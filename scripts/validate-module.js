#!/usr/bin/env node
/** Validate modules-src/{slug} structure + module.json shape */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const slug = process.argv[2]
if (!slug) {
  console.error('Usage: node scripts/validate-module.js <slug>')
  process.exit(1)
}
const dir = path.join(root, 'modules-src', slug)
const errors = []
if (!fs.existsSync(dir)) errors.push('missing source dir')
const mf = path.join(dir, 'module.json')
if (!fs.existsSync(mf)) errors.push('missing module.json')
else {
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'))
  if (m.schema_version !== 1) errors.push('schema_version')
  if (m.type !== 'jasefly-module') errors.push('type')
  if (m.slug !== slug) errors.push('slug mismatch')
  if (!m.entrypoints?.backend) errors.push('entrypoints.backend')
  const be = path.join(dir, m.entrypoints.backend)
  if (!fs.existsSync(be)) errors.push('backend entry missing')
}
if (!fs.existsSync(path.join(dir, 'checksums.json')) && !process.argv.includes('--allow-no-checksums')) {
  // ok for source; required in built zip
}
if (errors.length) {
  console.error('FAIL', errors.join('; '))
  process.exit(1)
}
console.log('OK', slug)
