import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/participants")({
  head: () => ({ meta: [{ title: "Участники — CRICKET BOX" }] }),
  component: AdminParticipants,
});

function AdminParticipants() {
  return (
    <AppShell title="Участники" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-5" glow>
          <Users className="size-5 text-primary-glow" />
          <h1 className="mt-3 font-display text-xl uppercase">Участники сезона</h1>
          <p className="mt-1 text-xs text-muted-foreground">Здесь будет полноценный модуль со списком пользователей, фильтрами, активностью, spins и статусами наград.</p>
        </GlassCard>
        <GlassCard className="px-4 py-4">
          <p className="text-sm font-semibold">Предпросмотр</p>
          <p className="mt-1 text-xs text-muted-foreground">Детальная таблица участников подключается следующим этапом вместе с backend.</p>
          <Link to="/admin" className="mt-4 inline-flex rounded-xl border border-glass-border px-3 py-2 text-xs font-semibold">Вернуться к сезону</Link>
        </GlassCard>
      </div>
    </AppShell>
  );
}
