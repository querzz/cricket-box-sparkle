import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Flame, Gift, RefreshCw, Users, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route=createFileRoute("/admin/daily-streak")({
  head:()=>({meta:[{title:"Daily Streak — CRICKET BOX"}]}),
  component:DailyStreakAdmin,
});

type Player={
  id:string;telegramId:string;username:string;name:string;totalDays:number;currentDay:number;visitedDays:number;
  currentStreak:number;checkedInToday:boolean;eligibleForReward:boolean;rewardStars:number;days:number[];
};
type Api={
  ok:boolean;code?:string;
  season?:{id:string;code:string;name:string;state:string;startsAt:string|null;endsAt:string|null;totalDays:number;currentDay:number};
  metrics?:{participants:number;checkedToday:number;notCheckedToday:number;noMisses:number;eligible:number};
  players?:Player[];
};

function initData(){
  if(typeof window==="undefined") return "";
  return (window as Window&{Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";
}
function fmt(n:number){return n.toLocaleString("ru-RU");}
function dayLabel(day:number,total:number){return day>0?`День ${Math.min(day,total)} из ${total}`:"Сезон ещё не начался";}
function statusLabel(player:Player){
  if(player.eligibleForReward) return "⭐ 15 ⭐";
  if(player.checkedInToday) return "✅ Сегодня";
  return "❌ Нет входа";
}

function DailyStreakAdmin(){
  const [data,setData]=useState<Api|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState<"ALL"|"MISSED"|"STREAK"|"ELIGIBLE">("ALL");
  const [search,setSearch]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/daily-streak?initData="+encodeURIComponent(initData()));
      const result=await response.json() as Api;
      if(!response.ok||!result.ok) throw new Error(result.code??"DAILY_STREAK_FAILED");
      setData(result);
    }catch(e){
      setError(e instanceof Error&&e.message==="ADMIN_ACCESS_DENIED"?"Нет доступа к админке.":"Не удалось загрузить Daily Streak.");
    }finally{setLoading(false);}
  }
  useEffect(()=>{ void load(); const timer=window.setInterval(()=>void load(),10000); return()=>window.clearInterval(timer); },[]);

  const players=useMemo(()=>{
    const all=data?.players??[];
    const q=search.trim().toLowerCase();
    return all.filter((player)=>{
      if(filter==="MISSED"&&player.checkedInToday) return false;
      if(filter==="STREAK" && !(player.currentDay>0 && player.currentStreak===player.currentDay && player.visitedDays===player.currentDay)) return false;
      if(filter==="ELIGIBLE"&&!player.eligibleForReward) return false;
      if(!q) return true;
      return player.name.toLowerCase().includes(q)||player.username.toLowerCase().includes(q)||player.telegramId.includes(q);
    });
  },[data,filter,search]);

  const s=data?.season;
  const m=data?.metrics;

  return <AppShell title="Daily Streak" nav={false}>
    <div className="space-y-4 pb-8">
      <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link>

      {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

      {loading&&!data ? <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Считаем ежедневные входы…</GlassCard> : data&&s&&m ? <>
        <GlassCard glow className="overflow-hidden px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Ежедневный проход</p>
              <h1 className="mt-1 truncate font-display text-xl uppercase">{s.name}</h1>
              <p className="mt-1 text-[10px] text-muted-foreground">{dayLabel(s.currentDay,s.totalDays)} · максимальный streak 🔥 {s.totalDays}</p>
            </div>
            <button type="button" onClick={()=>void load()} aria-label="Обновить" className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/10"><RefreshCw className="size-4"/></button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric icon={Users} label="Зашли в сезон" value={fmt(m.participants)}/>
            <Metric icon={CheckCircle2} label="Сегодня ✅" value={fmt(m.checkedToday)}/>
            <Metric icon={XCircle} label="Не заходили" value={fmt(m.notCheckedToday)}/>
            <Metric icon={Flame} label="Без пропусков" value={fmt(m.noMisses)}/>
            <Metric icon={Gift} label="Готовы к 15 ⭐" value={fmt(m.eligible)}/>
          </div>
        </GlassCard>

        <GlassCard className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-orange-400/25 bg-orange-500/10"><Flame className="size-5 text-orange-400"/></div>
            <div>
              <p className="text-sm font-semibold">Как работает streak</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Первый вход в каждый день сезона отмечается один раз. Длина сезона автоматически определяет максимум: 7 дней → 🔥 7, 14 дней → 🔥 14. Полные {s.totalDays}/{s.totalDays} дней дают {15} ⭐ в конце сезона.</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-glass-border bg-muted/10 px-3 py-2.5 text-[10px] text-muted-foreground">Сегодня засчитан как день <strong className="text-foreground">{Math.min(s.currentDay||1,s.totalDays)}</strong>. Повторные открытия в этот день не увеличивают счётчик.</div>
        </GlassCard>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h2 className="section-label">Участники</h2><p className="text-[10px] text-muted-foreground">{players.length} из {m.participants}</p></div>
            <div className="flex gap-1.5 overflow-x-auto">
              {([["ALL","Все"],["MISSED","❌ Не были"],["STREAK","🔥 Без пропусков"],["ELIGIBLE","⭐ 15 ⭐"]] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setFilter(value)} className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold ${filter===value?"border-primary/40 bg-primary/10":"border-glass-border bg-muted/10 text-muted-foreground"}`}>{label}</button>)}
            </div>
          </div>
          <div className="relative mb-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Имя, @username или Telegram ID" className="admin-input w-full"/></div>
          <div className="space-y-2">
            {players.map((player)=><GlassCard key={player.id} className="px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-orange-500/10"><Flame className="size-4 text-orange-400"/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{player.name}</p><span className="text-[10px] text-muted-foreground">{player.username}</span></div>
                  <p className="mt-1 text-[10px] text-muted-foreground">🔥 {player.currentStreak} дней подряд · {player.visitedDays}/{player.totalDays} посещений</p>
                  <div className="mt-2 flex gap-1 overflow-hidden">
                    {Array.from({length:player.totalDays},(_,index)=>index+1).map((day)=><span key={day} title={`День ${day}`} className={`size-3 shrink-0 rounded-[4px] border ${player.days.includes(day)?"border-primary/50 bg-primary/70":"border-glass-border bg-muted/20"}`}/>)}
                  </div>
                  <p className="mt-2 text-[9px] text-muted-foreground">Telegram ID: {player.telegramId}</p>
                </div>
                <div className="shrink-0 text-right"><p className="text-[10px] font-semibold">{statusLabel(player)}</p><p className="mt-1 text-[9px] text-muted-foreground">{player.checkedInToday?"Сегодня ✅":"Сегодня ❌"}</p></div>
              </div>
            </GlassCard>)}
            {players.length===0&&<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Никого по этому фильтру пока нет.</GlassCard>}
          </div>
        </section>
      </> : null}
    </div>
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:string}){
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow"/><p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}
