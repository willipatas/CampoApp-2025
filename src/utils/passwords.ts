// src/utils/passwords.ts
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = async (plain: string) => {
  return bcrypt.hash(plain, ROUNDS);
};

export const comparePassword = async (plain: string, hash: string) => {
  return bcrypt.compare(plain, hash);
};
