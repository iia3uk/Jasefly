import fs from 'node:fs';
import path from 'node:path';
import { CONTRACTS_ROOT } from '../config.js';

type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
};

const cache = new Map<string, JsonSchema>();

function loadSchema(name: string): JsonSchema {
  if (cache.has(name)) return cache.get(name)!;
  const p = path.join(CONTRACTS_ROOT, 'schema', name);
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as JsonSchema;
  cache.set(name, doc);
  return doc;
}

function typeOk(value: unknown, type: string | string[] | undefined): boolean {
  if (!type) return true;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    if (t === 'null') return value === null;
    if (t === 'array') return Array.isArray(value);
    if (t === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === t;
  });
}

/** Minimal draft-07 subset validator for envelope schemas (no external Ajv dep required). */
export function validateAgainstSchema(schemaName: string, value: unknown): string[] {
  const schema = loadSchema(schemaName);
  const problems: string[] = [];
  walk(schema, value, '', problems);
  return problems;
}

function walk(schema: JsonSchema, value: unknown, at: string, problems: string[]) {
  if (schema.const !== undefined && value !== schema.const) {
    problems.push(`${at || '$'}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (!typeOk(value, schema.type)) {
    problems.push(`${at || '$'}: type mismatch`);
    return;
  }
  if (schema.required && value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required) {
      if (!(k in obj)) problems.push(`${at || '$'}: missing ${k}`);
    }
  }
  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (k in obj) walk(sub, obj[k], `${at}.${k}`, problems);
    }
  }
}

export function assertSuccessEnvelope(body: unknown): string[] {
  return validateAgainstSchema('envelope.success.v1.json', body);
}

export function assertErrorEnvelope(body: unknown): string[] {
  return validateAgainstSchema('envelope.error.v1.json', body);
}
