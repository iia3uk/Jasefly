import argon2 from 'argon2';
import { createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { scrypt as scryptCb } from 'node:crypto';

const scrypt = promisify(scryptCb);

/** Verify PHP password_hash (argon2id / bcrypt) and legacy hashes. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    if (hash.startsWith('$argon2')) {
      return await argon2.verify(hash, password);
    }
    if (hash.startsWith('$2y$') || hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      const bcrypt = await import('bcryptjs');
      const norm = hash.startsWith('$2y$') ? `$2b$${hash.slice(4)}` : hash;
      return bcrypt.compareSync(password, norm);
    }
  } catch {
    return false;
  }
  return false;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function needsRehash(hash: string): boolean {
  return !hash.startsWith('$argon2id');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// keep scrypt import used for future if needed
void scrypt;
