// src/routes/fincas.roles.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../db';
import {
  authRequired,
  requireRoleGlobal,
  requireRoleInFinca,
} from '../middlewares/auth.middleware';
import { fincaContext } from '../middlewares/tenant.middleware';

const router = Router();

// Todos los endpoints aquí requieren auth y contexto de finca
router.use(authRequired, fincaContext);

// Zod schemas
const miembroSchema = z.object({
  id_usuario: z.number().int().positive(),
  rol: z.enum(['AdminFinca', 'Empleado', 'Veterinario']),
});

/**
 * GET /api/fincas/:id/miembros
 * Lista miembros de la finca (visibles para cualquiera que tenga rol en la finca)
 */
router.get(
  '/:id/miembros',
  requireRoleInFinca('AdminFinca', 'Empleado', 'Veterinario'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id_finca = Number(req.params.id);
      const q = `
        SELECT
          u.id_usuario,
          u.nombre_usuario,
          u.nombre_completo,
          u.correo_electronico,
          u.rol AS rol_global,
          ufr.rol AS rol_finca
        FROM usuario_finca_roles ufr
        JOIN usuarios u ON u.id_usuario = ufr.id_usuario
        WHERE ufr.id_finca = $1
        ORDER BY u.nombre_usuario;
      `;
      const r = await pool.query(q, [id_finca]);
      res.json({ ok: true, miembros: r.rows });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * POST /api/fincas/:id/miembros
 * Asigna (o cambia) el rol de un usuario en la finca.
 * Permisos: SuperAdmin global o AdminFinca de esa finca.
 * Efectos:
 *  - UPSERT en usuario_finca_roles con clave (id_usuario,id_finca)
 *  - Si rol='AdminFinca' => actualiza fincas.administrador_id
 *  - Si cambiamos desde AdminFinca a otro rol y ese usuario era el admin actual => limpia administrador_id
 */
router.post(
  '/:id/miembros',
  // Permite SuperAdmin global; si no lo es, debe ser AdminFinca en la finca
  (req, res, next) => {
    requireRoleGlobal('SuperAdmin')(req, res, (err) => {
      if (!err) return next();
      return requireRoleInFinca('AdminFinca')(req, res, next);
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const id_finca = Number(req.params.id);
      const { id_usuario, rol } = miembroSchema.parse(req.body);

      await client.query('BEGIN');

      // Leemos el rol anterior (si existía) para saber si estamos degradando desde AdminFinca
      const prev = await client.query(
        `SELECT rol
           FROM usuario_finca_roles
          WHERE id_usuario = $1 AND id_finca = $2
          LIMIT 1`,
        [id_usuario, id_finca]
      );
      const rolAnterior: string | null = prev.rowCount ? prev.rows[0].rol : null;

      // UPSERT: un solo rol por finca para el usuario (necesita índice único (id_usuario,id_finca))
      const upsert = `
        INSERT INTO usuario_finca_roles (id_usuario, id_finca, rol)
        VALUES ($1, $2, $3)
        ON CONFLICT (id_usuario, id_finca)
        DO UPDATE SET rol = EXCLUDED.rol
        RETURNING id_usuario, id_finca, rol;
      `;
      const r = await client.query(upsert, [id_usuario, id_finca, rol]);
      const asignacion = r.rows[0];

      // Si asignamos AdminFinca => reflejarlo en fincas.administrador_id
      if (rol === 'AdminFinca') {
        await client.query(
          `UPDATE fincas SET administrador_id = $1 WHERE id_finca = $2`,
          [id_usuario, id_finca]
        );
      }

      // Si cambiamos DESDE AdminFinca A otro rol y ese usuario era el admin actual => limpiar
      if (rolAnterior === 'AdminFinca' && rol !== 'AdminFinca') {
        const check = await client.query(
          `SELECT administrador_id FROM fincas WHERE id_finca = $1`,
          [id_finca]
        );
        if (check.rows[0]?.administrador_id === id_usuario) {
          await client.query(
            `UPDATE fincas SET administrador_id = NULL WHERE id_finca = $1`,
            [id_finca]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ ok: true, asignacion });
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e?.issues) {
        return next({
          statusCode: 400,
          message: 'Datos inválidos',
          detalle: e.issues,
        });
      }
      if (e?.code === '23503') {
        // FK: usuario o finca inexistente
        return next({
          statusCode: 400,
          message: 'Usuario o finca inexistente',
        });
      }
      if (e?.code === '23505') {
        // Choques por índices únicos (p.ej., 1 AdminFinca por finca)
        return next({
          statusCode: 409,
          message: 'Conflicto por restricción de unicidad',
        });
      }
      next(e);
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/fincas/:id/miembros/:idUsuario?rol=Empleado|Veterinario|AdminFinca
 * Elimina una asignación de rol en la finca.
 * Si se elimina AdminFinca y ese usuario era el admin actual => limpia administrador_id
 * Permisos: SuperAdmin o AdminFinca de la finca
 */
router.delete(
  '/:id/miembros/:idUsuario',
  (req, res, next) => {
    requireRoleGlobal('SuperAdmin')(req, res, (err) => {
      if (!err) return next();
      return requireRoleInFinca('AdminFinca')(req, res, next);
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const id_finca = Number(req.params.id);
      const id_usuario = Number(req.params.idUsuario);
      const rol = String(req.query.rol || '');

      if (!rol) {
        return next({
          statusCode: 400,
          message:
            'Debe enviar rol a remover (?rol=Empleado|Veterinario|AdminFinca)',
        });
      }

      await client.query('BEGIN');

      const del = await client.query(
        `DELETE FROM usuario_finca_roles
          WHERE id_usuario = $1 AND id_finca = $2 AND rol = $3`,
        [id_usuario, id_finca, rol]
      );

      if (del.rowCount === 0) {
        await client.query('ROLLBACK');
        return next({ statusCode: 404, message: 'No existía esa asignación' });
      }

      // Si borramos AdminFinca y el usuario era el admin actual => limpiar
      if (rol === 'AdminFinca') {
        const check = await client.query(
          `SELECT administrador_id FROM fincas WHERE id_finca = $1`,
          [id_finca]
        );
        if (check.rows[0]?.administrador_id === id_usuario) {
          await client.query(
            `UPDATE fincas SET administrador_id = NULL WHERE id_finca = $1`,
            [id_finca]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true, mensaje: 'Rol eliminado' });
    } catch (e) {
      await client.query('ROLLBACK');
      next(e);
    } finally {
      client.release();
    }
  }
);

export default router;
