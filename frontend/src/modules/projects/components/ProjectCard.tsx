import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { MediaImage, SurfacePanel } from '@/shared/ui'
import type { Project } from '@/modules/projects/types'
import { projectStatusLabel, projectStatusTone } from '@/modules/projects/projectStatus'
import { projectOneLine } from '@/shared/projectPortfolioFeed'

/** Reusable project card — no page-specific fetch logic */
export function ProjectCard({ project, compact = false }: { project: Project; compact?: boolean }) {
  const statusLabel = projectStatusLabel(project.project_status)
  const oneLine = projectOneLine(project, compact ? 96 : 160)

  if (compact) {
    return (
      <Link to={`/projects/${project.slug}`} className="link-card group block min-w-0">
        <SurfacePanel className="link-card-surface overflow-hidden">
          <div className="relative aspect-[16/10] overflow-hidden bg-white/[0.03]">
            <MediaImage
              media={project.cover ?? project.cover_media_id}
              alt={project.title}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
            />
          </div>
        </SurfacePanel>
        <div className="mt-4 min-w-0">
          <h3 className="font-heading text-lg font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)]">
            {project.title}
          </h3>
          {oneLine ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{oneLine}</p>
          ) : null}
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">Смотреть →</p>
        </div>
      </Link>
    )
  }

  return (
    <Link to={`/projects/${project.slug}`} className="link-card group block min-w-0">
      <SurfacePanel className="link-card-surface overflow-hidden">
        <div className="relative aspect-[16/10] overflow-hidden bg-white/[0.03]">
          <MediaImage
            media={project.cover ?? project.cover_media_id}
            alt={project.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
          />
          {statusLabel ? (
            <span
              className={`absolute left-3 top-3 z-[1] rounded-md border px-2.5 py-1 text-[0.7rem] font-medium tracking-wide backdrop-blur-md sm:left-4 sm:top-4 ${projectStatusTone(project.project_status)}`}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
      </SurfacePanel>
      <div className="mt-4 flex items-start justify-between gap-3 sm:mt-5 sm:gap-4">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-semibold tracking-[-0.03em] transition group-hover:text-[var(--accent)] sm:text-xl">
            {project.title}
          </h3>
          {(project.role || project.completion_date) ? (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              {project.completion_date ? <span>{String(project.completion_date).slice(0, 10)}</span> : null}
              {project.role ? <span>{String(project.role)}</span> : null}
            </p>
          ) : null}
          {project.short_description && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{project.short_description}</p>
          )}
          <p className="mt-3 text-sm font-medium text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition group-hover:decoration-[var(--accent)]">
            Смотреть проект
          </p>
        </div>
        <ArrowUpRight
          className="link-card-cue mt-1 shrink-0 text-[var(--muted)] transition duration-200"
          size={18}
          aria-hidden
        />
      </div>
    </Link>
  )
}

export function ProjectGrid({ projects }: { projects: Project[] }) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:gap-x-8 sm:gap-y-12 md:grid-cols-2">
      {projects.map((p) => (
        <ProjectCard key={String(p.id)} project={p} />
      ))}
    </div>
  )
}
