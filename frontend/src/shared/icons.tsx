import {
  Box,
  Braces,
  BriefcaseBusiness,
  Bug,
  Calendar,
  ChartLine,
  CodeXml,
  Cpu,
  CreditCard,
  Database,
  File,
  FileCode,
  Folder,
  Gamepad,
  Gamepad2,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  Hash,
  HelpCircle,
  Image,
  KeyRound,
  Laptop,
  Layers,
  LayoutTemplate,
  List,
  ListOrdered,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Monitor,
  MonitorPlay,
  Network,
  Package,
  Pen,
  Plug,
  Puzzle,
  RefreshCw,
  Save,
  Send,
  Server,
  Sparkles,
  Terminal,
  UserPlus,
  Zap,
  Activity,
  Award,
  Bell,
  BookOpen,
  Bot,
  Camera,
  Check,
  CircleUser,
  Cloud,
  Compass,
  Download,
  ExternalLink,
  Eye,
  Flame,
  FolderKanban,
  GraduationCap,
  Heart,
  Home,
  Link2,
  MapPin,
  Music,
  Palette,
  Phone,
  Play,
  Rocket,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Star,
  Target,
  Trash2,
  Upload,
  Users,
  Video,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { SOCIAL_ALIASES, SOCIAL_ICONS, type SocialIconData } from '@/shared/socialIconData'
import { resolveTechBrandIcon } from '@/shared/techBrandIcons'

/** Lucide components keyed by kebab slug (tree-shake friendly curated set). */
const REGISTRY: Record<string, LucideIcon> = {
  'git-branch': GitBranch,
  send: Send,
  globe: Globe,
  mail: Mail,
  'monitor-play': MonitorPlay,
  'gamepad-2': Gamepad2,
  gamepad: Gamepad,
  cpu: Cpu,
  'code-xml': CodeXml,
  braces: Braces,
  database: Database,
  layers: Layers,
  sparkles: Sparkles,
  zap: Zap,
  network: Network,
  monitor: Monitor,
  pen: Pen,
  'chart-line': ChartLine,
  calendar: Calendar,
  'file-code': FileCode,
  'layout-template': LayoutTemplate,
  box: Box,
  terminal: Terminal,
  'briefcase-business': BriefcaseBusiness,
  hash: Hash,
  image: Image,
  'message-square': MessageSquare,
  activity: Activity,
  award: Award,
  bell: Bell,
  'book-open': BookOpen,
  bot: Bot,
  camera: Camera,
  check: Check,
  'circle-user': CircleUser,
  cloud: Cloud,
  compass: Compass,
  download: Download,
  'external-link': ExternalLink,
  eye: Eye,
  flame: Flame,
  'folder-kanban': FolderKanban,
  'graduation-cap': GraduationCap,
  heart: Heart,
  home: Home,
  'key-round': KeyRound,
  'link-2': Link2,
  'map-pin': MapPin,
  music: Music,
  palette: Palette,
  phone: Phone,
  play: Play,
  rocket: Rocket,
  search: Search,
  settings: Settings,
  shield: Shield,
  'shopping-bag': ShoppingBag,
  star: Star,
  target: Target,
  'trash-2': Trash2,
  upload: Upload,
  users: Users,
  video: Video,
  wrench: Wrench,
  package: Package,
  'refresh-cw': RefreshCw,
  folder: Folder,
  list: List,
  'list-ordered': ListOrdered,
  save: Save,
  file: File,
  'credit-card': CreditCard,
  'user-plus': UserPlus,
  map: MapIcon,
  server: Server,
  gauge: Gauge,
  plug: Plug,
  laptop: Laptop,
  bug: Bug,
  puzzle: Puzzle,
  handshake: Handshake,
}

/** Content / tech aliases → Lucide registry (used when no social/tech brand match). */
const LUCIDE_ALIASES: Record<string, string> = {
  unreal: 'gamepad-2',
  unity: 'box',
  godot: 'gamepad',
  js: 'braces',
  javascript: 'braces',
  cpp: 'code-xml',
  csharp: 'code-xml',
  c: 'code-xml',
  python: 'terminal',
  chart: 'chart-line',
  nodes: 'network',
  layout: 'layout-template',
  code: 'code-xml',
  email: 'mail',
  website: 'globe',
  web: 'globe',
  site: 'globe',
  package: 'package',
  refresh: 'refresh-cw',
  reload: 'refresh-cw',
  sync: 'refresh-cw',
  folder: 'folder',
  key: 'key-round',
  list: 'list',
  save: 'save',
  file: 'file',
  briefcase: 'briefcase-business',
  cart: 'shopping-bag',
  shop: 'shopping-bag',
  card: 'credit-card',
  'user-plus': 'user-plus',
  map: 'map',
  edit: 'pen',
  pencil: 'pen',
  server: 'server',
  hosting: 'server',
  gauge: 'gauge',
  speed: 'gauge',
  plug: 'plug',
  user: 'circle-user',
  message: 'message-square',
  bug: 'bug',
  puzzle: 'puzzle',
  handshake: 'handshake',
  laptop: 'laptop',
  desktop: 'monitor',
}

const SOCIAL_BY_SLUG = new Map(SOCIAL_ICONS.map((icon) => [icon.slug, icon]))

export type IconOption = { slug: string; label: string; kind: 'social' | 'lucide' }

export function normalizeIconSlug(raw?: string | null): string {
  return (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
}

export function resolveSocialIcon(raw?: string | null): SocialIconData | null {
  const key = normalizeIconSlug(raw)
  if (!key) return null
  const slug = SOCIAL_ALIASES[key] ?? key
  return SOCIAL_BY_SLUG.get(slug) ?? null
}

export function resolveBrandIcon(raw?: string | null): SocialIconData | null {
  return resolveSocialIcon(raw) ?? resolveTechBrandIcon(raw)
}

export function resolveIconSlug(raw?: string | null): string | null {
  const key = normalizeIconSlug(raw)
  if (!key) return null
  if (SOCIAL_ALIASES[key] || SOCIAL_BY_SLUG.has(key)) return SOCIAL_ALIASES[key] ?? key
  const tech = resolveTechBrandIcon(key)
  if (tech) return tech.slug
  return LUCIDE_ALIASES[key] ?? key
}

export function getLucideIcon(raw?: string | null): LucideIcon | null {
  const key = normalizeIconSlug(raw)
  if (!key) return null
  // Prefer brand mark when both exist
  if (resolveBrandIcon(key)) return null
  const resolved = LUCIDE_ALIASES[key] ?? key
  return REGISTRY[resolved] ?? null
}

function BrandSvg({
  icon,
  size = 24,
  className,
  ...props
}: {
  icon: SocialIconData
  size?: number | string
  className?: string
} & React.SVGProps<SVGSVGElement>) {
  const px = typeof size === 'number' ? size : undefined
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="currentColor"
      className={cn('shrink-0', className)}
      aria-hidden
      {...props}
    >
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  )
}

function StepNumberIcon({
  n,
  size = 24,
  className,
}: {
  n: string
  size?: number | string
  className?: string
}) {
  const px = typeof size === 'number' ? size : 24
  const fontSize = n.length > 1 ? Math.round(px * 0.42) : Math.round(px * 0.5)
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {n}
      </text>
    </svg>
  )
}

export function AppIcon({
  name,
  fallback = true,
  className,
  size = 24,
  ...props
}: { name?: string | null; fallback?: boolean } & LucideProps) {
  const brand = resolveBrandIcon(name)
  if (brand) {
    return <BrandSvg icon={brand} size={size} className={className} />
  }

  const key = normalizeIconSlug(name)
  if (/^\d{1,2}$/.test(key)) {
    return <StepNumberIcon n={key} size={size} className={className} />
  }

  const Icon = getLucideIcon(name)
  if (!Icon) {
    if (!fallback) return null
    return <HelpCircle size={size} className={cn('opacity-35', className)} {...props} />
  }
  return <Icon size={size} className={className} {...props} />
}

const SOCIAL_POPULAR = [
  'telegram', 'vk', 'instagram', 'youtube', 'github', 'discord', 'x', 'whatsapp',
  'linkedin', 'tiktok', 'facebook', 'steam', 'twitch', 'spotify', 'behance', 'dribbble',
  'wechat', 'line', 'kakaotalk', 'mastodon', 'bluesky', 'threads', 'reddit', 'pinterest',
]

const LUCIDE_POPULAR = [
  'globe', 'mail', 'send', 'gamepad-2', 'cpu', 'code-xml', 'braces', 'database',
  'layers', 'sparkles', 'zap', 'network', 'monitor', 'pen', 'chart-line', 'rocket', 'star', 'users',
  'server', 'package', 'layout-template', 'bot', 'shield',
]

export function popularIcons(): IconOption[] {
  const social: IconOption[] = []
  for (const slug of SOCIAL_POPULAR) {
    const icon = resolveSocialIcon(slug)
    if (icon) social.push({ slug, label: icon.title, kind: 'social' })
  }

  const lucide: IconOption[] = LUCIDE_POPULAR
    .filter((slug) => REGISTRY[slug])
    .map((slug) => ({ slug, label: slug, kind: 'lucide' as const }))

  return [...social, ...lucide]
}

export function searchIcons(query: string, limit = 40): IconOption[] {
  const q = normalizeIconSlug(query)
  if (q.length < 2) return []

  type Scored = { item: IconOption; score: number }
  const scored: Scored[] = []

  for (const icon of SOCIAL_ICONS) {
    let score = 99
    if (icon.slug === q) score = 0
    else if (icon.slug.startsWith(q)) score = 1
    else if (icon.slug.includes(q)) score = 2
    else if (normalizeIconSlug(icon.title).includes(q)) score = 3
    else {
      const aliasHit = Object.entries(SOCIAL_ALIASES).some(
        ([alias, target]) => target === icon.slug && (alias === q || alias.startsWith(q) || alias.includes(q)),
      )
      if (aliasHit) score = 2
      else continue
    }
    scored.push({ item: { slug: icon.slug, label: icon.title, kind: 'social' }, score })
  }

  for (const [alias, target] of Object.entries(SOCIAL_ALIASES)) {
    if (!(alias === q || alias.startsWith(q) || alias.includes(q))) continue
    if (!SOCIAL_BY_SLUG.has(target)) continue
    scored.push({
      item: { slug: alias, label: `${alias} → ${SOCIAL_BY_SLUG.get(target)!.title}`, kind: 'social' },
      score: alias === q ? 0 : 1,
    })
  }

  const tech = resolveTechBrandIcon(q)
  if (tech) {
    scored.push({ item: { slug: tech.slug, label: tech.title, kind: 'social' }, score: 0 })
  }

  for (const slug of Object.keys(REGISTRY)) {
    let score = 99
    if (slug === q) score = 0
    else if (slug.startsWith(q)) score = 4
    else if (slug.includes(q)) score = 5
    else continue
    scored.push({ item: { slug, label: slug, kind: 'lucide' }, score })
  }

  for (const [alias, target] of Object.entries(LUCIDE_ALIASES)) {
    if (!(alias === q || alias.startsWith(q) || alias.includes(q))) continue
    if (!REGISTRY[target]) continue
    scored.push({
      item: { slug: alias, label: `${alias} → ${target}`, kind: 'lucide' },
      score: alias === q ? 0 : 4,
    })
  }

  scored.sort((a, b) => a.score - b.score || a.item.slug.localeCompare(b.item.slug))

  const seen = new Set<string>()
  const out: IconOption[] = []
  for (const { item } of scored) {
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

export function socialIconCount(): number {
  return SOCIAL_ICONS.length
}
