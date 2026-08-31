import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift } from "lucide-react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/prizes")({
  head: () => ({ meta: [{ title: "Призовой фонд — CRICKET BOX" }] }),
  component: AdminPrizes,
});

function AdminPrizes() {
  return (
    <AppShell title="Призовой фонд" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground"><ArrowLeft className="size-3.5" /> Админ-панель</Link>
        <GlassCard className="px-4 py-5" glow>
          <Gift className="size-5 text-primary-glow" />
          <h1 className="mt-3 font-display text-xl uppercase">Призовой фонд сезона</h1>
          <p className="mt-1 text-xs text-muted-foreground">Здесь будет полноценный модуль управления призами, остатками и параметрами prize pool.</p>
        </GlassCard>
        <GlassCard className="px-4 py-4">
          <p className="text-sm font-semibold">Текущий фонд</p>
          <p className="mt-1 text-xs text-muted-foreground">Подробный редактор уже доступен на странице сезона в админ-панели. Отдельный модуль расширим следующим этапом.</p>
          <Link to="/admin" className="mt-4 inline-flex rounded-xl border border-glass-border px-3 py-2 text-xs font-semibold">Вернуться к сезону</Link>
        </GlassCard>
      </div>
    </AppShell>
  );
}
