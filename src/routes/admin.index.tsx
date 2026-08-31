import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Gift, Plus, Settings2, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { PrimaryButton } from "@/components/kit/PrimaryButton";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { useSession } from "@/store/session";
import type { Prize, RewardKind, SeasonState } from "@/lib/types";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Админ-панель — CRICKET BOX" },
      { name: "description", content: "Управление сезонами, призами и экономикой CRICKET BOX." },
    ],
  }),
  component: AdminDashboard,
});

const stateLabel: Record<SeasonState, string> = {
  DRAFT: "Черновик", SCHEDULED: "Запланирован", ACTIVE: "Активен", ENDING: "Завершается",
  CLOSED: "Завершён", PAYOUT: "Выдача", ARCHIVED: "Архив",
};

function AdminDashboard() {
  const { snapshot } = useSession();
  const [seasons, setSeasons] = useState(() => snapshot ? [{ id: snapshot.season.id, code: snapshot.season.code, state: snapshot.season.state, participants: 1, spins: snapshot.spin.totalSpins }] : []);
  const [newSeasonOpen, setNewSeasonOpen] = useState(false);
  const [draftCode, setDraftCode] = useState("CRICKET BOX #002");
  const [draftDays, setDraftDays] = useState(14);
  const [draftPrice, setDraftPrice] = useState(100);
  const [draftDaily, setDraftDaily] = useState(true);

  const prizeStats = useMemo(() => {
    const prizes = snapshot?.prizes ?? [];
    return {
      winning: prizes.filter((p) => p.kind !== "EMPTY").reduce((sum, p) => sum + p.remaining, 0),
      total: prizes.reduce((sum, p) => sum + p.remaining, 0),
      starsLiability: prizes.filter((p) => p.kind === "STARS").reduce((sum, p) => sum + (p.amount ?? Number(p.title.replace(/[^0-9]/g, "")) || 0) * p.remaining, 0),
    };
  }, [snapshot?.prizes]);

  function createDraft() {
    setSeasons((current) => [...current, { id: `draft_${Date.now()}`, code: draftCode.trim() || "CRICKET BOX #002", state: "DRAFT" as SeasonState, participants: 0, spins: 0 }]);
    setNewSeasonOpen(false);
  }

  return (
    <AppShell title="Админ-панель" nav={false}>
      <div className="space-y-4 pb-6">
        <GlassCard className="border-primary/25 px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Текущий сезон</p>
              <h1 className="mt-1 font-display text-xl uppercase">{snapshot?.season.code ?? "Нет активного сезона"}</h1>
            </div>
            {snapshot && <StatusBadge status={{ type: "season", value: snapshot.season.state }} />}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Участники" value="1" />
            <Metric label="Прокрутки" value={String(snapshot?.spin.totalSpins ?? 0)} />
            <Metric label="Призы" value={String(prizeStats.winning)} />
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-2.5">
          <ActionCard icon={Plus} title="Создать сезон" text="Новый сезон и настройки" onClick={() => setNewSeasonOpen(true)} />
          <Link to="/admin/economics" className="block"><ActionCard icon={BarChart3} title="Экономика" text="Планировщик и маржа" /></Link>
          <ActionCard icon={Gift} title="Призы" text={`${prizeStats.winning} наград доступно`} />
          <ActionCard icon={Users} title="Участники" text="Проверка активности" />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Сезоны</h2>
            <button type="button" onClick={() => setNewSeasonOpen(true)} className="text-[11px] text-primary-glow">+ Новый</button>
          </div>
          <GlassCard className="divide-y divide-glass-border overflow-hidden">
            {seasons.map((season) => (
              <div key={season.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{season.code}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{season.participants} участников · {season.spins} прокруток</p>
                </div>
                <StatusBadge status={{ type: "season", value: season.state }} />
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
            ))}
          </GlassCard>
        </section>

        <GlassCard className="px-4 py-4">
          <div className="flex items-start gap-3"><Settings2 className="mt-0.5 size-4 text-primary-glow" /><div><p className="text-sm font-semibold">Проверка prize pool</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Сейчас в mock pool {prizeStats.total} исходов, из них {prizeStats.winning} реальных наград. Stars liability: {prizeStats.starsLiability} ⭐.</p></div></div>
        </GlassCard>
      </div>

      {newSeasonOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <GlassCard className="w-full max-w-lg px-4 py-4">
            <div className="flex items-center justify-between"><h2 className="font-display text-base uppercase">Новый сезон</h2><button type="button" onClick={() => setNewSeasonOpen(false)} className="text-muted-foreground">Закрыть</button></div>
            <div className="mt-4 space-y-3">
              <Field label="Название"><input value={draftCode} onChange={(e) => setDraftCode(e.target.value)} className="admin-input" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Дней"><input type="number" min={1} value={draftDays} onChange={(e) => setDraftDays(Number(e.target.value))} className="admin-input" /></Field><Field label="Paid spin, ⭐"><input type="number" min={1} value={draftPrice} onChange={(e) => setDraftPrice(Number(e.target.value))} className="admin-input" /></Field></div>
              <label className="flex items-center justify-between rounded-xl border border-glass-border bg-muted/20 px-3 py-3"><span><span className="block text-sm font-semibold">Ежедневная бесплатная попытка</span><span className="text-[11px] text-muted-foreground">1 в день, без накопления</span></span><input type="checkbox" checked={draftDaily} onChange={(e) => setDraftDaily(e.target.checked)} /></label>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-[11px] text-muted-foreground">Предпросмотр: {draftCode || "CRICKET BOX"} · {draftDays} дней · {draftPrice} ⭐ за paid spin · daily free spin {draftDaily ? "включён" : "выключен"}.</div>
              <PrimaryButton fullWidth onClick={createDraft}>Создать черновик</PrimaryButton>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg">{value}</p></div>;
}

function ActionCard({ icon: Icon, title, text, onClick }: { icon: typeof Plus; title: string; text: string; onClick?: () => void }) {
  const inner = <GlassCard className="h-full px-3 py-3.5"><Icon className="size-4 text-primary-glow" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{text}</p></GlassCard>;
  return onClick ? <button type="button" onClick={onClick} className="block h-full w-full text-left">{inner}</button> : inner;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>{children}</label>;
}
