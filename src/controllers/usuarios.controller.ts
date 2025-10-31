import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import {
  actualizarPerfilSchema,
  actualizarUsuarioAdminSchema,
  cambiarContrasenaSchema,
  cambiarPasswordSelfSchema,
  cambiarPasswordAdminSchema,
} from '../schemas/usuario.schema';
import { comparePassword, hashPassword } from '../utils/passwords';
import { resetPwdAdminSchema } from '../schemas/usuario.schema';

// Nunca exponer contraseñas
const toPublicUser = (u: any) => {
  const { contrasena, ...rest } = u;
  return rest;
};

/** GET /api/usuarios/me */
export const getMiPerfil = async (req: Request, res: Response, next: NextFunction) => {
  try {
    
    const userFromToken = (req as any).user as { id_usuario: number; rol: string };

    const qUsuario = `
      SELECT id_usuario, nombre_usuario, correo_electronico, rol, nombre_completo
      FROM usuarios
      WHERE id_usuario = $1
      LIMIT 1;
    `;
    const pUsuario = pool.query(qUsuario, [userFromToken.id_usuario]);

    let pFincas; 

    if (userFromToken.rol === 'SuperAdmin') {
      
      const qFincasSuperAdmin = `
        SELECT id_finca, nombre_finca, 'SuperAdmin' AS rol_en_finca
        FROM fincas
        ORDER BY nombre_finca;
      `;
      pFincas = pool.query(qFincasSuperAdmin);
    } else {
      
      const qFincasUsuario = `
        SELECT f.id_finca, f.nombre_finca, ufr.rol AS rol_en_finca
        FROM usuario_finca_roles ufr
        JOIN fincas f ON f.id_finca = ufr.id_finca
        WHERE ufr.id_usuario = $1
        ORDER BY f.nombre_finca;
      `;
      pFincas = pool.query(qFincasUsuario, [userFromToken.id_usuario]);
    }

    const [resultUsuario, resultFincas] = await Promise.all([pUsuario, pFincas]);

    if (resultUsuario.rowCount === 0) {
      return next({ statusCode: 404, message: 'Usuario no encontrado' });
    }

  
    res.json({
      ok: true,
      usuario: toPublicUser(resultUsuario.rows[0]),
      fincas: resultFincas.rows, // Esta lista ahora estará llena para el SuperAdmin
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/usuarios  -> ahora solo SuperAdmin (validado en ruta)
export const listarUsuarios = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const q = `
      SELECT id_usuario, nombre_usuario, correo_electronico, rol, nombre_completo
      FROM usuarios
      ORDER BY id_usuario ASC;
    `;
    const result = await pool.query(q);
    res.json({ ok: true, usuarios: result.rows });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/usuarios/me */
export const actualizarMiPerfil = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req as any).user as { id_usuario: number };
    const data = actualizarPerfilSchema.parse(req.body);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.nombre_completo) { fields.push(`nombre_completo = $${idx++}`); values.push(data.nombre_completo); }
    if (data.correo_electronico) { fields.push(`correo_electronico = $${idx++}`); values.push(data.correo_electronico); }

    if (fields.length === 0) return next({ statusCode: 400, message: 'Debe enviar al menos un campo' });

    const q = `
      UPDATE usuarios
      SET ${fields.join(', ')}
      WHERE id_usuario = $${idx}
      RETURNING id_usuario, nombre_usuario, correo_electronico, rol, nombre_completo;
    `;
    values.push(me.id_usuario);

    const result = await pool.query(q, values);
    res.json({ ok: true, usuario: toPublicUser(result.rows[0]) });
  } catch (e: any) {
    if (e?.code === '23505') {
      const detalle = e?.detail || 'Registro duplicado';
      let campo = 'campo único';
      if (detalle.includes('nombre_usuario')) campo = 'nombre_usuario';
      else if (detalle.includes('correo_electronico')) campo = 'correo_electronico';
      return next({ statusCode: 409, message: `Ya existe un registro con ese ${campo}`, detalle });
    }
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/** PATCH /api/usuarios/me/password */
export const cambiarMiContrasena = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req as any).user as { id_usuario: number };
    const { contrasena_actual, contrasena_nueva } = cambiarContrasenaSchema.parse(req.body);

    const rSel = await pool.query(
      'SELECT contrasena FROM usuarios WHERE id_usuario = $1 LIMIT 1',
      [me.id_usuario]
    );
    if (rSel.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });

    const hashActual: string = rSel.rows[0].contrasena;
    const coincide = await comparePassword(contrasena_actual, hashActual);
    if (!coincide) return next({ statusCode: 401, message: 'Contraseña actual incorrecta' });
    if (contrasena_actual === contrasena_nueva) {
      return next({ statusCode: 400, message: 'La nueva contraseña no puede ser igual a la actual' });
    }

    const nuevaHash = await hashPassword(contrasena_nueva);
    await pool.query('UPDATE usuarios SET contrasena = $1 WHERE id_usuario = $2', [nuevaHash, me.id_usuario]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/** PATCH /api/usuarios/:id (Admin) */
export const actualizarUsuarioAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const data = actualizarUsuarioAdminSchema.parse(req.body);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.nombre_usuario) { fields.push(`nombre_usuario = $${idx++}`); values.push(data.nombre_usuario); }
    if (data.correo_electronico) { fields.push(`correo_electronico = $${idx++}`); values.push(data.correo_electronico); }
    if (data.nombre_completo) { fields.push(`nombre_completo = $${idx++}`); values.push(data.nombre_completo); }
    if (data.rol) { fields.push(`rol = $${idx++}`); values.push(data.rol); }

    if (fields.length === 0) return next({ statusCode: 400, message: 'No hay campos para actualizar' });

    const q = `
      UPDATE usuarios
      SET ${fields.join(', ')}
      WHERE id_usuario = $${idx}
      RETURNING id_usuario, nombre_usuario, correo_electronico, rol, nombre_completo;
    `;
    values.push(id);

    const result = await pool.query(q, values);
    if (result.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });
    res.json({ ok: true, usuario: toPublicUser(result.rows[0]) });
  } catch (e: any) {
    if (e?.code === '23505') {
      const detalle = e?.detail || 'Registro duplicado';
      let campo = 'campo único';
      if (detalle.includes('nombre_usuario')) campo = 'nombre_usuario';
      else if (detalle.includes('correo_electronico')) campo = 'correo_electronico';
      return next({ statusCode: 409, message: `Ya existe un registro con ese ${campo}`, detalle });
    }
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/**
 * DELETE /api/usuarios/:id
 * Reglas:
 *  - SuperAdmin: puede eliminar a cualquiera, pero NO a SuperAdmin (entre sí no se eliminan).
 *  - AdminFinca: solo usuarios de SU finca y NO SuperAdmin.
 */
export const eliminarUsuario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = Number(req.params.id);
    const authUser = (req as any).user;

    if (!authUser) return next({ statusCode: 401, message: 'Token requerido' });
    if (!targetId || Number.isNaN(targetId)) return next({ statusCode: 400, message: 'ID inválido' });

    // Traemos rol del objetivo
    const rU = await pool.query(
      `SELECT id_usuario, rol FROM usuarios WHERE id_usuario = $1 LIMIT 1`,
      [targetId]
    );
    if (rU.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });

    const objetivoRol: string = rU.rows[0].rol;

    // 1) SuperAdmin
    if (authUser.rol === 'SuperAdmin') {
      if (objetivoRol === 'SuperAdmin') {
        return next({ statusCode: 403, message: 'Los SuperAdmin no pueden eliminar a otros SuperAdmin' });
      }
      await pool.query('DELETE FROM usuarios WHERE id_usuario = $1', [targetId]);
      return res.json({ ok: true, mensaje: 'Usuario eliminado (SuperAdmin)' });
    }

    // 2) AdminFinca: solo si el objetivo pertenece a alguna finca donde el admin también sea AdminFinca
    //    y el objetivo NO es SuperAdmin
    if (objetivoRol === 'SuperAdmin') {
      return next({ statusCode: 403, message: 'No puede eliminar un SuperAdmin' });
    }

    // ¿comparten una finca donde authUser es AdminFinca?
    const rShare = await pool.query(
      `
      SELECT 1
      FROM usuario_finca_roles u1
      JOIN usuario_finca_roles u2
        ON u1.id_finca = u2.id_finca
      WHERE u1.id_usuario = $1 AND u1.rol = 'AdminFinca'
        AND u2.id_usuario = $2
      LIMIT 1
      `,
      [authUser.id_usuario, targetId]
    );

    if (rShare.rowCount === 0) {
      return next({
        statusCode: 403,
        message: 'Solo puede eliminar usuarios de sus fincas (y nunca SuperAdmin)',
      });
    }

    await pool.query('DELETE FROM usuarios WHERE id_usuario = $1', [targetId]);
    return res.json({ ok: true, mensaje: 'Usuario eliminado' });
  } catch (e: any) {
    if (e?.code === '23503') {
      return next({ statusCode: 409, message: 'No se puede eliminar: tiene datos relacionados', detalle: e?.detail });
    }
    next(e);
  }
};

export const resetearContrasenaAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = Number(req.params.id);
    const { nueva } = resetPwdAdminSchema.parse(req.body);

    const hash = await hashPassword(nueva);
    const r = await pool.query(
      'UPDATE usuarios SET contrasena = $1 WHERE id_usuario = $2',
      [hash, id]
    );

    if (r.rowCount === 0) {
      return next({ statusCode: 404, message: 'Usuario no encontrado' });
    }
    res.json({ ok: true, mensaje: 'Contraseña reseteada' });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

export const cambiarPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = Number(req.params.id);
    const authUser = (req as any).user;

    if (!authUser) return next({ statusCode: 401, message: 'Token requerido' });
    if (!targetId || Number.isNaN(targetId)) {
      return next({ statusCode: 400, message: 'ID inválido' });
    }

    // MODO SUPERADMIN → puede cambiar la de OTROS usuarios solo con { nueva }
    if (authUser.rol === 'SuperAdmin' && authUser.id_usuario !== targetId) {
      const { nueva } = cambiarPasswordAdminSchema.parse(req.body);

      const exists = await pool.query('SELECT 1 FROM usuarios WHERE id_usuario = $1', [targetId]);
      if (exists.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });

      const passHash = await hashPassword(nueva);
      await pool.query('UPDATE usuarios SET contrasena = $1 WHERE id_usuario = $2', [passHash, targetId]);

      return res.json({ ok: true, mensaje: 'Contraseña actualizada por SuperAdmin' });
    }

    // MODO PROPIETARIO → solo su propia contraseña con { contrasena_actual, nueva }
    if (authUser.id_usuario !== targetId) {
      return next({
        statusCode: 403,
        message: 'No autorizado: solo SuperAdmin puede cambiar contraseñas de terceros',
      });
    }

    const { contrasena_actual, nueva } = cambiarPasswordSelfSchema.parse(req.body);

    const userRow = await pool.query('SELECT contrasena FROM usuarios WHERE id_usuario = $1', [targetId]);
    if (userRow.rowCount === 0) return next({ statusCode: 404, message: 'Usuario no encontrado' });

    const ok = await comparePassword(contrasena_actual, userRow.rows[0].contrasena);
    if (!ok) return next({ statusCode: 400, message: 'Contraseña actual incorrecta' });

    const passHash = await hashPassword(nueva);
    await pool.query('UPDATE usuarios SET contrasena = $1 WHERE id_usuario = $2', [passHash, targetId]);

    return res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (e: any) {
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', detalle: e.issues });
    next(e);
  }
};