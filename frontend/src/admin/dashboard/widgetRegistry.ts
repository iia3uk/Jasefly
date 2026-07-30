import type { DashboardWidgetDef } from './types'
import { ContentHealthWidget } from './widgets/ContentHealthWidget'
import { McpActivityWidget } from './widgets/McpActivityWidget'
import { AnalyticsDashWidget } from './widgets/AnalyticsDashWidget'
import { WeekStatsWidget } from './widgets/WeekStatsWidget'
import { CatalogCountsWidget } from './widgets/CatalogCountsWidget'
import { PublishStatusWidget } from './widgets/PublishStatusWidget'
import { LifecycleDraftsWidget } from './widgets/LifecycleDraftsWidget'
import { MessagesWidget } from './widgets/MessagesWidget'
import { ActivityWidget } from './widgets/ActivityWidget'
import { SupportWidget } from './widgets/SupportWidget'
import { FormsWidget } from './widgets/FormsWidget'
import { OrdersWidget } from './widgets/OrdersWidget'
import { SchedulerWidget } from './widgets/SchedulerWidget'
import { NotificationsWidget } from './widgets/NotificationsWidget'
import { NewsletterWidget } from './widgets/NewsletterWidget'
import { BlogPulseWidget } from './widgets/BlogPulseWidget'
import { OverloadWidget } from './widgets/OverloadWidget'

/** Default visual order on a fresh dashboard. */
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: 'content-health',
    title: 'Контент',
    hint: 'Дыры SEO / обложки',
    span: 'half',
    defaultVisible: true,
    Component: ContentHealthWidget,
  },
  {
    id: 'mcp-activity',
    title: 'MCP / агент',
    hint: 'Журнал MCP',
    span: 'half',
    defaultVisible: true,
    Component: McpActivityWidget,
  },
  {
    id: 'analytics',
    title: 'Аналитика',
    hint: 'Пульс трафика',
    plugin: 'analytics',
    span: 'full',
    defaultVisible: true,
    Component: AnalyticsDashWidget,
  },
  {
    id: 'week-stats',
    title: 'За 7 дней',
    span: 'full',
    defaultVisible: true,
    Component: WeekStatsWidget,
  },
  {
    id: 'catalog-counts',
    title: 'Каталог',
    hint: 'Счётчики ресурсов',
    span: 'full',
    defaultVisible: true,
    Component: CatalogCountsWidget,
  },
  {
    id: 'publish-status',
    title: 'Публикации',
    span: 'full',
    defaultVisible: true,
    Component: PublishStatusWidget,
  },
  {
    id: 'lifecycle-drafts',
    title: 'Статусы и черновики',
    span: 'full',
    defaultVisible: true,
    Component: LifecycleDraftsWidget,
  },
  {
    id: 'messages',
    title: 'Сообщения',
    span: 'half',
    defaultVisible: true,
    Component: MessagesWidget,
  },
  {
    id: 'activity',
    title: 'Активность',
    span: 'half',
    defaultVisible: true,
    Component: ActivityWidget,
  },
  {
    id: 'support',
    title: 'Поддержка',
    plugin: 'support',
    span: 'half',
    defaultVisible: true,
    Component: SupportWidget,
  },
  {
    id: 'forms',
    title: 'Формы',
    plugin: 'forms',
    span: 'half',
    defaultVisible: true,
    Component: FormsWidget,
  },
  {
    id: 'blog-pulse',
    title: 'Блог',
    plugin: 'blog',
    span: 'half',
    defaultVisible: true,
    Component: BlogPulseWidget,
  },
  {
    id: 'notifications',
    title: 'Уведомления',
    plugin: 'notifications',
    span: 'half',
    defaultVisible: true,
    Component: NotificationsWidget,
  },
  {
    id: 'orders',
    title: 'Заказы',
    plugin: 'orders',
    span: 'half',
    defaultVisible: false,
    Component: OrdersWidget,
  },
  {
    id: 'scheduler',
    title: 'Планировщик',
    plugin: 'scheduler',
    span: 'half',
    defaultVisible: false,
    Component: SchedulerWidget,
  },
  {
    id: 'overload',
    title: 'Нагрузка сервера',
    hint: 'Load average и перегрузки',
    plugin: 'overload',
    span: 'half',
    defaultVisible: true,
    Component: OverloadWidget,
  },
  {
    id: 'newsletter',
    title: 'Рассылка',
    plugin: 'newsletter',
    span: 'half',
    defaultVisible: false,
    Component: NewsletterWidget,
  },
]

export const DASHBOARD_WIDGET_MAP = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w]),
) as Record<(typeof DASHBOARD_WIDGETS)[number]['id'], DashboardWidgetDef>

export function spanClass(span: DashboardWidgetDef['span']): string {
  if (span === 'full') return 'col-span-1 lg:col-span-6'
  if (span === 'third') return 'col-span-1 lg:col-span-2'
  return 'col-span-1 lg:col-span-3'
}
