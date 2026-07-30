#!/usr/bin/env node
/**
 * Local mirror of GitHub Actions job «Platform SDK / sdk»
 * (.github/workflows/platform-sdk.yml).
 *
 * Usage:
 *   node scripts/ci-sdk-check.js
 *   node scripts/ci-sdk-check.js --fast   # skip module ZIP builds
 *
 * Does NOT run lifecycle (needs MySQL service). That job is separate in CI.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const frontend = path.join(root, 'frontend')
const fast = process.argv.includes('--fast')

function whichPhp() {
  const candidates = [
    process.env.PHP_BIN,
    'php',
    'C:\\tools\\php\\php.exe',
    'C:\\php\\php.exe',
  ].filter(Boolean)
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-v'], { encoding: 'utf8' })
    if (r.status === 0) return bin
  }
  return null
}

function run(step, cmd, args, opts = {}) {
  process.stdout.write(`\n==> ${step}\n`)
  const useShell = opts.shell === true || (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx'))
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    encoding: 'utf8',
    shell: useShell,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  if (out.trim()) {
    const tail = out.length > 4000 ? out.slice(-4000) : out
    process.stdout.write(tail.endsWith('\n') ? tail : `${tail}\n`)
  }
  if (r.status !== 0) {
    console.error(`\nFAIL: ${step} (exit ${r.status ?? 'null'})`)
    process.exit(r.status || 1)
  }
  console.log(`OK: ${step}`)
}

const php = whichPhp()
if (!php) {
  console.error('PHP не найден. Поставь PHP 8.2+ или задай PHP_BIN.')
  process.exit(1)
}

console.log(`ci-sdk-check · root=${root}`)
console.log(`php=${php}${fast ? ' · --fast' : ''}`)

run('PHP unit tests', php, ['backend/tests/run.php'])
run('SDK API diff', php, ['backend/bin/sdk.php', 'api-diff'])
run('Certify demo-kit', php, ['backend/bin/sdk.php', 'certify', 'modules-src/demo-kit'])
run('Certify forms-sdk-reference', php, [
  'backend/bin/sdk.php',
  'certify',
  'modules-src/forms-sdk-reference',
])

if (!fs.existsSync(path.join(frontend, 'node_modules'))) {
  run('Frontend npm ci', 'npm', ['ci'], { cwd: frontend })
} else {
  console.log('\n==> Frontend deps (node_modules present — skip npm ci)')
}

run('Frontend unit tests', 'npm', ['test'], { cwd: frontend })
run('Frontend build (tsc -b && vite build)', 'npm', ['run', 'build'], { cwd: frontend })

if (!fast) {
  run('Build demo-kit package', 'node', ['scripts/build-module.js', 'demo-kit', '--yes'])
  run('Build forms-sdk-reference package', 'node', [
    'scripts/build-module.js',
    'forms-sdk-reference',
    '--yes',
  ])
} else {
  console.log('\n==> Module ZIP builds skipped (--fast)')
}

console.log('\nALL GREEN — локальный sdk-check как у GitHub Actions.')
console.log('Примечание: job lifecycle (MySQL) здесь не гоняется — только на CI.')
