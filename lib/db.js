"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // 👉 Carga las variables de entorno automáticamente
const pg_1 = require("pg");
// Crear el pool de conexiones con los valores del .env
const pool = new pg_1.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
});
// (Opcional) Verificación inicial de conexión al iniciar el servidor
pool.connect()
    .then(() => {
    console.log('✅ Conexión exitosa a la base de datos PostgreSQL');
})
    .catch((err) => {
    console.error('❌ Error al conectar con PostgreSQL:', err);
});
// Manejador global de errores del pool (por si la conexión se cae)
pool.on('error', (err) => {
    console.error('⚠️ Error inesperado en el pool de PostgreSQL:', err);
});
exports.default = pool;
