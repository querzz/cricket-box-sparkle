import { Gift, Heart, Ticket, Star, Sparkles } from 'lucide-react';
import { useEffect,useState } from 'react';
import { GlassCard } from '@/components/kit/GlassCard';

type Reward={type?:string;amount?:number;title?:string};
type Event={id:string;type:'GIFT_OR_PASS'|'GOOD_OR_BAD'|'OWNER_SPECIAL';passRemaining:number;payload:{title?:string;message?:string;reward?:Reward;good?:Reward;bad?:Reward};createdAt:string};
type Api={ok:boolean;event?:Event|null;code?:string};
function initData(){return typeof window==='undefined'?'':(window as Window & {Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??'';}
function icon(type:string){if(type==='STARS')return Star;if(type==='FREE_SPIN')return Ticket;if(type==='XP')return Sparkles;return Gift;}

export function EntertainmentEventCard(){
 const [event,setEvent]=useState<Event|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{const r=await fetch('/api/entertainment?initData='+encodeURIComponent(initData()),{cache:'no-store'});const d=await r.json() as Api;if(r.ok&&d.ok)setEvent(d.event??null);}catch{/* Best-effort read; absence of an event is a valid state. */}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 if(loading||!event)return null;
 const currentEvent=event;
 const payload=currentEvent.payload??{};const reward=payload.reward??{};const good=payload.good;const Icon=icon(String(reward.type??good?.type??'NOTE'));
 async function action(actionType:'CLAIM'|'PASS'){
  if(busy)return;setBusy(true);setError('');
  try{
   let passToTelegramId:string|undefined;
   if(actionType==='PASS'){passToTelegramId=window.prompt('Telegram ID участника, которому передать подарок:')?.replace(/\D/g,'');if(!passToTelegramId){setBusy(false);return;}}
   const r=await fetch('/api/entertainment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:initData(),eventId:currentEvent.id,action:actionType,passToTelegramId})});
   const d=await r.json() as Api & {title?:string;amount?:number;credited?:number;rewardType?:string};
   if(!r.ok||!d.ok)throw new Error(d.code??'EVENT_FAILED');
   setEvent(null);
   if(actionType==='CLAIM')window.alert(d.rewardType==='STARS'?`+${d.credited??d.amount??0} ⭐`:'Подарок получен ✅');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить событие.');}finally{setBusy(false);}
 }
 const isPass=currentEvent.type==='GIFT_OR_PASS';
 return <GlassCard glow className='border-primary/35 bg-primary/5 px-4 py-4'>
  <div className='flex items-start gap-3'><div className='grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10'><Icon className='size-5 text-primary-glow'/></div><div className='min-w-0 flex-1'><p className='text-[9px] uppercase tracking-[0.2em] text-primary-glow'>✨ Развлекательное событие</p><h2 className='mt-1 font-display text-base uppercase'>{payload.title??'Особое событие'}</h2>{payload.message&&<p className='mt-1 text-[10px] leading-relaxed text-muted-foreground'>{payload.message}</p>}{isPass?<p className='mt-2 text-[9px] text-muted-foreground'>Можно передать дальше: ещё {currentEvent.passRemaining} раз.</p>:currentEvent.type==='GOOD_OR_BAD'?<p className='mt-2 text-[9px] text-muted-foreground'>Открой подарок — внутри может быть хороший или неудачный результат 🎁</p>:<p className='mt-2 text-[9px] text-muted-foreground'>{reward.amount?reward.amount+' '+(reward.type==='STARS'?'⭐':reward.type==='FREE_SPIN'?'бонусная попытка':'XP'):'Особый подарок'}</p>}</div></div>
  <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2'><button disabled={busy} onClick={()=>void action('CLAIM')} type='button' className='inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold'><Heart className='size-3.5'/> {event.type==='GOOD_OR_BAD'?'Открыть подарок':'Забрать подарок'}</button>{isPass&&currentEvent.passRemaining>0&&<button disabled={busy} onClick={()=>void action('PASS')} type='button' className='inline-flex items-center justify-center gap-2 rounded-xl border border-glass-border bg-muted/10 px-3 py-2.5 text-[10px] font-semibold'>Передать дальше</button>}</div>
  {error&&<p className='mt-2 text-center text-[9px] text-destructive'>{error}</p>}
 </GlassCard>;
}