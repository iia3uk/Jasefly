import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { GlassPanel } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'

type Overview={range:{from:string;to:string};summary:{events:number;visitors:number;sessions:number;page_views:number;value_total:number};daily:Array<{date:string;events:number;visitors:number;page_views:number}>;events:Array<{event_name:string;count:number;visitors:number;value:number}>;pages:Array<{path:string;views:number;visitors:number}>;goals:Array<{id:number;name:string;conversions:number;value:number}>}
const unpack=<T,>(v:{data?:T}|T):T=>v&&typeof v==='object'&&'data'in v?(v as {data:T}).data:v as T
const date=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}

export function AnalyticsAdminPage(){return <RequirePermission permission="analytics.view"><AnalyticsInner/></RequirePermission>}
function AnalyticsInner(){
  const [from,setFrom]=useState(date(-29));const [to,setTo]=useState(date())
  const overview=useQuery({queryKey:['analytics',from,to],queryFn:async()=>unpack<Overview>(await api.get(`/admin/analytics/overview?from=${from}&to=${to}`))})
  const data=overview.data
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-heading text-2xl">Аналитика</h1><p className="text-sm text-zinc-400">События сайта без хранения исходных IP-адресов.</p></div><div className="flex gap-2"><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-lg border border-white/10 bg-zinc-900 p-2"/></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['События',data?.summary.events],['Посетители',data?.summary.visitors],['Сессии',data?.summary.sessions],['Просмотры',data?.summary.page_views]].map(([label,value])=><GlassPanel key={String(label)} className="p-4"><div className="text-sm text-zinc-400">{label}</div><div className="mt-1 text-3xl font-semibold">{Number(value||0).toLocaleString('ru')}</div></GlassPanel>)}</div>
    {!data?.summary.events?<GlassPanel className="p-10 text-center text-zinc-500">За выбранный период событий нет. Подключите beacon или отправляйте события в /analytics/collect.</GlassPanel>:<div className="grid gap-4 lg:grid-cols-2"><GlassPanel className="overflow-x-auto p-4"><h2 className="mb-3 font-semibold">События</h2><table className="w-full text-sm"><tbody>{data.events.map((row)=><tr key={row.event_name} className="border-t border-white/10"><td className="py-2">{row.event_name}</td><td className="text-right">{row.count}</td><td className="text-right text-zinc-500">{row.visitors} чел.</td></tr>)}</tbody></table></GlassPanel>
      <GlassPanel className="overflow-x-auto p-4"><h2 className="mb-3 font-semibold">Популярные страницы</h2><table className="w-full text-sm"><tbody>{data.pages.map((row)=><tr key={row.path} className="border-t border-white/10"><td className="max-w-80 truncate py-2">{row.path||'/'}</td><td className="text-right">{row.views}</td><td className="text-right text-zinc-500">{row.visitors} чел.</td></tr>)}</tbody></table></GlassPanel>
      <GlassPanel className="overflow-x-auto p-4 lg:col-span-2"><h2 className="mb-3 font-semibold">По дням</h2><table className="w-full text-sm"><thead className="text-zinc-500"><tr><th className="text-left">Дата</th><th className="text-right">События</th><th className="text-right">Посетители</th><th className="text-right">Просмотры</th></tr></thead><tbody>{data.daily.map((row)=><tr key={row.date} className="border-t border-white/10"><td className="py-2">{row.date}</td><td className="text-right">{row.events}</td><td className="text-right">{row.visitors}</td><td className="text-right">{row.page_views}</td></tr>)}</tbody></table></GlassPanel></div>}</div>
}
