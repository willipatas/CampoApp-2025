// Este módulo lee las variables de entorno para conectarse a PostgreSQL.

const { Pool } = require('pg');

// Crea un pool de conexión. Esto es más eficiente que abrir y cerrar
// una conexión para cada consulta.
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Función para verificar la conexión al iniciar el servidor
pool.connect((err, client, release) => {
  if (err) {
    // Si hay un error, lo imprimimos.
    console.error('Error al conectar con PostgreSQL:', err.stack);
    // Nota: El servidor Express puede seguir corriendo, pero la API fallará
    // en las rutas que necesitan la BD.
  } else {
    // Éxito: conexión adquirida. La liberamos de inmediato.
    console.log('✅ Conexión a PostgreSQL (DB:', process.env.DB_NAME, ') exitosa.');
    release();
  }
});

// Exporta la función para poder ejecutar consultas desde los controladores.
// Ejemplo de uso: await db.query('SELECT * FROM users');
module.exports = {
  query: (text, params) => pool.query(text, params),
};
