// src/routes/auth.routes.ts
import { Router } from 'express';
import { registrar, login, refreshTokens } from '../controllers/auth.controller';
import { verifyAccessToken } from '../utils/jwt';

// Middleware opcional: si viene Authorization lo decodifica; si no, sigue normal
const optionalAuth = (req: any, _res: any, next: any) => {
  try {
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) req.user = verifyAccessToken(token);
  } catch (_) {}
  next();
};

const router = Router();

// Salud de este subrouter (opcional)
router.get('/_up', (_req, res) => res.json({ ok: true, via: 'auth.routes' }));

// Auth
router.post('/register', optionalAuth, registrar);
router.post('/login', login);
router.post('/refresh', refreshTokens);

export default router;
