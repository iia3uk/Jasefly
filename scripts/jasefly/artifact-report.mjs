import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { abs, findLatestRelease } from './run.mjs';

/**
 * Summarize production artifacts under release/.
 * @param {{ runtime: string, target: string }} cfg
 */
export function reportArtifacts(cfg) {
  /** @type {Array<Record<string, unknown>>} */
  const items = [];

  const phpZip =
    findLatestRelease(/^jasefly-cms-(install|update)-.*\.zip$/i) ||
    findLatestRelease(/^jasefly-cms-update-.*\.zip$/i);
  const nodeArt =
    findLatestRelease(/^jasefly-cms-vps-.*\.(tgz|zip)$/i);

  if (phpZip) {
    items.push({
      kind: 'php-shared-zip',
      path: phpZip.full,
      bytes: phpZip.size,
      mb: +(phpZip.size / 1048576).toFixed(2),
      contains_runtime_node: zipMentions(phpZip.full, 'runtime-node'),
      contains_php: true,
    });
  }

  if (nodeArt) {
    const stageDirs = fs.existsSync(abs('release'))
      ? fs
          .readdirSync(abs('release'))
          .filter((d) => d.startsWith('vps-stage-'))
          .map((d) => path.join(abs('release'), d))
          .sort()
          .reverse()
      : [];
    const stage = stageDirs[0] || null;
    let phpInStage = false;
    if (stage && fs.existsSync(stage)) {
      phpInStage = hasPhpFiles(stage);
    }
    items.push({
      kind: 'node-vps-artifact',
      path: nodeArt.full,
      bytes: nodeArt.size,
      mb: +(nodeArt.size / 1048576).toFixed(2),
      stage,
      php_in_stage: phpInStage,
    });
  }

  console.log('--- artifact report ---');
  console.log(JSON.stringify({ runtime: cfg.runtime, target: cfg.target, artifacts: items }, null, 2));
  return items;
}

function zipMentions(zipPath, needle) {
  // Cheap probe: PowerShell / tar list when available; else null
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
          `$z=[IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}'); ` +
          `$hit=@($z.Entries|Where-Object{ $_.FullName -like '*${needle}*' }).Count; $z.Dispose(); if($hit -gt 0){'yes'}else{'no'}`,
      ],
      { encoding: 'utf8', timeout: 120000 },
    );
    if (r.status === 0) return (r.stdout || '').includes('yes');
  }
  return null;
}

function hasPhpFiles(dir) {
  /** @type {string[]} */
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    let ents;
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        stack.push(p);
      } else if (e.name.endsWith('.php')) {
        return true;
      }
    }
  }
  return false;
}
