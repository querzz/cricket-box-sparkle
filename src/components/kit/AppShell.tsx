import { Link } from "@tanstack/react-router";
import { Bot, ChevronLeft, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { BottomNavigation } from "@/components/kit/BottomNavigation";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
  title?: string | undefined;
  back?: string | undefined;
  action?: ReactNode | undefined;
  bare?: boolean | undefined;
  nav?: boolean | undefined;
  className?: string | undefined;
}

const ADMIN_BOT_URL = import.meta.env.VITE_ADMIN_BOT_URL || "https://t.me/your_bot?startapp=admin";

function telegramMiniAppIsAvailable() {
  if (typeof window === "undefined") return false;
  const telegram = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return Boolean(telegram?.WebApp?.initData);
}

function AdminBotGate() {
  return <div className="grain relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-background">
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[68vh] stage-glow" />
    <main className="relative z-10 flex min-h-dvh items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-primary/25 bg-card/70 p-5 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
          <ShieldCheck className="size-6 text-primary-glow" />
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Защищённый доступ</p>
        <h1 className="mt-1 font-display text-xl uppercase">Админка открывается через бота</h1>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">В рабочем режиме обычный вход с сайта закрыт. Откройте админ-панель из Telegram-бота как Mini App.</p>
        <a href={ADMIN_BOT_URL} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-semibold active:scale-[0.99]">
          <Bot className="size-4" /> Открыть бота
        </a>
        <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">Для продакшена бот передаёт Telegram Mini App initData на сервер для проверки личности и роли.</p>
      </div>
    </main>
  </div>;
}

function AdminExtraActions() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(window.location.pathname === "/admin" || window.location.pathname === "/admin/"), []);
  if (!visible) return null;

  return <div className="relative z-20 grid grid-cols-2 gap-2.5 pb-5">
    <Link to="/admin/owner-gifts" className="press relative z-20 isolate block h-full w-full text-left" aria-label="Личные подарки">
      <div className="h-full rounded-2xl border border-glass-border bg-card/70 px-3 py-3.5 backdrop-blur-xl">
        <Gift className="size-4 text-primary-glow" />
        <p className="mt-2 text-sm font-semibold">Личные подарки</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Особые подарки от владельца</p>
      </div>
    </Link>
    <Link to="/admin/mechanics" className="press relative z-20 isolate block h-full w-full text-left" aria-label="Развлекательные механики">
      <div className="h-full rounded-2xl border border-glass-border bg-card/70 px-3 py-3.5 backdrop-blur-xl">
        <Sparkles className="size-4 text-primary-glow" />
        <p className="mt-2 text-sm font-semibold">Развлекательные механики</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Передача подарков и мини-игры</p>
      </div>
    </Link>
  </div>;
}

export function AppShell({ children, title, back, action, bare = false, nav = true, className }: AppShellProps) {
  const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const isAdminLogin = typeof window !== "undefined" && window.location.pathname === "/admin/login";
  const needsBotEntry = isAdmin && !isAdminLogin && !import.meta.env.DEV && !telegramMiniAppIsAvailable();
  const adminBack = isAdmin && !isAdminLogin ? "/" : undefined;
  const effectiveBack = back ?? adminBack;

  if (needsBotEntry) return <AdminBotGate />;

  return <div className="grain relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-background">
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[68vh] stage-glow" />
    <div aria-hidden className="pointer-events-none fixed -left-24 top-[38vh] z-0 size-64 rounded-full bg-primary/20 blur-[90px] animate-drift" />
    <div aria-hidden className="pointer-events-none fixed -right-28 top-[62vh] z-0 size-72 rounded-full bg-primary-glow/12 blur-[110px] animate-drift [animation-delay:-6s]" />
    {!bare && <header className="sticky top-0 z-30 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 bg-background/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl">
      {effectiveBack ? <Link to={effectiveBack} className="press grid size-9 place-items-center rounded-full bg-muted/50 text-foreground" aria-label={effectiveBack === "/" ? "Назад в бота" : "Назад"}><ChevronLeft className="size-5" /></Link> : <span />}
      <h1 className="truncate text-center font-display text-sm font-semibold uppercase tracking-[0.22em]">{title}</h1>
      <div className="flex justify-end">{action}</div>
    </header>}
    <main className={cn("relative z-10 px-4", bare ? "pt-0" : "pt-1", nav ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-10", className)}>
      <AdminExtraActions />
      {children}
    </main>
    {nav && <BottomNavigation />}
  </div>;
}
