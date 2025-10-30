// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import { verifyAccessToken } from '../utils/jwt';

export const authRequired = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next({ statusCode: 401, message: 'Token requerido' });
  }

  try {
    const token = header.split(' ')[1].trim();

    // 1. Verificamos el token y lo guardamos en una variable
    const user = verifyAccessToken(token);

    // 2. Revisamos si el token devolvió un usuario válido
    if (!user) {
      return next({ statusCode: 401, message: 'Usuario del token no es válido o no encontrado' });
    }

    // 3. --- REVERTIDO A COMO ESTABA ---
    // Guardamos en "req.user" (en inglés) para consistencia global
    (req as any).user = user;

    next();
  } catch {
    // Esto atrapa errores como "token expirado"
    next({ statusCode: 401, message: 'Token inválido o expirado' });
  }
};

/** Verifica rol GLOBAL (e.g. 'SuperAdmin') contra usuarios.rol */
export const requireRoleGlobal =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    // Esta función ya usaba "req.user", así que está correcta.
    const user = (req as any).user as { rol?: string } | undefined;
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });
    if (!user.rol || !roles.includes(user.rol)) {
      return next({ statusCode: 403, message: 'Sin permisos (rol global requerido)' });
    }
    next();
  };

/** Verifica rol por FINCA (tabla usuario_finca_roles) */
export const requireRoleInFinca =
  (...roles: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    // Esta función ya usaba "req.user", así que está correcta.
    const user = (req as any).user as { id_usuario: number } | undefined;
    const id_finca = (req as any).fincaId as number | undefined;

    if (!user) return next({ statusCode: 401, message: 'Token requerido' });
    if (!id_finca) return next({ statusCode: 400, message: 'Debe indicar X-Finca-Id o :id en la ruta' });

    try {
      const q = `
        SELECT 1
        FROM usuario_finca_roles
        WHERE id_usuario = $1 AND id_finca = $2 AND rol = ANY($3)
        LIMIT 1;
      `;
      const r = await pool.query(q, [user.id_usuario, id_finca, roles]);
      if (r.rowCount === 0) return next({ statusCode: 403, message: 'Sin permisos en esta finca' });
      next();
    } catch (e) {
      next(e);
    }
  };