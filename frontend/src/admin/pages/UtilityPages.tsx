import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Download, FolderPlus, MailOpen, Trash2, Upload, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { api, endpoints, mediaUrl } from '@/lib/api'
import { copyToClipboard } from '@/lib/clipboard'
import { useAdminList } from '@/hooks/useApi'
import type { ContactMessage, ID, MediaAsset, MediaFolder } from '@/types'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/components/ui'
import { PageContext } from '@/admin/components/PageContext'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { t } from '@/admin/i18n'
import clsx from 'clsx'

function Header({ title, contextKey, subtitle }: { title: string; contextKey: string; subtitle?: string }) {
  return (
    <AdminPageHero
      title={title}
      hint={subtitle || t.manageWorkspace}
      eyebrow="Рабочая область"
      accent="teal"
    >
      <PageContext contextKey={contextKey} />
    </AdminPageHero>
  )
}

type FolderFilter = 'all' | 'root' | ID

export function MediaLibraryPage() {
  const client = useQueryClient()
  const file = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState<FolderFilter>('all')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [missingAltOnly, setMissingAltOnly] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('missing_alt') === '1'
    } catch {
      return false
    }
  })
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({})
  const [savingAlt, setSavingAlt] = useState<string | null>(null)

  const foldersQuery = useQuery({
    queryKey: ['admin', 'media-folders'],
    queryFn: endpoints.mediaFolders,
  })
  const mediaQuery = useQuery({
    queryKey: ['admin', 'media', folder, query],
    queryFn: () => endpoints.mediaList({
      folder_id: folder === 'all' ? undefined : folder,
      q: query.trim() || undefined,
    }),
  })

  const folders = foldersQuery.data ?? []
  const mediaAll = mediaQuery.data ?? []
  const media = missingAltOnly
    ? mediaAll.filter((m) => !String(m.alt_text || '').trim())
    : mediaAll
  const missingAltCount = mediaAll.filter((m) => !String(m.alt_text || '').trim()).length
  const uploadFolderId = folder === 'all' || folder === 'root' ? null : folder
  const missingCount = mediaAll.filter((m) => m.missing).length

  const folderButtons = useMemo(() => ([
    { id: 'all' as const, label: t.folderAll },
    { id: 'root' as const, label: t.folderRoot },
    ...folders.map((f: MediaFolder) => ({ id: f.id as FolderFilter, label: f.name })),
  ]), [folders])

  const refresh = async () => {
    await mediaQuery.refetch()
    await foldersQuery.refetch()
    void client.invalidateQueries({ queryKey: ['admin', 'media'] })
  }

  const purgeMissing = async () => {
    if (!missingCount) return
    if (!confirm(t.purgeMissingConfirm.replace('{n}', String(missingCount)))) return
    try {
      const result = await endpoints.purgeMissingMedia()
      await refresh()
      window.alert(t.purgeMissingDone.replace('{n}', String(result.removed ?? missingCount)))
    } catch (e) {
      setError(e instanceof Error ? e.message : t.purgeMissingFail)
    }
  }

  const uploadFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const picked of files) {
        await endpoints.uploadMedia(picked, { folder_id: uploadFolderId })
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.uploadFailed)
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }

  const createFolder = async () => {
    const name = window.prompt(t.folderNamePrompt)
    if (!name?.trim()) return
    try {
      const created = await endpoints.createMediaFolder(name.trim())
      await foldersQuery.refetch()
      setFolder(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.folderCreateFail)
    }
  }

  const deleteFolder = async (id: ID) => {
    if (!confirm(t.folderDeleteConfirm)) return
    try {
      await endpoints.deleteMediaFolder(id)
      if (String(folder) === String(id)) setFolder('all')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.folderDeleteFail)
    }
  }

  const moveToFolder = async (asset: MediaAsset, folderId: ID | null) => {
    try {
      await endpoints.updateMedia(asset.id, { folder_id: folderId })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.uploadFailed)
    }
  }

  const saveAlt = async (asset: MediaAsset) => {
    const key = String(asset.id)
    const next = (altDrafts[key] ?? asset.alt_text ?? '').trim()
    setSavingAlt(key)
    setError('')
    try {
      await endpoints.updateMedia(asset.id, { alt_text: next || '' })
      setAltDrafts((prev) => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить alt')
    } finally {
      setSavingAlt(null)
    }
  }

  return (
    <>
      <Header title={t.mediaLibrary} contextKey="media" />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-1">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{t.folders}</p>
          {folderButtons.map((item) => (
            <button
              key={String(item.id)}
              type="button"
              onClick={() => setFolder(item.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                String(folder) === String(item.id) ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={createFolder}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <FolderPlus size={15} /> {t.newFolder}
          </button>
          {folder !== 'all' && folder !== 'root' && (
            <button
              type="button"
              onClick={() => deleteFolder(folder)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300/80 hover:bg-red-500/10"
            >
              <Trash2 size={15} /> {t.deleteFolder}
            </button>
          )}
          <p className="mt-4 px-2 text-xs leading-5 text-zinc-600">{t.foldersHint}</p>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchFiles} className="min-w-0 flex-1" />
            <input ref={file} type="file" className="hidden" multiple accept="image/*,application/pdf,video/mp4" onChange={(e) => uploadFiles(e.target.files)} />
            <Button type="button" disabled={uploading} onClick={() => file.current?.click()}>
              <Upload size={16} />{uploading ? t.uploading : t.uploadMedia}
            </Button>
            <Button
              type="button"
              className={missingAltOnly ? 'border-amber-400/40 text-amber-200' : ''}
              onClick={() => setMissingAltOnly((v) => !v)}
            >
              Без alt{missingAltCount ? ` (${missingAltCount})` : ''}
            </Button>
            {missingCount > 0 && (
              <Button type="button" className="text-amber-200" onClick={purgeMissing}>
                {t.purgeMissing} ({missingCount})
              </Button>
            )}
          </div>
          <p className="mb-4 text-xs text-zinc-500">
            {folder === 'all' ? t.folderUploadHintAll : folder === 'root' ? t.folderUploadHintRoot : t.folderUploadHintFolder}
          </p>
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {mediaQuery.isLoading
              ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square" />)
              : media.map((asset) => (
                <GlassPanel className={`group overflow-hidden ${asset.missing ? 'ring-1 ring-amber-500/40' : ''}`} key={String(asset.id)}>
                  {asset.missing ? (
                    <div className="flex aspect-square items-center justify-center bg-amber-500/10 p-3 text-center text-xs text-amber-200">
                      {t.mediaMissingBadge}
                    </div>
                  ) : mediaUrl(asset) ? (
                    <img src={mediaUrl(asset)} alt={asset.alt_text ?? ''} className="aspect-square w-full object-cover" />
                  ) : null}
                  <div className="space-y-2 p-2">
                    <div className="flex items-center gap-1">
                      <span className="flex-1 truncate text-xs">{asset.original_name ?? asset.filename}</span>
                      {!String(asset.alt_text || '').trim() && (
                        <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-200">alt</span>
                      )}
                      <Button
                        type="button"
                        className="px-1 text-red-300 opacity-80"
                        title={t.deleteMediaHost}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (confirm(t.deleteMediaHostConfirm)) {
                            endpoints.deleteMedia(asset.id).then(() => void refresh()).catch((err) => {
                              setError(err instanceof Error ? err.message : t.deleteMediaFail)
                            })
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <input
                        className="min-w-0 flex-1 text-xs"
                        placeholder="Alt-текст"
                        value={altDrafts[String(asset.id)] ?? asset.alt_text ?? ''}
                        onChange={(e) => setAltDrafts((prev) => ({ ...prev, [String(asset.id)]: e.target.value }))}
                      />
                      <Button
                        type="button"
                        className="shrink-0 px-2 text-xs"
                        disabled={savingAlt === String(asset.id)
                          || (altDrafts[String(asset.id)] ?? asset.alt_text ?? '') === (asset.alt_text ?? '')}
                        onClick={() => void saveAlt(asset)}
                      >
                        {savingAlt === String(asset.id) ? '…' : 'OK'}
                      </Button>
                    </div>
                    <select
                      className="w-full text-xs"
                      value={asset.folder_id == null ? '' : String(asset.folder_id)}
                      onChange={(e) => moveToFolder(asset, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">{t.folderRoot}</option>
                      {folders.map((f) => (
                        <option key={String(f.id)} value={String(f.id)}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </GlassPanel>
              ))}
          </div>
          {!mediaQuery.isLoading && !media.length && (
            <p className="py-16 text-center text-sm text-zinc-500">{t.folderEmpty}</p>
          )}
        </div>
      </div>
    </>
  )
}

export function ContactMessagesPage() {
  const client = useQueryClient()
  const { data = [], isLoading } = useAdminList<ContactMessage>('contact-messages')
  const [busyId, setBusyId] = useState<string | number | null>(null)
  const [busyAll, setBusyAll] = useState(false)

  const unreadCount = data.filter((m) => Number(m.is_read ?? 0) === 0).length

  const refreshLists = async () => {
    await Promise.all([
      client.refetchQueries({ queryKey: ['admin', 'contact-messages'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  const patchReadLocal = (ids: Array<string | number>) => {
    const set = new Set(ids.map(String))
    client.setQueryData<ContactMessage[]>(['admin', 'contact-messages'], (prev) =>
      (prev ?? []).map((m) => (set.has(String(m.id)) ? { ...m, is_read: 1 } : m)),
    )
  }

  const markRead = async (id: string | number) => {
    setBusyId(id)
    patchReadLocal([id])
    try {
      await api.post(`/admin/contact-messages/${id}/mark-read`, {})
      await refreshLists()
    } catch (e) {
      await refreshLists()
      window.alert(e instanceof Error ? e.message : t.markReadFail)
    } finally {
      setBusyId(null)
    }
  }

  const markAllRead = async () => {
    const unread = data.filter((m) => Number(m.is_read ?? 0) === 0)
    if (!unread.length) return
    setBusyAll(true)
    patchReadLocal(unread.map((m) => m.id))
    try {
      for (const m of unread) {
        await api.post(`/admin/contact-messages/${m.id}/mark-read`, {})
      }
      await refreshLists()
    } catch (e) {
      await refreshLists()
      window.alert(e instanceof Error ? e.message : t.markReadFail)
    } finally {
      setBusyAll(false)
    }
  }

  const remove = async (id: string | number) => {
    if (!window.confirm(t.deleteMessageConfirm)) return
    setBusyId(id)
    try {
      await api.delete(`/admin/contact-messages/${id}`)
      await refreshLists()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t.deleteFail)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Header title={t.contactMessages} contextKey="contact-messages" subtitle={t.contactMessagesHint} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {unreadCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-amber-100">
              {t.unreadMessages}: {unreadCount}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-zinc-400">
              {t.allRead}
            </span>
          )}
          <span className="text-zinc-600">{data.length} {t.totalShort}</span>
        </div>
        {unreadCount > 0 ? (
          <GhostButton type="button" disabled={busyAll} onClick={() => void markAllRead()}>
            <CheckCheck size={16} />
            {busyAll ? t.markingRead : t.markAllRead}
          </GhostButton>
        ) : null}
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : data.length ? (
          data.map((msg) => {
            const unread = Number(msg.is_read ?? 0) === 0
            const busy = busyId === msg.id
            return (
              <GlassPanel
                key={String(msg.id)}
                className={clsx(
                  'p-5 transition',
                  unread
                    ? 'border-amber-400/25 bg-amber-500/[0.04] shadow-[inset_3px_0_0_0_rgb(251_191_36_/_0.55)]'
                    : 'opacity-90',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="truncate text-[color:var(--text)]">{msg.name}</b>
                      {unread ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          {t.unreadShort}
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                          {t.readShort}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-zinc-500">{msg.email}</p>
                    {msg.subject ? (
                      <p className="mt-1 text-sm font-medium text-zinc-300">{msg.subject}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">{msg.created_at}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{msg.message}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                  {unread ? (
                    <Button type="button" disabled={busy} onClick={() => void markRead(msg.id)}>
                      <MailOpen size={15} />
                      {busy ? t.markingRead : t.markRead}
                    </Button>
                  ) : null}
                  <GhostButton type="button" disabled={busy} onClick={() => void remove(msg.id)}>
                    <Trash2 size={15} />
                    {t.deleteMessage}
                  </GhostButton>
                </div>
              </GlassPanel>
            )
          })
        ) : (
          <GlassPanel className="p-10 text-center text-sm text-zinc-500">{t.noMessages}</GlassPanel>
        )}
      </div>
    </>
  )
}

export function BackupPage() {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Header title={t.backup} contextKey="backup" />
      <GlassPanel className="p-6">
        <p className="text-sm text-zinc-400">{t.createBackupHint}</p>
        <Button
          type="button"
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setStatus('')
            try {
              await api.post('/admin/backup')
              setStatus(t.backupOk)
            } catch (e) {
              setStatus(e instanceof Error ? e.message : t.backupFail)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Download size={16} />{busy ? t.creatingBackup : t.createBackup}
        </Button>
        {status && <p className="mt-3 text-sm text-zinc-400">{status}</p>}
      </GlassPanel>
    </>
  )
}

type UpdateStatus = {
  version?: string
  zip_available?: boolean
  hosting_layout?: boolean
  max_zip_mb?: number
  php_upload_max?: string
  php_post_max?: string
  last?: {
    ok?: boolean
    at?: string
    files_copied?: number
    package?: string
    message?: string
    error?: string
    migrations?: { just_applied?: unknown[]; pending?: string[]; ok?: boolean }
  } | null
}

type UpdateResult = {
  ok?: boolean
  files_copied?: number
  files_skipped_protected?: number
  message?: string
  warnings?: string[]
  migrations?: { just_applied?: unknown[]; pending?: string[]; ok?: boolean; error?: unknown }
}

export function UpdatesPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [info, setInfo] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void api.get<{ data?: UpdateStatus } | UpdateStatus>('/admin/updates')
      .then((res) => {
        const data = (res as { data?: UpdateStatus }).data ?? (res as UpdateStatus)
        setInfo(data)
      })
      .catch(() => setInfo(null))
  }, [result])

  return (
    <>
      <Header title={t.updates} contextKey="updates" />
      <div className="space-y-6">
        <GlassPanel className="space-y-4 p-6">
          <p className="text-sm text-zinc-400">{t.updatesHint}</p>
          <p className="text-xs leading-relaxed text-zinc-500">{t.updatesProtectNote}</p>
          {info && (
            <dl className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">{t.updatesCurrentVersion}</dt>
                <dd className="font-medium text-zinc-200">{info.version ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t.updatesMaxSize}</dt>
                <dd className="font-medium text-zinc-200">
                  ~{info.max_zip_mb ?? '?'} МБ
                  <span className="ml-2 text-xs text-zinc-500">
                    (PHP upload {info.php_upload_max}, post {info.php_post_max})
                  </span>
                </dd>
              </div>
            </dl>
          )}
          {info?.zip_available === false && (
            <p className="text-sm text-amber-400/90">{t.updatesNeedZipExt}</p>
          )}
          <label className="block space-y-2 text-sm">
            <span>{t.updatesSelectZip}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setStatus('')
                setResult(null)
              }}
            />
          </label>
          <Button
            type="button"
            disabled={busy || info?.zip_available === false}
            onClick={async () => {
              if (!file) {
                setStatus(t.updatesZipMissing)
                return
              }
              if (!/\.zip$/i.test(file.name)) {
                setStatus(t.updatesZipMissing)
                return
              }
              setBusy(true)
              setStatus('')
              setResult(null)
              try {
                const form = new FormData()
                form.append('package', file)
                const res = await api.upload<{ data?: UpdateResult } | UpdateResult>('/admin/updates', form)
                const data = (res as { data?: UpdateResult }).data ?? (res as UpdateResult)
                setResult(data)
                setStatus(data.message || t.updatesSuccess)
                setFile(null)
                if (fileRef.current) fileRef.current.value = ''
              } catch (e) {
                setStatus(e instanceof Error ? e.message : t.updatesFail)
              } finally {
                setBusy(false)
              }
            }}
          >
            <RefreshCw size={16} className={busy ? 'animate-spin' : undefined} />
            {busy ? t.updatesInstalling : t.updatesInstall}
          </Button>
          {status && (
            <p className={`text-sm ${result?.ok === false ? 'text-rose-400' : 'text-zinc-300'}`}>{status}</p>
          )}
          {result?.ok && (
            <ul className="space-y-1 text-sm text-zinc-400">
              <li>Скопировано файлов: {result.files_copied ?? 0}</li>
              {result.files_skipped_protected != null && (
                <li>Пропущено (защищённые): {result.files_skipped_protected}</li>
              )}
              {Array.isArray(result.migrations?.just_applied) && result.migrations.just_applied.length > 0 && (
                <li>Миграции: применено {result.migrations.just_applied.length}</li>
              )}
            </ul>
          )}
          {result?.warnings && result.warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-400/80">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </GlassPanel>

        {info?.last && (
          <GlassPanel className="space-y-2 p-6">
            <h2 className="font-heading text-lg">{t.updatesLast}</h2>
            <p className="text-sm text-zinc-400">
              {info.last.at ? new Date(info.last.at).toLocaleString('ru-RU') : '—'}
              {info.last.package ? ` · ${info.last.package}` : ''}
              {info.last.files_copied != null ? ` · ${info.last.files_copied} файлов` : ''}
            </p>
            <p className={`text-sm ${info.last.ok ? 'text-emerald-400/90' : 'text-rose-400'}`}>
              {info.last.ok ? (info.last.message || 'OK') : (info.last.error || 'Ошибка')}
            </p>
          </GlassPanel>
        )}
      </div>
    </>
  )
}

export function PasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null)
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string; setup_token: string } | null>(null)
  const [code, setCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [twoFaStatus, setTwoFaStatus] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void api.get<{ data?: { totp_enabled?: boolean }; totp_enabled?: boolean }>('/auth/me')
      .then((res) => {
        const enabled = Boolean(
          (res as { data?: { totp_enabled?: boolean } }).data?.totp_enabled
          ?? (res as { totp_enabled?: boolean }).totp_enabled,
        )
        setTotpEnabled(enabled)
      })
      .catch(() => setTotpEnabled(false))
  }, [])

  return (
    <>
      <Header title={t.passwordPage} contextKey="password" />
      <div className="space-y-6">
        <GlassPanel className="space-y-5 p-6">
          <h2 className="font-heading text-xl">{t.updatePassword}</h2>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault()
              if (password !== confirm) {
                setStatus(t.passwordsMismatch)
                return
              }
              try {
                await api.put('/admin/users/password', { password })
                setStatus(t.passwordUpdated)
                setPassword('')
                setConfirm('')
              } catch (err) {
                setStatus(err instanceof Error ? err.message : t.passwordFail)
              }
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>{t.newPassword}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t.confirmPassword}</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={10} />
            </label>
            <Button type="submit">{t.updatePassword}</Button>
          </form>
          {status && <p className="text-sm text-zinc-400">{status}</p>}
        </GlassPanel>

        <GlassPanel className="space-y-5 p-6">
          <h2 className="font-heading text-xl">{t.twoFactorTitle}</h2>
          <p className="text-sm text-zinc-400">{t.twoFactorSetupHint}</p>
          <p className="text-xs leading-relaxed text-zinc-500">{t.twoFactorNoGoogle}</p>
          {totpEnabled === null && <p className="text-sm text-zinc-500">…</p>}
          {totpEnabled === true && !setup && (
            <>
              <p className="text-sm text-emerald-400/90">{t.twoFactorEnabled}</p>
              <label className="block space-y-2 text-sm">
                <span>{t.currentPassword}</span>
                <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} autoComplete="current-password" />
              </label>
              <label className="block space-y-2 text-sm">
                <span>{t.twoFactorCode}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await endpoints.disable2fa(disablePassword, code)
                    setTotpEnabled(false)
                    setCode('')
                    setDisablePassword('')
                    setTwoFaStatus(t.twoFactorDisabled)
                  } catch (e) {
                    setTwoFaStatus(e instanceof Error ? e.message : t.twoFactorFail)
                  }
                }}
              >
                {t.twoFactorDisable}
              </Button>
            </>
          )}
          {totpEnabled === false && !setup && (
            <Button
              type="button"
              onClick={async () => {
                try {
                  const data = await endpoints.setup2fa()
                  setSetup(data)
                  setCopied(false)
                  setTwoFaStatus('')
                } catch (e) {
                  setTwoFaStatus(e instanceof Error ? e.message : t.twoFactorFail)
                }
              }}
            >
              {t.twoFactorEnable}
            </Button>
          )}
          {setup && (
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await endpoints.enable2fa(setup.setup_token, code)
                  setTotpEnabled(true)
                  setSetup(null)
                  setCode('')
                  setTwoFaStatus(t.twoFactorEnabled)
                } catch (err) {
                  setTwoFaStatus(err instanceof Error ? err.message : t.twoFactorFail)
                }
              }}
            >
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <QRCodeSVG
                    value={setup.otpauth_url}
                    size={168}
                    level="M"
                    marginSize={1}
                    title={t.twoFactorScanQr}
                  />
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="font-medium text-zinc-200">{t.twoFactorScanQr}</p>
                  <p className="text-xs text-zinc-500">{t.twoFactorManualSecret}</p>
                  <code className="block break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs tracking-wider text-zinc-300">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    className="text-xs text-zinc-400 underline hover:text-zinc-200"
                    onClick={async () => {
                      const ok = await copyToClipboard(setup.secret)
                      if (ok) {
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 2000)
                      }
                    }}
                  >
                    {copied ? t.twoFactorCopied : t.twoFactorCopySecret}
                  </button>
                </div>
              </div>
              <label className="block space-y-2 text-sm">
                <span>{t.twoFactorCode}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required pattern="\d{6}" />
              </label>
              <Button type="submit">{t.twoFactorConfirm}</Button>
            </form>
          )}
          {twoFaStatus && <p className="text-sm text-zinc-400">{twoFaStatus}</p>}
        </GlassPanel>
      </div>
    </>
  )
}
