import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { useAdminSingleton } from '@/hooks/useApi'
import { t } from '@/admin/i18n'
import { getSiteTemplate, getTemplateCss } from '@/shared/siteTemplates'
import { themeStyleVars } from '@/shared/themeStyleVars'
import {
  BlogPostView,
  ContactInfoView,
  EducationItemView,
  ExperienceItemView,
  FooterPreviewView,
  HeroView,
  HomepageSectionView,
  NavItemView,
  ProfileHeroView,
  ProjectDetailView,
  ServiceCardView,
  SkillItemView,
  SocialLinkView,
  StatisticItemView,
  TestimonialCardView,
} from '@/shared/views'
import type { ThemeSettings } from '@/types'
import { Container, RichText, Section, SurfacePanel } from '@/components/ui'
import { AppIcon } from '@/shared/icons'

type ShellProps = {
  children: ReactNode
  status?: string | null
  label?: string
  /** When editing theme, pass form colors so preview updates live */
  themeOverride?: Partial<ThemeSettings> | null
}

type Device = 'desktop' | 'tablet' | 'mobile'

const deviceWidth: Record<Device, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

export function PreviewShell({ children, status, label, themeOverride }: ShellProps) {
  const { data: savedTheme } = useAdminSingleton<ThemeSettings>('theme')
  const theme = themeOverride ?? savedTheme
  const [device, setDevice] = useState<Device>('desktop')

  const badge =
    status === 'published'
      ? t.previewPublished
      : status === 'draft'
        ? t.previewDraft
        : label ?? t.previewUnpublished

  const presetCss = useMemo(() => getTemplateCss(theme?.preset), [theme?.preset])
  const customCss = theme?.custom_css?.trim() ?? ''

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t.preview}</span>
        <div className="flex items-center gap-1">
          {(
            [
              ['desktop', Monitor, t.previewDesktop],
              ['tablet', Tablet, t.previewTablet],
              ['mobile', Smartphone, t.previewMobile],
            ] as const
          ).map(([id, Icon, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={device === id}
              onClick={() => setDevice(id)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
                device === id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
          <span className="ml-2 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-zinc-400">{badge}</span>
        </div>
      </div>
      <div className="admin-quiet-scroll flex max-h-[min(78vh,860px)] justify-center overflow-y-auto bg-[#08080a] p-3 sm:p-4">
        <div
          className="admin-preview-surface w-full overflow-hidden rounded-xl border border-white/[0.06] shadow-2xl transition-[max-width] duration-200"
          style={{
            maxWidth: deviceWidth[device],
            ...themeStyleVars(theme),
          }}
        >
          {presetCss ? <style>{presetCss}</style> : null}
          {customCss ? <style>{customCss}</style> : null}
          {children}
        </div>
      </div>
    </div>
  )
}

type Data = Record<string, any>

export function HeroPreview({ form }: { form: Data }) {
  return (
    <PreviewShell>
      <HeroView hero={form} animate={false} />
    </PreviewShell>
  )
}

export function ProfilePreview({ form }: { form: Data }) {
  return (
    <PreviewShell>
      <ProfileHeroView profile={form} />
    </PreviewShell>
  )
}

export function BlogPostPreview({ form }: { form: Data }) {
  return (
    <PreviewShell status={form.status}>
      <BlogPostView post={form} />
    </PreviewShell>
  )
}

export function ProjectPreview({ form }: { form: Data }) {
  return (
    <PreviewShell status={form.status}>
      <ProjectDetailView project={form} />
    </PreviewShell>
  )
}

export function CrudItemPreview({ form, resource }: { form: Data; resource: string }) {
  let body: ReactNode = null

  if (resource === 'experience') {
    body = (
      <Section className="pt-8">
        <Container>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Опыт</p>
          <ExperienceItemView item={form} />
        </Container>
      </Section>
    )
  } else if (resource === 'education') {
    body = (
      <Section className="pt-8">
        <Container>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Образование</p>
          <EducationItemView item={form} />
        </Container>
      </Section>
    )
  } else if (resource === 'services') {
    body = (
      <Section className="pt-8">
        <Container>
          <ServiceCardView service={form} index={0} />
        </Container>
      </Section>
    )
  } else if (resource === 'testimonials') {
    body = (
      <Section className="pt-8">
        <Container>
          <TestimonialCardView item={form} />
        </Container>
      </Section>
    )
  } else if (resource === 'skills') {
    body = (
      <Section className="pt-8">
        <Container>
          <SurfacePanel className="p-6 sm:p-8">
            <SkillItemView form={form} />
          </SurfacePanel>
        </Container>
      </Section>
    )
  } else if (resource === 'navigation') {
    body = <NavItemView form={form} />
  } else if (resource === 'statistics') {
    body = (
      <Section className="pt-8">
        <Container>
          <StatisticItemView form={form} />
        </Container>
      </Section>
    )
  } else if (resource === 'social-links') {
    body = (
      <Section className="pt-8">
        <Container>
          <SocialLinkView form={form} />
        </Container>
      </Section>
    )
  } else if (resource === 'skill-categories') {
    body = (
      <Section className="pt-8">
        <Container>
          <SurfacePanel className="p-6">
            <p className="font-heading text-2xl font-semibold">{String(form.name || 'Категория')}</p>
            {form.description ? <p className="mt-3 text-[var(--muted)]">{String(form.description)}</p> : null}
            {form.slug ? <p className="mt-2 text-xs text-[var(--muted)]">/{String(form.slug)}</p> : null}
          </SurfacePanel>
        </Container>
      </Section>
    )
  } else {
    const title =
      form.title ?? form.name ?? form.company ?? form.institution ?? form.author_name ?? form.label ?? form.platform ?? 'Элемент'
    const subtitle =
      form.role ?? form.degree ?? form.short_description ?? form.href ?? form.url ?? form.field_of_study ?? ''
    const content = form.content ?? form.description ?? ''
    body = (
      <Section className="pt-8">
        <Container>
          <SurfacePanel className="p-6">
            <div className="flex items-start gap-3">
              {form.icon != null && String(form.icon).trim() !== '' && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <AppIcon name={String(form.icon)} size={18} />
                </span>
              )}
              <div>
                <h2 className="font-heading text-xl font-semibold">{String(title)}</h2>
                {subtitle ? <p className="mt-2 text-sm text-[var(--muted)]">{String(subtitle)}</p> : null}
              </div>
            </div>
            {typeof content === 'string' && content.includes('<') ? (
              <div className="mt-4"><RichText html={content} /></div>
            ) : content ? (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{String(content)}</p>
            ) : null}
          </SurfacePanel>
        </Container>
      </Section>
    )
  }

  return <PreviewShell label={resource}>{body}</PreviewShell>
}

export function HomepageSectionPreview({ form }: { form: Data }) {
  return (
    <PreviewShell>
      <HomepageSectionView form={form} />
    </PreviewShell>
  )
}

export function SingletonPreview({ form, path }: { form: Data; path: string }) {
  if (path === 'footer') {
    return (
      <PreviewShell label={path}>
        <FooterPreviewView form={form} />
      </PreviewShell>
    )
  }
  if (path === 'contact-info') {
    return (
      <PreviewShell label={path}>
        <ContactInfoView form={form} />
      </PreviewShell>
    )
  }

  const entries = Object.entries(form).filter(
    ([k, v]) => !['id', 'created_at', 'updated_at', 'show_social', 'maintenance_mode'].includes(k) && v != null && String(v) !== '',
  ).slice(0, 12)

  return (
    <PreviewShell label={path}>
      <Section className="pt-8">
        <Container>
          <dl className="space-y-3 text-sm">
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">{key.replace(/_/g, ' ')}</dt>
                <dd className="mt-1 break-words text-[var(--text)]">{String(value).slice(0, 160)}</dd>
              </div>
            ))}
            {!entries.length && <p className="text-[var(--muted)]">Заполните поля слева — здесь появится превью.</p>}
          </dl>
        </Container>
      </Section>
    </PreviewShell>
  )
}

export function ThemePreview({ form }: { form: Data }) {
  const preset = form.preset || 'midnight'
  const template = getSiteTemplate(preset)
  const colors = [
    ['primary', form.primary_color],
    ['accent', form.accent_color],
    ['bg', form.background_color],
    ['surface', form.surface_color],
    ['text', form.text_color],
    ['muted', form.muted_color],
  ] as const

  return (
    <PreviewShell label={template?.name ?? preset} themeOverride={form}>
      {form.custom_html ? (
        <div className="overflow-hidden border-b border-white/10" dangerouslySetInnerHTML={{ __html: String(form.custom_html) }} />
      ) : null}
      <HeroView
        hero={{
          badge_text: template?.name ?? preset,
          headline: 'Пример заголовка на вашем шаблоне',
          subheadline: 'Так выглядит типографика, кнопки и цвета публичного сайта.',
          primary_cta_label: 'Кнопка',
          primary_cta_href: '#',
          secondary_cta_label: 'Ещё',
          secondary_cta_href: '#',
        }}
        animate={false}
      />
      <Section className="!py-8">
        <Container>
          <div className="flex flex-wrap gap-2">
            {colors.map(([name, color]) => (
              <div key={name} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span className="h-5 w-5 rounded border border-white/10" style={{ background: color || '#333' }} />
                {name}
              </div>
            ))}
          </div>
          {form.custom_js ? (
            <p className="mt-4 text-xs text-[var(--muted)]">
              JS: {String(form.custom_js).slice(0, 80)}{String(form.custom_js).length > 80 ? '…' : ''}
            </p>
          ) : null}
        </Container>
      </Section>
    </PreviewShell>
  )
}

export function ListContextPreview({ where, sampleTitle }: { where: string; sampleTitle?: string }) {
  return (
    <PreviewShell>
      <Section className="pt-10">
        <Container>
          <p className="text-sm text-[var(--muted)]">Этот список выводится здесь:</p>
          <p className="mt-2 font-heading text-2xl font-semibold tracking-[-0.03em]">{where}</p>
          {sampleTitle && (
            <SurfacePanel className="mt-6 p-5">
              <p className="text-xs text-[var(--muted)]">Пример элемента</p>
              <p className="mt-1 font-heading text-lg font-medium">{sampleTitle}</p>
            </SurfacePanel>
          )}
        </Container>
      </Section>
    </PreviewShell>
  )
}
