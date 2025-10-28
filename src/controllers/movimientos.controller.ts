import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../db';

// ====== Validación del body ======
const crearMovimientoSchema = z.object({
  tipo: z.enum(['Traslado', 'Muerte', 'Venta']),
  destino_id: z.number().int().positive().optional(),
  observaciones: z.string().max(500).optional(),
});

// ====== Helpers de permisos ======

// ¿Es AdminFinca del id_finca?
async function esAdminDeFinca(id_usuario: number, id_finca: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
       FROM usuario_finca_roles
      WHERE id_usuario = $1
        AND id_finca   = $2
        AND rol        = 'AdminFinca'
      LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount ?? 0) > 0;
}

// ====== POST /api/semovientes/:id/movimientos ======
export const crearMovimiento = async (req: Request, res: Response, next: NextFunction) => {
  const id_semoviente = Number(req.params.id);

  try {
    const { tipo, destino_id, observaciones } = crearMovimientoSchema.parse(req.body);

    // usuario autenticado (inyectado por authRequired)
    const auth = (req as any).user as { id_usuario: number; rol: string };
    if (!auth) return next({ statusCode: 401, message: 'Token requerido' });

    // Traer finca actual del animal
    const rGet = await pool.query(
      'SELECT id_finca FROM semovientes WHERE id_semoviente = $1 LIMIT 1',
      [id_semoviente]
    );
    if (rGet.rowCount === 0) {
      return next({ statusCode: 404, message: 'Semoviente no encontrado' });
    }
    const finca_actual: number = rGet.rows[0].id_finca;

    // ===== Permisos =====
    // SuperAdmin: bypass total
    if (auth.rol !== 'SuperAdmin') {
      // Solo AdminFinca del ORIGEN puede mover
      const adminOrigen = await esAdminDeFinca(auth.id_usuario, finca_actual);
      if (!adminOrigen) {
        return next({
          statusCode: 403,
          message: 'No autorizado: debe ser AdminFinca de la finca de origen',
        });
      }
      // (Opcional) Si quieres exigir también admin en destino, descomenta:
      // if (tipo === 'Traslado' && destino_id) {
      //   const adminDestino = await esAdminDeFinca(auth.id_usuario, destino_id);
      //   if (!adminDestino) {
      //     return next({ statusCode: 403, message: 'No autorizado en la finca destino' });
      //   }
      // }
    }

    // ===== Validaciones por tipo =====
    if (tipo === 'Traslado') {
      if (!destino_id || Number.isNaN(destino_id)) {
        return next({ statusCode: 400, message: 'destino_id es requerido para Traslado' });
      }
      if (destino_id === finca_actual) {
        return next({ statusCode: 400, message: 'El destino debe ser distinto a la finca actual' });
      }
      // Validar finca destino
      const rF = await pool.query('SELECT 1 FROM fincas WHERE id_finca = $1 LIMIT 1', [destino_id]);
      if (rF.rowCount === 0) {
        return next({ statusCode: 400, message: 'Finca destino inexistente' });
      }

      // CTE atómico: actualiza finca y registra movimiento
      const rCTE = await pool.query(
        `
        WITH updated AS (
          UPDATE semovientes
             SET id_finca = $1
           WHERE id_semoviente = $2
         RETURNING id_finca AS id_finca_nueva
        )
        INSERT INTO movimientos_semovientes
          (id_semoviente, tipo_movimiento, fecha_movimiento, finca_origen_id, finca_destino_id, observaciones)
        SELECT $2, 'Traslado', NOW()::date, $3, $1, $4
          FROM updated
        RETURNING id_movimiento;
        `,
        [destino_id, id_semoviente, finca_actual, observaciones || null]
      );

      return res.status(201).json({
        ok: true,
        mensaje: 'Traslado registrado',
        id_movimiento: rCTE.rows[0].id_movimiento,
        id_finca_origen: finca_actual,
        id_finca_destino: destino_id,
      });
    }

    // Muerte / Venta: no cambia finca (solo registra movimiento)
    const rIns = await pool.query(
      `
      INSERT INTO movimientos_semovientes
        (id_semoviente, tipo_movimiento, fecha_movimiento, finca_origen_id, finca_destino_id, observaciones)
      VALUES ($1, $2, NOW()::date, $3, NULL, $4)
      RETURNING id_movimiento;
      `,
      [id_semoviente, tipo, finca_actual, observaciones || null]
    );

    return res.status(201).json({
      ok: true,
      mensaje: `${tipo} registrado`,
      id_movimiento: rIns.rows[0].id_movimiento,
    });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

// ====== GET /api/semovientes/:id/movimientos ======
export const listarMovimientos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);
    const r = await pool.query(
      `
      SELECT id_movimiento, tipo_movimiento, fecha_movimiento,
             finca_origen_id, finca_destino_id, observaciones
        FROM movimientos_semovientes
       WHERE id_semoviente = $1
       ORDER BY fecha_movimiento DESC, id_movimiento DESC;
      `,
      [id_semoviente]
    );
    res.json({ ok: true, movimientos: r.rows });
  } catch (e) {
    next(e);
  }
};
