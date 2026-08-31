import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Crown, Power, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/access")({
  head: () => ({ meta: [{ title: "Доступ к админке — CRICKET BOX" }] }),
  component: AdminAccess,
});

type AdminUser = { id: string; telegram_id: string; username: string | null; role: "OWNER" | "ADMIN"; is_active: boolean; created_at: string };
type ApiResponse = { ok: boolean; admins?: AdminUser[]; code?: string };

function getInitData() {
  if (typeof window === "undefined") return "";
  const telegram = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return telegram?.WebApp?.initData?.trim() ?? "";
}

function date(value: string) { return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }

async function mutate(body: Record<string, unknown>, method: string) {
  const response = await fetch("/api/admin/access", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, initData: getInitData() }) });
  const data = (await response.json()) as ApiResponse;
  if (!response.ok || !data.ok) throw new Error(data.code ?? "REQUEST_FAILED");
}

function AdminAccess() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const owner = rows.find((x) => x.role === "OWNER");
  const adminCount = useMemo(() => rows.filter((x) => x.role === "ADMIN" && x.is_active).length, [rows]);

  async function reload() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/access?initData=${encodeURIComponent(getInitData())}`);
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.ok) throw new Error(data.code ?? "LOAD_FAILED");
      setRows(data.admins ?? []);
    } catch { setError("Не удалось загрузить доступы."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  async function addAdmin() {
    if (!/^\d+$/.test(telegramId.trim())) { setError("Введите корректный Telegram ID."); return; }
    setWorking(true); setError("");
    try { await mutate({ telegramId: telegramId.trim(), username: username.trim() || null }, "POST"); setTelegramId(""); setUsername(""); await reload(); }
    catch (e) { setError(e instanceof Error && e.message === "OWNER_ONLY" ? "Только владелец может менять доступы." : "Не удалось выдать доступ."); }
    finally { setWorking(false); }
  }

  async function toggle(user: AdminUser) {
    if (!confirm(user.is_active ? "Заблокировать доступ этому администратору?" : "Вернуть доступ этому администратору?")) return;
    setWorking(true); setError("");
    try { await mutate({ telegramId: user.telegram_id, role: user.is_active ? "REVOKE" : "ADMIN" }, "PATCH"); await reload(); }
    catch { setError("Не удалось изменить статус доступа."); }
    finally { setWorking(false); }
  }

  async function remove(user: AdminUser) {
    if (!confirm("Удалить администратора из списка доступа?")) return;
    setWorking(true); setError("");
    try { await mutate({ telegramId: user.telegram_id }, "DELETE"); await reload(); }
    catch { setError("Не удалось удалить администратора."); }
    finally { setWorking(false); }
  }

  return <AppShell title="Доступ к админке" nav={false}>
    <div className="space-y-4 pb-8">
      <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
      <GlassCard className="px-4 py-4" glow>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Безопасность</p><h1 className="mt-1 font-display text-xl uppercase">Доступ к админке</h1></div><ShieldCheck className="size-5 text-primary-glow" /></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Metric label="Владелец" value={owner?.username ? `@${owner.username.replace(/^@/, "")}` : owner?.telegram_id ?? "—"} /><Metric label="Активные админы" value={String(adminCount)} /></div>
      </GlassCard>
      <GlassCard className="space-y-3 px-3 py-3">
        <div className="flex items-center gap-2"><UserPlus className="size-4 text-primary-glow" /><div><p className="text-sm font-semibold">Выдать доступ</p><p className="text-[10px] text-muted-foreground">Сохраняется сразу в PostgreSQL.</p></div></div>
        <input value={telegramId} onChange={(e) => setTelegramId(e.target.value.replace(/\D/g, ""))} placeholder="Telegram ID" inputMode="numeric" className="admin-input w-full" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username (необязательно)" className="admin-input w-full" />
        <button disabled={working} type="button" onClick={() => void addAdmin()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold disabled:opacity-50"><UserPlus className="size-4" /> Выдать доступ админа</button>
      </GlassCard>
      {error && <GlassCard className="border-destructive/30 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">{error}</GlassCard>}
      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="section-label">Участники доступа</h2><button type="button" onClick={() => void reload()} className="text-[10px] text-primary-glow">Обновить</button></div>
        {loading ? <GlassCard className="px-4 py-6 text-center text-xs text-muted-foreground">Загрузка доступов…</GlassCard> : <div className="space-y-2.5">{rows.map((user) => <GlassCard key={user.id} className="px-3.5 py-3.5"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20">{user.role === "OWNER" ? <Crown className="size-4 text-primary-glow" /> : <ShieldCheck className="size-4 text-primary-glow" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{user.username ? `@${user.username.replace(/^@/, "")}` : `ID ${user.telegram_id}`}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{user.role === "OWNER" ? "Владелец" : "Администратор"}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] ${user.is_active ? "border-primary/25 bg-primary/5" : "border-destructive/25 bg-destructive/5 text-destructive"}`}>{user.is_active ? "Активен" : "Заблокирован"}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Telegram ID: {user.telegram_id}</p><p className="mt-1 text-[10px] text-muted-foreground">Добавлен: {date(user.created_at)}</p></div></div>{user.role === "ADMIN" && <div className="mt-3 flex gap-2 border-t border-glass-border pt-3"><button disabled={working} type="button" onClick={() => void toggle(user)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-glass-border bg-muted/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-50"><Power className="size-3.5" /> {user.is_active ? "Заблокировать" : "Включить"}</button><button disabled={working} type="button" onClick={() => void remove(user)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] font-semibold disabled:opacity-50"><Trash2 className="size-3.5" /> Удалить</button></div>}</GlassCard>)}</div>}
      </section>
      <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">Передачу владельца оставляем отдельным подтверждаемым действием.</GlassCard>
    </div>
  </AppShell>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>; }
