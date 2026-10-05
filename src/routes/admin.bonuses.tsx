import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Power, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/bonuses")({
  head: () => ({ meta: [{ title: "Бонусные акции — CRICKET BOX" }] }),
  component: BonusCampaigns,
});

type Campaign = {
  id: string;
  season_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  spins_per_user: number;
  enabled: boolean;
};
type Season = { id:string; code:string; name:string; state:string };
type Api = { ok:boolean; campaigns?:Campaign[]; code?:string; id?:string; enabled?:boolean };
type SeasonsApi = { ok:boolean; seasons?:Season[]; code?:string };

function initData(){
  return typeof window==="undefined"?"":(window as Window & {Telegram?:{WebApp?:{initData?:string}}}).Telegram?.WebApp?.initData?.trim()??"";
}

function BonusCampaigns(){
  const [seasons,setSeasons]=useState<Season[]>([]);
  const [seasonId,setSeasonId]=useState("");
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [name,setName]=useState("Дополнительная бесплатная попытка");
  const [spinsPerUser,setSpinsPerUser]=useState(1);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function loadSeasons(){
    const response=await fetch("/api/admin/seasons?all=1&initData="+encodeURIComponent(initData()));
    const data=await response.json() as SeasonsApi;
    if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
    const list=data.seasons??[];
    setSeasons(list);
    setSeasonId((current)=>current&&list.some(item=>item.id===current)?current:list.find(s=>s.state==="ACTIVE")?.id??list.find(s=>s.state==="ENDING")?.id??list[0]?.id??"");
    return list;
  }

  async function loadCampaigns(id:string){
    if(!id){setCampaigns([]);return;}
    const response=await fetch("/api/admin/free-spin-campaigns?initData="+encodeURIComponent(initData())+"&seasonId="+encodeURIComponent(id));
    const data=await response.json() as Api;
    if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
    setCampaigns(data.campaigns??[]);
  }

  useEffect(()=>{
    setLoading(true);setError("");
    void loadSeasons().catch((e)=>setError(e instanceof Error?e.message:"Не удалось загрузить сезоны.")).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(!seasonId)return;
    setLoading(true);setError("");
    void loadCampaigns(seasonId).catch((e)=>setError(e instanceof Error?e.message:"Не удалось загрузить кампании.")).finally(()=>setLoading(false));
  },[seasonId]);

  const selectedSeason=seasons.find(s=>s.id===seasonId);
  const canCreate=selectedSeason?["ACTIVE","ENDING"].includes(selectedSeason.state):false;

  async function createCampaign(){
    if(!canCreate)return;
    setSaving(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/admin/free-spin-campaigns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:initData(),seasonId,name:name.trim(),spinsPerUser})});
      const data=await response.json() as Api & {grantedUsers?:number};
      if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
      setMessage(`Готово: ${Number(data.grantedUsers??0)} участникам выдано по ${spinsPerUser} доп. попытки.`);
      await loadCampaigns(seasonId);
    }catch(e){
      const code=e instanceof Error?e.message:"";
      setError(code==="SEASON_NOT_ACTIVE"?"Для выдачи нужен активный или завершающийся сезон.":code==="INVALID_CAMPAIGN"?"Проверь название и количество попыток.":"Не удалось создать акцию: "+code);
    }finally{setSaving(false);}
  }

  async function toggle(id:string,enabledValue:boolean){
    setSaving(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/free-spin-campaigns",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({initData:initData(),id,enabled:enabledValue})});
      const data=await response.json() as Api;
      if(!response.ok||!data.ok)throw new Error(data.code??"REQUEST_FAILED");
      setCampaigns(all=>all.map(item=>item.id===id?{...item,enabled:enabledValue}:item));
      if(enabledValue&&Number((data as Api&{grantedUsers?:number}).grantedUsers??0)>0)setMessage(`Акция включена: выдано ещё ${Number((data as Api&{grantedUsers?:number}).grantedUsers??0)} пользователям.`);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить состояние акции.");}
    finally{setSaving(false);}
  }

  return <AppShell title="Бонусные акции" nav={false}>
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link>
        <button type="button" onClick={()=>{setLoading(true);void loadSeasons().then(()=>seasonId?loadCampaigns(seasonId):undefined).catch(e=>setError(e instanceof Error?e.message:"Не удалось обновить.")).finally(()=>setLoading(false));}} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5"/> Обновить</button>
      </div>

      <GlassCard className="px-4 py-4" glow>
        <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><Gift className="size-5 text-primary-glow"/></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">LiveOps</p><h1 className="mt-1 font-display text-xl uppercase">Дополнительные попытки</h1><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Одна акция выдаёт бесплатные прокрутки участникам выбранного сезона один раз. Новые участники активного сезона получают бонус при входе.</p></div></div>
        <label className="mt-4 block"><span className="field-label">Сезон</span><select value={seasonId} onChange={e=>setSeasonId(e.target.value)} className="admin-input mt-1 w-full">{seasons.map(s=><option key={s.id} value={s.id}>{s.name} · {s.state}</option>)}</select></label>
        <p className="mt-2 text-[9px] text-muted-foreground">{selectedSeason?canCreate?"Можно создавать и включать акции для этого сезона.":"Исторический сезон: просмотр доступен, выдача новых бонусов запрещена.":"Сезон не выбран."}</p>
      </GlassCard>

      {message&&<GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
      {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

      <GlassCard className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2"><Gift className="size-4 text-primary-glow"/><p className="text-sm font-semibold">Выдать дополнительные попытки</p></div>
        <label className="block"><span className="field-label">Название</span><input value={name} onChange={e=>setName(e.target.value)} className="admin-input mt-1 w-full"/></label>
        <label className="block"><span className="field-label">Бесплатных прокруток на участника</span><input type="number" min={1} max={20} value={spinsPerUser} onChange={e=>setSpinsPerUser(Math.max(1,Math.min(20,Number(e.target.value)||1)))} className="admin-input mt-1 w-full"/></label>
        <button disabled={saving||loading||!canCreate||!name.trim()} type="button" onClick={()=>void createCampaign()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold disabled:opacity-50">{saving?"Создаём…":canCreate?"Создать акцию":"Только для активного сезона"}</button>
      </GlassCard>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Акции сезона</h2><span className="text-[10px] text-muted-foreground">{campaigns.length}</span></div>
        {loading?<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</GlassCard>:<div className="space-y-2.5">
          {campaigns.map(campaign=><GlassCard key={campaign.id} className="px-4 py-3.5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{campaign.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{campaign.spins_per_user} бесплатн. прокрут. на участника · {new Date(campaign.starts_at).toLocaleString("ru-RU",{hour12:false})} → {new Date(campaign.ends_at).toLocaleString("ru-RU",{hour12:false})}</p></div><button disabled={saving||!canCreate} type="button" onClick={()=>void toggle(campaign.id,!campaign.enabled)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-50"><Power className="size-3.5"/>{campaign.enabled?"Выключить":"Включить"}</button></div></GlassCard>)}
          {campaigns.length===0&&<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">{selectedSeason?"Акций для этого сезона пока нет.":"Сезон не найден."}</GlassCard>}
        </div>}
      </section>
    </div>
  </AppShell>;
}
