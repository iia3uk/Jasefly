/**
 * Resolve external / local package authoring roots for Core tooling.
 *
 * Priority:
 *   1. JASEFLY_MODULES_ROOT (absolute or relative to Core root) → …/modules-src or the root itself
 *   2. nested Jasefly-Modules/modules-src (local sibling repo)
 *   3. Core modules-src/ (optional leftover local packages — gitignored)
 *   4. backend/tests/fixtures/modules (CI / approved fixtures)
 *
 * Production Core runtime does NOT require any of these trees.
 */
import fs from 'fs';
import path from 'path';

function isPackageDir(dir) {
  return fs.existsSync(path.join(dir, 'module.json'));
}

function expandRoot(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return [];
  const out = [];
  const asSrc = path.join(candidate, 'modules-src');
  if (fs.existsSync(asSrc) && fs.statSync(asSrc).isDirectory()) out.push(asSrc);
  if (fs.statSync(candidate).isDirectory()) out.push(candidate);
  return out;
}

/** @param {string} coreRoot */
export function resolveModulesRoots(coreRoot) {
  const roots = [];
  const seen = new Set();
  const push = (p) => {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    roots.push(abs);
  };

  const env = process.env.JASEFLY_MODULES_ROOT?.trim();
  if (env) {
    const envPath = path.isAbsolute(env) ? env : path.resolve(coreRoot, env);
    for (const r of expandRoot(envPath)) push(r);
  }

  push(path.join(coreRoot, 'Jasefly-Modules', 'modules-src'));
  push(path.join(coreRoot, 'modules-src'));
  push(path.join(coreRoot, 'backend', 'tests', 'fixtures', 'modules'));

  return roots;
}

/** @param {string} coreRoot @param {string} slug */
export function resolveModuleSrc(coreRoot, slug) {
  for (const root of resolveModulesRoots(coreRoot)) {
    const dir = path.join(root, slug);
    if (isPackageDir(dir)) return dir;
  }
  return null;
}

/** Authoring SDK (package-side helpers), if present. */
export function resolvePackageSdkRoot(coreRoot) {
  const env = process.env.JASEFLY_MODULES_ROOT?.trim();
  const candidates = [];
  if (env) {
    const envPath = path.isAbsolute(env) ? env : path.resolve(coreRoot, env);
    candidates.push(path.join(envPath, 'package-sdk'));
    candidates.push(path.join(path.dirname(envPath), 'package-sdk'));
  }
  candidates.push(path.join(coreRoot, 'Jasefly-Modules', 'package-sdk'));
  candidates.push(path.join(coreRoot, 'package-sdk'));
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node'))) return c;
  }
  return null;
}
