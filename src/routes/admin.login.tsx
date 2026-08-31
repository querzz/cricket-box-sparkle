import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Вход в админку — CRICKET BOX" }] }),
  component: AdminLogin,
});

const BOT_URL = import.meta.env.VITE_ADMIN_BOT_URL || "https://t.me/your_bot?startapp=admin";

function AdminLogin() {
  return (
    <AppShell title="Вход в админку" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> На главную
        </Link>

        <GlassCard className="px-4 py-5 text-center" glow>
          <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
            <ShieldCheck className="size-6 text-primary-glow" />
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Защищённый вход</p>
          <h1 className="mt-1 font-display text-xl uppercase">Только через Telegram-бота</h1>
          <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
            Админ-панель не должна открываться обычным входом с сайта. Откройте админку из Telegram-бота, чтобы сервер смог проверить ваш Telegram ID и роль.
          </p>

          <a
            href={BOT_URL}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-semibold transition-transform active:scale-[0.99]"
          >
            <Bot className="size-4" /> Открыть бота
          </a>
        </GlassCard>

        <GlassCard className="px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
          После запуска backend бот будет открывать Mini App с админской ссылкой, а сервер будет проверять Telegram Mini App initData и права пользователя. Сам Telegram рекомендует валидировать initData на сервере перед доверием данным пользователя.
        </GlassCard>
      </div>
    </AppShell>
  );
}
