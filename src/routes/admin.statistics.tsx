import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, TrendingUp, Users, RotateCw, Gift, Star, WalletCards, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/statistics")({
  head: () => ({ meta: [{ title: "Статистика — CRICKET BOX" }] }),
  component: AdminStatistics,
});

type Period = "current" | "all";
type Metrics = { participants:number; spins:number; freeSpins:number; paidSpins:number; wins:number; starsRevenue:number; starsPrizeValue:number; pendingPayouts:number; withdrawalRequests:number; completedWithdrawals:number; dailyActiveToday:number };
type Stats = { ok:boolean; metrics:Metrics; daily:{users:number[];userLabels:string[];spins:number[]}; seasonId:string|null; };

function initData(){if(typeof window==="undefined")return "";return (window as Window & {Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";}
async function loadStats(period:Period){const response=await fetch(`/api/admin/statistics?scope=${period}&initData=${encodeURIComponent(initData())}`);const data=(await response.json()) as Stats & {code?:string};if(!response.ok||!data.ok)throw new Error(data.code??"STATISTICS_FAILED");return data;}
function fmt(n:number){return n.toLocaleString("ru-RU");}
function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:string}){return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow"/><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between gap-4 border-b border-glass-border py-2.5 last:border-0"><span className="text-[11px] text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold tabular-nums">{value}</span></div>}

function AdminStatistics(){
 const [period,setPeriod]=useState<Period>("current");const [data,setData]=useState<Stats|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const refresh=async(p=period)=>{setLoading(true);setError("");try{setData(await loadStats(p));}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить статистику.");}finally{setLoading(false);}};
 useEffect(()=>{void refresh();},[period]);
 const m=data?.metrics;
 const maxSpin=Math.max(1,...(data?.daily.spins??[1]));
 return <AppShell title="Статистика" nav={false}><div className="space-y-4 pb-8">
  <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link>
  <div className="flex items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={()=>setPeriod("current")} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${period==="current"?"border-primary/40 bg-primary/10":"border-glass-border bg-muted/10 text-muted-foreground"}`}>Текущий сезон</button><button type="button" onClick={()=>setPeriod("all")} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${period==="all"?"border-primary/40 bg-primary/10":"border-glass-border bg-muted/10 text-muted-foreground"}`}>Все сезоны</button></div><button type="button" onClick={()=>void refresh()} aria-label="Обновить" className="grid size-9 place-items-center rounded-xl border border-glass-border"><RefreshCw className="size-4"/></button></div>
  {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
  {loading&&!data?<GlassCard className="px-4 py-7 text-center text-xs text-muted-foreground">Загрузка реальной статистики…</GlassCard>:m&&<>
   <GlassCard className="px-4 py-4" glow><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Данные PostgreSQL</p><h1 className="mt-1 font-display text-xl uppercase">Статистика</h1></div><BarChart3 className="size-5 text-primary-glow"/></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric icon={Users} label="Участники" value={fmt(m.participants)}/><Metric icon={RotateCw} label="Прокрутки" value={fmt(m.spins)}/><Metric icon={WalletCards} label="Оплачено Telegram" value={`${fmt(m.starsRevenue)} ⭐`}/><Metric icon={TrendingUp} label="Награды Stars" value={`${fmt(m.starsPrizeValue)} ⭐`}/></div></GlassCard>
   <GlassCard className="space-y-2 px-4 py-4"><Row label="Бесплатные прокрутки" value={fmt(m.freeSpins)}/><Row label="Платные прокрутки" value={fmt(m.paidSpins)}/><Row label="Выигрыши" value={fmt(m.wins)}/><Row label="Сегодня активных" value={fmt(m.dailyActiveToday)}/><Row label="Заявок на вывод" value={fmt(m.withdrawalRequests)}/><Row label="Выводов выдано" value={fmt(m.completedWithdrawals)}/><Row label="Ожидают выплат" value={fmt(m.pendingPayouts)}/></GlassCard>
   <section><h2 className="section-label mb-2">Прокрутки за 7 дней</h2><GlassCard className="px-4 py-4"><div className="flex h-44 items-end gap-2">{data!.daily.spins.map((value,i)=><div key={`${data!.daily.userLabels[i]}-${i}`} className="flex h-full flex-1 flex-col justify-end gap-1"><div className="rounded-t-xl bg-primary/35" style={{height:`${Math.max(4,Math.round(value/maxSpin*100))}%`}}/><span className="text-center text-[9px] text-muted-foreground">{data!.daily.userLabels[i]}</span></div>)}</div></GlassCard></section>
   <section><h2 className="section-label mb-2">Новые пользователи</h2><GlassCard className="px-4 py-4"><div className="grid grid-cols-7 gap-1.5">{data!.daily.users.map((value,i)=><div key={`${data!.daily.userLabels[i]}-u`} className="rounded-xl border border-glass-border bg-muted/15 px-1 py-2 text-center"><p className="text-[9px] text-muted-foreground">{data!.daily.userLabels[i]}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div></GlassCard></section>
   <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Все числа выше рассчитаны из PostgreSQL и Telegram payment records. Здесь больше нет демонстрационных коэффициентов.</GlassCard>
  </>}
 </div></AppShell>;
}
