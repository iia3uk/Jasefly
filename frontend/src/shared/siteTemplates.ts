import type { ThemeSettings } from '@/types'

export type SiteTemplate = {
  id: string
  name: string
  description: string
  preview: [string, string]
  theme: Partial<ThemeSettings>
  css?: string
}

export const CUSTOM_TEMPLATE_ID = 'custom'

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Тёмный портфолио-стиль по умолчанию. Синие акценты и мягкое свечение.',
    preview: ['#06080c', '#5b8cff'],
    theme: {
      primary_color: '#5b8cff',
      accent_color: '#8eb6ff',
      background_color: '#06080c',
      surface_color: '#0e1219',
      text_color: '#f4f6fa',
      muted_color: '#8b95a8',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '14px',
      glass_opacity: 0.08,
    },
    css: `body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  background:
    radial-gradient(900px 500px at 10% -5%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 55%),
    radial-gradient(700px 400px at 95% 10%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 50%);
}`,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Глубокий морской фон, холодные акценты, спокойная типографика.',
    preview: ['#061018', '#3d9cf0'],
    theme: {
      primary_color: '#3d9cf0',
      accent_color: '#7dd3fc',
      background_color: '#061018',
      surface_color: '#0c1c28',
      text_color: '#e8f4fc',
      muted_color: '#7f9db3',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '16px',
      glass_opacity: 0.1,
    },
    css: `.button { box-shadow: 0 8px 28px color-mix(in srgb, var(--primary) 35%, transparent); }
header { border-bottom-color: color-mix(in srgb, var(--accent) 25%, transparent) !important; }`,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Монохромный tech-look: минимум цвета, максимум контраста.',
    preview: ['#0c0c0e', '#c4c4c8'],
    theme: {
      primary_color: '#c4c4c8',
      accent_color: '#e8e8ea',
      background_color: '#0c0c0e',
      surface_color: '#16161a',
      text_color: '#f5f5f5',
      muted_color: '#8f8f98',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '8px',
      glass_opacity: 0.06,
    },
    css: `.button { letter-spacing: 0.02em; text-transform: uppercase; font-size: 0.82rem; }
.font-heading { letter-spacing: -0.04em; }`,
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Тёмно-зелёная палитра для спокойного, «земного» портфолио.',
    preview: ['#07140f', '#3dba7a'],
    theme: {
      primary_color: '#3dba7a',
      accent_color: '#86efac',
      background_color: '#07140f',
      surface_color: '#0f2319',
      text_color: '#eef8f1',
      muted_color: '#7fa38d',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '18px',
      glass_opacity: 0.09,
    },
    css: `body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  background: radial-gradient(800px 420px at 80% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%);
}`,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Тёплые оранжево-розовые акценты на тёмном фоне.',
    preview: ['#120a0f', '#f97316'],
    theme: {
      primary_color: '#f97316',
      accent_color: '#fb923c',
      background_color: '#120a0f',
      surface_color: '#1a1018',
      text_color: '#fff5f0',
      muted_color: '#b89a8f',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '20px',
      glass_opacity: 0.1,
    },
    css: `.button { background: linear-gradient(135deg, var(--primary), var(--accent)); color: #1a0a05; }
.link-text { text-decoration-color: color-mix(in srgb, var(--primary) 70%, transparent); }`,
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Кибер-неон: фиолетовый + циан, glow на интерактивных элементах.',
    preview: ['#080812', '#a855f7'],
    theme: {
      primary_color: '#a855f7',
      accent_color: '#22d3ee',
      background_color: '#080812',
      surface_color: '#12121f',
      text_color: '#f5f3ff',
      muted_color: '#9ca3af',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '12px',
      glass_opacity: 0.12,
    },
    css: `.button { box-shadow: 0 0 24px color-mix(in srgb, var(--primary) 45%, transparent); }
.button-ghost { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
a:hover, .link-nav:hover { text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 50%, transparent); }`,
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Светлая минималистичная тема — как лист бумаги.',
    preview: ['#f8f7f4', '#2563eb'],
    theme: {
      primary_color: '#2563eb',
      accent_color: '#3b82f6',
      background_color: '#f8f7f4',
      surface_color: '#ffffff',
      text_color: '#111827',
      muted_color: '#6b7280',
      font_display: 'Sora',
      font_body: 'DM Sans',
      border_radius: '10px',
      glass_opacity: 0.04,
    },
    css: `body { background-image: linear-gradient(180deg, #fff 0%, var(--background) 120px); }
header, footer { background: color-mix(in srgb, var(--surface) 92%, transparent) !important; }
.button { background: var(--primary); color: #fff; }`,
  },
  {
    id: CUSTOM_TEMPLATE_ID,
    name: 'Свой шаблон',
    description: 'Полный контроль: свой HTML, CSS и JS поверх стандартной вёрстки сайта.',
    preview: ['#1a1a2e', '#6366f1'],
    theme: {},
    css: '',
  },
]

export function getSiteTemplate(id?: string | null): SiteTemplate | undefined {
  if (!id) return SITE_TEMPLATES[0]
  return SITE_TEMPLATES.find((t) => t.id === id)
}

export function getTemplateCss(preset?: string | null): string {
  if (!preset || preset === CUSTOM_TEMPLATE_ID) return ''
  return getSiteTemplate(preset)?.css ?? ''
}

export function applySiteTemplate(current: ThemeSettings, template: SiteTemplate): ThemeSettings {
  return {
    ...current,
    preset: template.id,
    ...template.theme,
  }
}
