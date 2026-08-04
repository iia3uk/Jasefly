import { describe, expect, it } from 'vitest'
import {
  activeProjectsFeed,
  isCancelledProject,
  pickLeadStackProjects,
  projectOneLine,
  projectPortfolioStats,
} from './projectPortfolioFeed'
import type { Project } from '@/types'

describe('projectPortfolioFeed', () => {
  it('excludes cancelled and aggregates unique tech', () => {
    const projects = [
      {
        id: 1,
        title: 'Ясень',
        slug: 'yasen',
        status: 'published',
        project_status: 'in_progress',
        sort_order: 1,
        short_description: 'Производственная платформа для задач и склада',
        technologies: [{ name: 'PHP' }, { name: 'React' }],
      },
      {
        id: 2,
        title: 'Джарвис',
        slug: 'jarvis',
        status: 'published',
        project_status: 'cancelled',
        sort_order: 0,
        technologies: [{ name: 'Python' }],
      },
      {
        id: 3,
        title: 'Jasefly',
        slug: 'jasefly',
        status: 'published',
        project_status: 'completed',
        sort_order: 0,
        short_description: 'AI-first framework',
        technologies: [{ name: 'React' }, { name: 'MCP' }],
      },
    ] as Project[]

    expect(isCancelledProject(projects[1])).toBe(true)
    const feed = activeProjectsFeed(projects)
    expect(feed.cards.map((c) => c.title)).toEqual(['Jasefly', 'Ясень'])
    expect(feed.tags).toEqual(['React', 'MCP', 'PHP'])
    expect(feed.cards[0].label).toContain('Jasefly')
    expect(feed.cards[0].label).toContain('AI-first')
  })

  it('picks showcase lead by featured_priority then sort_order', () => {
    const projects = [
      { id: 1, title: 'A', slug: 'a', status: 'published', sort_order: 0, featured_priority: 1 },
      { id: 2, title: 'B', slug: 'b', status: 'published', sort_order: 1, featured_priority: 10 },
      { id: 3, title: 'C', slug: 'c', status: 'published', sort_order: 2, featured_priority: 2 },
    ] as Project[]
    const stack = pickLeadStackProjects(projects, { limit: 3 })
    expect(stack.primary?.slug).toBe('b')
    expect(stack.secondary.map((p) => p.slug)).toEqual(['c', 'a'])
  })

  it('honours primary_slug override for showcase lead', () => {
    const projects = [
      { id: 1, title: 'A', slug: 'a', status: 'published', sort_order: 0, featured_priority: 99 },
      { id: 2, title: 'B', slug: 'b', status: 'published', sort_order: 1, featured_priority: 1 },
    ] as Project[]
    expect(pickLeadStackProjects(projects, { primarySlug: 'b' }).primary?.slug).toBe('b')
  })

  it('builds a compact one-liner from short_description', () => {
    expect(projectOneLine({
      short_description: 'Производственная платформа для задач и склада на предприятии',
      description: '',
    }, 40)).toMatch(/Производственная/)
    expect(projectOneLine({ short_description: '', description: '<p>HTML <b>text</b></p>' })).toBe('HTML text')
  })

  it('computes live KPI strip from project statuses', () => {
    const projects = [
      { id: 1, title: 'A', slug: 'a', status: 'published', project_status: 'completed', sort_order: 0, technologies: [{ name: 'Unity' }] },
      { id: 2, title: 'B', slug: 'b', status: 'published', project_status: 'in_progress', sort_order: 1, short_description: 'Built with Godot and Unreal' },
      { id: 3, title: 'C', slug: 'c', status: 'published', project_status: 'cancelled', sort_order: 2 },
      { id: 4, title: 'D', slug: 'd', status: 'published', project_status: 'on_hold', sort_order: 3 },
    ] as Project[]
    const stats = projectPortfolioStats(projects)
    expect(stats.map((s) => s.value)).toEqual([3, 1, 1, 3]) // total, completed, wip, engines
  })
})
