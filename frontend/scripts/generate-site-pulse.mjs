/**
 * Build-time snapshot for the public site (metrics + recent git activity).
 * Run before vite build: node scripts/generate-site-pulse.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const outDir = path.join(frontendRoot, 'src', 'generated')
const outFile = path.join(outDir, 'sitePulse.json')

function sh(cmd, cwd = repoRoot) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function walkCount(dir, pred, acc = { n: 0 }) {
  if (!fs.existsSync(dir)) return acc.n
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor' || name === 'dist' || name === '.git' || name === 'release') continue
    const p = path.join(dir, name)
    let st
    try {
      st = fs.statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walkCount(p, pred, acc)
    else if (pred(p, name)) acc.n++
  }
  return acc.n
}

function countPhpClasses() {
  let n = 0
  const root = path.join(repoRoot, 'backend', 'src')
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else if (name.endsWith('.php')) {
        const t = fs.readFileSync(p, 'utf8')
        n += (t.match(/\b(class|interface|enum)\s+\w+/g) || []).length
      }
    }
  }
  walk(root)
  return n
}

function countSdkInterfaces() {
  const dir = path.join(repoRoot, 'backend', 'src', 'Platform', 'Contracts')
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter((f) => f.endsWith('.php')).length
}

function countWidgets() {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'src', 'builder', 'manifest', 'widget-types.v1.json'), 'utf8'))
    return Array.isArray(man.widgets) ? man.widgets.length : 0
  } catch {
    return 0
  }
}

function countCoreModules() {
  const dir = path.join(repoRoot, 'backend', 'src', 'Modules')
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).length
}

function countPackages() {
  const dir = path.join(repoRoot, 'modules-src')
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).length
}

function countCoreRoutes() {
  const f = path.join(repoRoot, 'backend', 'routes', 'api_v1.php')
  if (!fs.existsSync(f)) return 0
  const t = fs.readFileSync(f, 'utf8')
  return (t.match(/\$router->(get|post|put|patch|delete)\s*\(/g) || []).length
}

function repoSizeMb() {
  // Prefer git object database size (stable, ignores node_modules / dist).
  const pack = sh('git count-objects -v')
  const match = pack.match(/size-pack:\s*(\d+)/i) || pack.match(/size:\s*(\d+)/i)
  if (match) {
    const kb = Number(match[1])
    if (Number.isFinite(kb) && kb > 0) return Math.round((kb / 1024) * 10) / 10
  }
  return null
}

function recentCommits(limit = 5) {
  const raw = sh(`git log -n ${limit} --pretty=format:%h%x09%ad%x09%s --date=short`)
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash, date, ...rest] = line.split('\t')
    return { hash: hash || '', date: date || '', subject: rest.join('\t') }
  }).filter((c) => c.hash)
}

const files = walkCount(repoRoot, (_p, name) => !name.startsWith('.'))
const pulse = {
  generated_at: new Date().toISOString(),
  version: sh('git describe --tags --always') || 'dev',
  commit: sh('git rev-parse --short HEAD') || '',
  metrics: {
    files,
    php_classes: countPhpClasses(),
    builder_widgets: countWidgets(),
    rest_routes_core: countCoreRoutes(),
    sdk_interfaces: countSdkInterfaces(),
    git_commits: Number(sh('git rev-list --count HEAD') || '0') || null,
    repo_size_mb: repoSizeMb(),
    core_modules: countCoreModules(),
    package_scaffolds: countPackages(),
  },
  github: {
    repo: 'iia3uk/jasefly',
    url: 'https://github.com/iia3uk/jasefly',
    latest_tag: sh('git describe --tags --abbrev=0') || '',
    latest_commit_date: sh('git log -1 --format=%ad --date=short') || '',
    commits: recentCommits(5),
  },
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(pulse, null, 2) + '\n')
console.log('Wrote', path.relative(repoRoot, outFile), 'version=', pulse.version)
