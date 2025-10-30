import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import { crearFincaSchema, actualizarFincaSchema } from '../schemas/finca.schema';

// Helpers de autorización basados en el token y roles por finca
const isSuperAdmin = (req: Request) =>
  ((req as any).user?.rol ?? '') === 'SuperAdmin';

const userId = (req: Request) => Number((req as any).user?.id_usuario);

// Lista SOLO las fincas del usuario (si no es SuperAdmin) o TODAS (si es SuperAdmin)
export const listarFincas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isSuperAdmin(req)) {
      const r = await pool.query(
        `SELECT id_finca, nombre_finca, ubicacion, nombre_admin, telefono_admin, administrador_id
         FROM fincas
         ORDER BY id_finca`
      );
      return res.json({ ok: true, fincas: r.rows });
    }

    const r = await pool.query(
      `SELECT f.id_finca, f.nombre_finca, f.ubicacion, f.nombre_admin, f.telefono_admin, f.administrador_id
       FROM fincas f
       JOIN usuario_finca_roles ufr ON ufr.id_finca = f.id_finca
       WHERE ufr.id_usuario = $1
       GROUP BY f.id_finca
       ORDER BY f.id_finca`,
      [userId(req)]
    );
    res.json({ ok: true, fincas: r.rows });
  } catch (e) {
    next(e);
  }
};

// Obtener una finca por id (visible si SuperAdmin o miembro de la finca)
export const obtenerFinca = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_finca = Number(req.params.id);

    const base = await pool.query(
      `SELECT id_finca, nombre_finca, ubicacion, nombre_admin, telefono_admin, administrador_id
       FROM fincas WHERE id_finca = $1`, [id_finca]
    );
    if (base.rowCount === 0) return next({ statusCode: 404, message: 'Finca no encontrada' });

    if (isSuperAdmin(req)) return res.json({ ok: true, finca: base.rows[0] });

    const miembro = await pool.query(
      `SELECT 1 FROM usuario_finca_roles WHERE id_finca = $1 AND id_usuario = $2 LIMIT 1`,
      [id_finca, userId(req)]
    );
    if (miembro.rowCount === 0) return next({ statusCode: 403, message: 'Sin acceso a esta finca' });

    res.json({ ok: true, finca: base.rows[0] });
  } catch (e) {
    next(e);
  }
};

// Crear finca (solo SuperAdmin)
export const crearFinca = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validar que el usuario sea SuperAdmin
    if (((req as any).user?.rol ?? '') !== 'SuperAdmin') {
      return next({ statusCode: 403, message: 'Solo SuperAdmin puede crear fincas' });
    }

    // Validar y extraer datos del body
    const data = crearFincaSchema.parse(req.body);

    // Insertar finca
    const r = await pool.query(
      `INSERT INTO fincas (nombre_finca, ubicacion, nombre_admin, telefono_admin, administrador_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id_finca, nombre_finca, ubicacion, nombre_admin, telefono_admin, administrador_id`,
      [
        data.nombre_finca,
        data.ubicacion ?? null,
        data.nombre_admin ?? null,
        data.telefono_admin ?? null,
        data.administrador_id ?? null
      ]
    );

    res.status(201).json({ ok: true, finca: r.rows[0] });
  } catch (e: any) {
    if (e?.issues) {
      return next({ statusCode: 400, message: 'Datos inválidos', detalle: e.issues });
    }
    if (e?.code === '23505') {
      return next({ statusCode: 409, message: 'Ya existe una finca con ese nombre u otro dato único' });
    }
    if (e?.code === '23503') {
      return next({ statusCode: 400, message: 'El administrador_id no corresponde a un usuario existente' });
    }
    next(e);
  }
};

// Actualizar finca (SuperAdmin o AdminFinca de esa finca)
export const actualizarFinca = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id_finca = Number(req.params.id);
    const data = actualizarFincaSchema.parse(req.body);

    // Verifica permisos: SuperAdmin o AdminFinca de esa finca
    const user = (req as any).user;
    const isSuperAdmin = user?.rol === 'SuperAdmin';

    if (!isSuperAdmin) {
      const check = await pool.query(
        `SELECT 1 FROM usuario_finca_roles
         WHERE id_finca = $1 AND id_usuario = $2 AND rol = 'AdminFinca' LIMIT 1`,
        [id_finca, user.id_usuario]
      );
      if (check.rowCount === 0)
        return next({ statusCode: 403, message: 'Solo AdminFinca puede editar esta finca' });
    }

    // Construir UPDATE dinámico
    const campos: string[] = [];
    const valores: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      campos.push(`${k} = $${i++}`);
      valores.push(v ?? null);
    }
    valores.push(id_finca);

    const q = `UPDATE fincas SET ${campos.join(', ')} WHERE id_finca = $${i} RETURNING *`;
    const upd = await pool.query(q, valores);

    if (upd.rowCount === 0)
      return next({ statusCode: 404, message: 'Finca no encontrada' });

    res.json({ ok: true, finca: upd.rows[0] });
  } catch (e: any) {
    if (e?.issues)
      return next({ statusCode: 400, message: 'Datos inválidos', detalle: e.issues });
    next(e);
  }
};


// Eliminar finca (solo SuperAdmin)
export const eliminarFinca = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSuperAdmin(req)) return next({ statusCode: 403, message: 'Solo SuperAdmin puede eliminar fincas' });

    const id_finca = Number(req.params.id);
    const del = await pool.query(`DELETE FROM fincas WHERE id_finca = $1 RETURNING id_finca`, [id_finca]);
    if (del.rowCount === 0) return next({ statusCode: 404, message: 'Finca no encontrada' });

    res.json({ ok: true, mensaje: 'Finca eliminada' });
  } catch (e) {
    next(e);
  }
};

/* =========================================================
   REGISTROS MÉDICOS POR FINCA
========================================================= */

/**
 * GET /api/fincas/:id/eventos
 * Lista todos los registros médicos de TODOS los semovientes de una finca.
 * Permisos: SuperAdmin o Miembro de la finca.
 */
export const listarEventosPorFinca = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_finca = Number(req.params.id);
    if (!id_finca) return next({ statusCode: 400, message: 'ID de finca inválido' });

    // Respetamos la convención req.user
    const user = (req as any).user; 
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    // 1. Verificar Permisos (SuperAdmin o Miembro de la finca)
    if (user.rol !== 'SuperAdmin') {
      const rPermiso = await pool.query(
        `SELECT 1 FROM usuario_finca_roles WHERE id_finca = $1 AND id_usuario = $2 LIMIT 1`,
        [id_finca, user.id_usuario]
      );
      if (rPermiso.rowCount === 0) {
        // Si no es miembro, no puede ver los eventos
        return next({ statusCode: 403, message: 'Acceso prohibido a esta finca' });
      }
    }

    // 2. Obtener los registros médicos de todos los semovientes de esa finca
    const q = `
      SELECT rm.*, s.nombre AS nombre_semoviente, s.nro_marca
      FROM registros_medicos rm
      JOIN semovientes s ON s.id_semoviente = rm.id_semoviente
      WHERE s.id_finca = $1
      ORDER BY rm.fecha_consulta DESC, rm.id_registro_medico DESC;
    `;
    
    const rEventos = await pool.query(q, [id_finca]);

    res.json({ ok: true, registros: rEventos.rows });

  } catch (e) {
    next(e);
  }
};

/* =========================================================
   REPORTE DE INVENTARIO
========================================================= */

/**
 * GET /api/fincas/:id/reportes/inventario
 * Devuelve un resumen del inventario de semovientes de una finca.
 * Permisos: SuperAdmin o Miembro de la finca.
 */
export const reporteInventarioFinca = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_finca = Number(req.params.id);
    if (!id_finca) return next({ statusCode: 400, message: 'ID de finca inválido' });

    // Respetamos la convención req.user
    const user = (req as any).user;
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    // 1. Verificar Permisos (SuperAdmin o Miembro de la finca)
    // Usamos los helpers que ya existen en este archivo
    if (!isSuperAdmin(req)) { 
      const miembro = await pool.query(
        `SELECT 1 FROM usuario_finca_roles WHERE id_finca = $1 AND id_usuario = $2 LIMIT 1`,
        [id_finca, userId(req)] // userId(req) es un helper de este archivo
      );
      if (miembro.rowCount === 0) {
        return next({ statusCode: 403, message: 'Acceso prohibido a esta finca' });
      }
    }

    // 2. Definir las consultas del reporte
    const qTotal = `SELECT COUNT(*) AS total_semovientes FROM semovientes WHERE id_finca = $1`;
    
    const qEstado = `SELECT estado, COUNT(*) AS total FROM semovientes WHERE id_finca = $1 GROUP BY estado`;
    
    // Asumo que tu tabla de especies se llama 'especies' y la columna 'nombre_especie'
    const qEspecie = `
      SELECT e.nombre_especie, COUNT(s.id_semoviente) AS total
      FROM semovientes s
      JOIN especies e ON s.id_especie = e.id_especie
      WHERE s.id_finca = $1
      GROUP BY e.nombre_especie`;
      
    const qSexo = `SELECT sexo, COUNT(*) AS total FROM semovientes WHERE id_finca = $1 GROUP BY sexo`;

    // 3. Ejecutar todo en paralelo
    const [
      resTotal,
      resEstado,
      resEspecie,
      resSexo
    ] = await Promise.all([
      pool.query(qTotal, [id_finca]),
      pool.query(qEstado, [id_finca]),
      pool.query(qEspecie, [id_finca]),
      pool.query(qSexo, [id_finca]),
    ]);

    // 4. Formatear la respuesta
    // Helper para convertir [{estado: 'Activo', total: 10}, ...] en {Activo: 10, ...}
    const arrayToObject = (arr: any[], keyField: string) => 
      arr.reduce((acc, item) => {
        acc[item[keyField]] = parseInt(item.total, 10);
        return acc;
      }, {});

    const reporte = {
      total_semovientes: parseInt(resTotal.rows[0].total_semovientes, 10),
      desglose_estado: arrayToObject(resEstado.rows, 'estado'),
      desglose_especie: arrayToObject(resEspecie.rows, 'nombre_especie'),
      desglose_sexo: arrayToObject(resSexo.rows, 'sexo'),
    };

    res.json({ ok: true, reporte });

  } catch (e) {
    next(e);
  }
};

/* =========================================================
   FUNCIÓN: REPORTE SANITARIO (PRÓXIMOS EVENTOS)
========================================================= */

/**
 * GET /api/fincas/:id/reportes/sanitario
 * Devuelve una lista de registros médicos (vacunas, etc.) con
 * una 'proxima_fecha' programada.
 * Acepta un query param "?dias=90" (default: 30)
 * Permisos: SuperAdmin o Miembro de la finca.
 */
export const reporteSanitarioFinca = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id_finca = Number(req.params.id);
    if (!id_finca) return next({ statusCode: 400, message: 'ID de finca inválido' });

    // ----- INICIO DE LA MODIFICACIÓN -----
    
    // 1. Leer el query param 'dias'. Si no viene, el default es 30.
    const dias = Number(req.query.dias) || 30;

    // Validar que sea un número razonable (ej. no más de 5 años)
    if (Number.isNaN(dias) || dias <= 0 || dias > 1825) {
      return next({ statusCode: 400, message: 'El parámetro "dias" debe ser un número válido entre 1 y 1825' });
    }
    
    // Convertir los días a un string de intervalo para SQL (ej: '90 days')
    const intervalo = `${dias} days`;

    // ----- FIN DE LA MODIFICACIÓN -----


    // Respetamos la convención req.user
    const user = (req as any).user;
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    // 2. Verificar Permisos (SuperAdmin o Miembro de la finca)
    if (!isSuperAdmin(req)) { 
      const miembro = await pool.query(
        `SELECT 1 FROM usuario_finca_roles WHERE id_finca = $1 AND id_usuario = $2 LIMIT 1`,
        [id_finca, userId(req)]
      );
      if (miembro.rowCount === 0) {
        return next({ statusCode: 403, message: 'Acceso prohibido a esta finca' });
      }
    }

    // 3. Definir la consulta del reporte (AHORA ES DINÁMICA)
    // Usamos $2::INTERVAL para pasar el intervalo de forma segura
    const q = `
      SELECT 
        rm.id_registro_medico,
        rm.proxima_fecha,
        rm.tipo_evento_medico,
        rm.nombre_vacuna,
        rm.dosis,
        rm.observaciones,
        s.id_semoviente,
        s.nombre AS nombre_semoviente,
        s.nro_marca
      FROM registros_medicos rm
      JOIN semovientes s ON s.id_semoviente = rm.id_semoviente
      WHERE 
        s.id_finca = $1
        AND rm.proxima_fecha IS NOT NULL
        AND rm.proxima_fecha BETWEEN NOW() AND (NOW() + $2::INTERVAL) -- <-- Cambio aquí
      ORDER BY 
        rm.proxima_fecha ASC;
    `;

    // 4. Ejecutar consulta (pasando el intervalo como $2)
    const resEventos = await pool.query(q, [id_finca, intervalo]); // <-- Cambio aquí

    // 5. Devolver respuesta
    res.json({ 
      ok: true, 
      reporte: {
        dias_consulta: dias, // <-- Añadido para confirmar el rango
        proximos_eventos: resEventos.rows,
        total_encontrado: resEventos.rowCount
      }
    });

  } catch (e) {
    next(e);
  }
};