export type ID = number | string

export interface MediaAsset {
  id: ID
  path?: string
  thumbnail_path?: string
  webp_path?: string
  alt_text?: string
  mime_type?: string
  original_name?: string
  filename?: string
  folder_id?: ID | null
  size_bytes?: number
  missing?: boolean
}

export interface MediaFolder {
  id: ID
  name: string
  slug: string
  parent_id?: ID | null
}

export interface ProjectMediaItem {
  id?: ID
  /** File from media library; optional if `url` is set (embed / remote video). */
  media_id?: ID | null
  caption?: string | null
  media_type?: string
  /** Persisted when picked in builder (image/* or video/*). */
  media_mime?: string | null
  /** External video URL (YouTube, Rutube, VK, Vimeo, direct MP4…). */
  url?: string | null
  sort_order?: number
  path?: string
  thumbnail_path?: string
  webp_path?: string
  alt_text?: string
  original_name?: string | null
  filename?: string | null
  mime_type?: string | null
}

export interface ThemeSettings {
  preset?: string
  primary_color?: string
  accent_color?: string
  background_color?: string
  surface_color?: string
  text_color?: string
  muted_color?: string
  font_display?: string
  font_body?: string
  border_radius?: string
  glass_opacity?: number | string
  /** overlay = transparent until scroll (default); solid = classic sticky bar */
  header_style?: 'overlay' | 'solid' | string
  custom_css?: string
  custom_html?: string
  custom_js?: string
}

export interface SeoSettings {
  site_title?: string
  site_description?: string
  site_keywords?: string
  /** Target markets for schema.org areaServed: CIS | EU | USA | ASIA */
  target_regions?: string[] | string | null
  canonical_base_url?: string
  og_title?: string
  og_description?: string
  twitter_card?: string
  twitter_handle?: string
  twitter_title?: string
  twitter_description?: string
  google_analytics_id?: string
  google_tag_manager_id?: string
  custom_head_scripts?: string
  custom_body_scripts?: string
  robots_txt?: string
  favicon_media_id?: ID | null
  og_image_id?: ID | null
}

export interface SiteSettings {
  site_name?: string
  maintenance_mode?: boolean | number
  /** Заголовок экрана техработ (гость) */
  maintenance_title?: string | null
  /** Текст для гостей */
  maintenance_message?: string | null
  /** Staff (admin/editor) может открывать сайт во время техработ */
  maintenance_allow_staff?: boolean | number
  timezone?: string
  locale?: string
  posts_per_page?: number
  projects_per_page?: number
  logo_media_id?: ID | null
  cookie_banner_enabled?: boolean | number
  cookie_banner_text?: string | null
  cookie_policy_href?: string | null
  /** SPA admin UI base segment (e.g. "panel" → /panel). Empty/null = "admin". API path unchanged. */
  admin_base_path?: string | null
}

export interface NavItem {
  id: ID
  label: string
  href: string
  target?: '_self' | '_blank'
  parent_id?: ID | null
  location?: 'header' | 'footer' | 'both' | string
  sort_order?: number
  is_visible?: boolean | number
}

export interface SocialLink {
  id: ID
  platform: string
  label: string
  url: string
  icon?: string
  sort_order?: number
}

export interface HeroSettings {
  headline?: string
  subheadline?: string
  badge_text?: string
  primary_cta_label?: string
  primary_cta_href?: string
  secondary_cta_label?: string
  secondary_cta_href?: string
  background_media_id?: ID | null
  background?: MediaAsset | null
  show_scroll_indicator?: boolean | number
  animation_style?: string
}

export interface HomepageSection {
  id: ID
  section_key: string
  title?: string
  subtitle?: string
  content?: string
  cta_label?: string
  cta_href?: string
  secondary_cta_label?: string
  secondary_cta_href?: string
  is_visible?: boolean | number
  sort_order?: number
  settings_json?: Record<string, unknown> | string | null
}

export interface FooterSettings {
  copyright_text?: string
  tagline?: string
  show_social?: boolean | number
  columns_json?: Array<{
    title?: string
    links?: Array<{ label: string; href: string }>
  }> | string | null
}

export interface Profile {
  id?: ID
  name?: string
  job_title?: string
  short_bio?: string
  bio?: string
  location?: string
  availability_status?: string
  years_experience?: number
  photo_media_id?: ID | null
  avatar_media_id?: ID | null
  resume_media_id?: ID | null
  photo?: MediaAsset | null
  avatar?: MediaAsset | null
  resume?: MediaAsset | null
}

export interface Statistic {
  id: ID
  label: string
  value: string
  suffix?: string
  icon?: string
}

export interface Experience {
  id: ID
  company: string
  role: string
  location?: string
  description?: string
  start_date?: string
  end_date?: string | null
  is_current?: boolean | number
  technologies?: string[] | string | null
}

export interface Education {
  id: ID
  institution: string
  degree: string
  field_of_study?: string
  description?: string
  start_date?: string
  end_date?: string
}

export interface Skill {
  id: ID
  name: string
  percentage?: number
  icon?: string
  color?: string
}

export interface SkillCategory {
  id: ID
  name: string
  slug?: string
  description?: string
  skills?: Skill[]
}

export interface ProjectTech {
  id?: ID
  name: string
  icon?: string
}

export interface ProjectFeature {
  id?: ID
  title: string
  description?: string
  icon?: string
}

export interface ProjectTimeline {
  id?: ID
  title: string
  description?: string
  event_date?: string
}

export interface ProjectTag {
  id: ID
  name: string
  slug: string
}

export interface Project {
  id: ID
  title: string
  slug: string
  short_description?: string
  description?: string
  content?: string
  cover_media_id?: ID | null
  cover?: MediaAsset | null
  status?: string
  project_status?: string
  is_featured?: boolean | number
  sort_order?: number
  role?: string
  team_size?: number
  completion_date?: string
  github_url?: string
  website_url?: string
  steam_url?: string
  itch_url?: string
  google_play_url?: string
  app_store_url?: string
  download_url?: string
  download_label?: string
  video_url?: string
  youtube_url?: string
  challenges?: string
  seo_title?: string
  seo_description?: string
  seo_keywords?: string
  technologies?: ProjectTech[] | string[]
  features?: ProjectFeature[] | string[]
  timeline?: ProjectTimeline[]
  tags?: ProjectTag[]
  media?: ProjectMediaItem[]
  category?: { id: ID; name: string; slug: string }
  related_posts?: Array<Pick<BlogPost, 'id' | 'title' | 'slug' | 'excerpt' | 'cover' | 'cover_media_id' | 'published_at' | 'reading_time'>>
}

export interface BlogPost {
  id: ID
  title: string
  slug: string
  excerpt?: string
  content?: string
  content_format?: string
  cover_media_id?: ID | null
  cover?: MediaAsset | null
  /** Open Graph / social share image (separate from on-page cover). */
  og_image_id?: ID | null
  og_image?: MediaAsset | null
  category_id?: ID | null
  project_id?: ID | null
  status?: string
  reading_time?: number
  published_at?: string
  seo_title?: string
  seo_description?: string
  tags?: ProjectTag[]
  category?: { id: ID; name: string; slug: string }
  project?: { id: ID; title: string; slug: string } | null
  related?: BlogPost[]
  toc_json?: Array<{ id: string; text: string; level: number }> | null
}

export interface Service {
  id: ID
  title: string
  slug?: string
  short_description?: string
  description?: string
  icon?: string
  price_label?: string
  price?: number | null
  currency?: string
  is_purchasable?: boolean | number
  offer_text?: string | null
  duration_label?: string | null
  features?: string[] | string | null
}

/** Тариф / вариант покупки (дни, лицензия и т.п.). */
export interface ProductVariant {
  id?: string
  label: string
  price: number
  old_price?: number | null
  per_day?: number | null
  discount_label?: string | null
  highlight?: string | null
  sku?: string | null
}

export interface ProductTab {
  key?: string
  label: string
  html?: string
}

export interface Product {
  id: ID
  title: string
  slug: string
  sku?: string | null
  /** Бейдж статуса (Хит продаж, Новинка…). */
  badge?: string | null
  short_description?: string | null
  description?: string | null
  price: number
  currency?: string
  media_id?: number | null
  video_url?: string | null
  stock?: number | null
  sold_count?: number
  is_purchasable?: boolean | number
  is_visible?: boolean | number
  sort_order?: number
  /** Произвольные поля для динамической привязки: attrs.category, attrs.detection… */
  attrs?: Record<string, unknown> | null
  variants?: ProductVariant[] | null
  gallery?: number[] | null
  tabs?: ProductTab[] | null
  tags?: string[] | null
}

export interface Testimonial {
  id: ID
  author_name: string
  author_role?: string
  author_company?: string
  content: string
  rating?: number
}

export interface ContactInfo {
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  map_embed?: string
  map_lat?: number | string | null
  map_lng?: number | string | null
  form_enabled?: boolean | number
  form_success_message?: string
}

export interface PageLayout {
  version: number
  elements: BuilderElementDTO[]
  /** seed=true — заготовка из каталога; на сайте не подменяет классическую страницу, пока не сохраните в билдере. */
  meta?: {
    seed?: boolean
    useOnSite?: boolean
    [key: string]: unknown
  }
}

export interface BuilderElementDTO {
  id: string
  elType: 'section' | 'column' | 'widget'
  widgetType?: string
  settings?: Record<string, unknown>
  elements?: BuilderElementDTO[]
}

export interface Page {
  id: ID
  title: string
  slug: string
  content?: string
  layout_json?: string | null
  layout?: PageLayout | null
  status?: string
  seo_title?: string
  seo_description?: string
  og_image_id?: ID | null
  og_image?: MediaAsset | null
  scheduled_at?: string | null
  published_at?: string | null
  template?: string
  is_home?: boolean | number
  preview?: boolean
}

export interface ContactMessage {
  id: ID
  name: string
  email: string
  subject?: string
  message: string
  is_read?: boolean | number
  created_at?: string
}

export interface DashboardData {
  counts: Record<string, number>
  messages: ContactMessage[]
  drafts?: { projects: number; posts: number; pages?: number }
  unread_messages?: number
  publish?: {
    projects?: Record<string, number>
    posts?: Record<string, number>
    pages?: Record<string, number>
  }
  project_lifecycle?: Record<string, number>
  recent?: {
    projects_7d?: number
    posts_7d?: number
    media_7d?: number
    messages_7d?: number
  }
  trash_total?: number
  activity?: Array<{
    id: number | string
    user_name?: string | null
    action?: string
    entity_type?: string | null
    entity_id?: number | string | null
    entity_label?: string | null
    created_at?: string
  }>
}

export interface PortfolioSiteSettings {
  homepage_template?: 'classic' | 'builder' | string
  show_blog?: boolean
  show_services?: boolean
  show_testimonials?: boolean
}

export interface SitePayload {
  site_settings: SiteSettings | null
  theme: ThemeSettings | null
  seo: SeoSettings | null
  navigation: NavItem[]
  footer_nav: NavItem[]
  footer: FooterSettings | null
  social: SocialLink[]
  hero: HeroSettings | null
  homepage_sections: HomepageSection[]
  home_page?: Page | null
  /** Шаблон экрана загрузки (Suspense / lazy routes). */
  lazy_loader_page?: Page | null
  /** Публичные настройки плагина Portfolio (null если плагин выключен). */
  portfolio?: PortfolioSiteSettings | null
  /** Оверлей-переводчик (плагин translate). */
  translate?: TranslateSiteSettings | null
  /** Имена включённых плагинов — для гейта публичного сайта. */
  enabled_plugins?: string[]
}

export interface TranslateSiteSettings {
  widget_enabled?: boolean
  auto_warmup?: boolean
  geo_auto_lang?: boolean
  source_lang?: string
  languages?: string[]
  position?: string
  provider?: string
  cache_ready?: boolean
  content_hash?: string
  mode?: string
  visitor_country?: string | null
  suggested_lang?: string
  geo_via?: string
}

export interface AuthResponse {
  requires_2fa?: boolean
  challenge_token?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id: ID; email: string; name: string; role: string; totp_enabled?: boolean }
  /** Registration / email-verify extras */
  needs_verification?: boolean
  verified?: boolean
  message?: string
  redirect?: string
}

export interface ApiEnvelope<T> {
  success?: boolean
  data: T
  error?: string | null
  meta?: { api_version?: string; [key: string]: unknown }
}
