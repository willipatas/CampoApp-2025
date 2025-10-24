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
