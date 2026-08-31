import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, HandCoins, Shuffle, Sparkles, UsersRound } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/mechanics")({
  head: () => ({ meta: [{ title: "Развлекательные механики — CRICKET BOX" }] }),
  component: Mechanics,
});

type Mechanic = { id: string; title: string; description: string; enabled: boolean };
const INITIAL: Mechanic[] = [
  { id: "gift-or-pass", title: "Оставить подарок или передать 2 дальше", description: "Пользователь выбирает между своим подарком и передачей двух подарков следующим игрокам.", enabled: true },
  { id: "good-or-bad", title: "Хороший или неудачный подарок", description: "Развлекательный выбор с неожиданным результатом, отдельно от основного фонда.", enabled: false },
  { id: "owner-special", title: "Особый подарок владельца", description: "Персональный сценарий для выбранного пользователя.", enabled: true },
];

function Mechanics() {
  const [rows, setRows] = useState(INITIAL);
  const [passCount, setPassCount] = useState(2);
  const [failureText, setFailureText] = useState("Не повезло… но это было красиво 😈");
  const [confirm, setConfirm] = useState(true);
  const toggle = (id: string) => setRows((all) => all.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x));
  return <AppShell title="Развлекательные механики" nav={false}><div className="space-y-4 pb-8">
    <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
    <GlassCard className="px-4 py-4" glow><div className="flex items-start gap-3"><Sparkles className="mt-1 size-5 text-primary-glow" /><div><p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Экспериментальные сценарии</p><h1 className="mt-1 font-display text-xl uppercase">Развлекательные механики</h1><p className="mt-1 text-[11px] text-muted-foreground">Мини-игры поверх обычного розыгрыша. Для каждого сезона включаются отдельно.</p></div></div></GlassCard>
    <section className="space-y-2.5">{rows.map((row) => <GlassCard key={row.id} className="px-3.5 py-3.5"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20">{row.id === "gift-or-pass" ? <Gift className="size-4 text-primary-glow" /> : row.id === "good-or-bad" ? <Shuffle className="size-4 text-primary-glow" /> : <UsersRound className="size-4 text-primary-glow" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.title}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{row.description}</p></div><button type="button" onClick={() => toggle(row.id)} className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${row.enabled ? "border-primary/30 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{row.enabled ? "Включено" : "Выключено"}</button></div></GlassCard>)}</section>
    <GlassCard className="space-y-3 px-3 py-3"><div className="flex items-center gap-2"><HandCoins className="size-4 text-primary-glow" /><p className="text-sm font-semibold">Параметры передачи</p></div><label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Подарков при передаче</span><input type="number" min={1} value={passCount} onChange={(e) => setPassCount(Math.max(1, Number(e.target.value) || 1))} className="admin-input w-full" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Текст неудачного исхода</span><textarea value={failureText} onChange={(e) => setFailureText(e.target.value)} className="admin-input min-h-20 w-full resize-none" /></label><label className="flex items-center justify-between rounded-xl border border-glass-border bg-muted/10 px-3 py-3"><span><span className="block text-sm font-semibold">Подтверждать передачу</span><span className="text-[10px] text-muted-foreground">Показать итоговый выбор перед отправкой.</span></span><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /></label><button type="button" onClick={() => alert("Настройки сохранены в предпросмотре.")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold"><Sparkles className="size-4" /> Сохранить настройки</button></GlassCard>
  </div></AppShell>;
}
