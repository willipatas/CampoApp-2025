// En: src/controllers/movimientos.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../db';
import { QueryResult } from 'pg';

// ====== Validación del body (ACTUALIZADA) ======
const crearMovimientoSchema = z.object({
  // Tipos de movimiento (Muerte/Venta son de SALIDA)
  tipo: z.enum(['Traslado', 'Muerte', 'Venta']), 
  destino_id: z.number().int().positive().optional(),
  observaciones: z.string().max(500).optional(),
  
  // --- NUEVO CAMPO (para Venta) ---
  valor: z.number().positive().optional().nullable(), // Precio de Venta
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
    // 1. Usar el esquema (que incluye 'valor')
    const { tipo, destino_id, observaciones, valor } = crearMovimientoSchema.parse(req.body);

    const auth = (req as any).user as { id_usuario: number; rol: string };
    if (!auth) return next({ statusCode: 401, message: 'Token requerido' });

    // Traer finca actual del animal
    const rGet = await pool.query(
      'SELECT id_finca, estado FROM semovientes WHERE id_semoviente = $1 LIMIT 1',
      [id_semoviente]
    );
    if (rGet.rowCount === 0) {
      return next({ statusCode: 404, message: 'Semoviente no encontrado' });
    }
    const finca_actual: number = rGet.rows[0].id_finca;
    const estado_actual: string = rGet.rows[0].estado;

    if (estado_actual !== 'Activo') {
      return next({ statusCode: 400, message: `No se puede mover un semoviente que no está 'Activo' (estado actual: ${estado_actual})` });
    }

    // ===== 2. Permisos =====
    if (auth.rol !== 'SuperAdmin') {
      const adminOrigen = await esAdminDeFinca(auth.id_usuario, finca_actual);
      if (!adminOrigen) {
        return next({
          statusCode: 403,
          message: 'No autorizado: debe ser AdminFinca de la finca de origen',
        });
      }
    }

    // ===== 3. Validaciones y Lógica por tipo =====

    // --- Lógica de TRASLADO ---
    if (tipo === 'Traslado') {
      if (!destino_id || Number.isNaN(destino_id)) {
        return next({ statusCode: 400, message: 'destino_id es requerido para Traslado' });
      }
      if (destino_id === finca_actual) {
        return next({ statusCode: 400, message: 'El destino debe ser distinto a la finca actual' });
      }
      const rF = await pool.query('SELECT 1 FROM fincas WHERE id_finca = $1 LIMIT 1', [destino_id]);
      if (rF.rowCount === 0) return next({ statusCode: 400, message: 'Finca destino inexistente' });

      // CTE atómico
      const rCTE = await pool.query(
        `
        WITH updated AS (
          UPDATE semovientes
             SET id_finca = $1, estado = 'Traslado'
           WHERE id_semoviente = $2
         RETURNING id_finca AS id_finca_nueva
        )
        INSERT INTO movimientos_semovientes
          (id_semoviente, tipo_movimiento, fecha_movimiento, finca_origen_id, finca_destino_id, observaciones, valor)
        SELECT $2, 'Traslado', NOW()::date, $3, $1, $4, NULL
          FROM updated
        RETURNING id_movimiento;
        `,
        [destino_id, id_semoviente, finca_actual, observaciones || null]
      );

      return res.status(201).json({
        ok: true,
        mensaje: 'Traslado registrado',
        id_movimiento: rCTE.rows[0].id_movimiento,
      });
    }

    // --- Lógica de MUERTE o VENTA ---
    
    if (tipo === 'Venta' && (!valor || valor <= 0)) {
       return next({ statusCode: 400, message: 'El "valor" (precio de venta) es requerido para una Venta' });
    }

    // 1. Registrar el movimiento (con el valor)
    const rIns = await pool.query(
      `
      INSERT INTO movimientos_semovientes
        (id_semoviente, tipo_movimiento, fecha_movimiento, finca_origen_id, finca_destino_id, observaciones, valor)
      VALUES ($1, $2, NOW()::date, $3, NULL, $4, $5)
      RETURNING id_movimiento;
      `,
      [id_semoviente, tipo, finca_actual, observaciones || null, (tipo === 'Venta' ? valor : null)]
    );

    // 2. Actualizar el estado del semoviente
    const nuevoEstado = (tipo === 'Venta') ? 'Vendido' : 'Fallecido';
    
    await pool.query(
      `UPDATE semovientes
       SET estado = $1, 
           fecha_salida = NOW()::date, 
           fecha_baja = NOW()::date, 
           motivo_baja = $2,
           observaciones_baja = $3 
       WHERE id_semoviente = $4`,
      [nuevoEstado, tipo, observaciones || null, id_semoviente]
    );

    return res.status(201).json({
      ok: true,
      mensaje: `${tipo} registrada. Semoviente actualizado a estado '${nuevoEstado}'.`,
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
    if (!id_semoviente || Number.isNaN(id_semoviente)) {
        return next({ statusCode: 400, message: 'ID de semoviente inválido' });
    }

    // 1. Obtener usuario (respetando la convención req.user)
    const user = (req as any).user as { id_usuario: number; rol: string };
    if (!user) {
      return next({ statusCode: 401, message: 'Token requerido' });
    }

    // 2. Lógica de Permisos
    if (user.rol !== 'SuperAdmin') {
      const queryPermiso = `
        SELECT 1
        FROM usuario_finca_roles ufr
        WHERE ufr.id_usuario = $1
        AND ufr.id_finca IN (
            (SELECT id_finca FROM semovientes WHERE id_semoviente = $2)
            UNION
            (SELECT finca_origen_id FROM movimientos_semovientes WHERE id_semoviente = $2 AND finca_origen_id IS NOT NULL)
            UNION
            (SELECT finca_destino_id FROM movimientos_semovientes WHERE id_semoviente = $2 AND finca_destino_id IS NOT NULL)
        )
        LIMIT 1;
      `;
      
      const rPermiso: QueryResult = await pool.query(queryPermiso, [user.id_usuario, id_semoviente]);

      if (rPermiso.rowCount === 0) {
        return next({ statusCode: 403, message: 'Acceso prohibido: no es miembro de ninguna finca relacionada con este semoviente' });
      }
    }
    
    // 3. Si tiene permisos (SuperAdmin o es miembro), ejecutar la consulta
    const r = await pool.query(
      `
      SELECT id_movimiento, tipo_movimiento, fecha_movimiento,
             finca_origen_id, finca_destino_id, observaciones, valor
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