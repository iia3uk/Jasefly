import type { LucideIcon } from 'lucide-react'
import {
  AlignLeft,
  BadgeCheck,
  Boxes,
  Code2,
  Columns2,
  Contact,
  CreditCard,
  FileText,
  FormInput,
  GalleryHorizontal,
  Gauge,
  GitBranch,
  Grid3x3,
  Heading,
  HelpCircle,
  Image,
  Layers,
  LayoutTemplate,
  LineChart,
  Link2,
  ListOrdered,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  Package,
  PanelTop,
  PlayCircle,
  Quote,
  Rows3,
  Sparkles,
  Square,
  Star,
  Tags,
  Type,
  UserCircle,
  Users,
  Video,
  Wallet,
  Zap,
  ToggleLeft,
  Workflow,
  Network,
} from 'lucide-react'

/** Lucide icon for a builder widget type (palette + chrome). */
const MAP: Record<string, LucideIcon> = {
  heading: Heading,
  text: AlignLeft,
  image: Image,
  button: MousePointerClick,
  spacer: Rows3,
  divider: Minus,
  html: Code2,
  'page-loader': Loader2,
  chip: Tags,
  'chip-row': Tags,
  'connector-line': GitBranch,
  'step-badge': BadgeCheck,
  'steps-row': ListOrdered,
  'content-tabs': PanelTop,
  'media-placeholder': Square,
  'hero-block': Sparkles,
  'compare-block': Columns2,
  'showcase-block': LayoutTemplate,
  'cta-block': Zap,
  'stat-row': Gauge,
  'stats-strip': Gauge,
  'relation-flow': GitBranch,
  'process-diagram': Workflow,
  'module-toggles': ToggleLeft,
  'pipeline-panel': Workflow,
  'mcp-inspector': Network,
  hero: LayoutTemplate,
  'projects-grid': Grid3x3,
  skills: Star,
  experience: LineChart,
  'journey-timeline': GitBranch,
  'profile-hero': UserCircle,
  services: Package,
  testimonials: MessageSquareQuote,
  'blog-list': FileText,
  'contact-form': FormInput,
  'profile-card': UserCircle,
  'cta-banner': Zap,
  'image-gallery': GalleryHorizontal,
  faq: HelpCircle,
  'logos-strip': GalleryHorizontal,
  'pricing-table': CreditCard,
  'features-grid': Boxes,
  'video-embed': PlayCircle,
  'product-landing': LayoutTemplate,
  'payment-checkout': Wallet,
  'payment-methods': CreditCard,
  'seller-info': Contact,
  'offer-document': FileText,
  'auth-login': LogIn,
  'auth-register': Users,
  'access-container': Lock,
  map: MapPin,
  quote: Quote,
  link: Link2,
  video: Video,
  icon: Star,
}

const CATEGORY_FALLBACK: Record<string, LucideIcon> = {
  basic: Type,
  landing: Sparkles,
  portfolio: Layers,
  commerce: CreditCard,
  system: Code2,
  mail: FormInput,
  integration: Link2,
}

export function widgetIcon(type: string, category?: string): LucideIcon {
  if (MAP[type]) return MAP[type]
  if (type.startsWith('pl-')) return LayoutTemplate
  if (category && CATEGORY_FALLBACK[category]) return CATEGORY_FALLBACK[category]
  return Layers
}

/** Accent tint class for palette tiles by category. */
export function widgetIconTone(category?: string): string {
  switch (category) {
    case 'landing':
      return 'text-sky-300'
    case 'portfolio':
      return 'text-emerald-300'
    case 'commerce':
      return 'text-amber-300'
    case 'system':
      return 'text-zinc-300'
    case 'mail':
      return 'text-rose-300'
    case 'integration':
      return 'text-cyan-300'
    default:
      return 'text-[var(--accent,#8eb6ff)]'
  }
}

/** Mini column preview for section add buttons (1–6 cols). */
export function SectionColsPreview({ cols }: { cols: number }) {
  const n = Math.min(Math.max(cols, 1), 6)
  return (
    <span
      className="flex h-5 w-full max-w-[2.75rem] items-stretch gap-0.5"
      aria-hidden
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-[2px] bg-current opacity-70"
        />
      ))}
    </span>
  )
}
