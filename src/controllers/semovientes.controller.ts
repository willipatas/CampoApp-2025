// src/controllers/semovientes.controller.ts
import { Request, Response, NextFunction } from 'express';
import { QueryResult } from 'pg';
import { z } from 'zod';
import pool from '../db';

/* =========================================================
   Helpers de contexto / permisos
========================================================= */
const userFromReq = (req: Request) => (req as any).user as {
  id_usuario: number;
  rol: 'SuperAdmin' | 'Administrador' | 'Empleado' | string;
};

const isSuperAdmin = (req: Request) => userFromReq(req)?.rol === 'SuperAdmin';
const userId = (req: Request) => userFromReq(req)?.id_usuario;

/* ---------------------------------------------------------
   ¿El usuario es miembro de la finca?
--------------------------------------------------------- */
const esMiembroDeFinca = async (id_usuario: number, id_finca: number): Promise<boolean> => {
  const r: QueryResult<any> = await pool.query(
    `SELECT 1
       FROM usuario_finca_roles
      WHERE id_usuario = $1 AND id_finca = $2
      LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount as number) > 0;
};

/* ---------------------------------------------------------
   ¿Es AdminFinca de esa finca?
--------------------------------------------------------- */
const esAdminDeFinca = async (id_usuario: number, id_finca: number): Promise<boolean> => {
  const r: QueryResult<any> = await pool.query(
    `SELECT 1
       FROM usuario_finca_roles
      WHERE id_usuario = $1 AND id_finca = $2 AND rol = 'AdminFinca'
      LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount as number) > 0;
};

/* ---------------------------------------------------------
   Validar que la raza pertenezca a la especie
--------------------------------------------------------- */
const validarRazaEspecie = async (id_raza: number, id_especie: number): Promise<boolean> => {
  const r: QueryResult<any> = await pool.query(
    `SELECT 1
       FROM razas
      WHERE id_raza = $1 AND id_especie = $2
      LIMIT 1`,
    [id_raza, id_especie]
  );
  return (r.rowCount as number) > 0;
};

/* ---------------------------------------------------------
   Obtener finca de un semoviente (para checks de acceso)
--------------------------------------------------------- */
const fincaDeSemoviente = async (id_semoviente: number): Promise<number | null> => {
  const r: QueryResult<{ id_finca: number }> = await pool.query(
    `SELECT id_finca FROM semovientes WHERE id_semoviente = $1 LIMIT 1`,
    [id_semoviente]
  );
  return r.rowCount ? r.rows[0].id_finca : null;
};

/* =========================================================
   Schemas de validación (Zod)
========================================================= */
const sexoEnum = z.enum(['Macho', 'Hembra']);

/** Crear */
const crearSemovienteSchema = z.object({
  id_finca: z.number().int().positive(),
  nro_marca: z.string().min(1),
  nro_registro: z.string().min(1).optional().nullable(),
  nombre: z.string().min(1),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // 'YYYY-MM-DD'
  sexo: sexoEnum,
  id_raza: z.number().int().positive(),
  id_especie: z.number().int().positive(),
  id_madre: z.number().int().positive().optional().nullable(),
  id_padre: z.number().int().positive().optional().nullable(),
});

/** Actualizar (parcial) */
const actualizarSemovienteSchema = z.object({
  nro_marca: z.string().min(1).optional(),
  nro_registro: z.string().min(1).optional().nullable(),
  nombre: z.string().min(1).optional(),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sexo: sexoEnum.optional(),
  id_raza: z.number().int().positive().optional(),
  id_especie: z.number().int().positive().optional(),
  id_madre: z.number().int().positive().optional().nullable(),
  id_padre: z.number().int().positive().optional().nullable(),
});

/* =========================================================
   CONTROLADORES
========================================================= */

/** GET /api/semovientes?finca=ID
 *  Lista por finca. Solo miembros de la finca o SuperAdmin.
 */
export const listarSemovientes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_finca = Number(req.query.finca);
    if (!id_finca) return next({ statusCode: 400, message: 'Debe enviar ?finca=ID' });

    const u = userFromReq(req);
    if (!isSuperAdmin(req)) {
      const miembro = await esMiembroDeFinca(u.id_usuario, id_finca);
      if (!miembro) return next({ statusCode: 403, message: 'No tiene acceso a esta finca' });
    }

    const r = await pool.query(
      `SELECT s.id_semoviente, s.nro_marca, s.nro_registro, s.nombre,
              s.fecha_nacimiento, s.sexo, s.id_raza, s.id_especie, s.id_madre, s.id_padre,
              s.id_finca, e.nombre_especie, rz.nombre_raza
         FROM semovientes s
         JOIN especies e ON e.id_especie = s.id_especie
         JOIN razas rz   ON rz.id_raza = s.id_raza
        WHERE s.id_finca = $1
        ORDER BY s.id_semoviente ASC`,
      [id_finca]
    );

    res.json({ ok: true, semovientes: r.rows });
  } catch (e) {
    next(e);
  }
};

/** POST /api/semovientes
 *  Crea en una finca (AdminFinca de esa finca o SuperAdmin).
 */
export const crearSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = crearSemovienteSchema.parse(req.body);

    // Permisos
    if (!isSuperAdmin(req)) {
      const admin = await esAdminDeFinca(userId(req), data.id_finca);
      if (!admin) return next({ statusCode: 403, message: 'Solo AdminFinca puede crear en esta finca' });
    }

    // Validar raza ↔ especie
    const okRazaEsp = await validarRazaEspecie(data.id_raza, data.id_especie);
    if (!okRazaEsp) return next({ statusCode: 400, message: 'La raza no pertenece a la especie' });

    const q = `
      INSERT INTO semovientes
        (nro_marca, nro_registro, nombre, fecha_nacimiento, sexo,
         id_raza, id_especie, id_madre, id_padre, id_finca)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id_semoviente
    `;
    const params = [
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
    ];

    const r: QueryResult<{ id_semoviente: number }> = await pool.query(q, params);
    res.status(201).json({ ok: true, id_semoviente: r.rows[0].id_semoviente });
  } catch (e: any) {
    if (e?.code === '23505') {
      return next({ statusCode: 409, message: 'nro_marca o nro_registro duplicado', detalle: e?.detail });
    }
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/** GET /api/semovientes/:id
 *  Solo miembro de la finca o SuperAdmin.
 */
export const obtenerSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(
      `SELECT s.*, e.nombre_especie, rz.nombre_raza
         FROM semovientes s
         JOIN especies e ON e.id_especie = s.id_especie
         JOIN razas rz   ON rz.id_raza = s.id_raza
        WHERE s.id_semoviente = $1
        LIMIT 1`,
      [id]
    );
    if (r.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    const id_finca = r.rows[0].id_finca as number;
    if (!isSuperAdmin(req)) {
      const miembro = await esMiembroDeFinca(userId(req), id_finca);
      if (!miembro) return next({ statusCode: 403, message: 'No tiene acceso a esta finca' });
    }

    res.json({ ok: true, semoviente: r.rows[0] });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/semovientes/:id
 *  AdminFinca de la finca del animal o SuperAdmin.
 */
export const actualizarSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const id_finca = await fincaDeSemoviente(id);
    if (!id_finca) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    if (!isSuperAdmin(req)) {
      const admin = await esAdminDeFinca(userId(req), id_finca);
      if (!admin) return next({ statusCode: 403, message: 'Solo AdminFinca puede actualizar en esta finca' });
    }

    const data = actualizarSemovienteSchema.parse(req.body);

    if (data.id_raza && data.id_especie) {
      const okRazaEsp = await validarRazaEspecie(data.id_raza, data.id_especie);
      if (!okRazaEsp) return next({ statusCode: 400, message: 'La raza no pertenece a la especie' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    for (const [k, v] of Object.entries(data)) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
    if (fields.length === 0) return next({ statusCode: 400, message: 'No hay campos para actualizar' });

    values.push(id);

    const r = await pool.query(
      `UPDATE semovientes SET ${fields.join(', ')} WHERE id_semoviente = $${i} RETURNING *`,
      values
    );
    res.json({ ok: true, semoviente: r.rows[0] });
  } catch (e: any) {
    if (e?.code === '23505') {
      return next({ statusCode: 409, message: 'nro_marca o nro_registro duplicado', detalle: e?.detail });
    }
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/** DELETE /api/semovientes/:id
 *  AdminFinca de la finca del animal o SuperAdmin.
 *  Requiere que las FKs estén configuradas como:
 *    - id_madre/id_padre: ON DELETE SET NULL
 *    - dependencias (vacunas, registros, movimientos): ON DELETE CASCADE
 */
export const eliminarSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const id_finca = await fincaDeSemoviente(id);
    if (!id_finca) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    if (!isSuperAdmin(req)) {
      const admin = await esAdminDeFinca(userId(req), id_finca);
      if (!admin) return next({ statusCode: 403, message: 'Solo AdminFinca puede eliminar en esta finca' });
    }

    const r = await pool.query(`DELETE FROM semovientes WHERE id_semoviente = $1`, [id]);
    if (r.rowCount === 0) return next({ statusCode: 404, message: 'Semoviente no encontrado' });

    res.json({ ok: true, mensaje: 'Semoviente eliminado' });
  } catch (e: any) {
    if (e?.code === '23503') {
      return next({ statusCode: 409, message: 'No se puede eliminar: tiene dependencias relacionadas' });
    }
    next(e);
  }
};
