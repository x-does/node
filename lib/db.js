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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_key_created (event_key, created_at),
      INDEX idx_source_created (source, created_at)
    )`
  );

  leadEventsTableReady = true;
}

export async function insertLeadEvent({ eventKey, source, userAgent, ipHash }) {
  await ensureLeadEventsTable();
  await getPool().query(
    `INSERT INTO openclaw_lead_events (event_key, source, user_agent, ip_hash)
     VALUES (?, ?, ?, ?)`,
    [eventKey, source, userAgent || null, ipHash || null]
  );
}

export async function getLeadCounts(eventKey) {
  const metrics = await getLeadMetrics(eventKey);
  return {
    total: metrics.total,
    unique: metrics.unique,
  };
}

export async function getLeadMetrics(eventKey) {
  await ensureLeadEventsTable();

  const [countRows] = await getPool().query(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT COALESCE(ip_hash, user_agent, CONCAT('event-', id))) AS unique_count,
       MAX(created_at) AS last_event_at
     FROM openclaw_lead_events
     WHERE event_key = ?`,
    [eventKey]
  );

  const [sourceRows] = await getPool().query(
    `SELECT source, COUNT(*) AS total
     FROM openclaw_lead_events
     WHERE event_key = ?
     GROUP BY source
     ORDER BY total DESC, source ASC`,
    [eventKey]
  );

  const row = countRows?.[0] || {};
  const bySource = sourceRows.map((item) => ({
    source: item.source,
    total: Number(item.total || 0),
  }));

  const internalSources = bySource.filter((item) => isInternalAuditSource(item.source));
  const externalSources = bySource.filter((item) => !isInternalAuditSource(item.source));

  const internalTotal = internalSources.reduce((sum, item) => sum + item.total, 0);
  const externalTotal = externalSources.reduce((sum, item) => sum + item.total, 0);

  const [identityRows] = await getPool().query(
    `SELECT
       COALESCE(ip_hash, user_agent, CONCAT('event-', id)) AS identity_key,
       source
     FROM openclaw_lead_events
     WHERE event_key = ?`,
    [eventKey]
  );

  const externalIdentitySet = new Set();

  for (const item of identityRows) {
    if (!isInternalAuditSource(item.source)) {
      externalIdentitySet.add(item.identity_key);
    }
  }

  const externalUnique = externalIdentitySet.size;

  return {
    total: Number(row.total || 0),
    unique: Number(row.unique_count || 0),
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null,
    bySource,
    external: {
      total: externalTotal,
      unique: externalUnique,
      bySource: externalSources,
    },
    internal: {
      total: internalTotal,
      bySource: internalSources,
    },
  };
}
