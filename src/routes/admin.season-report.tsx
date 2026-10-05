import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Crown, Gift, Medal, RefreshCw, RotateCw, Star, TrendingUp, Trophy, Users, WalletCards, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/season-report")({
  head: () => ({ meta: [{ title: "Отчёт сезона — CRICKET BOX" }] }),
  component: SeasonReport,
});

type Prize = { id:string; kind:string; title:string; subtitle:string|null; amount:string; unit_cost:string; quantity_total:string; quantity_remaining:string; won:string; consumed_pct:string };
type User = { id:string; username:string|null; first_name:string; last_name:string|null; spins:string; wins:string; paid_spins:string; stars_won:string };
type Day = { day:string; spins:string; free:string; paid:string; bonus:string; active_users:string };
type Report = {
  ok:boolean;
  season:{id:string;code:string;name:string;state:string;startsAt:string|null;endsAt:string|null;isPaused:boolean;pausedAt:string|null;paidSpinPrice:number;durationDays:number|null};
  kpis:{participants:number;completedSpins:number;attemptedSpins:number;failedSpins:number;refundedSpins:number;freeSpins:number;paidSpins:number;paidUsers:number;paidRevenueStars:number;avgSpinsPerParticipant:number;avgPaidRevenuePerPayer:number;wins:number;emptySpins:number;winRate:number;emptyRate:number;repeatUsers:number};
  bonusSpins:{ownerGift:number;activity:number;veteran:number};
  payouts:{pendingCount:number;paidCount:number;pendingRewards:number;pendingStars:number;payedStars:number;pendingMoney:number;prizeCost:number};
  withdrawals:{requests:number;paid:number;requestedStars:number;paidStars:number};
  dailyGift:{claims:number;users:number;starsClaims:number;starsAwarded:number;spinClaims:number;spinsAwarded:number;xpClaims:number;xpAwarded:number};
  streak:{totalDays:number;users:number;perfectUsers:number;checkins:number;perfectRate:number};
  activity:{users:number;events:number;points:number};
  engagement:{uniqueUsers:number;avgUserSpins:number;maxUserSpins:number;newUsers:number};
  retention:{d1Eligible:number;d1Retained:number;d3Eligible:number;d3Retained:number;d7Eligible:number;d7Retained:number};
  prizes:Prize[];
  topUsers:User[];
  ranks:{tier:string;users:string}[];
  daily:Day[];
  meta:{durationHours:number;generatedAt:string};
  code?:string;
};

function initData(){return typeof window==="undefined"?"":(window as Window & {Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";}
async function load(id?:string){const q=id?"&seasonId="+encodeURIComponent(id):"";const r=await fetch("/api/admin/season-report?initData="+encodeURIComponent(initData())+q);const d=await r.json() as Report;if(!r.ok||!d.ok)throw new Error(d.code??"SEASON_REPORT_FAILED");return d;}
function num(v:number|string|null|undefined){return Number(v??0).toLocaleString("ru-RU");}
function pct(v:number){return (v*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%";}
function dt(v:string|null){return v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}):"—";}
function displayUser(u:User){return u.username?("@"+u.username.replace(/^@/,"")):[u.first_name,u.last_name].filter(Boolean).join(" ")||"Без имени";}
function kindLabel(k:string){return k==="EMPTY"?"EMPTY":k==="STARS"?"Stars":k==="PREMIUM"?"Premium":k==="MONEY"?"Деньги":k==="NFT"?"NFT":k==="FREE_SPIN"?"Free Spin":k;}
function kindIcon(k:string){return k==="EMPTY"?"":k==="STARS"?"⭐":k==="PREMIUM"?"💎":k==="MONEY"?"💵":k==="NFT"?"🖼️":k==="FREE_SPIN"?"🎲":"🎁";}

function SeasonReport(){
  const [data,setData]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [seasonId,setSeasonId]=useState("");
  const [seasonList,setSeasonList]=useState<Array<{id:string;name:string;code:string;state:string}>>([]);
  const [showAllPrizes,setShowAllPrizes]=useState(false);

  async function loadSeasons(){
    try{
      const r=await fetch("/api/admin/seasons?all=1&initData="+encodeURIComponent(initData()));
      const d=await r.json() as {ok:boolean;seasons?:Array<{id:string;name:string;code:string;state:string}>};
      if(r.ok&&d.ok)setSeasonList((d.seasons??[]).filter(s=>["CLOSED","PAYOUT","ARCHIVED","ENDING"].includes(s.state)));
    }catch{}
  }
  async function refresh(id=seasonId){
    setLoading(true);setError("");
    try{
      const d=await load(id||undefined);
      setData(d);
      if(!seasonId)setSeasonId(d.season.id);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить отчёт.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadSeasons();void refresh();},[]);
  useEffect(()=>{if(seasonId&&data&&seasonId!==data.season.id)void refresh(seasonId);},[seasonId]);

  const visiblePrizes=useMemo(()=>showAllPrizes?(data?.prizes??[]):(data?.prizes??[]).slice(0,8),[data,showAllPrizes]);
  if(loading&&!data)return <AppShell title="Отчёт сезона" nav={false}><div className="space-y-4"><Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link><GlassCard className="px-4 py-10 text-center text-xs text-muted-foreground">Собираю полный отчёт сезона…</GlassCard></div></AppShell>;

  return <AppShell title="Отчёт сезона" nav={false}><div className="space-y-4 pb-10">
    <div className="flex items-center justify-between gap-2"><Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link><button type="button" onClick={()=>void refresh()} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5"/> Обновить</button></div>
    {seasonList.length>0&&<GlassCard className="px-3 py-3"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-primary-glow"/><select value={seasonId} onChange={e=>setSeasonId(e.target.value)} className="admin-input flex-1 text-xs">{seasonList.map(s=><option key={s.id} value={s.id}>{s.name} · {s.state}</option>)}</select></div></GlassCard>}
    {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
    {data&&<ReportBody data={data} prizes={visiblePrizes} showAll={showAllPrizes} onToggle={()=>setShowAllPrizes(!showAllPrizes)}/>}
  </div></AppShell>;
}

function ReportBody({data,prizes,showAll,onToggle}:{data:Report;prizes:Prize[];showAll:boolean;onToggle:()=>void}){
  const k=data.kpis;
  const maxDay=Math.max(1,...data.daily.map(d=>Number(d.spins)));
  const duration=data.season.durationDays?Math.round(data.season.durationDays):0;
  return <div className="space-y-4">
    <GlassCard className="relative overflow-hidden border-primary/25 px-4 py-5" glow>
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-primary/10 blur-3xl"/>
      <div className="relative">
        <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Финальный отчёт сезона</p><h1 className="mt-1 font-display text-2xl uppercase leading-tight">{data.season.name}</h1><p className="mt-1 text-[10px] text-muted-foreground">{data.season.code} · {dt(data.season.startsAt)} → {dt(data.season.endsAt)}</p></div><Trophy className="size-9 shrink-0 text-primary-glow"/></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Kpi label="Участники" value={num(k.participants)} icon={Users}/><Kpi label="Прокрутки" value={num(k.completedSpins)} icon={RotateCw}/><Kpi label="Выигрыши" value={num(k.wins)} icon={Trophy}/><Kpi label="Выручка" value={num(k.paidRevenueStars)+" ⭐"} icon={WalletCards}/></div>
      </div>
    </GlassCard>

    <section><SectionTitle icon={BarChart3} title="1. Итоги сезона" subtitle="Главные цифры за весь жизненный цикл."/><GlassCard className="px-4 py-3"><Row label="Длительность" value={duration?duration+" дней":data.meta.durationHours.toFixed(1)+" ч"}/><Row label="Все попытки" value={num(k.attemptedSpins)}/><Row label="Завершённые" value={num(k.completedSpins)}/><Row label="Неудачные" value={num(k.failedSpins)}/><Row label="Возвращённые" value={num(k.refundedSpins)}/><Row label="Среднее спинов на участника" value={k.avgSpinsPerParticipant.toLocaleString("ru-RU",{maximumFractionDigits:2})}/><Row label="Победы / win rate" value={num(k.wins)+" · "+pct(k.winRate)}/><Row label="EMPTY / empty rate" value={num(k.emptySpins)+" · "+pct(k.emptyRate)}/><Row label="2+ спина" value={num(k.repeatUsers)}/></GlassCard></section>

    <section><SectionTitle icon={WalletCards} title="2. Монетизация и Stars" subtitle="Реальная выручка и обязательства по наградам."/><div className="grid grid-cols-2 gap-2"><Kpi label="Платных спинов" value={num(k.paidSpins)} icon={WalletCards}/><Kpi label="Платящих" value={num(k.paidUsers)} icon={Users}/><Kpi label="Выручка" value={num(k.paidRevenueStars)+" ⭐"} icon={Star}/><Kpi label="Среднее / payer" value={k.avgPaidRevenuePerPayer.toLocaleString("ru-RU",{maximumFractionDigits:2})+" ⭐"} icon={TrendingUp}/></div><GlassCard className="mt-2 px-4 py-3"><Row label="Stars-призы PENDING/REVIEW" value={num(data.payouts.pendingStars)+" ⭐"}/><Row label="Stars-призы уже выданы" value={num(data.payouts.payedStars)+" ⭐"}/><Row label="Оценочная стоимость выигранных призов" value={num(data.payouts.prizeCost)}/><Row label="Денежные призы ожидают" value={num(data.payouts.pendingMoney)}/><Row label="Наград ещё в очереди" value={num(data.payouts.pendingRewards)}/><Row label="Заявки на вывод" value={num(data.withdrawals.requests)}/><Row label="Запрошено к выводу" value={num(data.withdrawals.requestedStars)+" ⭐"}/><Row label="Выдано выводами" value={num(data.withdrawals.paidStars)+" ⭐"}/></GlassCard></section>

    <section><SectionTitle icon={Users} title="3. Аудитория и вовлечение" subtitle="Кто дошёл до сезона и насколько активно играл."/><div className="grid grid-cols-2 gap-2"><Kpi label="Новых пользователей" value={num(data.engagement.newUsers)} icon={Users}/><Kpi label="Игроков со спинами" value={num(data.engagement.uniqueUsers)} icon={RotateCw}/><Kpi label="Среднее спинов / user" value={data.engagement.avgUserSpins.toLocaleString("ru-RU",{maximumFractionDigits:2})} icon={TrendingUp}/><Kpi label="Максимум спинов / user" value={num(data.engagement.maxUserSpins)} icon={Trophy}/></div><GlassCard className="mt-2 px-4 py-3"><Row label="D1 retention" value={data.retention.d1Eligible?num(data.retention.d1Retained)+" / "+num(data.retention.d1Eligible)+" · "+pct(data.retention.d1Retained/data.retention.d1Eligible):"Недостаточно данных"}/><Row label="D3 retention" value={data.retention.d3Eligible?num(data.retention.d3Retained)+" / "+num(data.retention.d3Eligible)+" · "+pct(data.retention.d3Retained/data.retention.d3Eligible):"Недостаточно данных"}/><Row label="D7 retention" value={data.retention.d7Eligible?num(data.retention.d7Retained)+" / "+num(data.retention.d7Eligible)+" · "+pct(data.retention.d7Retained/data.retention.d7Eligible):"Недостаточно данных"}/></GlassCard></section>

    <section><SectionTitle icon={Gift} title="4. Daily Gift" subtitle="Фактические ежедневные выдачи этого сезона."/><div className="grid grid-cols-2 gap-2"><Kpi label="Получателей" value={num(data.dailyGift.users)} icon={Gift}/><Kpi label="Выдач" value={num(data.dailyGift.claims)} icon={CheckCircle2}/><Kpi label="Stars" value={num(data.dailyGift.starsAwarded)+" ⭐"} icon={Star}/><Kpi label="Free Spin" value={num(data.dailyGift.spinsAwarded)} icon={RotateCw}/></div><GlassCard className="mt-2 px-4 py-3"><Row label="Выдач Stars" value={num(data.dailyGift.starsClaims)}/><Row label="Выдач Free Spin" value={num(data.dailyGift.spinClaims)}/><Row label="XP выдано" value={num(data.dailyGift.xpAwarded)}/><Row label="XP-выдач" value={num(data.dailyGift.xpClaims)}/></GlassCard></section>

    <section><SectionTitle icon={Zap} title="5. Дополнительные попытки" subtitle="Как пользователи получали бонусные спины."/><div className="grid grid-cols-3 gap-2"><Kpi label="Owner" value={num(data.bonusSpins.ownerGift)} icon={Gift}/><Kpi label="Activity" value={num(data.bonusSpins.activity)} icon={Zap}/><Kpi label="Veteran" value={num(data.bonusSpins.veteran)} icon={Crown}/></div><GlassCard className="mt-2 px-4 py-3"><Row label="Пользователи активности" value={num(data.activity.users)}/><Row label="События активности" value={num(data.activity.events)}/><Row label="Activity points" value={num(data.activity.points)}/></GlassCard></section>

    <section><SectionTitle icon={CalendarDays} title="6. Daily Streak" subtitle="Полный проход сезона день за днём."/><div className="grid grid-cols-2 gap-2"><Kpi label="Дней сезона" value={num(data.streak.totalDays)} icon={CalendarDays}/><Kpi label="Участников streak" value={num(data.streak.users)} icon={Users}/><Kpi label="Полный проход" value={num(data.streak.perfectUsers)} icon={CheckCircle2}/><Kpi label="Full-pass rate" value={pct(data.streak.perfectRate)} icon={TrendingUp}/></div><GlassCard className="mt-2 px-4 py-3"><Row label="Всего check-in" value={num(data.streak.checkins)}/><Row label="Среднее check-in / user" value={(data.streak.users?data.streak.checkins/data.streak.users:0).toLocaleString("ru-RU",{maximumFractionDigits:2})}/></GlassCard></section>

    <section><SectionTitle icon={Trophy} title="7. Призовой фонд" subtitle="Каждый приз: выпало, остаток и степень расходования."/><GlassCard className="overflow-hidden">{prizes.map(p=><div key={p.id} className="flex items-center gap-3 border-b border-glass-border px-3 py-3 last:border-0"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/15 text-xs">{kindIcon(p.kind)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.title}</p><p className="text-[9px] text-muted-foreground">{kindLabel(p.kind)}{p.subtitle?" · "+p.subtitle:""} · выпало {num(p.won)} · осталось {num(p.quantity_remaining)} из {num(p.quantity_total)}</p></div><div className="text-right"><p className="text-xs font-semibold">{p.consumed_pct}%</p><p className="text-[9px] text-muted-foreground">consumed</p></div></div>)}{data.prizes.length>8&&<button type="button" onClick={onToggle} className="flex w-full items-center justify-center gap-1 border-t border-glass-border px-3 py-3 text-[10px] font-semibold text-primary-glow">{showAll?"Свернуть":"Показать все "+data.prizes.length}<ChevronDown className={showAll?"size-3.5 rotate-180":"size-3.5"}/></button>}</GlassCard></section>

    <section><SectionTitle icon={BarChart3} title="8. Динамика сезона" subtitle="Количество прокруток и активность по каждому дню."/><GlassCard className="px-3 py-4"><div className="flex h-48 items-end gap-1.5">{data.daily.map(d=><div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"><div className="rounded-t-lg bg-primary/40" title={d.day+" · "+d.spins+" спинов"} style={{height:Math.max(3,Math.round(Number(d.spins)/maxDay*100))+"%"}}/><span className="truncate text-center text-[8px] text-muted-foreground">{d.day}</span></div>)}</div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><Mini label="Spins" value={data.daily.reduce((a,d)=>a+Number(d.spins),0)}/><Mini label="Free" value={data.daily.reduce((a,d)=>a+Number(d.free),0)}/><Mini label="Paid" value={data.daily.reduce((a,d)=>a+Number(d.paid),0)}/><Mini label="Bonus" value={data.daily.reduce((a,d)=>a+Number(d.bonus),0)}/></div></GlassCard></section>

    <section><SectionTitle icon={Medal} title="9. Топ игроков" subtitle="Сначала активность, затем победы и Stars."/><GlassCard className="overflow-hidden">{data.topUsers.length===0?<div className="px-4 py-8 text-center text-xs text-muted-foreground">Нет завершённых спинов.</div>:data.topUsers.map((u,i)=><div key={u.id} className="flex items-center gap-3 border-b border-glass-border px-3.5 py-3 last:border-0"><div className="grid size-8 shrink-0 place-items-center rounded-full border border-glass-border bg-muted/15 font-display text-sm">{i+1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{displayUser(u)}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{num(u.spins)} спинов · {num(u.wins)} побед · {num(u.paid_spins)} paid</p></div><div className="text-right"><p className="font-display text-sm">{num(u.stars_won)} ⭐</p><p className="text-[9px] text-muted-foreground">Stars won</p></div></div>)}</GlassCard></section>

    <section><SectionTitle icon={Crown} title="10. Ранги" subtitle="Распределение рангов среди участников."/><div className="grid grid-cols-3 gap-2">{["ROOKIE","VETERAN","ELITE"].map(tier=>{const row=data.ranks.find(x=>x.tier===tier);return <Kpi key={tier} label={tier==="ELITE"?"Элита":tier==="VETERAN"?"Ветераны":"Новички"} value={num(row?.users??0)} icon={tier==="ELITE"?Crown:tier==="VETERAN"?Medal:Users}/>})}</div></section>

    <section><SectionTitle icon={TrendingUp} title="11. Что важно для следующего сезона" subtitle="Ключевые показатели без ручных расчётов."/><div className="grid grid-cols-2 gap-2"><Insight title="Paid conversion" value={k.participants?pct(k.paidUsers/k.participants):"0%"} note={num(k.paidUsers)+" / "+num(k.participants)+" участников платили"}/><Insight title="Win rate" value={pct(k.winRate)} note={num(k.wins)+" побед из "+num(k.completedSpins)}/><Insight title="EMPTY rate" value={pct(k.emptyRate)} note={num(k.emptySpins)+" пустых исходов"}/><Insight title="Streak full-pass" value={pct(data.streak.perfectRate)} note={num(data.streak.perfectUsers)+" из "+num(data.streak.users)}/><Insight title="Revenue / payer" value={k.avgPaidRevenuePerPayer.toLocaleString("ru-RU",{maximumFractionDigits:2})+" ⭐"} note={num(k.paidUsers)+" платящих"}/><Insight title="Payout liability" value={num(data.payouts.pendingStars)+" ⭐"} note="Stars-призы PENDING/REVIEW"/></div></section>

    <GlassCard className="border-primary/15 bg-primary/5 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">Отчёт рассчитан из PostgreSQL на {dt(data.meta.generatedAt)}. После выдачи оставшихся наград этот отчёт можно обновить: исторические спины и покупки не изменятся, а блок выплат покажет актуальное состояние.</GlassCard>
  </div>;
}

function SectionTitle({icon:Icon,title,subtitle}:{icon:typeof BarChart3;title:string;subtitle:string}){return <div className="mb-2 flex items-start gap-2"><Icon className="mt-0.5 size-4 text-primary-glow"/><div><h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]">{title}</h2><p className="mt-0.5 text-[9px] text-muted-foreground">{subtitle}</p></div></div>}
function Kpi({label,value,icon:Icon}:{label:string;value:string;icon:typeof Users}){return <GlassCard className="px-3 py-3"><Icon className="size-4 text-primary-glow"/><p className="mt-1.5 text-[8px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-lg">{value}</p></GlassCard>}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between gap-4 border-b border-glass-border py-2.5 last:border-0"><span className="text-[10px] text-muted-foreground">{label}</span><span className="text-right text-sm font-semibold tabular-nums">{value}</span></div>}
function Mini({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-glass-border bg-muted/15 px-2 py-2"><p className="text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{num(value)}</p></div>}
function Insight({title,value,note}:{title:string;value:string;note:string}){return <GlassCard className="px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p><p className="mt-0.5 font-display text-lg">{value}</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{note}</p></GlassCard>}
