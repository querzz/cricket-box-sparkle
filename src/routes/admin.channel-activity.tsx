import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, MessageCircle, Radio, RefreshCw, Search, Send, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route=createFileRoute("/admin/channel-activity")({
  head:()=>({meta:[{title:"Активность канала — CRICKET BOX"}]}),
  component:ChannelActivity,
});

type Level="Низкая"|"Активный"|"Очень активный"|"Максимальная";
type Row={
  id:string;telegramId:string;name:string;username:string;activeDays:number;
  reactions:number;comments:number;joins:number;score:number;level:Level;
  bonus:boolean;bonusSpins:number;activityBonusRemaining:number;
};
type Season={id:string;code:string;name:string;state:string;startsAt:string|null;endsAt:string|null};
type Diagnostics={
  configured:boolean;channelId:string|null;linkedDiscussionChatId:string|null;botId:number|null;
  botChannelStatus:string|null;botDiscussionStatus:string|null;channelTitle:string|null;
  ok:boolean;issues:string[];
};
type ApiResponse={
  ok:boolean;code?:string;enabled?:boolean;configured?:boolean;seasons?:Season[];
  season?:Season|null;diagnostics?:Diagnostics;
  stats?:{activeUsers:number;totalPoints:number;totalActions:number;bonusReady:number;comments:number;reactions:number;joins:number;lastEventAt:string|null};
  users?:Row[];
};

function initData(){
  if(typeof window==="undefined")return "";
  return (window as Window&{Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";
}
function formatDate(value:string|null){
  return value?new Date(value).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}):"—";
}

function ChannelActivity(){
  const [rows,setRows]=useState<Row[]>([]);
  const [seasons,setSeasons]=useState<Season[]>([]);
  const [seasonId,setSeasonId]=useState("");
  const [query,setQuery]=useState("");
  const [enabled,setEnabled]=useState(true);
  const [level,setLevel]=useState<Level|"Все">("Все");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [stats,setStats]=useState({activeUsers:0,totalPoints:0,totalActions:0,bonusReady:0,comments:0,reactions:0,joins:0,lastEventAt:null as string|null});
  const [diagnostics,setDiagnostics]=useState<Diagnostics|null>(null);

  async function load(id=seasonId){
    setLoading(true);
    setError("");
    try{
      const suffix=id?"&seasonId="+encodeURIComponent(id):"";
      const response=await fetch("/api/admin/channel-activity?initData="+encodeURIComponent(initData())+suffix);
      const data=await response.json() as ApiResponse;
      if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
      setRows(data.users??[]);
      setStats(data.stats??{activeUsers:0,totalPoints:0,totalActions:0,bonusReady:0,comments:0,reactions:0,joins:0,lastEventAt:null});
      setEnabled(data.enabled!==false);
      setDiagnostics(data.diagnostics??null);
      if(data.seasons)setSeasons(data.seasons);
      if(data.season?.id&&data.season.id!==seasonId)setSeasonId(data.season.id);
    }catch(err){
      setError(err instanceof Error&&err.message==="ADMIN_ACCESS_DENIED"?"Недостаточно прав для просмотра активности.":"Не удалось загрузить активность канала.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(seasonId)void load(seasonId);},[seasonId]);

  const filtered=useMemo(()=>rows.filter(row=>{
    const q=query.trim().toLowerCase();
    return (!q||row.username.toLowerCase().includes(q)||row.name.toLowerCase().includes(q)||row.telegramId.includes(q)||row.id.toLowerCase().includes(q))
      && (level==="Все"||row.level===level);
  }),[rows,query,level]);

  async function toggleSystem(){
    setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/channel-activity",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({initData:initData(),enabled:!enabled})});
      const data=await response.json() as ApiResponse;
      if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
      setEnabled(data.enabled!==false);
      setMessage(data.enabled?"Начисление очков активности включено.":"Начисление очков активности выключено.");
    }catch{setError("Не удалось изменить настройку активности.");}
  }

  async function grantBonus(telegramId:string){
    setMessage("");setError("");
    try{
      const response=await fetch("/api/admin/channel-activity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:initData(),telegramId})});
      const data=await response.json() as ApiResponse&{bonusFreeSpins?:number};
      if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
      setMessage("Бонусная прокрутка выдана.");
      await load();
    }catch(err){
      const code=err instanceof Error?err.message:"";
      setError(code==="BONUS_CAP_REACHED"?"У пользователя уже максимальный запас бонусных попыток.":code==="USER_NOT_FOUND"?"Пользователь ещё не запускал приложение.":"Не удалось выдать бонусную прокрутку.");
    }
  }

  return <AppShell title="Активность канала" nav={false}>
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link>
        <button type="button" onClick={()=>void load()} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5"/> Обновить</button>
      </div>

      <GlassCard className="px-4 py-4" glow>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Telegram-канал</p>
            <h1 className="mt-1 font-display text-xl uppercase">Реальная активность</h1>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">2 комментария = 1 очко · до 20 учитываемых комментариев в день · 10 очков = 1 бонусный спин. Реакции и вступления считаются как активность, но сами по себе очков не дают.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Radio className={diagnostics?.ok?"size-4 text-primary-glow":"size-4 text-warning"} />
            <button type="button" onClick={()=>void toggleSystem()} className="inline-flex items-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold">
              {enabled?"Выключить":"Включить"}
            </button>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="field-label">Сезон</span>
          <select value={seasonId} onChange={e=>setSeasonId(e.target.value)} className="admin-input mt-1 w-full">
            {seasons.map(season=><option key={season.id} value={season.id}>{season.name} · {season.state}</option>)}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric icon={Users} label="Активные" value={String(stats.activeUsers)} />
          <Metric icon={MessageCircle} label="Очки" value={String(stats.totalPoints)} />
          <Metric icon={Gift} label="Бонус готов" value={String(stats.bonusReady)} />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
          <MiniStat label="Комменты" value={stats.comments} />
          <MiniStat label="Реакции" value={stats.reactions} />
          <MiniStat label="Вступления" value={stats.joins} />
        </div>

        <div className="mt-2 rounded-xl border border-glass-border bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3"><span>Всего действий за период</span><strong className="text-foreground">{stats.totalActions}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span>Последнее событие</span><strong className="text-foreground">{formatDate(stats.lastEventAt)}</strong></div>
        </div>
      </GlassCard>

      {diagnostics&&<GlassCard className={diagnostics.ok?"border-primary/20 bg-primary/5 px-4 py-4":"border-warning/25 bg-warning/5 px-4 py-4"}>
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-glow"/><div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{diagnostics.ok?"Подключение Telegram готово":"Нужно проверить подключение Telegram"}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{diagnostics.channelTitle??"Канал не определён"} · бот в канале: {diagnostics.botChannelStatus??"не проверен"} · обсуждения: {diagnostics.botDiscussionStatus??"не проверено"}</p>
          {diagnostics.linkedDiscussionChatId&&<p className="mt-1 text-[9px] text-muted-foreground">Чат обсуждений: {diagnostics.linkedDiscussionChatId}</p>}
          {diagnostics.issues.length>0&&<div className="mt-2 space-y-1">{diagnostics.issues.map(issue=><p key={issue} className="rounded-lg border border-warning/15 bg-warning/10 px-2.5 py-2 text-[9px] text-warning">⚠ {issue}</p>)}</div>}
        </div></div>
      </GlassCard>}

      {message&&<GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
      {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

      <GlassCard className="space-y-3 px-3 py-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Имя, @username, Telegram ID или ID пользователя" className="admin-input w-full pl-9"/></div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{(["Все","Низкая","Активный","Очень активный","Максимальная"] as const).map(item=><button key={item} type="button" onClick={()=>setLevel(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${level===item?"border-primary/40 bg-primary/10":"border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}</div>
      </GlassCard>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Пользователи канала</h2><span className="text-[10px] text-muted-foreground">{filtered.length}</span></div>
        {loading?<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загружаем активность…</GlassCard>:<div className="space-y-2.5">
          {filtered.map(row=><GlassCard key={row.id} className="px-3.5 py-3.5">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20"><ShieldCheck className="size-4 text-primary-glow"/></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{row.name}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{row.level}</span>{row.bonus&&<span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px]">Бонус в запасе</span>}</div>
                <p className="mt-1 text-[10px] text-muted-foreground">{row.username} · Telegram ID: {row.telegramId}</p>
                <p className="mt-1 break-all text-[9px] text-muted-foreground">ID пользователя CRICKET BOX: {row.id.startsWith("tg_")?"не зарегистрирован":row.id}</p>
                <div className="mt-2 grid grid-cols-4 gap-2"><MiniStat label="Дней" value={row.activeDays}/><MiniStat label="Реакций" value={row.reactions}/><MiniStat label="Комментов" value={row.comments}/><MiniStat label="Очков" value={row.score}/></div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-glass-border pt-3"><span className="flex-1 text-[10px] text-muted-foreground">Бонусов активности осталось: <strong className="text-foreground">{row.activityBonusRemaining}</strong></span><button type="button" onClick={()=>void grantBonus(row.telegramId)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold"><Send className="size-3.5"/> Выдать +1</button></div>
          </GlassCard>)}
          {filtered.length===0&&<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">За выбранный сезон активность пока не собрана.</GlassCard>}
        </div>}
      </section>

      <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground"><strong className="text-foreground">Как считается:</strong> только комментарии дают очки: каждые 2 комментария = 1 очко, максимум 20 комментариев в день. 10 очков дают +1 бонусный спин, максимум 20 спинов активности за сезон. Реакции и вступления — отдельные метрики активности.</GlassCard>
    </div>
  </AppShell>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:string}){return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow"/><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;}
function MiniStat({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-glass-border bg-muted/15 px-2.5 py-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 text-xs font-semibold">{value}</p></div>;}
