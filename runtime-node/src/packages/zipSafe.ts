import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { isDangerousPath } from './ModulePaths.js';

export { isDangerousPath };

export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

export function isZipMagic(buf: Buffer | Uint8Array): boolean {
  if (buf.length < 4) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return false;
  const sig = buf[2]! | (buf[3]! << 8);
  return sig === 0x0403 || sig === 0x0506 || sig === 0x0708;
}

export interface ZipScanResult {
  ok: boolean;
  entries: string[];
  uncompressedTotal: number;
  errors: string[];
}

/** Scan ZIP central directory without decompressing (zip-bomb + slip guard). */
export function scanZip(buf: Uint8Array): ZipScanResult {
  const entries: string[] = [];
  const errors: string[] = [];
  let uncompressedTotal = 0;

  const eocdOffset = findEocdOffset(buf);
  if (eocdOffset < 0) {
    return { ok: false, entries, uncompressedTotal, errors: ['ZIP end-of-central-directory not found'] };
  }

  const centralOffset = readU32(buf, eocdOffset + 16);
  const totalEntries = readU16(buf, eocdOffset + 10);
  let offset = centralOffset;

  for (let i = 0; i < totalEntries && offset + 46 <= buf.length; i++) {
    const sig = readU32(buf, offset);
    if (sig !== CENTRAL_SIG) {
      errors.push(`Invalid central directory signature at ${offset}`);
      break;
    }

    const compMethod = readU16(buf, offset + 10);
    const compSize = readU32(buf, offset + 20);
    const uncompSize = readU32(buf, offset + 24);
    const nameLen = readU16(buf, offset + 28);
    const extraLen = readU16(buf, offset + 30);
    const commentLen = readU16(buf, offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buf.length) {
      errors.push('Truncated ZIP central filename');
      break;
    }

    const name = new TextDecoder().decode(buf.subarray(nameStart, nameEnd)).replace(/\\/g, '/');
    entries.push(name);

    if (name && !name.endsWith('/')) {
      if (isDangerousPath(name)) {
        errors.push(`Path traversal or absolute path: ${name}`);
      }
      const size = uncompSize !== 0xffffffff ? uncompSize : compSize;
      uncompressedTotal += size;
    }

    if (compMethod !== 0 && compMethod !== 8) {
      errors.push(`Unsupported compression method ${compMethod} for ${name}`);
    }

    offset = nameEnd + extraLen + commentLen;
  }

  if (entries.length === 0) {
    errors.push('ZIP contains no entries');
  }
  if (uncompressedTotal > MAX_UNCOMPRESSED_BYTES) {
    errors.push(`Uncompressed size exceeds limit (${MAX_UNCOMPRESSED_BYTES} bytes)`);
  }

  return { ok: errors.length === 0, entries, uncompressedTotal, errors };
}

/** Validate and extract ZIP into destDir (store/deflate via fflate). */
export function extractZipSafe(
  buf: Uint8Array,
  destDir: string,
  assertContained: (root: string, target: string) => string,
): void {
  const scan = scanZip(buf);
  if (!scan.ok) {
    throw new Error(scan.errors.join('; '));
  }

  fs.mkdirSync(destDir, { recursive: true });
  const files = unzipSync(buf);

  for (const [name, data] of Object.entries(files)) {
    const norm = name.replace(/\\/g, '/');
    if (isDangerousPath(norm)) {
      throw new Error(`Illegal ZIP entry path: ${norm}`);
    }
    const target = assertContained(destDir, path.join(destDir, norm));
    if (norm.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data));
  }
}

function findEocdOffset(buf: Uint8Array): number {
  const minEocd = 22;
  const start = Math.max(0, buf.length - minEocd - 65535);
  for (let i = buf.length - minEocd; i >= start; i--) {
    if (readU32(buf, i) === END_SIG) return i;
  }
  return -1;
}

function readU16(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}

function readU32(buf: Uint8Array, off: number): number {
  return (buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24)) >>> 0;
}
