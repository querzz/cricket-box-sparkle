import { Check, Gift, Star, Ticket, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/kit/GlassCard";
import type { OwnerGift } from "@/lib/types";
import { isServiceError, useSession } from "@/store/session";

export function OwnerGiftCard({ gift }: { gift: OwnerGift | null }) {
  const { claimOwnerGift } = useSession();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [showPopup,setShowPopup]=useState(false);

  useEffect(()=>{
    if(!gift) return;
    try{
      const key=`cricketbox-owner-gift-seen:${gift.id}`;
      if(localStorage.getItem(key)!=="1"){
        localStorage.setItem(key,"1");
        setShowPopup(true);
      }
    }catch{
      setShowPopup(true);
    }
  },[gift?.id]);

  if(!gift) return null;
  const currentGift=gift;
  const Icon=currentGift.rewardType==="STARS"?Star:currentGift.rewardType==="FREE_SPIN"?Ticket:currentGift.rewardType==="XP"?Sparkles:Gift;
  const rewardLabel=currentGift.rewardType==="STARS"?`⭐ ${currentGift.amount} Stars`:currentGift.rewardType==="FREE_SPIN"?`🎟️ ${currentGift.amount} бонусных прокруток`:currentGift.rewardType==="XP"?`✨ +${currentGift.amount} XP`:"Особое сообщение";

  async function claim():Promise<boolean>{
    if(busy)return false;
    setBusy(true);setMessage("");
    try{
      const result=await claimOwnerGift(currentGift.id);
      if(isServiceError(result)){setMessage(result.message);return false;}
      setMessage(result.rewardType==="STARS"?`+${result.amount} ⭐ зачислено на баланс.`:"Подарок получен ✅");
      return true;
    }finally{setBusy(false);}
  }

  return <>
    <GlassCard glow className="border-primary/35 bg-primary/5 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10"><Icon className="size-5 text-primary-glow"/></div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-[0.2em] text-primary-glow">🎁 Личный подарок от владельца</p>
          <h2 className="mt-1 font-display text-base uppercase">{currentGift.title}</h2>
          {currentGift.message&&<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{currentGift.message}</p>}
          <p className="mt-2 text-[10px] font-semibold">{rewardLabel}</p>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={()=>void claim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold disabled:opacity-50"><Check className="size-3.5"/>{busy?"Получаем…":"Открыть и получить подарок"}</button>
      {message&&<p className="mt-2 text-center text-[9px] text-primary-glow">{message}</p>}
    </GlassCard>

    {showPopup&&<div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-3 sm:items-center" onClick={()=>setShowPopup(false)}>
      <GlassCard glow className="w-full max-w-sm overflow-hidden border-primary/40 bg-background/95 px-5 py-5 shadow-2xl" onClick={(event)=>event.stopPropagation()}>
        <div className="relative">
          <button type="button" aria-label="Закрыть" onClick={()=>setShowPopup(false)} className="absolute right-0 top-0 grid size-8 place-items-center rounded-full border border-glass-border bg-muted/20"><X className="size-4"/></button>
          <div className="mx-auto grid size-16 place-items-center rounded-[1.4rem] border border-primary/35 bg-primary/10"><Icon className="size-8 text-primary-glow"/></div>
          <p className="mt-4 text-center text-[9px] uppercase tracking-[0.24em] text-primary-glow">🎁 Тебе что-то дали</p>
          <h2 className="mt-2 text-center font-display text-2xl uppercase leading-tight">Личный подарок</h2>
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 text-center">
            <p className="font-semibold">{currentGift.title}</p>
            {currentGift.message&&<p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{currentGift.message}</p>}
            <p className="mt-3 text-sm font-semibold">{rewardLabel}</p>
          </div>
          {message&&<p className="mt-2 text-center text-[9px] text-destructive">{message}</p>}
          <button type="button" disabled={busy} onClick={async()=>{const ok=await claim();if(ok)setShowPopup(false);}} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/15 px-4 py-3 text-xs font-bold disabled:opacity-50"><Gift className="size-4"/>{busy?"Получаем…":"Забрать подарок"}</button>
          <button type="button" onClick={()=>setShowPopup(false)} className="mt-2 w-full rounded-xl px-4 py-2 text-[10px] text-muted-foreground">Позже</button>
        </div>
      </GlassCard>
    </div>}
  </>;
}
