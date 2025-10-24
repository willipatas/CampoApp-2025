// src/middlewares/roles.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const requireRole = (role: 'Administrador' | 'Empleado' | 'SuperAdmin') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return next({ statusCode: 401, message: 'Token requerido' });

    // SuperAdmin siempre pasa
    if (user.rol === 'SuperAdmin') return next();

    if (user.rol !== role) {
      return next({ statusCode: 403, message: `Requiere rol ${role}` });
    }
    next();
  };
};