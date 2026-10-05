import { Check, ChevronRight, Clover, Flame, Gift, Star, Ticket, Zap } from "lucide-react";
import { useState } from "react";
import { GlassCard } from "@/components/kit/GlassCard";
import type { DailyStreakChoice, DailyStreakSnapshot } from "@/lib/types";
import { useSession, isServiceError } from "@/store/session";

const REWARDS=[1,1,1,2,2,3];

function choiceIcon(type:DailyStreakChoice["type"]){
  if(type==="STARS") return Star;
  if(type==="FREE_SPIN") return Ticket;
  if(type==="DAILY_GIFT_BOOST") return Clover;
  return Zap;
}

export function DailyStreakCard({streak}:{streak:DailyStreakSnapshot}){
  const { claimStreakChoice }=useSession();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  if(!streak.enabled) return null;

  const day7Ready=Boolean(streak.day7ChoiceAvailable)&&!streak.closed;
  const visited=new Set(streak.visitedDayIndexes??[]); const completed=Math.min(7,Math.max(0,streak.currentStreak));
  const current=Math.min(7,Math.max(0,streak.currentDay||0));

  async function choose(choice:DailyStreakChoice["type"]){
    if(busy||!day7Ready) return;
    setBusy(true);setMessage("");
    try{
      const result=await claimStreakChoice(choice);
      if(isServiceError(result)){setMessage(result.message);return;}
      setMessage("Награда получена ✅");
    }finally{setBusy(false);}
  }

  return <GlassCard glow className="overflow-hidden px-4 py-4">
    <div className="flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-orange-400/25 bg-orange-500/10"><Flame className="size-5 text-orange-400"/></div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg uppercase tracking-[0.12em]">{streak.closed?"Серия остановлена":"🔥 Серия "+completed+" дней"}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{streak.closed?(streak.stoppedReason??"Сезон завершён — серия остановлена."):(streak.checkedInToday?"Сегодняшний день засчитан ✅":"Зайди сегодня, чтобы сохранить серию")}</p>
      </div>
      {!streak.closed&&<div className="shrink-0 text-right"><p className="font-display text-base">{Math.min(7,streak.currentStreak)}/7</p><p className="text-[9px] text-muted-foreground">дней подряд</p></div>}
    </div>

    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {Array.from({length:7},(_,i)=>i+1).map(day=>{
        const done=visited.has(day);
        const active=day===current&&!streak.closed;
        const special=day===7;
        return <div key={day} className={`min-w-0 rounded-xl border px-1 py-2 text-center ${special?"border-primary/45 bg-primary/10":"border-glass-border bg-muted/10"} ${active?"ring-1 ring-primary/50":""}`}>
          <div className={`mx-auto grid size-6 place-items-center rounded-lg text-[9px] ${done?"bg-primary/80 text-primary-foreground":"bg-muted/20 text-muted-foreground"}`}>{done?<Check className="size-3"/>:special?<Gift className="size-3.5"/>:day}</div>
          <p className="mt-1 text-[8px] text-muted-foreground">День {day}</p>
          <p className="mt-1 text-[8px] font-semibold">{day<7?(REWARDS[day-1]||0)+" ⭐":"выбор 🎁"}</p>
        </div>;
      })}
    </div>

    <div className="mt-3 rounded-2xl border border-glass-border bg-muted/10 px-3 py-3">
      <p className="text-[10px] font-semibold">Награды серии</p>
      <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">День 1–6 дают 10 ⭐ суммарно. На 7-й день выбери одну награду.</p>
      {day7Ready&&streak.day7Choices&&<div className="mt-3 grid grid-cols-2 gap-2">{streak.day7Choices.map(choice=>{const Icon=choiceIcon(choice.type);return <button key={choice.type} type="button" disabled={busy} onClick={()=>void choose(choice.type)} className="press rounded-2xl border border-primary/30 bg-primary/8 px-3 py-3 text-left disabled:opacity-50"><span className="grid size-8 place-items-center rounded-xl border border-primary/25 bg-primary/10"><Icon className="size-4 text-primary-glow"/></span><p className="mt-2 text-[10px] font-semibold leading-tight">{choice.title}</p><span className="mt-1 inline-flex items-center gap-1 text-[8px] text-muted-foreground">Выбрать <ChevronRight className="size-3"/></span></button>;})}</div>}
      {!streak.closed&&!day7Ready&&<p className="mt-2 text-[9px] text-muted-foreground">{current<7?`Ещё ${Math.max(0,7-current)} дн. подряд до выбора награды.`:"7-й день отмечен. Выбор уже получен или ожидает обновления."}</p>}
      {message&&<p className="mt-2 text-[9px] text-primary-glow">{message}</p>}
    </div>
  </GlassCard>;
}
