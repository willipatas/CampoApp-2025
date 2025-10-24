// src/middlewares/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const fincaContext = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('X-Finca-Id');
  const param = (req.params as any)?.id ?? (req.params as any)?.id_finca;
  const id_finca = Number(header ?? param);

  if (Number.isFinite(id_finca)) {
    (req as any).fincaId = id_finca;
  }
  next();
};
