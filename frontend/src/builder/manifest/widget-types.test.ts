import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const widgetsDir = path.join(dir, '..', 'widgets')
const snapshotPath = path.join(dir, 'widget-types.v1.json')

function scanRegisteredWidgetTypes(): string[] {
  const types = new Set<string>()
  const re = /registerWidget\(\s*\{[\s\S]*?type:\s*['"]([^'"]+)['"]/g
  for (const file of fs.readdirSync(widgetsDir)) {
    if (!/\.(tsx?)$/.test(file) || file === 'index.ts') continue
    const src = fs.readFileSync(path.join(widgetsDir, file), 'utf8')
    let m: RegExpExecArray | null
    const local = new RegExp(re.source, 'g')
    while ((m = local.exec(src))) types.add(m[1])
  }
  return [...types].sort()
}

describe('builder widget type freeze', () => {
  it('does not remove widget IDs from widget-types.v1.json', () => {
    const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as { widgets: string[] }
    const frozen = [...snap.widgets].sort()
    const live = scanRegisteredWidgetTypes()
    const removed = frozen.filter((id) => !live.includes(id))
    expect(removed, `removed widget types: ${removed.join(', ')}`).toEqual([])
    expect(live.length).toBeGreaterThanOrEqual(frozen.length)
  })
})
