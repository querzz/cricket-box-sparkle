import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, Gift, Power } from "lucide-react";
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
type Api = { ok: boolean; campaigns?: Campaign[]; code?: string; id?: string; enabled?: boolean };

function initData() {
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function toInputDate(value: Date) {
  const pad = (n:number) => String(n).padStart(2,"0");
  return value.getFullYear()+"-"+pad(value.getMonth()+1)+"-"+pad(value.getDate())+"T"+pad(value.getHours())+":"+pad(value.getMinutes());
}

function BonusCampaigns() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [seasonId,setSeasonId]=useState("");
  const [name,setName]=useState("Дополнительная бесплатная попытка");
  const [startsAt,setStartsAt]=useState("");
  const [endsAt,setEndsAt]=useState("");
  const [spinsPerUser,setSpinsPerUser]=useState(1);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response=await fetch("/api/admin/seasons?initData="+encodeURIComponent(initData()));
      const data=await response.json() as {ok:boolean;seasons?:Array<{id:string;code:string;state:string;starts_at?:string|null;ends_at?:string|null}>};
      if(!response.ok||!data.ok) throw new Error(data.code??"REQUEST_FAILED");
      const seasons=data.seasons??[];
      const live=seasons.find((s)=>s.state==="ACTIVE"||s.state==="SCHEDULED"||s.state==="ENDING")??seasons[0];
      if(live) setSeasonId(live.id);
      if(live && !startsAt) {
        const start=live.starts_at?new Date(live.starts_at):new Date();
        const end=live.ends_at?new Date(live.ends_at):new Date(start.getTime()+60*60*1000);
        setStartsAt(toInputDate(start));
        setEndsAt(toInputDate(end));
      }
      if(live) {
        const campaignResponse=await fetch("/api/admin/free-spin-campaigns?initData="+encodeURIComponent(initData())+"&seasonId="+encodeURIComponent(live.id));
        const campaignData=await campaignResponse.json() as Api;
        if(campaignResponse.ok&&campaignData.ok) setCampaigns(campaignData.campaigns??[]);
      }
    } catch(e) {
      setError(e instanceof Error?e.message:"Не удалось загрузить кампании.");
    } finally { setLoading(false); }
  }

  useEffect(()=>{void load();},[]);

  async function createCampaign() {
    setSaving(true); setMessage(""); setError("");
    try {
      const response=await fetch("/api/admin/free-spin-campaigns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        initData:initData(),seasonId,name,startsAt,endsAt,spinsPerUser,
      })});
      const data=await response.json() as Api;
      if(!response.ok||!data.ok) throw new Error(data.code??"REQUEST_FAILED");
      setMessage("Бонусная акция создана.");
      await load();
    } catch(e) {
      setError(e instanceof Error&&e.message==="CAMPAIGN_OUTSIDE_SEASON"?"Время акции должно находиться внутри сезона.":"Не удалось создать акцию.");
    } finally { setSaving(false); }
  }

  async function toggle(id:string, enabled:boolean) {
    try {
      const response=await fetch("/api/admin/free-spin-campaigns",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({initData:initData(),id,enabled})});
      const data=await response.json() as Api;
      if(!response.ok||!data.ok) throw new Error(data.code??"REQUEST_FAILED");
      setCampaigns((all)=>all.map((item)=>item.id===id?{...item,enabled}:item));
    } catch { setError("Не удалось изменить состояние акции."); }
  }

  return <AppShell title="Бонусные акции" nav={false}><div className="space-y-4 pb-8">
    <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5"/> Админ-панель</Link>
    <GlassCard className="px-4 py-4" glow>
      <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><Gift className="size-5 text-primary-glow"/></div><div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">LiveOps</p><h1 className="mt-1 font-display text-xl uppercase">Дополнительные попытки</h1><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">На заданном промежутке каждый участник получает указанное количество бесплатных прокруток один раз. Можно создать несколько акций за сезон.</p></div></div>
    </GlassCard>

    {message&&<GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
    {error&&<GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}

    <GlassCard className="space-y-3 px-4 py-4">
      <div className="flex items-center gap-2"><CalendarPlus className="size-4 text-primary-glow"/><p className="text-sm font-semibold">Новая акция</p></div>
      <label className="block"><span className="field-label">Название</span><input value={name} onChange={(e)=>setName(e.target.value)} className="admin-input mt-1 w-full"/></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="field-label">Начало</span><input type="datetime-local" value={startsAt} onChange={(e)=>setStartsAt(e.target.value)} className="admin-input mt-1 w-full"/></label>
        <label className="block"><span className="field-label">Конец</span><input type="datetime-local" value={endsAt} onChange={(e)=>setEndsAt(e.target.value)} className="admin-input mt-1 w-full"/></label>
      </div>
      <label className="block"><span className="field-label">Бесплатных прокруток на участника</span><input type="number" min={1} max={20} value={spinsPerUser} onChange={(e)=>setSpinsPerUser(Math.max(1,Math.min(20,Number(e.target.value)||1)))} className="admin-input mt-1 w-full"/></label>
      <button disabled={saving||loading||!seasonId} type="button" onClick={()=>void createCampaign()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[10px] font-semibold">{saving?"Создаём…":"Создать акцию"}</button>
    </GlassCard>

    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-label">Акции сезона</h2>
        <span className="text-[10px] text-muted-foreground">{campaigns.length}</span>
      </div>
      {loading ? (
        <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка…</GlassCard>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((campaign) => (
            <GlassCard key={campaign.id} className="px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{campaign.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(campaign.starts_at).toLocaleString()} → {new Date(campaign.ends_at).toLocaleString()}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{campaign.spins_per_user} бесплатн. прокрут. на участника</p>
                </div>
                <button type="button" onClick={() => void toggle(campaign.id, !campaign.enabled)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold">
                  <Power className="size-3.5" />
                  {campaign.enabled ? "Выключить" : "Включить"}
                </button>
              </div>
            </GlassCard>
          ))}
          {campaigns.length === 0 && (
            <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Акций пока нет.</GlassCard>
          )}
        </div>
      )}
    </section>
    </section>
  </div></AppShell>;
}
