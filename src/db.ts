// src/db.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export default pool;

export async function checkDbConnection() {
  try {
    await pool.query('SELECT 1');
    console.log(`✅ Conexión a PostgreSQL (DB: ${process.env.DB_NAME}) exitosa.`);
  } catch (err) {
    console.error('❌ Error al conectar con PostgreSQL:', err);
  }
}
