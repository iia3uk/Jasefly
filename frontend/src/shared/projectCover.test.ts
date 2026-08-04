import { describe, expect, it } from 'vitest'
import { projectCoverSources, resolveProjectCoverMedia } from './projectCover'

describe('projectCover', () => {
  it('builds sources with orientation fallbacks', () => {
    const sources = projectCoverSources({
      title: 'Jasefly',
      cover_media_id: 10,
      cover_portrait_media_id: 20,
    })
    expect(sources.alt).toBe('Jasefly')
    expect(sources.default).toBe(10)
    expect(sources.portrait).toBe(20)
    expect(sources.landscape).toBeUndefined()
    expect(resolveProjectCoverMedia(sources, 'portrait')).toBe(20)
    expect(resolveProjectCoverMedia(sources, 'landscape')).toBe(10)
  })

  it('falls back to default when orientation missing', () => {
    const sources = projectCoverSources({ title: 'A', cover: { id: 3 } as never })
    expect(resolveProjectCoverMedia(sources, 'portrait')).toEqual({ id: 3 })
    expect(resolveProjectCoverMedia(sources, 'landscape')).toEqual({ id: 3 })
  })
})
