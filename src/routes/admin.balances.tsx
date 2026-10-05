import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, RefreshCw, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { ExportListButton } from "@/components/kit/ExportListButton";
import { CopyButton } from "@/components/kit/CopyButton";

export const Route=createFileRoute("/admin/balances")({head:()=>({meta:[{title:"Балансы — CRICKET BOX"}]}),component:BalancesScreen});

type User={id:string;telegramId:string;username:string;name:string;balance:number;spins:number;wins:number;pendingStars:number;lastSeen:string};
type Api={ok:boolean;role?:"OWNER"|"ADMIN";users?:User[];summary?:{totalStars:number;usersWithBalance:number;usersTotal:number;averageBalance:number};result?:{kind:string;amount:number;balance:number;username:string};code?:string};

function initData(){return typeof window==="undefined"?"":(window as Window & {Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";}

async function request(url:string,method:"GET"|"POST"="GET",body?:Record<string,unknown>){
  const response=await fetch(url,{method,headers:{"content-type":"application/json"},...(body?{body:JSON.stringify({...body,initData:initData()})}:{})});
  const data=await response.json() as Api;
  if(!response.ok||!data.ok) throw new Error(data.code??"REQUEST_FAILED");
  return data;
}

function BalancesScreen(){
  const [users,setUsers]=useState<User[]>([]);
  const [summary,setSummary]=useState({totalStars:0,usersWithBalance:0,usersTotal:0,averageBalance:0});
  const [adminRole,setAdminRole]=useState<"OWNER"|"ADMIN">("ADMIN");
  const [search,setSearch]=useState(""); const [filter,setFilter]=useState("all"); const [sort,setSort]=useState("balance_desc");
  const [selected,setSelected]=useState<User|null>(null); const [action,setAction]=useState<"stars"|"spins"|null>(null);
  const [amount,setAmount]=useState("5"); const [reason,setReason]=useState(""); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [message,setMessage]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const data=await request("/api/admin/balances?initData="+encodeURIComponent(initData())+"&search="+encodeURIComponent(search)+"&filter="+encodeURIComponent(filter)+"&sort="+encodeURIComponent(sort));
      setUsers(data.users??[]);setSummary(data.summary??{totalStars:0,usersWithBalance:0,usersTotal:0,averageBalance:0});setAdminRole(data.role==="OWNER"?"OWNER":"ADMIN");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить балансы.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[filter,sort]);
  useEffect(()=>{const t=window.setTimeout(()=>void load(),300);return()=>window.clearTimeout(t);},[search]);

  const displayed=useMemo(()=>users,[users]);
  async function doAction(random=false){
    if(!selected||!action||busy)return;
    const n=Number(amount);
    if(action==="stars"&&(!Number.isSafeInteger(n)||n===0)){setError("Для Stars укажи целое изменение, например +5 или -5.");return;}
    if(action==="spins"&&!random&&(!Number.isSafeInteger(n)||n<1||n>20)){setError("Бесплатных прокруток можно выдать от 1 до 20.");return;}
    if(!reason.trim()){setError("Укажи причину выдачи.");return;}
    setBusy(true);setError("");setMessage("");
    try{
      const data=await request("/api/admin/balances","POST",{
        userId:selected.id,action:action==="stars"?"STAR_ADJUST":"FREE_SPIN_GRANT",amount:action==="spins"&&random?1:n,random,reason:reason.trim()
      });
      const result=data.result;
      if(result) setMessage(action==="stars" ? result.username+" — баланс теперь "+result.balance+" ⭐." : result.username+" — выдано "+result.amount+" бесплатных прокруток.");
      setSelected(null);setAction(null);setReason("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить действие.");}
    finally{setBusy(false);}
  }

  return <AppShell title="Балансы" nav={false}><div className="space-y-4 pb-8">
    <div className="flex items-center justify-between gap-3"><Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link><button type="button" onClick={()=>void load()} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5"/> Обновить</button></div>
    <GlassCard className="px-4 py-4" glow><div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><Users className="size-5 text-primary-glow"/></div><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Stars</p><h1 className="mt-1 font-display text-xl uppercase">Балансы пользователей</h1></div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Всего звёзд" value={summary.totalStars+" ⭐"}/><Metric label="Пользователей" value={String(summary.usersTotal)}/><Metric label="С балансом" value={String(summary.usersWithBalance)}/><Metric label="Средний баланс" value={summary.averageBalance.toFixed(1)+" ⭐"}/></div></GlassCard>
    {message&&<GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}{error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
    <GlassCard className="space-y-2.5 px-3 py-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по @username, ID или имени" className="admin-input w-full"/><div className="flex gap-2 overflow-x-auto pb-1">{[["all","Все"],["positive","С балансом"],["zero","Нулевой"]].map(([v,label])=><button key={v} type="button" onClick={()=>setFilter(v)} className={filter===v?"rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold":"rounded-full border border-glass-border px-3 py-1.5 text-[10px] text-muted-foreground"}>{label}</button>)}<select value={sort} onChange={e=>setSort(e.target.value)} className="admin-input ml-auto min-w-36 py-1.5 text-[10px]"><option value="balance_desc">Баланс ↓</option><option value="balance_asc">Баланс ↑</option><option value="recent">Последний вход</option></select></div></GlassCard>
    <section><div className="mb-2 flex items-center justify-between gap-2"><h2 className="section-label">Пользователи</h2><div className="flex items-center gap-2"><ExportListButton filename="balansy-polzovatelei" title="Балансы пользователей" headers={["Username","Имя","Telegram ID","Stars","Прокрутки","Награды","К выводу"]} rows={displayed.map(u=>[u.username,u.name,u.telegramId,u.balance,u.spins,u.wins,u.pendingStars])}/><span className="text-[10px] text-muted-foreground">{displayed.length}</span></div></div><GlassCard className="overflow-hidden">{loading?<div className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</div>:displayed.map(user=><div key={user.id} className="flex items-center gap-3 border-b border-glass-border px-3 py-3.5 last:border-0"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{user.username}</p><CopyButton value={user.username.startsWith("@")?user.username:`@${user.username}`} label="Скопировать username" /></div><div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground"><span>ID {user.telegramId}</span><CopyButton value={user.telegramId} label="Скопировать ID" /></div><p className="mt-1 text-[9px] text-muted-foreground">{user.spins} прокруток · {user.wins} наград{user.pendingStars>0?" · "+user.pendingStars+" ⭐ к выплате":""}</p></div><div className="text-right"><p className="font-display text-lg">{user.balance} ⭐</p><button type="button" onClick={()=>{setSelected(user);setAction(adminRole==="OWNER"?"stars":"spins");setAmount("5");setReason("");}} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-[9px] font-semibold"><Plus className="size-3"/> Управлять</button></div></div>)}{!loading&&displayed.length===0&&<div className="px-4 py-8 text-center text-xs text-muted-foreground">Пользователи не найдены.</div>}</GlassCard></section>
  </div>
  {selected&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"><GlassCard className="w-full max-w-lg px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Управление пользователем</p><h2 className="mt-1 font-display text-xl">{selected.username}</h2><p className="text-[10px] text-muted-foreground">ID {selected.telegramId} · текущий баланс {selected.balance} ⭐</p></div><button type="button" onClick={()=>setSelected(null)}><X className="size-5"/></button></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={adminRole!=="OWNER"} onClick={()=>setAction("stars")} title={adminRole==="OWNER"?"":"Только OWNER"} className={action==="stars"?"rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold":"rounded-xl border border-glass-border px-3 py-2.5 text-[10px]"}><Plus className="mr-1 inline size-3.5"/> Stars</button><button type="button" onClick={()=>setAction("spins")} className={action==="spins"?"rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold":"rounded-xl border border-glass-border px-3 py-2.5 text-[10px]"}><Send className="mr-1 inline size-3.5"/> Free Spin</button></div>{action==="stars"&&<div className="mt-3 space-y-2"><p className="text-[9px] text-muted-foreground">{adminRole==="OWNER"?"Ручная корректировка доступна владельцу.":"Только OWNER может изменять Stars-баланс."}</p><input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="+5 или -5" inputMode="numeric" className="admin-input w-full"/><p className="text-[9px] text-muted-foreground">Положительное число начисляет Stars, отрицательное списывает. Лимит баланса 0–500.</p></div>}{action==="spins"&&<div className="mt-3 space-y-2"><input type="number" min={1} max={20} value={amount} onChange={e=>setAmount(e.target.value)} className="admin-input w-full"/><button type="button" onClick={()=>void doAction(true)} disabled={busy} className="w-full rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold">🎲 Выдать случайно 1–5</button></div>}<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Причина / комментарий" className="admin-input mt-3 min-h-20 w-full resize-none"/><button type="button" disabled={busy||!action} onClick={()=>void doAction(false)} className="mt-3 w-full rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold">{busy?"Сохраняем…":action==="stars"?"Применить баланс":"Выдать прокрутки"}</button></GlassCard></div>}
  </AppShell>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>}
