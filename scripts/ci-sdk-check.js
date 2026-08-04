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

/** @returns {{ bin: string, args: string[] } | null} */
function whichPhp() {
  const wingetPhpDir = (() => {
    try {
      const base = path.join(
        process.env.LOCALAPPDATA || '',
        'Microsoft',
        'WinGet',
        'Packages',
      )
      if (!fs.existsSync(base)) return null
      const hit = fs
        .readdirSync(base)
        .find((n) => /^PHP\.PHP\./i.test(n))
      if (!hit) return null
      const dir = path.join(base, hit)
      return fs.existsSync(path.join(dir, 'php.exe')) ? dir : null
    } catch {
      return null
    }
  })()

  /** @type {Array<{ bin: string, args?: string[] }>} */
  const candidates = [
    process.env.PHP_BIN ? { bin: process.env.PHP_BIN } : null,
    wingetPhpDir
      ? {
          bin: path.join(wingetPhpDir, 'php.exe'),
          args: [
            '-d',
            `extension_dir=${path.join(wingetPhpDir, 'ext')}`,
            '-d',
            'extension=pdo_sqlite',
            '-d',
            'extension=sqlite3',
          ],
        }
      : null,
    { bin: 'php' },
    { bin: 'C:\\tools\\php\\php.exe' },
    { bin: 'C:\\php\\php.exe' },
  ].filter(Boolean)

  /** @type {{ bin: string, args: string[] } | null} */
  let fallback = null
  for (const c of candidates) {
    const args = c.args || []
    const v = spawnSync(c.bin, [...args, '-v'], { encoding: 'utf8' })
    if (v.status !== 0) continue
    const mods = spawnSync(c.bin, [...args, '-m'], { encoding: 'utf8' })
    const modOut = `${mods.stdout || ''}${mods.stderr || ''}`
    const resolved = { bin: c.bin, args }
    if (/\bpdo_sqlite\b/i.test(modOut)) return resolved
    if (!fallback) fallback = resolved
  }
  return fallback
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
console.log(`php=${php.bin}${php.args.length ? ' (+sqlite ext)' : ''}${fast ? ' · --fast' : ''}`)

// Mirror GHA: pdo_sqlite must be loaded or ~170 tests are SKIP and CI will diverge.
const phpMods = spawnSync(php.bin, [...php.args, '-m'], { encoding: 'utf8' })
const modOut = `${phpMods.stdout || ''}${phpMods.stderr || ''}`
if (!/\bpdo_sqlite\b/i.test(modOut)) {
  console.error('FAIL: PHP без pdo_sqlite — поставь extension или PHP_BIN как в GHA (php 8.2 + pdo_sqlite).')
  console.error('Иначе локальный прогон пропустит SQLite-тесты и расходится с GitHub Actions.')
  process.exit(1)
}

const phpArgs = (...rest) => [...php.args, ...rest]
run('PHP unit tests', php.bin, phpArgs('backend/tests/run.php'))
run('SDK API diff', php.bin, phpArgs('backend/bin/sdk.php', 'api-diff'))
run('Certify demo-kit', php.bin, phpArgs(
  'backend/bin/sdk.php',
  'certify',
  'backend/tests/fixtures/modules/demo-kit',
))
run('Certify forms-sdk-reference', php.bin, phpArgs(
  'backend/bin/sdk.php',
  'certify',
  'backend/tests/fixtures/modules/forms-sdk-reference',
))

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
