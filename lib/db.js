import mysql from 'mysql2/promise';
import { isInternalAuditSource } from './audit-source.js';

let pool;
let leadEventsTableReady = false;

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: required('DB_HOST'),
      port: Number(process.env.DB_PORT || 3306),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      database: required('DB_NAME'),
      ssl: process.env.DB_SSL === 'true' ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function getPublicStatusCards() {
  const [rows] = await getPool().query(
    `SELECT slug, title, value_text AS valueText, public_note AS publicNote, updated_at AS updatedAt
     FROM openclaw_app_status
     ORDER BY id ASC`
  );
  return rows;
}

export async function ensureLeadEventsTable() {
  if (leadEventsTableReady) {
    return;
  }

  await getPool().query(
    `CREATE TABLE IF NOT EXISTS openclaw_lead_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_key VARCHAR(120) NOT NULL,
      source VARCHAR(120) NOT NULL,
      user_agent VARCHAR(255) NULL,
      ip_hash VARCHAR(64) NULL,
      automated_ua TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_key_created (event_key, created_at),
      INDEX idx_source_created (source, created_at),
      INDEX idx_event_automated_created (event_key, automated_ua, created_at)
    )`
  );

  try {
    await getPool().query(
      'ALTER TABLE openclaw_lead_events ADD COLUMN automated_ua TINYINT(1) NOT NULL DEFAULT 0'
    );
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column')) {
      throw error;
    }
  }

  leadEventsTableReady = true;
}

export async function insertLeadEvent({ eventKey, source, userAgent, ipHash, automatedUa = false }) {
  await ensureLeadEventsTable();
  await getPool().query(
    `INSERT INTO openclaw_lead_events (event_key, source, user_agent, ip_hash, automated_ua)
     VALUES (?, ?, ?, ?, ?)`,
    [eventKey, source, userAgent || null, ipHash || null, automatedUa ? 1 : 0]
  );
}

export async function getLeadCounts(eventKey) {
  const metrics = await getLeadMetrics(eventKey);
  return {
    total: metrics.total,
    unique: metrics.unique,
  };
}

async function loadScopedLeadMetrics(eventKey, scopeClause = '', scopeParams = [], windowStartUtc = null) {
  const scopedWhere = `WHERE event_key = ?${scopeClause ? ` ${scopeClause}` : ''}`;
  const params = [eventKey, ...scopeParams];

  const [countRows] = await getPool().query(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT COALESCE(ip_hash, user_agent, CONCAT('event-', id))) AS unique_count,
       SUM(CASE WHEN automated_ua = 1 THEN 1 ELSE 0 END) AS automated_total,
       SUM(CASE WHEN automated_ua = 0 THEN 1 ELSE 0 END) AS non_automated_total,
       MAX(created_at) AS last_event_at
     FROM openclaw_lead_events
     ${scopedWhere}`,
    params
  );

  const [sourceRows] = await getPool().query(
    `SELECT
       source,
       COUNT(*) AS total,
       SUM(CASE WHEN automated_ua = 1 THEN 1 ELSE 0 END) AS automated_total
     FROM openclaw_lead_events
     ${scopedWhere}
     GROUP BY source
     ORDER BY total DESC, source ASC`,
    params
  );

  const row = countRows?.[0] || {};
  const bySource = sourceRows.map((item) => ({
    source: item.source,
    total: Number(item.total || 0),
    automatedTotal: Number(item.automated_total || 0),
  }));

  const internalSources = bySource.filter((item) => isInternalAuditSource(item.source));
  const externalSources = bySource.filter((item) => !isInternalAuditSource(item.source));

  const internalTotal = internalSources.reduce((sum, item) => sum + item.total, 0);
  const externalTotal = externalSources.reduce((sum, item) => sum + item.total, 0);
  const automatedTotal = Number(row.automated_total || 0);
  const nonAutomatedTotal = Number(row.non_automated_total || 0);
  const automatedInternalTotal = internalSources.reduce((sum, item) => sum + item.automatedTotal, 0);
  const automatedExternalTotal = externalSources.reduce((sum, item) => sum + item.automatedTotal, 0);
  const nonAutomatedInternalTotal = internalTotal - automatedInternalTotal;
  const nonAutomatedExternalTotal = externalTotal - automatedExternalTotal;

  const [identityRows] = await getPool().query(
    `SELECT
       COALESCE(ip_hash, user_agent, CONCAT('event-', id)) AS identity_key,
       source,
       created_at
     FROM openclaw_lead_events
     ${scopedWhere}`,
    params
  );

  const externalIdentitySet = new Set();
  let externalLastEventAt = null;
  let internalLastEventAt = null;

  for (const item of identityRows) {
    const createdAtIso = item.created_at ? new Date(item.created_at).toISOString() : null;

    if (isInternalAuditSource(item.source)) {
      if (!internalLastEventAt || (createdAtIso && createdAtIso > internalLastEventAt)) {
        internalLastEventAt = createdAtIso;
      }
      continue;
    }

    externalIdentitySet.add(item.identity_key);
    if (!externalLastEventAt || (createdAtIso && createdAtIso > externalLastEventAt)) {
      externalLastEventAt = createdAtIso;
    }
  }

  return {
    total: Number(row.total || 0),
    unique: Number(row.unique_count || 0),
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null,
    automatedTotal,
    nonAutomatedTotal,
    windowStartUtc,
    bySource,
    external: {
      total: externalTotal,
      unique: externalIdentitySet.size,
      automatedTotal: automatedExternalTotal,
      nonAutomatedTotal: nonAutomatedExternalTotal,
      lastEventAt: externalLastEventAt,
      bySource: externalSources,
    },
    internal: {
      total: internalTotal,
      automatedTotal: automatedInternalTotal,
      nonAutomatedTotal: nonAutomatedInternalTotal,
      lastEventAt: internalLastEventAt,
      bySource: internalSources,
    },
  };
}

export async function getLeadMetrics(eventKey) {
  await ensureLeadEventsTable();

  const now = new Date();
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last60mStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const overall = await loadScopedLeadMetrics(eventKey);
  const last24h = await loadScopedLeadMetrics(
    eventKey,
    'AND created_at >= (UTC_TIMESTAMP() - INTERVAL 24 HOUR)',
    [],
    last24hStart
  );
  const last60m = await loadScopedLeadMetrics(
    eventKey,
    'AND created_at >= (UTC_TIMESTAMP() - INTERVAL 60 MINUTE)',
    [],
    last60mStart
  );

  return {
    ...overall,
    windows: {
      last24h,
      last60m,
    },
  };
}
