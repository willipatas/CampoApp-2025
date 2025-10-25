// src/app.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import pool, { checkDbConnection } from './db';
import authRoutes from './routes/auth.routes';
import usuariosRoutes from './routes/usuarios.routes';
import fincasRoutes from './routes/fincas.routes';           // CRUD fincas
import fincaRolesRoutes from './routes/fincas.roles.routes'; // /:id/miembros
import semovientesRoutes from './routes/semovientes.routes';


const app = express();

(async () => {
  await checkDbConnection();
  // ... levantar express, etc.
})();

/* ===== Middlewares base ===== */
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ===== Rutas ===== */
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/fincas', fincasRoutes);      // CRUD de fincas
app.use('/api/fincas', fincaRolesRoutes);  // miembros por finca
app.use('/api/semovientes', semovientesRoutes);

/* ===== Endpoints de salud ===== */
app.get('/ping', (_req: Request, res: Response) =>
  res.json({ ok: true, message: 'Servidor vivo 👋' })
);

app.get('/ping-db', async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT NOW() as now');
    res.json({ ok: true, db_time: r.rows[0].now });
  } catch (err) { next(err); }
});

/* ===== 404 (ruta no encontrada) ===== */
app.use((_req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' });
});

/* ===== Manejador global de errores (al final) ===== */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';
  if (process.env.NODE_ENV !== 'production') console.error('❌ Error:', err);
  res.status(status).json({
    ok: false,
    mensaje: message,
    ...(err.detalle && { detalle: err.detalle }),
    ...(err.issues && { issues: err.issues }),
  });
});

/* ===== Levantar servidor ===== */
const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    await checkDbConnection(); // healthcheck único
    app.listen(PORT, () => {
      console.log(`✅ Servidor listo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ No se pudo verificar la DB al iniciar:', err);
    process.exit(1);
  }
})();

export default app;
