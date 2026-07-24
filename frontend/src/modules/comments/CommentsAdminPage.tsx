import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { usePluginEnabled } from '@/hooks/useApi'

type Comment = { id:number; type:string; target_type:string; target_id:number; author_name:string; author_email?:string; body:string; rating?:number; status:string; verified_purchase:number; created_at:string }
const unpack=<T,>(v:{data?:T}|T):T=>v&&typeof v==='object'&&'data'in v?(v as {data:T}).data:v as T

export function CommentsAdminPage(){return <RequirePermission permission="comments.view"><CommentsInner/></RequirePermission>}
function CommentsInner(){
  const qc=useQueryClient(); const pluginOn=usePluginEnabled('comments'); const [status,setStatus]=useState('pending'); const [type,setType]=useState('')
  const rows=useQuery({queryKey:['comments',status,type],enabled:pluginOn,queryFn:async()=>unpack<Comment[]>(await api.get(`/admin/comments?status=${status}&type=${type}`))})
  const moderate=useMutation({mutationFn:({id,value}:{id:number;value:string})=>api.post(`/admin/comments/${id}/moderate`,{status:value}),onSuccess:async()=>qc.invalidateQueries({queryKey:['comments']})})
  return <div className="space-y-4"><div><h1 className="font-heading text-2xl">Комментарии и отзывы</h1><p className="text-sm text-zinc-400">Очередь модерации пользовательского контента.</p></div>
    <GlassPanel className="flex gap-2 p-3"><select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2">{['pending','approved','rejected','spam'].map((s)=><option key={s}>{s}</option>)}</select><select value={type} onChange={(e)=>setType(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2"><option value="">Все типы</option><option value="comment">Комментарии</option><option value="review">Отзывы</option></select></GlassPanel>
    {!rows.data?.length?<GlassPanel className="p-8 text-center text-zinc-500">Очередь пуста</GlassPanel>:rows.data.map((row)=><GlassPanel key={row.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong>{row.author_name}</strong><span className="ml-2 text-xs text-zinc-500">{row.target_type} #{row.target_id}</span>{row.verified_purchase?<span className="ml-2 text-xs text-emerald-400">Покупка подтверждена</span>:null}</div><span>{row.type}{row.rating?` · ${row.rating}/5`:''}</span></div><p className="my-3 whitespace-pre-wrap">{row.body}</p><div className="flex flex-wrap gap-2"><Button onClick={()=>moderate.mutate({id:row.id,value:'approved'})}>Одобрить</Button><GhostButton onClick={()=>moderate.mutate({id:row.id,value:'rejected'})}>Отклонить</GhostButton><GhostButton onClick={()=>moderate.mutate({id:row.id,value:'spam'})}>Спам</GhostButton><span className="ml-auto text-xs text-zinc-500">{row.created_at}</span></div></GlassPanel>)}</div>
}
