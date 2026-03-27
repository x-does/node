import mysql from 'mysql2/promise';

let pool;

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
