import { Link } from 'react-router-dom'
import { SurfacePanel } from '@/shared/ui'
import type { Project } from '@/modules/projects/types'
import { pickLeadStackProjects, projectOneLine } from '@/shared/projectPortfolioFeed'
import { ResponsiveProjectCover } from '@/modules/projects/components/ResponsiveProjectCover'

/**
 * Desktop geometry is locked in `shared/showcaseGeometry.ts`:
 * lead media 2/3 drives column height; secondary cards share two equal grid rows;
 * secondary text is fixed height; media fills the remainder (~1:1).
 */
function LeadCard({ project }: { project: Project }) {
  const oneLine = projectOneLine(project, 110)
  return (
    <Link
      to={`/projects/${project.slug}`}
      className="link-card group flex h-full min-h-0 flex-col overflow-hidden rounded-[calc(var(--radius)+4px)] border border-white/[0.1] bg-white/[0.02] transition hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]"
    >
      <ResponsiveProjectCover
        project={project}
        coverVariant="auto"
        className="aspect-[16/10] w-full shrink-0 sm:aspect-[16/9] lg:aspect-[2/3]"
        imgClassName="transition duration-500 motion-reduce:transition-none motion-safe:group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
        sizes="(min-width:1024px) 58vw, 100vw"
      />
      <div className="flex shrink-0 flex-col px-5 py-5 sm:px-6 sm:py-6 lg:min-h-[10.5rem]">
        <h3 className="font-heading text-xl font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)] sm:text-2xl lg:text-[1.65rem] lg:leading-snug">
          {project.title}
        </h3>
        {oneLine ? (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)] sm:text-base">{oneLine}</p>
        ) : null}
        <p className="mt-4 text-sm font-medium text-[var(--accent)]">Смотреть проект →</p>
      </div>
    </Link>
  )
}

function SecondaryCard({ project }: { project: Project }) {
  const oneLine = projectOneLine(project, 72)
  return (
    <Link
      to={`/projects/${project.slug}`}
      className="link-card group flex h-full min-h-0 flex-col overflow-hidden rounded-[calc(var(--radius)+2px)] border border-white/[0.1] bg-white/[0.02] transition hover:border-[color-mix(in_srgb,var(--primary)_35%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]"
    >
      {/*
        Mobile/tablet: explicit aspect (card owns geometry).
        Desktop lg: flex-1 fills half-lead row after fixed text — slot ≈ 1:1 (see showcaseGeometry).
      */}
      <ResponsiveProjectCover
        project={project}
        coverVariant="landscape"
        className="aspect-square w-full shrink-0 sm:aspect-[5/4] lg:aspect-auto lg:min-h-0 lg:flex-1 lg:shrink"
        imgClassName="transition duration-500 motion-reduce:transition-none motion-safe:group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
        sizes="(min-width:1024px) 38vw, 100vw"
      />
      <div className="flex h-[6.75rem] shrink-0 flex-col justify-center px-4 py-3 sm:px-5">
        <h3 className="line-clamp-1 font-heading text-base font-semibold tracking-[-0.02em] transition group-hover:text-[var(--accent)] sm:text-lg">
          {project.title}
        </h3>
        {oneLine ? (
          <p className="mt-1 line-clamp-1 text-sm leading-5 text-[var(--muted)]">{oneLine}</p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-[var(--accent)]">Смотреть →</p>
      </div>
    </Link>
  )
}

/**
 * Asymmetric showcase: one lead + two stacked secondaries (equal column height on lg+).
 */
export function ProjectLeadStack({
  projects,
  primarySlug,
  limit = 3,
}: {
  projects: Project[]
  primarySlug?: string
  limit?: number
}) {
  const { primary, secondary } = pickLeadStackProjects(projects, { limit, primarySlug })
  if (!primary) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-white/15 px-4 py-10 text-center text-sm text-[var(--muted)]">
        Добавьте избранные проекты
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:grid-rows-2 lg:gap-5">
      <div className="min-h-0 lg:row-span-2 lg:h-full">
        <LeadCard project={primary} />
      </div>
      {secondary.length ? (
        secondary.map((p) => (
          <div key={String(p.id)} className="min-h-0 lg:h-full">
            <SecondaryCard project={p} />
          </div>
        ))
      ) : (
        <SurfacePanel className="flex items-center justify-center p-6 text-sm text-[var(--muted)] lg:row-span-2">
          Добавьте ещё проекты в избранное
        </SurfacePanel>
      )}
    </div>
  )
}
