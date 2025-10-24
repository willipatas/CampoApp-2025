// src/utils/jwt.ts
import jwt, { SignOptions } from 'jsonwebtoken';

export type JwtPayload = {
  id_usuario: number;
  rol: string;
  nombre_usuario: string;
};

const {
  JWT_SECRET,
  REFRESH_SECRET,
  JWT_EXPIRES_IN = '15m',
  REFRESH_EXPIRES_IN = '7d',
} = process.env as Record<string, string>;

if (!JWT_SECRET || !REFRESH_SECRET) {
  throw new Error('Faltan JWT_SECRET o REFRESH_SECRET en el archivo .env');
}

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: REFRESH_EXPIRES_IN };
  return jwt.sign(payload, REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
