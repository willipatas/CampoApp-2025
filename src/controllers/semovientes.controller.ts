import { Request, Response, NextFunction } from 'express';
import { QueryResult } from 'pg';
import pool from '../db';
import {
  crearSemovienteSchema,
  actualizarSemovienteSchema,
  cambiarEstadoSemovienteSchema,
} from '../schemas/semoviente.schema';

/* Utilidades */

const getFincaFromRequest = (req: Request): number | null => {
  const fromParam = req.params?.id_finca ? Number(req.params.id_finca) : null;
  const fromQuery = req.query?.id_finca ? Number(req.query.id_finca) : null;
  const fromHeader = (req.headers['x-finca-id'] as string | undefined) ? Number(req.headers['x-finca-id']) : null;

  const candidate = fromParam ?? fromQuery ?? fromHeader ?? null;
  if (candidate && !Number.isNaN(candidate)) return candidate;
  return null;
};

const esMiembroDeFinca = async (id_usuario: number, id_finca: number): Promise<boolean> => {
  const r: QueryResult = await pool.query(
    `SELECT 1 FROM usuario_finca_roles WHERE id_usuario = $1 AND id_finca = $2 LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount ?? 0) > 0;
};

const esAdminDeFinca = async (id_usuario: number, id_finca: number): Promise<boolean> => {
  const r: QueryResult = await pool.query(
    `SELECT 1 FROM usuario_finca_roles WHERE id_usuario = $1 AND id_finca = $2 AND rol = 'AdminFinca' LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount ?? 0) > 0;
};

const validarRazaEspecie = async (id_raza: number, id_especie: number): Promise<boolean> => {
  const r: QueryResult = await pool.query(
    `SELECT 1 FROM razas WHERE id_raza = $1 AND id_especie = $2 LIMIT 1`,
    [id_raza, id_especie]
  );
  return (r.rowCount ?? 0) > 0;
};

/* Endpoints */

export const listarSemovientes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as { id_usuario: number };
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    const id_finca = getFincaFromRequest(req);
    if (!id_finca) return next({ statusCode: 400, message: 'Debe indicar id_finca (query, header X-Finca-Id o ruta)' });

    const pertenece = await esMiembroDeFinca(user.id_usuario, id_finca);
    if (!pertenece) return next({ statusCode: 403, message: 'No autorizado para esta finca' });

    const includeInactivos = String(req.query.include_inactivos || 'false') === 'true';
    const filtroEstado = includeInactivos ? '' : `AND s.estado = 'Activo'`;

    const r = await pool.query(
      `SELECT s.*
         FROM semovientes s
        WHERE s.id_finca = $1
          ${filtroEstado}
        ORDER BY s.id_semoviente DESC`,
      [id_finca]
    );

    res.json({ ok: true, semovientes: r.rows });
  } catch (e) {
    next(e);
  }
};

export const crearSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as { id_usuario: number };
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    const data = crearSemovienteSchema.parse(req.body);

    const admin = await esAdminDeFinca(user.id_usuario, data.id_finca);
    if (!admin) return next({ statusCode: 403, message: 'No autorizado: requiere AdminFinca' });

    const okRaza = await validarRazaEspecie(data.id_raza, data.id_especie);
    if (!okRaza) return next({ statusCode: 400, message: 'La raza no pertenece a esa especie' });

    const r = await pool.query(
      `INSERT INTO semovientes
         (nro_marca, nro_registro, nombre, fecha_nacimiento, sexo,
          id_raza, id_especie, id_madre, id_padre, id_finca, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Activo')
       RETURNING *`,
      [
        data.nro_marca,
        data.nro_registro ?? null,
        data.nombre,
        data.fecha_nacimiento,
        data.sexo,
        data.id_raza,
        data.id_especie,
        data.id_madre ?? null,
        data.id_padre ?? null,
        data.id_finca,
      ]
    );

    res.status(201).json({ ok: true, semoviente: r.rows[0] });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    if (e?.code === '23505') return next({ statusCode: 409, message: 'Nro. de marca o registro duplicado' });
    next(e);
  }
};

export const actualizarSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return next({ statusCode: 400, message: 'ID inválido' });

    const data = actualizarSemovienteSchema.parse(req.body);

    const rSel = await pool.query(`SELECT id_finca FROM semovientes WHERE id_semoviente = $1`, [id]);
    if (rSel.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    const id_finca = rSel.rows[0].id_finca as number;
    const user = (req as any).user as { id_usuario: number };
    const admin = await esAdminDeFinca(user.id_usuario, id_finca);
    if (!admin) return next({ statusCode: 403, message: 'No autorizado: requiere AdminFinca' });

    if (data.id_raza && data.id_especie) {
      const okRaza = await validarRazaEspecie(data.id_raza, data.id_especie);
      if (!okRaza) return next({ statusCode: 400, message: 'La raza no pertenece a esa especie' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [k, v] of Object.entries(data)) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }

    const q = `
      UPDATE semovientes
         SET ${fields.join(', ')}
       WHERE id_semoviente = $${idx}
       RETURNING *`;
    values.push(id);

    const rUpd = await pool.query(q, values);
    res.json({ ok: true, semoviente: rUpd.rows[0] });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    if (e?.code === '23505') return next({ statusCode: 409, message: 'Nro. de marca o registro duplicado' });
    next(e);
  }
};

export const eliminarSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return next({ statusCode: 400, message: 'ID inválido' });

    const rSel = await pool.query(`SELECT id_finca FROM semovientes WHERE id_semoviente = $1`, [id]);
    if (rSel.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    const id_finca = rSel.rows[0].id_finca as number;
    const user = (req as any).user as { id_usuario: number };
    const admin = await esAdminDeFinca(user.id_usuario, id_finca);
    if (!admin) return next({ statusCode: 403, message: 'No autorizado: requiere AdminFinca' });

    const rDel = await pool.query(`DELETE FROM semovientes WHERE id_semoviente = $1`, [id]);
    if (rDel.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    res.json({ ok: true, mensaje: 'Eliminado' });
  } catch (e: any) {
    if (e?.code === '23503') {
      return next({
        statusCode: 409,
        message: 'No se puede eliminar: existen datos relacionados (vacunas, movimientos, registros médicos o descendencia)',
        detalle: e?.detail,
      });
    }
    next(e);
  }
};

export const cambiarEstadoSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);
    if (!id_semoviente || Number.isNaN(id_semoviente)) {
      return next({ statusCode: 400, message: 'ID inválido' });
    }

    const { estado, fecha, motivo, observaciones } = cambiarEstadoSemovienteSchema.parse(req.body);

    const rSem = await pool.query(
      'SELECT id_finca FROM semovientes WHERE id_semoviente = $1 LIMIT 1',
      [id_semoviente]
    );
    if (rSem.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    const id_finca = rSem.rows[0].id_finca as number;
    const user = (req as any).user as { id_usuario: number };
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    const permitido = await esAdminDeFinca(user.id_usuario, id_finca);
    if (!permitido) return next({ statusCode: 403, message: 'No autorizado: requiere AdminFinca de esta finca' });

    const setBaja =
      estado === 'Activo'
        ? `fecha_baja = NULL, motivo_baja = NULL, observaciones_baja = NULL`
        : `fecha_baja = COALESCE($2, fecha_baja),
           motivo_baja = COALESCE($3, motivo_baja),
           observaciones_baja = COALESCE($4, observaciones_baja)`;

    const params = [estado, fecha ?? null, motivo ?? null, observaciones ?? null, id_semoviente];

    const q = `
      UPDATE semovientes
         SET estado = $1,
             ${setBaja}
       WHERE id_semoviente = $5
       RETURNING id_semoviente, id_finca, estado, fecha_baja, motivo_baja, observaciones_baja`;

    const rUpd = await pool.query(q, params);

    res.json({
      ok: true,
      mensaje: 'Estado actualizado',
      semoviente: rUpd.rows[0],
    });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};
