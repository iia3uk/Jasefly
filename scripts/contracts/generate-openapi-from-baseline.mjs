#!/usr/bin/env node
/**
 * Generate contracts/openapi/jasefly.v1.yaml covering 100% of baseline routes.
 * Schemas are stubbed (components/schemas/Envelope) until per-route JSON Schema is filled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'contracts/baseline/routes.v1.json'), 'utf8'));
const out = path.join(root, 'contracts/openapi/jasefly.v1.yaml');

const byPath = new Map();
for (const r of baseline.routes) {
  if (!byPath.has(r.path)) byPath.set(r.path, []);
  byPath.get(r.path).push(r);
}

let yaml = `# AUTO-GENERATED from contracts/baseline/routes.v1.json — do not hand-edit paths.
# Regenerate: node scripts/contracts/generate-openapi-from-baseline.mjs
openapi: 3.0.3
info:
  title: Jasefly Baseline API
  version: 1.0.0
  description: Full baseline HTTP surface (PHP Shared + Node VPS).
servers:
  - url: /api/v1
paths:
`;

const sortedPaths = [...byPath.keys()].sort();
for (const p of sortedPaths) {
  const oasPath = p.replace(/\{(\w+)\}/g, '{$1}');
  yaml += `  ${JSON.stringify(oasPath)}:\n`;
  for (const r of byPath.get(p).sort((a, b) => a.method.localeCompare(b.method))) {
    const op = r.method.toLowerCase();
    const opId = `${op}_${r.path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`;
    yaml += `    ${op}:\n`;
    yaml += `      operationId: ${opId || op}\n`;
    yaml += `      tags: [${JSON.stringify(r.module)}]\n`;
    yaml += `      summary: ${JSON.stringify(r.id)}\n`;
    if (r.authentication === 'auth') {
      yaml += `      security:\n        - bearerAuth: []\n`;
    }
    if (r.permission) {
      yaml += `      x-jasefly-permission: ${JSON.stringify(r.permission)}\n`;
    }
    yaml += `      x-jasefly-module: ${JSON.stringify(r.module)}\n`;
    yaml += `      responses:\n`;
    yaml += `        '200':\n          description: OK\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/SuccessEnvelope'\n`;
    if (r.authentication === 'auth') {
      yaml += `        '401':\n          description: Unauthorized\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/ErrorEnvelope'\n`;
      yaml += `        '403':\n          description: Forbidden\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/ErrorEnvelope'\n`;
    }
    yaml += `        '404':\n          description: Not found\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/ErrorEnvelope'\n`;
  }
}

yaml += `components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    SuccessEnvelope:
      type: object
      required: [success, data, meta]
      properties:
        success: { type: boolean, enum: [true] }
        data: {}
        meta:
          type: object
          properties:
            api_version: { type: string }
    ErrorEnvelope:
      type: object
      required: [success, error]
      properties:
        success: { type: boolean, enum: [false] }
        error: { type: string }
        errors: {}
        data: { nullable: true }
`;

fs.writeFileSync(out, yaml);
console.log(`Wrote ${out} (${baseline.route_count} operations across ${sortedPaths.length} paths)`);
