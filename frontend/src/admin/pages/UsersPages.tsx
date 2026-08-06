import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { t } from '@/admin/i18n'
import { useSite } from '@/hooks/useApi'
import { permissionVisibleForPlugins } from '@/core/pluginGates'

type User = {
  id: number
  email: string
  name: string
  role: string
  last_login_at: string | null
  created_at: string
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>))
    ? (payload as { data: T }).data
    : (payload as T)
}

/** Users admin page — list, create, delete, change role. */
export function UsersPage() {
  const { isSuperAdmin } = useAuth()
  const superAdmin = isSuperAdmin()
  const qc = useQueryClient()
  const key = ['admin', 'users']
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: key,
    queryFn: async () => asData<User[]>(await api.get('/admin/users')),
  })

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'editor' })

  const create = useMutation({
    mutationFn: async () => asData<{ id: number }>(await api.post('/admin/users', form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      setShowCreate(false)
      setForm({ email: '', name: '', password: '', role: 'editor' })
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) =>
      asData<unknown>(await api.put(`/admin/users/${id}`, { role })),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => asData<unknown>(await api.delete(`/admin/users/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return (
    <RequirePermission permission="users.view">
    <div>
      <AdminPageHero
        title="Пользователи и доступ"
        hint="Учётные записи, роли (multi-role через API) и capability-based доступ. Эффективные права — с сервера."
        eyebrow="Система"
        accent="violet"
        actions={
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={16} /> {t.usersNew}
          </Button>
        }
      />

      {showCreate && (
        <GlassPanel className="mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-xl">{t.usersCreate}</h2>
            <button type="button" onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>{t.usersColEmail}</span>
              <input className="w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="space-y-2 text-sm">
              <span>{t.usersColName}</span>
              <input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="space-y-2 text-sm">
              <span>{t.usersPasswordMin}</span>
              <input className="w-full" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="space-y-2 text-sm">
              <span>{t.usersColRole}</span>
              <select className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="editor">{t.roleEditor}</option>
                <option value="author">Author</option>
                <option value="contributor">Contributor</option>
                <option value="subscriber">Subscriber</option>
                {superAdmin && <option value="admin">{t.roleAdmin}</option>}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? t.usersCreating : t.usersCreateBtn}
            </Button>
            {create.isError && <span className="ml-3 text-sm text-red-400">{(create.error as Error)?.message ?? 'Ошибка'}</span>}
          </div>
        </GlassPanel>
      )}

      <GlassPanel className="mt-6 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="p-3">{t.usersColName}</th>
                  <th className="p-3">{t.usersColEmail}</th>
                  <th className="p-3">{t.usersColRole}</th>
                  <th className="p-3 whitespace-nowrap">{t.usersColLastLogin}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const locked = !superAdmin && (u.role === 'admin' || u.role === 'super_admin')
                  const roleLabel =
                    u.role === 'super_admin' ? t.roleSuperAdmin
                      : u.role === 'admin' ? t.roleAdmin
                        : u.role === 'author' ? 'Author'
                          : u.role === 'contributor' ? 'Contributor'
                            : (u.role === 'subscriber' || u.role === 'member') ? 'Subscriber'
                              : t.roleEditor
                  return (
                  <tr key={u.id} className="border-b border-white/5">
                    <td className="p-3">{u.name}</td>
                    <td className="p-3 text-zinc-400">{u.email}</td>
                    <td className="p-3">
                      {locked ? (
                        <span className="text-xs text-zinc-400">{roleLabel}</span>
                      ) : (
                      <select
                        className="rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                        value={u.role}
                        onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
                      >
                        <option value="editor">{t.roleEditor}</option>
                        <option value="author">Author</option>
                        <option value="contributor">Contributor</option>
                        <option value="subscriber">Subscriber</option>
                        {superAdmin && <option value="admin">{t.roleAdmin}</option>}
                        {u.role === 'super_admin' && <option value="super_admin">{t.roleSuperAdmin}</option>}
                      </select>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-zinc-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                    <td className="p-3 text-right">
                      {!locked && u.role !== 'super_admin' && (
                        <button
                          type="button"
                          title={t.deleteConfirm}
                          disabled={remove.isPending}
                          onClick={() => confirm(t.usersDeleteConfirm(u.name)) && remove.mutate(u.id)}
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
    </RequirePermission>
  )
}

/** Roles & permissions admin page — assign capabilities to roles. */
export function RolesPage() {
  return (
    <RequirePermission permission="roles.manage">
      <RolesPageInner />
    </RequirePermission>
  )
}

function RolesPageInner() {
  const qc = useQueryClient()
  const { data: site } = useSite()
  const enabledPlugins = site?.enabled_plugins
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => asData<{ id: number; slug: string; name: string; perm_count: number }[]>(await api.get('/admin/roles')),
  })
  const { data: permissionsRaw = [], isLoading: permsLoading } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => asData<{ id: number; slug: string; name: string; group_name: string | null; risk_level?: string }[]>(await api.get('/admin/permissions')),
  })
  const permissions = useMemo(
    () => permissionsRaw.filter((p) => permissionVisibleForPlugins(p.slug, enabledPlugins)),
    [permissionsRaw, enabledPlugins],
  )

  const [selectedRole, setSelectedRole] = useState<number | null>(null)
  const { data: rolePerms = [] } = useQuery({
    queryKey: ['admin', 'roles', selectedRole, 'permissions'],
    queryFn: async () => asData<{ slug: string }[]>(await api.get(`/admin/roles/${selectedRole}/permissions`)),
    enabled: selectedRole != null,
  })

  const save = useMutation({
    mutationFn: async (perms: string[]) =>
      asData<unknown>(await api.put(`/admin/roles/${selectedRole}/permissions`, { permissions: perms })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles', selectedRole, 'permissions'] }),
  })

  const [draft, setDraft] = useState<Set<string>>(new Set())
  const current = new Set(rolePerms.map((p) => p.slug))

  const toggle = (slug: string) => {
    const next = new Set(draft.size ? draft : current)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    setDraft(next)
  }

  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    const g = p.group_name ?? 'Общее'
    ;(acc[g] ??= []).push(p)
    return acc
  }, {})

  const active = draft.size ? draft : current

  return (
    <div>
      <AdminPageHero
        title="Роли и права"
        hint="Матрица capabilities по ролям. Deny override и multi-role — через Access API. Опасные права (critical) помечены."
        eyebrow="Система"
        accent="violet"
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <GlassPanel className="h-fit p-3">
          {rolesLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <ul className="space-y-1">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedRole(r.id); setDraft(new Set()) }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selectedRole === r.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5'
                    }`}
                  >
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-zinc-600">{r.slug} · {r.perm_count} прав</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        {selectedRole ? (
          <GlassPanel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-xl">Права роли</h2>
              <Button
                type="button"
                className="text-sm"
                disabled={save.isPending || !draft.size}
                onClick={() => save.mutate([...active])}
              >
                {save.isPending ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
            {permsLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="space-y-5">
                {Object.entries(grouped).map(([group, perms]) => (
                  <div key={group}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{group}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map((p) => (
                        <label key={p.slug} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={active.has(p.slug)}
                            onChange={() => toggle(p.slug)}
                            className="mt-1"
                          />
                          <span>
                            <div className="text-zinc-200">
                              {p.name}
                              {(p.risk_level === 'critical' || p.risk_level === 'high') && (
                                <span className="ml-2 text-[10px] uppercase text-amber-400/90">{p.risk_level}</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-600">{p.slug}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        ) : (
          <div className="flex items-center justify-center text-sm text-zinc-500">Выберите роль слева</div>
        )}
      </div>
    </div>
  )
}
