import { readContractJson, type AppConfig } from '../config.js';

export interface CapabilitiesDoc {
  schema_version: number;
  baseline: string[];
  extended: string[];
  capabilities: string[];
}

export function loadCapabilitiesDoc(): CapabilitiesDoc {
  return readContractJson<CapabilitiesDoc>('capabilities/capabilities.v1.json');
}

/**
 * Capabilities advertised as usable on this process.
 * - VPS production: baseline + extended
 * - Shared / behavior parity (APP_ENV=test or BEHAVIOR_PARITY=1): baseline only (match PHP Shared)
 */
export function availableCapabilities(cfg: AppConfig): string[] {
  const doc = loadCapabilitiesDoc();
  const parity = process.env.BEHAVIOR_PARITY === '1' || cfg.env === 'test' || cfg.runtime === 'php-shared';
  if (parity) {
    return [...doc.baseline].sort();
  }
  return [...new Set([...doc.baseline, ...doc.extended])].sort();
}

export function assertModuleAllowedOnShared(manifest: {
  runtime?: { baseline?: boolean; capabilities?: string[] };
}): { ok: true } | { ok: false; reason: string } {
  const doc = loadCapabilitiesDoc();
  const ext = new Set(doc.extended);
  const caps = manifest.runtime?.capabilities ?? [];
  const needsExt = caps.filter((c) => ext.has(c));
  if (manifest.runtime?.baseline === false || needsExt.length) {
    return {
      ok: false,
      reason: `Module requires VPS-only capabilities: ${needsExt.join(', ') || '(non-baseline)'}`,
    };
  }
  return { ok: true };
}
