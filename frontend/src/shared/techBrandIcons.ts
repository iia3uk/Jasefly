/** Curated tech brand marks (Simple Icons) for CMS feature cards. */
import {
  siFramer,
  siJsonwebtokens,
  siMysql,
  siPhp,
  siReact,
  siTailwindcss,
  siTypescript,
  siVite,
} from 'simple-icons'
import type { SocialIconData } from '@/shared/socialIconData'

function brand(icon: { title: string; path: string; hex: string; slug: string }): SocialIconData {
  return { slug: icon.slug, title: icon.title, path: icon.path, hex: icon.hex }
}

const TECH_BY_SLUG: Record<string, SocialIconData> = {
  react: brand(siReact),
  vite: brand(siVite),
  mysql: brand(siMysql),
  jsonwebtokens: brand(siJsonwebtokens),
  jwt: brand(siJsonwebtokens),
  tailwindcss: brand(siTailwindcss),
  framer: brand(siFramer),
  typescript: brand(siTypescript),
  php: brand(siPhp),
}

/** Content aliases → tech brand slug. */
export const TECH_ALIASES: Record<string, string> = {
  react: 'react',
  vite: 'vite',
  mysql: 'mysql',
  db: 'mysql',
  jwt: 'jwt',
  jsonwebtokens: 'jwt',
  'json-web-tokens': 'jwt',
  tailwind: 'tailwindcss',
  tailwindcss: 'tailwindcss',
  style: 'tailwindcss',
  css: 'tailwindcss',
  framer: 'framer',
  'framer-motion': 'framer',
  motion: 'framer',
  ts: 'typescript',
  typescript: 'typescript',
  php: 'php',
}

export function resolveTechBrandIcon(raw?: string | null): SocialIconData | null {
  const key = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
  if (!key) return null
  const slug = TECH_ALIASES[key] ?? key
  return TECH_BY_SLUG[slug] ?? null
}
