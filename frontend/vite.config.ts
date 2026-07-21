import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { execSync } from 'node:child_process'

/** Unique per build so public/ brand assets & favicon cannot stick in mobile HTTP cache. */
function resolveAssetVersion(): string {
  if (process.env.VITE_ASSET_VERSION) return process.env.VITE_ASSET_VERSION
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return `${hash}.${Date.now().toString(36)}`
  } catch {
    return Date.now().toString(36)
  }
}

function assetVersionHtmlPlugin(version: string): Plugin {
  return {
    name: 'asset-version-html',
    transformIndexHtml(html) {
      return html.replace(
        /href=(["'])\/favicon(?:-jasefly)?\.svg\1/g,
        `href=$1/favicon-jasefly.svg?v=${version}$1`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL || 'http://127.0.0.1:8080'
  const port = Number(env.VITE_DEV_PORT || 5173)
  const assetVersion = resolveAssetVersion()

  return {
    plugins: [react(), tailwindcss(), assetVersionHtmlPlugin(assetVersion)],
    define: {
      'import.meta.env.VITE_ASSET_VERSION': JSON.stringify(assetVersion),
    },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
