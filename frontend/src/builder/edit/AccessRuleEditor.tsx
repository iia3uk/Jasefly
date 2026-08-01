import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type AccessLeaf = {
  provider: string
  assert: string
  params?: Record<string, unknown>
}

export type AccessRuleV1 = {
  version: 1
  op: 'all' | 'any' | 'not'
  rules: Array<AccessLeaf | AccessRuleV1>
}

type AssertDef = {
  id: string
  label: string
  params?: Array<{ key: string; label: string; type?: string; placeholder?: string }>
}

type ProviderDef = {
  id: string
  label: string
  available: boolean
  asserts: AssertDef[]
}

function emptyLeaf(): AccessLeaf {
  return { provider: 'auth', assert: 'authenticated', params: {} }
}

function normalizeRule(value: unknown): AccessRuleV1 {
  if (!value || typeof value !== 'object') {
    return { version: 1, op: 'any', rules: [emptyLeaf()] }
  }
  const v = value as Record<string, unknown>
  if (typeof v.provider === 'string' && typeof v.assert === 'string') {
    return {
      version: 1,
      op: 'all',
      rules: [{
        provider: v.provider,
        assert: v.assert,
        params: (v.params && typeof v.params === 'object') ? v.params as Record<string, unknown> : {},
      }],
    }
  }
  const op = v.op === 'all' || v.op === 'not' ? v.op : 'any'
  const rules = Array.isArray(v.rules) ? v.rules : [emptyLeaf()]
  return { version: 1, op, rules: rules as AccessRuleV1['rules'] }
}

export function AccessRuleEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [providers, setProviders] = useState<ProviderDef[]>([])
  const rule = normalizeRule(value)

  useEffect(() => {
    let alive = true
    api.get<{ data?: ProviderDef[] } | ProviderDef[]>('/access/providers', { silent: true })
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res) ? res : (res.data ?? [])
        setProviders(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!alive) return
        setProviders([
          {
            id: 'auth',
            label: 'Авторизация',
            available: true,
            asserts: [
              { id: 'guest', label: 'Только гость' },
              { id: 'authenticated', label: 'Авторизован' },
            ],
          },
          {
            id: 'role',
            label: 'Роль',
            available: true,
            asserts: [{ id: 'in', label: 'Одна из ролей', params: [{ key: 'roles', label: 'Роли', type: 'string_list' }] }],
          },
        ])
      })
    return () => { alive = false }
  }, [])

  const patch = (next: AccessRuleV1) => onChange(next)

  const leaves = rule.rules.filter((r): r is AccessLeaf =>
    !!r && typeof r === 'object' && 'provider' in r && !('op' in r))

  return (
    <div className="space-y-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3">
      <p className="text-[11px] leading-relaxed text-zinc-400">
        Билдер работает только с AccessService. Подписки, покупки и группы — провайдеры.
      </p>
      <label className="block space-y-1 text-[11px] text-zinc-400">
        Логика
        <select
          className="w-full"
          value={rule.op}
          onChange={(e) => patch({ ...rule, op: e.target.value as AccessRuleV1['op'] })}
        >
          <option value="any">Любое условие (OR)</option>
          <option value="all">Все условия (AND)</option>
          <option value="not">Отрицание первого</option>
        </select>
      </label>

      <div className="space-y-2">
        {leaves.map((leaf, idx) => {
          const provider = providers.find((p) => p.id === leaf.provider) ?? providers[0]
          const asserts = provider?.asserts ?? []
          const assertDef = asserts.find((a) => a.id === leaf.assert) ?? asserts[0]
          return (
            <div key={idx} className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-sky-200">Условие {idx + 1}</span>
                <button
                  type="button"
                  className="text-[11px] text-zinc-500 hover:text-rose-300"
                  onClick={() => {
                    const next = leaves.filter((_, i) => i !== idx)
                    patch({ ...rule, rules: next.length ? next : [emptyLeaf()] })
                  }}
                >
                  Удалить
                </button>
              </div>
              <label className="block space-y-1 text-[11px] text-zinc-400">
                Провайдер
                <select
                  className="w-full"
                  value={leaf.provider}
                  onChange={(e) => {
                    const p = providers.find((x) => x.id === e.target.value)
                    const a = p?.asserts[0]
                    const next = [...leaves]
                    next[idx] = {
                      provider: e.target.value,
                      assert: a?.id ?? 'authenticated',
                      params: {},
                    }
                    patch({ ...rule, rules: next })
                  }}
                >
                  {(providers.length ? providers : [{ id: leaf.provider, label: leaf.provider, available: true, asserts: [] }]).map((p) => (
                    <option key={p.id} value={p.id} disabled={p.available === false}>
                      {p.label}{p.available === false ? ' (недоступен)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-[11px] text-zinc-400">
                Проверка
                <select
                  className="w-full"
                  value={leaf.assert}
                  onChange={(e) => {
                    const next = [...leaves]
                    next[idx] = { ...leaf, assert: e.target.value, params: {} }
                    patch({ ...rule, rules: next })
                  }}
                >
                  {asserts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </label>
              {(assertDef?.params ?? []).map((param) => (
                <label key={param.key} className="block space-y-1 text-[11px] text-zinc-400">
                  {param.label}
                  <input
                    className="w-full"
                    placeholder={param.placeholder}
                    value={String(leaf.params?.[param.key] ?? '')}
                    onChange={(e) => {
                      const raw = e.target.value
                      let parsed: unknown = raw
                      if (param.type === 'number') parsed = raw === '' ? '' : Number(raw)
                      if (param.type === 'string_list') {
                        parsed = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
                      }
                      const next = [...leaves]
                      next[idx] = {
                        ...leaf,
                        params: { ...(leaf.params ?? {}), [param.key]: parsed },
                      }
                      patch({ ...rule, rules: next })
                    }}
                  />
                </label>
              ))}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="w-full rounded-lg border border-dashed border-sky-500/40 px-2 py-1.5 text-[11px] text-sky-200 hover:bg-sky-500/10"
        onClick={() => patch({ ...rule, rules: [...leaves, emptyLeaf()] })}
      >
        + Условие
      </button>
    </div>
  )
}
