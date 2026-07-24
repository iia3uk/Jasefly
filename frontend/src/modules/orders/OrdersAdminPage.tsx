import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, GhostButton, GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { usePluginEnabled } from '@/hooks/useApi'

type Order = { id:number; number:string; email?:string; customer_name?:string; status:string; payment_status:string; fulfillment_status:string; grand_total:number; amount:number; currency:string; created_at:string; order_items?: Array<{id:number;title:string;quantity:number;total:number}>; notes?: Array<{id:number;body:string;created_at:string}>; history?: Array<{id:number;from_status:string;to_status:string;created_at:string}>; refunds?: Array<{id:number;amount:number;status:string}> }
const unpack = <T,>(v: {data?:T}|T):T => v && typeof v === 'object' && 'data' in v ? (v as {data:T}).data : v as T
const statuses = ['new','pending','paid','processing','shipped','completed','cancelled','refunded']

export function OrdersAdminPage() {
  return <RequirePermission permission="orders.view"><OrdersInner /></RequirePermission>
}
function OrdersInner() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('orders')
  const [selected, setSelected] = useState<number|null>(null)
  const [filter, setFilter] = useState('')
  const [note, setNote] = useState('')
  const [refund, setRefund] = useState('')
  const [exporting, setExporting] = useState(false)
  const rows = useQuery({
    queryKey:['orders',filter],
    enabled: pluginOn,
    queryFn:async()=>unpack<Order[]>(await api.get(`/admin/orders${filter?`?status=${filter}`:''}`)),
  })
  const detail = useQuery({
    queryKey:['order',selected],
    enabled: pluginOn && !!selected,
    queryFn:async()=>unpack<Order>(await api.get(`/admin/orders/${selected}`)),
  })
  const status = useMutation({ mutationFn:(value:string)=>api.post(`/admin/orders/${selected}/status`,{status:value}), onSuccess:async()=>{await qc.invalidateQueries({queryKey:['orders']});await qc.invalidateQueries({queryKey:['order',selected]})} })
  const addNote = useMutation({ mutationFn:()=>api.post(`/admin/orders/${selected}/notes`,{body:note}), onSuccess:async()=>{setNote('');await qc.invalidateQueries({queryKey:['order',selected]})} })
  const addRefund = useMutation({ mutationFn:()=>api.post(`/admin/orders/${selected}/refunds`,{amount:Number(refund)}), onSuccess:async()=>{setRefund('');await qc.invalidateQueries({queryKey:['order',selected]})} })
  const exportCsv = async () => {
    setExporting(true)
    try { await api.download('/admin/orders/export', 'orders.csv') }
    finally { setExporting(false) }
  }
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-heading text-2xl">Заказы</h1><p className="text-sm text-zinc-400">Статусы, состав, заметки и возвраты.</p></div>
    <div className="flex gap-2"><select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2"><option value="">Все статусы</option>{statuses.map((s)=><option key={s}>{s}</option>)}</select><GhostButton onClick={()=>void exportCsv()} disabled={exporting}>{exporting?'CSV…':'CSV'}</GhostButton></div></div>
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><GlassPanel className="max-h-[75vh] overflow-auto p-2">{!rows.data?.length?<p className="p-4 text-sm text-zinc-500">Заказов пока нет</p>:rows.data.map((o)=><button key={o.id} onClick={()=>setSelected(o.id)} className={`mb-1 w-full rounded-lg p-3 text-left ${selected===o.id?'bg-white/10':'hover:bg-white/5'}`}><div className="flex justify-between"><strong>{o.number}</strong><span>{o.status}</span></div><div className="text-xs text-zinc-400">{o.customer_name||o.email||'Без клиента'} · {Number(o.grand_total||o.amount).toFixed(2)} {o.currency}</div></button>)}</GlassPanel>
      <GlassPanel className="space-y-4 p-5">{!detail.data?<p className="text-zinc-500">Выберите заказ</p>:<><div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-xl font-semibold">{detail.data.number}</h2><p className="text-sm text-zinc-400">{detail.data.customer_name} · {detail.data.email}</p></div><select value={detail.data.status} onChange={(e)=>status.mutate(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2">{statuses.map((s)=><option key={s}>{s}</option>)}</select></div>
        <div className="grid gap-2 sm:grid-cols-3"><div>Оплата: {detail.data.payment_status}</div><div>Доставка: {detail.data.fulfillment_status}</div><div className="font-semibold">{Number(detail.data.grand_total||detail.data.amount).toFixed(2)} {detail.data.currency}</div></div>
        <div><h3 className="mb-2 font-semibold">Позиции</h3>{detail.data.order_items?.map((i)=><div key={i.id} className="flex justify-between border-t border-white/10 py-2"><span>{i.title} × {i.quantity}</span><span>{Number(i.total).toFixed(2)}</span></div>)}</div>
        <div className="flex gap-2"><input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Внутренняя заметка" className="flex-1 rounded-lg border border-white/10 bg-black/20 p-2"/><Button onClick={()=>addNote.mutate()} disabled={!note}>Добавить</Button></div>
        <div className="flex gap-2"><input value={refund} onChange={(e)=>setRefund(e.target.value)} type="number" min="0" step="0.01" placeholder="Сумма возврата" className="flex-1 rounded-lg border border-white/10 bg-black/20 p-2"/><GhostButton onClick={()=>addRefund.mutate()} disabled={!Number(refund)}>Записать возврат</GhostButton></div>
        <div><h3 className="mb-2 font-semibold">История</h3>{detail.data.history?.map((h)=><div key={h.id} className="text-sm text-zinc-400">{h.created_at}: {h.from_status||'—'} → {h.to_status}</div>)}</div></>}</GlassPanel></div></div>
}
