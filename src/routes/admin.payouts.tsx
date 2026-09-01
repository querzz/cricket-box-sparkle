import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, Check, Clock3, RefreshCw, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

type PayoutStatus = "Ожидает" | "На проверке" | "Выдан" | "Ошибка" | "Отменён";
type Payout = {
  id: string;
  time: string;
  username: string;
  telegramId: string;
  prize: string;
  type: "Stars" | "Premium" | "Деньги";
  amount: string;
  status: PayoutStatus;
};
type ApiResponse = {
  ok: boolean;
  payouts?: Payout[];
  counts?: {
    pending: number;
    review: number;
    paid: number;
    failed?: number;
    cancelled?: number;
  };
  code?: string;
};

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({ meta: [{ title: "Выплаты — CRICKET BOX" }] }),
  component: AdminPayouts,
});

function initData() {
  if (typeof window === "undefined") return "";
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData?.trim() ?? "";
}

async function request(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const d = (await r.json()) as ApiResponse;
  if (!r.ok || !d.ok) throw new Error(d.code ?? "REQUEST_FAILED");
  return d;
}

function AdminPayouts() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PayoutStatus | "Все">("Все");
  const [counts, setCounts] = useState({ pending: 0, review: 0, paid: 0, failed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function refresh(search = query) {
    setLoading(true);
    setError("");
    try {
      const d = await request(`/api/admin/payouts?initData=${encodeURIComponent(initData())}&search=${encodeURIComponent(search)}`);
      setRows(d.payouts ?? []);
      setCounts({
        pending: d.counts?.pending ?? 0,
        review: d.counts?.review ?? 0,
        paid: d.counts?.paid ?? 0,
        failed: d.counts?.failed ?? 0,
        cancelled: d.counts?.cancelled ?? 0,
      });
      setSelected(new Set());
    } catch {
      setError("Не удалось загрузить выплаты из PostgreSQL.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(""); }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  async function setStatus(id: string, status: "REVIEW" | "PAID" | "FAILED" | "CANCELLED") {
    setSaving(id);
    setError("");
    try {
      await request("/api/admin/payouts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), id, status }),
      });
      await refresh(query);
    } catch (e) {
      setError(e instanceof Error && e.message === "INVALID_TRANSITION" ? "Недопустимый переход статуса выплаты." : "Не удалось изменить статус выплаты.");
    } finally {
      setSaving(null);
    }
  }

  async function bulkStatus(status: "PAID" | "FAILED" | "CANCELLED") {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Изменить статус у ${ids.length} выплат?`)) return;
    setSaving("bulk");
    setError("");
    try {
      await request("/api/admin/payouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initData(), ids, status }),
      });
      await refresh(query);
    } catch (e) {
      setError(e instanceof Error && e.message === "INVALID_TRANSITION" ? "Некоторые выплаты нельзя перевести в этот статус." : "Не удалось выполнить массовое действие.");
    } finally {
      setSaving(null);
    }
  }

  const filtered = useMemo(() => (filter === "Все" ? rows : rows.filter((x) => x.status === filter)), [rows, filter]);
  const selectable = filtered.filter((x) => x.status === "На проверке").map((x) => x.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <AppShell title="Выплаты" nav={false}>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1.5 text-[10px] text-primary-glow"><RefreshCw className="size-3.5" /> Обновить</button>
        </div>
        <GlassCard className="px-4 py-4" glow>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Выдача наград</p>
          <h1 className="mt-1 font-display text-xl uppercase">Выплаты</h1>
          <div className="mt-4 grid grid-cols-5 gap-2"><Metric label="Ожидают" value={String(counts.pending)} /><Metric label="Проверка" value={String(counts.review)} /><Metric label="Выдано" value={String(counts.paid)} /><Metric label="Ошибки" value={String(counts.failed)} /><Metric label="Отменено" value={String(counts.cancelled)} /></div>
        </GlassCard>
        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-muted/20 px-3 py-2.5"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пользователь, ID, приз или ID выплаты" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">{(["Все", "Ожидает", "На проверке", "Выдан", "Ошибка", "Отменён"] as const).map((x) => <button key={x} onClick={() => setFilter(x)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === x ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{x}</button>)}</div>
          {selectable.length > 0 && <div className="flex items-center justify-between gap-2 border-t border-glass-border pt-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable))} />Выбрать проверенные</label>{selected.size > 0 && <div className="flex gap-1.5"><button disabled={saving !== null} onClick={() => void bulkStatus("PAID")} className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[10px] font-semibold"><Check className="mr-1 inline size-3" /> Выдать {selected.size}</button><button disabled={saving !== null} onClick={() => void bulkStatus("FAILED")} className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[10px] font-semibold"><XCircle className="mr-1 inline size-3" /> Ошибка</button><button disabled={saving !== null} onClick={() => void bulkStatus("CANCELLED")} className="rounded-lg border border-glass-border bg-muted/15 px-2.5 py-1.5 text-[10px] font-semibold"><Ban className="mr-1 inline size-3" /> Отмена</button></div>}</div>}
        </GlassCard>
        {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
        {loading ? <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Загрузка из PostgreSQL…</GlassCard> : <div className="space-y-2.5">{filtered.map((p) => <GlassCard key={p.id} className="px-3.5 py-3.5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><div className="pt-1">{p.status === "На проверке" && <input type="checkbox" aria-label={`Выбрать выплату ${p.id}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />}</div><div className="min-w-0"><p className="font-mono text-[10px] text-muted-foreground">{p.id}</p><p className="mt-1 text-sm font-semibold">{p.username}</p><p className="text-[9px] text-muted-foreground">ID {p.telegramId} · {p.time}</p></div></div><Status status={p.status} /></div><div className="mt-3 rounded-xl border border-glass-border bg-muted/15 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Приз</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-sm font-semibold">{p.prize}</p><p className="text-xs font-semibold text-muted-foreground">{p.amount}</p></div></div>{(p.status === "Ожидает" || p.status === "На проверке") && <div className="mt-3 flex gap-2">{p.status === "Ожидает" ? <button disabled={saving !== null} onClick={() => void setStatus(p.id, "REVIEW")} className="flex-1 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[10px] font-semibold"><Clock3 className="mr-1 inline size-3.5" /> Проверить</button> : <><button disabled={saving !== null} onClick={() => void setStatus(p.id, "PAID")} className="flex-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold"><Check className="mr-1 inline size-3.5" /> Выдать</button><button disabled={saving !== null} onClick={() => void setStatus(p.id, "FAILED")} className="flex-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] font-semibold"><XCircle className="mr-1 inline size-3.5" /> Ошибка</button><button disabled={saving !== null} onClick={() => void setStatus(p.id, "CANCELLED")} className="flex-1 rounded-xl border border-glass-border bg-muted/15 px-3 py-2 text-[10px] font-semibold"><Ban className="mr-1 inline size-3.5" /> Отменить</button></>}</div>}</GlassCard>)}{filtered.length === 0 && <GlassCard className="px-4 py-8 text-center text-xs text-muted-foreground">Выплат пока нет.</GlassCard>}</div>}
        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Lifecycle: <b>Ожидает → На проверке → Выдано / Ошибка / Отменено</b>. Завершённые статусы нельзя открыть обратно. Для вывода Stars при ошибке или отмене средства автоматически возвращаются на баланс и действие попадает в аудит.</GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>; }

function Status({ status }: { status: PayoutStatus }) {
  const cls = status === "Выдан" ? "border-primary/30 bg-primary/10 text-primary-glow" : status === "Ошибка" || status === "Отменён" ? "border-destructive/30 bg-destructive/10" : status === "На проверке" ? "border-warning/30 bg-warning/10" : "border-glass-border bg-muted/10";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-semibold ${cls}`}>{status}</span>;
}
