import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Plus, Send, UserRound } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/owner-gifts")({
  head: () => ({ meta: [{ title: "Личные подарки — CRICKET BOX" }] }),
  component: OwnerGifts,
});

type GiftRow = { id: string; username: string; telegramId: string; gift: string; status: "Подготовлен" | "Выдан" | "Ожидает"; createdAt: string };

const INITIAL: GiftRow[] = [
  { id: "og_001", username: "@lucky_user", telegramId: "100000101", gift: "Особый подарок владельца", status: "Выдан", createdAt: "31.08.2026 18:21" },
  { id: "og_002", username: "@winner", telegramId: "100000102", gift: "50 Stars + личное сообщение", status: "Ожидает", createdAt: "31.08.2026 18:35" },
];

function OwnerGifts() {
  const [rows, setRows] = useState(INITIAL);
  const [username, setUsername] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [gift, setGift] = useState("Особый подарок владельца");
  const [message, setMessage] = useState("");

  function addGift() {
    if (!telegramId.trim()) return;
    setRows((all) => [{ id: `og_${Date.now()}`, username: username.trim() || "@username", telegramId: telegramId.trim(), gift: message.trim() ? `${gift} · ${message.trim()}` : gift, status: "Подготовлен", createdAt: new Date().toLocaleString("ru-RU", { hour12: false }) }, ...all]);
    setUsername(""); setTelegramId(""); setMessage("");
  }

  function markIssued(id: string) {
    setRows((all) => all.map((x) => x.id === id ? { ...x, status: "Выдан" } : x));
  }

  return (
    <AppShell title="Личные подарки" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl border border-glass-border bg-muted/20"><Gift className="size-5 text-primary-glow" /></div><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">От владельца</p><h1 className="mt-1 font-display text-xl uppercase">Личные подарки</h1><p className="mt-1 text-[11px] text-muted-foreground">Особые награды, которые не входят в обычный призовой фонд.</p></div></div>
        </GlassCard>
        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2"><UserRound className="size-4 text-primary-glow" /><p className="text-sm font-semibold">Новый личный подарок</p></div>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" className="admin-input w-full" />
          <input value={telegramId} onChange={(e) => setTelegramId(e.target.value.replace(/\D/g, ""))} placeholder="Telegram ID" inputMode="numeric" className="admin-input w-full" />
          <input value={gift} onChange={(e) => setGift(e.target.value)} placeholder="Что выдаём" className="admin-input w-full" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Личное сообщение (необязательно)" className="admin-input min-h-20 w-full resize-none" />
          <button type="button" onClick={addGift} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold"><Plus className="size-4" /> Подготовить подарок</button>
        </GlassCard>
        <section><h2 className="section-label mb-2">История личных подарков</h2><div className="space-y-2.5">{rows.map((row) => <GlassCard key={row.id} className="px-3.5 py-3.5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.gift}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.username} · ID {row.telegramId}</p><p className="mt-1 text-[10px] text-muted-foreground">Создан: {row.createdAt}</p></div><span className="rounded-full border border-glass-border px-2 py-1 text-[9px]">{row.status}</span></div>{row.status !== "Выдан" && <button type="button" onClick={() => markIssued(row.id)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[10px] font-semibold"><Send className="size-3.5" /> Отметить как выданный</button>}</GlassCard>)}</div></section>
        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">В рабочей версии здесь будет подтверждение личности получателя, предпросмотр сообщения и реальная выдача через backend. Личные подарки не уменьшают основной призовой фонд автоматически.</GlassCard>
      </div>
    </AppShell>
  );
}
