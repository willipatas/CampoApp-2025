// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import { registroExtendidoSchema } from '../schemas/usuario.schema';
import { hashPassword, comparePassword } from '../utils/passwords';
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../utils/jwt';

// === Helper: no devolver contraseñas ===
const toPublicUser = (u: any) => {
  const { contrasena, ...rest } = u;
  return rest;
};

// helper: ¿es AdminFinca del id_finca? (usa pool.query directamente)
async function esAdminDeFinca(id_usuario: number, id_finca: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
       FROM usuario_finca_roles
      WHERE id_usuario = $1 AND id_finca = $2 AND rol = 'AdminFinca'
      LIMIT 1`,
    [id_usuario, id_finca]
  );
  return (r.rowCount ?? 0) > 0;
}

/* =========================================================
   REGISTRO (sin pool.connect; compatible con tu db.ts)
========================================================= */
export const registrar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as any).user || null; // puede venir vacío
    const data = registroExtendidoSchema.parse(req.body);
    const passHash = await hashPassword(data.contrasena);

    // 1) Sólo un SuperAdmin puede crear OTRO SuperAdmin.
    if (data.rol_global === 'SuperAdmin') {
      if (!actor || actor.rol !== 'SuperAdmin') {
        return next({ statusCode: 403, message: 'Sólo SuperAdmin puede crear SuperAdmin' });
      }
    }

    // 2) Si se pide asignación a finca:
    //    - SuperAdmin: puede asignar en cualquier finca
    //    - NO SuperAdmin: debe estar autenticado y ser AdminFinca de ESA finca
    if (data.asignacion) {
      if (!actor) return next({ statusCode: 401, message: 'Token requerido para asignar finca' });

      if (actor.rol !== 'SuperAdmin') {
        const ok = await esAdminDeFinca(actor.id_usuario, data.asignacion.id_finca);
        if (!ok) {
          return next({
            statusCode: 403,
            message: 'Sólo AdminFinca de esa finca (o SuperAdmin) puede asignar miembros',
          });
        }
      }
    }

    // 3) Insertar usuario (el rol ya viene validado como 'SuperAdmin' o 'Usuario')
    const insUser = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, correo_electronico, contrasena, rol, nombre_completo)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id_usuario, nombre_usuario, correo_electronico, rol, nombre_completo;`,
      [
        data.nombre_usuario,
        data.correo_electronico,
        passHash,
        data.rol_global, // 'Usuario' o 'SuperAdmin' (del esquema)
        data.nombre_completo,
      ]
    );

    const usuario = insUser.rows[0];

    // 4) Asignación opcional por-finca
    if (data.asignacion) {
      await pool.query(
        `INSERT INTO usuario_finca_roles (id_usuario, id_finca, rol)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [usuario.id_usuario, data.asignacion.id_finca, data.asignacion.rol_finca]
      );
    }

    res.status(201).json({
      ok: true,
      usuario: toPublicUser(usuario), // Asegúrate que toPublicUser esté definida
      ...(data.asignacion ? { asignacion: data.asignacion } : {}),
    });
  } catch (e: any) {
    if (e?.code === '23505') {
      return next({ statusCode: 409, message: 'Usuario o correo ya registrado', detalle: e.detail });
    }
    if (e?.issues) return next({ statusCode: 400, message: 'Datos inválidos', issues: e.issues });
    next(e);
  }
};

/* =========================================================
   LOGIN
========================================================= */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { usuario, contrasena } = req.body;

    const r = await pool.query(
      `SELECT * FROM usuarios WHERE nombre_usuario = $1 OR correo_electronico = $1 LIMIT 1`,
      [usuario]
    );
    if (r.rowCount === 0) return next({ statusCode: 401, message: 'Credenciales inválidas' });

    const u = r.rows[0];
    const ok = await comparePassword(contrasena, u.contrasena);
    if (!ok) return next({ statusCode: 401, message: 'Credenciales inválidas' });

    const payload = { id_usuario: u.id_usuario, nombre_usuario: u.nombre_usuario, rol: u.rol };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.json({ ok: true, accessToken, refreshToken, usuario: toPublicUser(u) });
  } catch (e) {
    next(e);
  }
};

/* =========================================================
   REFRESH TOKEN
========================================================= */
export const refreshTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next({ statusCode: 400, message: 'Falta refreshToken' });

    const payload = verifyAccessToken(refreshToken); // o verifyRefreshToken si lo tienes
    const newAccess = signAccessToken(payload);
    const newRefresh = signRefreshToken(payload);

    res.json({ ok: true, accessToken: newAccess, refreshToken: newRefresh });
  } catch (e) {
    next(e);
  }
};
