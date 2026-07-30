/**
 * Дозапись 3 страниц, которые могли не сохраниться из‑за лимита хостинга.
 * node content/jasefly-official/reapply-three.mjs
 */
import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

loadMcpEnv()
const client = clientFromEnv()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Запускаем полный apply только для нужных slug через RESUME_FROM + STOP_AFTER
process.env.RESUME_FROM = 'features'
process.env.STOP_AFTER = 'cms-modules'

const child = spawn(process.execPath, ['content/jasefly-official/apply-visitor-copy.mjs'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code || 0))
