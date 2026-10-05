import { Gift, Star, Ticket, Sparkles, Check } from "lucide-react";
import { useState } from "react";
import { GlassCard } from "@/components/kit/GlassCard";
import type { OwnerGift } from "@/lib/types";
import { isServiceError, useSession } from "@/store/session";

export function OwnerGiftCard({ gift }: { gift: OwnerGift | null }) {
  const { claimOwnerGift } = useSession();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  if(!gift) return null;
  const Icon=gift.rewardType==="STARS"?Star:gift.rewardType==="FREE_SPIN"?Ticket:gift.rewardType==="XP"?Sparkles:Gift;
  async function claim(){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const result=await claimOwnerGift(gift.id);
      if(isServiceError(result)){setMessage(result.message);return;}
      setMessage(result.rewardType==="STARS"?`+${result.amount} ⭐ зачислено на баланс.`:"Подарок получен ✅");
    }finally{setBusy(false);}
  }
  return <GlassCard glow className="border-primary/35 bg-primary/5 px-4 py-4">
    <div className="flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10"><Icon className="size-5 text-primary-glow"/></div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-[0.2em] text-primary-glow">🎁 Личный подарок от владельца</p>
        <h2 className="mt-1 font-display text-base uppercase">{gift.title}</h2>
        {gift.message&&<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{gift.message}</p>}
        <p className="mt-2 text-[10px] font-semibold">{gift.rewardType==="STARS"?`⭐ ${gift.amount} Stars`:gift.rewardType==="FREE_SPIN"?`🎟️ ${gift.amount} бонусная попытка`:gift.rewardType==="XP"?`✨ +${gift.amount} XP`:"Особое сообщение"}</p>
      </div>
    </div>
    <button type="button" disabled={busy} onClick={()=>void claim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold disabled:opacity-50"><Check className="size-3.5"/>{busy?"Получаем…":"Открыть и получить подарок"}</button>
    {message&&<p className="mt-2 text-center text-[9px] text-primary-glow">{message}</p>}
  </GlassCard>;
}
