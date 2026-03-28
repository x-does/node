import mysql from 'mysql2/promise';

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
  await ensureLeadEventsTable();

  const [totalRows] = await getPool().query(
    `SELECT COUNT(*) AS total
     FROM openclaw_lead_events
     WHERE event_key = ?`,
    [eventKey]
  );

  const [uniqueRows] = await getPool().query(
    `SELECT COUNT(DISTINCT COALESCE(ip_hash, user_agent, CONCAT('event-', id))) AS unique_count
     FROM openclaw_lead_events
     WHERE event_key = ?`,
    [eventKey]
  );

  return {
    total: Number(totalRows?.[0]?.total || 0),
    unique: Number(uniqueRows?.[0]?.unique_count || 0),
  };
}
