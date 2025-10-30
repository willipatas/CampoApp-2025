import { Router } from 'express';
import { z } from 'zod';
import pool from '../db';
import { authRequired } from '../middlewares/auth.middleware';

const router = Router();
router.use(authRequired);

// Zod
const miembroSchema = z.object({
  id_usuario: z.number().int().positive(),
  rol: z.enum(['AdminFinca', 'Empleado', 'Veterinario']),
});

// Helper: ¿es SuperAdmin?
const esSuperAdmin = (req: any) => req?.user?.rol === 'SuperAdmin';

// Helper: ¿req.user es AdminFinca de esa finca?
async function esAdminDeFinca(id_usuario: number, id_finca: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM usuario_finca_roles
     WHERE id_usuario = $1 AND id_finca = $2 AND rol = 'AdminFinca' LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r?.rowCount ?? 0) > 0;
}

// GET /api/fincas/:id/miembros  (lista miembros de la finca)
router.get('/:id/miembros', async (req, res, next) => {
  try {
    const id_finca = Number(req.params.id);
    if (!id_finca) return next({ statusCode: 400, message: 'Id de finca inválido' });

    const user = (req as any).user;

    // Permisos: SuperAdmin o AdminFinca de esa finca (también podrías permitir Empleado/Veterinario solo lectura)
    if (!esSuperAdmin(req)) {
      const esAdmin = await esAdminDeFinca(user.id_usuario, id_finca);
      if (!esAdmin) return next({ statusCode: 403, message: 'No autorizado para ver miembros de esta finca' });
    }

    const r = await pool.query(
      `
      SELECT u.id_usuario, u.nombre_usuario, u.nombre_completo, u.correo_electronico,
             u.rol AS rol_global, ufr.rol AS rol_finca
      FROM usuario_finca_roles ufr
      JOIN usuarios u ON u.id_usuario = ufr.id_usuario
      WHERE ufr.id_finca = $1
      ORDER BY u.nombre_usuario;
      `,
      [id_finca]
    );

    res.json({ ok: true, miembros: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/fincas/:id/miembros  (asignar rol en finca)
router.post('/:id/miembros', async (req, res, next) => {
  try {
    const id_finca = Number(req.params.id);
    if (!id_finca) return next({ statusCode: 400, message: 'Id de finca inválido' });

    const { id_usuario, rol } = miembroSchema.parse(req.body);
    const user = (req as any).user;

    // Permisos: SuperAdmin o AdminFinca de ESA finca
    if (!esSuperAdmin(req)) {
      const esAdmin = await esAdminDeFinca(user.id_usuario, id_finca);
      if (!esAdmin) return next({ statusCode: 403, message: 'No autorizado para asignar en esta finca' });
    }

    // Verificar que el usuario exista
    const rU = await pool.query('SELECT 1 FROM usuarios WHERE id_usuario = $1 LIMIT 1', [id_usuario]);
    if (rU.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });

    // Verificar que la finca exista
    const rF = await pool.query('SELECT 1 FROM fincas WHERE id_finca = $1 LIMIT 1', [id_finca]);
    if (rF.rowCount === 0) return next({ statusCode: 404, message: 'Finca no encontrada' });

    // Insertar (ignorar si ya existe exacto ese rol)
    await pool.query(
      `INSERT INTO usuario_finca_roles (id_usuario, id_finca, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [id_usuario, id_finca, rol]
    );

    res.status(201).json({ ok: true, mensaje: 'Rol asignado' });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
});

// DELETE /api/fincas/:id/miembros/:idUsuario?rol=Empleado
router.delete('/:id/miembros/:idUsuario', async (req, res, next) => {
  try {
    const id_finca = Number(req.params.id);
    const id_usuario = Number(req.params.idUsuario);
    const rol = String(req.query.rol || '');

    if (!id_finca || !id_usuario || !rol) {
      return next({ statusCode: 400, message: 'Faltan parámetros (id, idUsuario, rol)' });
    }

    const user = (req as any).user;
    if (!esSuperAdmin(req)) {
      const esAdmin = await esAdminDeFinca(user.id_usuario, id_finca);
      if (!esAdmin) return next({ statusCode: 403, message: 'No autorizado para quitar rol en esta finca' });
    }

    const r = await pool.query(
      `DELETE FROM usuario_finca_roles
       WHERE id_usuario = $1 AND id_finca = $2 AND rol = $3`,
      [id_usuario, id_finca, rol]
    );

    if (r.rowCount === 0) return next({ statusCode: 404, message: 'No existía esa asignación' });
    res.json({ ok: true, mensaje: 'Rol eliminado' });
  } catch (e) {
    next(e);
  }
});

export default router;
