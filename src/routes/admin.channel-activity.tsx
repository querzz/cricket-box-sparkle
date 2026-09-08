import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, MessageCircle, Radio, Search, Send, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/channel-activity")({
  head: () => ({ meta: [{ title: "Активность канала — CRICKET BOX" }] }),
  component: ChannelActivity,
});

type Level = "Низкая" | "Активный" | "Очень активный" | "Максимальная";
type Row = { id:string; telegramId:string; name:string; username:string; activeDays:number; reactions:number; comments:number; joins:number; score:number; level:Level; bonus:boolean; bonusSpins:number; activityBonusRemaining:number };
type ApiResponse = { ok:boolean; code?:string; stats?:{activeUsers:number;totalPoints:number;totalActions:number;bonusReady:number}; users?:Row[] };

function initData() {
  if (typeof window === "undefined") return "";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim() ?? "";
}

function levelFromScore(score:number):Level {
  if (score >= 16) return "Максимальная";
  if (score >= 8) return "Очень активный";
  if (score >= 3) return "Активный";
  return "Низкая";
}

function ChannelActivity() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | "Все">("Все");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/channel-activity?initData=${encodeURIComponent(initData())}`);
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setRows(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error && err.message === "AUTH_FAILED" ? "Не удалось подтвердить доступ администратора." : "Не удалось загрузить активность канала.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => {
    const q = query.trim().toLowerCase();
    return (!q || row.username.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || row.telegramId.includes(q)) && (level === "Все" || row.level === level);
  }), [rows, query, level]);

  const activeUsers = rows.filter((x) => x.score > 0).length;
  const totalPoints = rows.reduce((sum, x) => sum + x.score, 0);
  const bonusReady = rows.filter((x) => x.activityBonusRemaining > 0).length;

  async function grantBonus(telegramId:string) {
    setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/channel-activity", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ initData:initData(), telegramId }) });
      const data = await response.json() as ApiResponse & { bonusFreeSpins?:number };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
      setMessage("Бонусная прокрутка выдана.");
      await load();
    } catch { setError("Не удалось выдать бонусную прокрутку."); }
  }

  return (
    <AppShell title="Активность канала" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Telegram-канал</p><h1 className="mt-1 font-display text-xl uppercase">Реальная активность</h1><p className="mt-1 text-[11px] text-muted-foreground">События из Telegram → очки → бонусные бесплатные спины.</p></div><Radio className="size-5 text-primary-glow" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><Metric icon={Users} label="Активные" value={String(activeUsers)} /><Metric icon={MessageCircle} label="Очки" value={String(totalPoints)} /><Metric icon={Gift} label="Бонус готов" value={String(bonusReady)} /></div>
        </GlassCard>
        {message && <GlassCard className="border-primary/25 bg-primary/5 px-4 py-3 text-[11px]">{message}</GlassCard>}
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        <GlassCard className="space-y-3 px-3 py-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Поиск по имени, @username или Telegram ID" className="admin-input w-full pl-9" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{(["Все","Низкая","Активный","Очень активный","Максимальная"] as const).map((item)=><button key={item} type="button" onClick={()=>setLevel(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${level===item?"border-primary/40 bg-primary/10":"border-glass-border bg-muted/10 text-muted-foreground"}`}>{item}</button>)}</div>
        </GlassCard>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Подписчики</h2><span className="text-[10px] text-muted-foreground">{filtered.length}</span></div>
          {loading ? <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загружаем активность…</GlassCard> : <div className="space-y-2.5">{filtered.map((row)=><GlassCard key={row.id} className="px-3.5 py-3.5">
            <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20"><ShieldCheck className="size-4 text-primary-glow" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{row.name}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{row.level}</span>{row.bonus&&<span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px]">Бонус в запасе</span>}</div><p className="mt-1 text-[10px] text-muted-foreground">{row.username} · ID {row.telegramId}</p><div className="mt-2 grid grid-cols-4 gap-2"><MiniStat label="Дней" value={String(row.activeDays)} /><MiniStat label="Реакций" value={String(row.reactions)} /><MiniStat label="Комментов" value={String(row.comments)} /><MiniStat label="Очков" value={String(row.score)} /></div></div></div>
            <div className="mt-3 flex items-center gap-2 border-t border-glass-border pt-3"><span className="flex-1 text-[10px] text-muted-foreground">Бонусных спинов: <strong className="text-foreground">{row.bonusSpins}</strong></span><button type="button" onClick={()=>void grantBonus(row.telegramId)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold"><Send className="size-3.5" /> Выдать +1</button></div>
          </GlassCard>)}{filtered.length===0&&<GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Активность пока не собрана.</GlassCard>}</div>}
        </section>
        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"><strong className="text-foreground">Механика:</strong> 10 очков активности = +1 бесплатный спин. Максимум автоматически выданных activity-бонусов за сезон — 20. Это прогресс, а не отдельная валюта.</GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ icon:Icon, label, value }:{ icon:typeof Users; label:string; value:string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><Icon className="size-4 text-primary-glow"/><p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }
function MiniStat({ label, value }:{ label:string; value:string }) { return <div className="rounded-xl border border-glass-border bg-muted/15 px-2.5 py-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 text-xs font-semibold">{value}</p></div>; }
