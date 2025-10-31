// En: src/controllers/semovientes.controller.ts
import { Request, Response, NextFunction } from 'express';
import { QueryResult } from 'pg';
import pool from '../db';
import {
  crearSemovienteSchema,
  actualizarSemovienteSchema,
  cambiarEstadoSemovienteSchema,
} from '../schemas/semoviente.schema';

import {
  crearRegistroMedicoSchema,
  actualizarRegistroMedicoSchema,
} from '../schemas/registros_medicos.schema';

/* ======== Utilidades (Existentes) ======== */

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

const puedeEscribirRegistros = async (id_usuario: number, id_finca: number): Promise<boolean> => {
  const r: QueryResult = await pool.query(
    `SELECT 1 FROM usuario_finca_roles
     WHERE id_usuario = $1
       AND id_finca = $2
       AND rol IN ('AdminFinca', 'Empleado', 'Veterinario')
     LIMIT 1`,
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

/* ======== Endpoints de Semovientes (Existentes) ======== */

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

    const fechaIngreso = (data.tipo_ingreso === 'Compra' && data.fecha_ingreso) 
      ? data.fecha_ingreso 
      : data.fecha_nacimiento;

    const r = await pool.query(
      `INSERT INTO semovientes
         (nro_marca, nro_registro, nombre, fecha_nacimiento, sexo,
          id_raza, id_especie, id_madre, id_padre, id_finca, estado,
          fecha_ingreso, peso_actual, fecha_peso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Activo', $11, NULL, NULL)
       RETURNING *`,
      [
        data.nro_marca, data.nro_registro ?? null, data.nombre,
        data.fecha_nacimiento, data.sexo, data.id_raza, data.id_especie,
        data.id_madre ?? null, data.id_padre ?? null, data.id_finca,
        fechaIngreso
      ]
    );

    const semovienteCreado = r.rows[0];

    const tipoMovimiento = data.tipo_ingreso;
    const valorMovimiento = (data.tipo_ingreso === 'Compra') ? data.valor_compra : null;
    const obs = (data.tipo_ingreso === 'Compra') ? 'Registro de Compra' : 'Registro de Nacimiento';

    await pool.query(
      `INSERT INTO movimientos_semovientes
        (id_semoviente, tipo_movimiento, fecha_movimiento, finca_destino_id, observaciones, valor)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        semovienteCreado.id_semoviente,
        tipoMovimiento,
        fechaIngreso,
        data.id_finca,
        obs,
        valorMovimiento
      ]
    );

    res.status(201).json({ ok: true, semoviente: semovienteCreado });
    
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

// --- FUNCIÓN eliminarSemoviente ELIMINADA ---

export const cambiarEstadoSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);
    if (!id_semoviente || Number.isNaN(id_semoviente)) return next({ statusCode: 400, message: 'ID inválido' });
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
    res.json({ ok: true, mensaje: 'Estado actualizado', semoviente: rUpd.rows[0] });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

export const obtenerSemoviente = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: semovienteId } = req.params;
    // @ts-ignore
    const { id_usuario: usuarioId, rol: usuarioRol } = req.user;
    const querySemoviente = `
      SELECT s.*, s.id_finca 
      FROM semovientes s
      WHERE s.id_semoviente = $1
    `;
    const resultSemoviente = await pool.query(querySemoviente, [semovienteId]);
    if (resultSemoviente.rowCount === 0) return res.status(404).json({ ok: false, mensaje: 'Semoviente no encontrado' });
    const semoviente = resultSemoviente.rows[0];
    const fincaIdDelSemoviente = semoviente.id_finca;
    if (usuarioRol === 'SuperAdmin') return res.json(semoviente);
    const queryPermiso = `
      SELECT rol FROM usuario_finca_roles
      WHERE id_finca = $1 AND id_usuario = $2
    `;
    const resultPermiso = await pool.query(queryPermiso, [fincaIdDelSemoviente, usuarioId]);
    if (resultPermiso.rowCount === 0) return res.status(403).json({ ok: false, mensaje: 'Acceso prohibido' });
    const rolEnFinca = resultPermiso.rows[0].rol;
    const rolesPermitidos = ['AdminFinca', 'empleado', 'veterinario'];
    if (rolesPermitidos.includes(rolEnFinca)) return res.json(semoviente);
    return res.status(403).json({ ok: false, mensaje: 'No tiene permisos suficientes' });
  } catch (err) {
    next(err);
  }
};


/* =========================================================
   NUEVAS FUNCIONES: REGISTROS MÉDICOS (/eventos)
========================================================= */

const verificarPermisoSemoviente = async (
  req: Request,
  id_semoviente: number,
  tipoPermiso: 'lectura' | 'escritura' | 'admin'
): Promise<number | null> => {
  
  const user = (req as any).user as { id_usuario: number; rol: string };
  if (!user) return null;

  if (user.rol === 'SuperAdmin') {
    const rSem = await pool.query('SELECT id_finca FROM semovientes WHERE id_semoviente = $1 LIMIT 1', [id_semoviente]);
    if (rSem.rowCount === 0) return null;
    return rSem.rows[0].id_finca;
  }

  const rSem = await pool.query('SELECT id_finca FROM semovientes WHERE id_semoviente = $1 LIMIT 1', [id_semoviente]);
  if (rSem.rowCount === 0) return null;
  const id_finca = rSem.rows[0].id_finca;

  let tienePermiso = false;
  if (tipoPermiso === 'lectura') {
    tienePermiso = await esMiembroDeFinca(user.id_usuario, id_finca);
  } else if (tipoPermiso === 'escritura') {
    tienePermiso = await puedeEscribirRegistros(user.id_usuario, id_finca);
  } else if (tipoPermiso === 'admin') {
    tienePermiso = await esAdminDeFinca(user.id_usuario, id_finca);
  }

  return tienePermiso ? id_finca : null;
};


export const listarRegistrosMedicos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);

    const id_finca = await verificarPermisoSemoviente(req, id_semoviente, 'lectura');
    if (!id_finca) {
      return next({ statusCode: 403, message: 'Acceso prohibido a este semoviente' });
    }

    const r = await pool.query(
      `SELECT * FROM registros_medicos
       WHERE id_semoviente = $1
       ORDER BY fecha_consulta DESC, id_registro_medico DESC`,
      [id_semoviente]
    );

    res.json({ ok: true, registros: r.rows });
  } catch (e) {
    next(e);
  }
};

export const crearRegistroMedico = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);
    const data = crearRegistroMedicoSchema.parse(req.body);

    const id_finca = await verificarPermisoSemoviente(req, id_semoviente, 'escritura');
    if (!id_finca) {
      return next({ statusCode: 403, message: 'No autorizado para crear registros en esta finca' });
    }

    const fields = ['id_semoviente'];
    const values: any[] = [id_semoviente];
    const dollars: string[] = ['$1'];
    let idx = 2;

    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields.push(k);
        values.push(v);
        dollars.push(`$${idx++}`);
      }
    }

    const q = `
      INSERT INTO registros_medicos (${fields.join(', ')})
      VALUES (${dollars.join(', ')})
      RETURNING *`;
    
    const r = await pool.query(q, values);
    res.status(201).json({ ok: true, registro: r.rows[0] });

  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

export const actualizarRegistroMedico = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_semoviente = Number(req.params.id);
    const id_registro = Number(req.params.idRegistro);
    const data = actualizarRegistroMedicoSchema.parse(req.body);

    const id_finca = await verificarPermisoSemoviente(req, id_semoviente, 'escritura');
    if (!id_finca) {
      return next({ statusCode: 403, message: 'No autorizado para editar registros en esta finca' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [k, v] of Object.entries(data)) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }
    
    values.push(id_semoviente, id_registro);

    const q = `
      UPDATE registros_medicos
      SET ${fields.join(', ')}
      WHERE id_semoviente = $${idx} AND id_registro_medico = $${idx + 1}
      RETURNING *`;
    
    const r = await pool.query(q, values);
    if (r.rowCount === 0) {
      return next({ statusCode: 404, message: 'Registro médico no encontrado o no pertenece a este semoviente' });
    }
    
    res.json({ ok: true, registro: r.rows[0] });

  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

// --- FUNCIÓN eliminarRegistroMedico ELIMINADA ---

/* =========================================================
  FUNCIÓN: FICHA COMPLETA DE SEMOVIENTE
========================================================= */

export const getFichaCompletaSemoviente = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: semovienteId } = req.params;
    if (!semovienteId || Number.isNaN(Number(semovienteId))) {
      return next({ statusCode: 400, message: 'ID de semoviente inválido' });
    }

    // @ts-ignore
    const { id_usuario: usuarioId, rol: usuarioRol } = req.user;

    // --- 1. Consultas en Paralelo ---

    const qDatos = `
      SELECT s.*, e.nombre_especie, r.nombre_raza
      FROM semovientes s
      LEFT JOIN especies e ON s.id_especie = e.id_especie
      LEFT JOIN razas r ON s.id_raza = r.id_raza
      WHERE s.id_semoviente = $1
    `;
    const pDatos = pool.query(qDatos, [semovienteId]);

    const qMedicos = `
      SELECT * FROM registros_medicos
      WHERE id_semoviente = $1
      ORDER BY fecha_consulta DESC, id_registro_medico DESC
    `;
    const pMedicos = pool.query(qMedicos, [semovienteId]);

    const qMovimientos = `
      SELECT * FROM movimientos_semovientes
      WHERE id_semoviente = $1
      ORDER BY fecha_movimiento DESC, id_movimiento DESC
    `;
    const pMovimientos = pool.query(qMovimientos, [semovienteId]);
    
    const [resDatos, resMedicos, resMovimientos] = await Promise.all([
      pDatos,
      pMedicos,
      pMovimientos,
    ]);

    // --- 2. Verificar Existencia y Permisos ---

    if (resDatos.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Semoviente no encontrado' });
    }

    const semoviente = resDatos.rows[0];
    const fincaIdDelSemoviente = semoviente.id_finca;

    if (usuarioRol === 'SuperAdmin') {
      return res.json({
        ok: true,
        datos: semoviente,
        historial_medico: resMedicos.rows,
        historial_movimientos: resMovimientos.rows,
      });
    }

    const queryPermiso = `
      SELECT rol FROM usuario_finca_roles
      WHERE id_finca = $1 AND id_usuario = $2
    `;
    const resPermiso = await pool.query(queryPermiso, [fincaIdDelSemoviente, usuarioId]);

    if (resPermiso.rowCount === 0) {
      return res.status(403).json({ ok: false, mensaje: 'Acceso prohibido' });
    }
    
    const rolesPermitidos = ['AdminFinca', 'Empleado', 'Veterinario'];
    if (rolesPermitidos.includes(resPermiso.rows[0].rol)) {
      return res.json({
        ok: true,
        datos: semoviente,
        historial_medico: resMedicos.rows,
        historial_movimientos: resMovimientos.rows,
      });
    }

    return res.status(403).json({ ok: false, mensaje: 'No tiene permisos suficientes' });

  } catch (err) {
    next(err);
  }
};