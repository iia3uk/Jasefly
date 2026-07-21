import type { BuilderElementDTO } from '@/types'

const CLIP_KEY = 'jasefly.builder.clipboard.v1'

export function writeBuilderClipboard(node: BuilderElementDTO): void {
  try {
    sessionStorage.setItem(CLIP_KEY, JSON.stringify(node))
  } catch {
    /* quota / private mode */
  }
}

export function readBuilderClipboard(): BuilderElementDTO | null {
  try {
    const raw = sessionStorage.getItem(CLIP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BuilderElementDTO
    if (!parsed || typeof parsed !== 'object' || !parsed.elType || !parsed.id) return null
    return parsed
  } catch {
    return null
  }
}

export function hasBuilderClipboard(): boolean {
  return readBuilderClipboard() != null
}
