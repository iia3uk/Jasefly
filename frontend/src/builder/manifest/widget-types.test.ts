import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const widgetsDir = path.join(dir, '..', 'widgets')
const snapshotPath = path.join(dir, 'widget-types.v1.json')
const packageStablePath = path.join(dir, 'package-stable-widget-types.v1.json')

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

function packageStableWidgetTypes(): string[] {
  if (!fs.existsSync(packageStablePath)) return []
  const doc = JSON.parse(fs.readFileSync(packageStablePath, 'utf8')) as {
    widgets?: Record<string, string>
  }
  return Object.keys(doc.widgets ?? {}).sort()
}

describe('builder widget type freeze', () => {
  it('does not remove widget IDs from widget-types.v1.json', () => {
    const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as { widgets: string[] }
    const frozen = [...snap.widgets].sort()
    const live = scanRegisteredWidgetTypes()
    const packageStable = packageStableWidgetTypes()
    const covered = new Set([...live, ...packageStable])

    // Package-owned stable IDs must themselves be frozen public contract members.
    const undeclared = packageStable.filter((id) => !frozen.includes(id))
    expect(undeclared, `package-stable widgets missing from freeze: ${undeclared.join(', ')}`).toEqual([])

    const removed = frozen.filter((id) => !covered.has(id))
    expect(removed, `removed widget types: ${removed.join(', ')}`).toEqual([])
    expect(covered.size).toBeGreaterThanOrEqual(frozen.length)
  })
})
