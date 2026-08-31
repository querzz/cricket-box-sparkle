import { useEffect, useState, type ReactNode } from "react";

import { ShieldAlert, ShieldCheck } from "lucide-react";

function getTelegramInitData(): string {
  if (typeof window === "undefined") return "";
  const telegram = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return telegram?.WebApp?.initData?.trim() ?? "";
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [message, setMessage] = useState("Проверяем доступ Telegram…");

  useEffect(() => {
    let cancelled = false;
    const initData = getTelegramInitData();

    if (!initData) {
      if (import.meta.env.DEV) {
        setState("allowed");
        return;
      }
      setMessage("Откройте админ-панель из Telegram-бота.");
      setState("denied");
      return;
    }

    fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (response) => {
        const data = (await response.json()) as { ok?: boolean; access?: string; code?: string };
        if (cancelled) return;
        if (response.ok && data.ok && data.access !== "USER") {
          setState("allowed");
          return;
        }
        setMessage(data.code === "AUTH_FAILED" ? "Не удалось подтвердить Telegram-сессию." : "У этого Telegram-аккаунта нет доступа к админ-панели.");
        setState("denied");
      })
      .catch(() => {
        if (cancelled) return;
        setMessage("Сервер проверки временно недоступен.");
        setState("denied");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="grain relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[68vh] stage-glow" />
      <main className="relative z-10 flex min-h-dvh items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-primary/25 bg-card/70 p-5 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
            {state === "loading" ? <ShieldCheck className="size-6 animate-pulse text-primary-glow" /> : <ShieldAlert className="size-6 text-destructive" />}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{state === "loading" ? "Проверка доступа" : "Доступ закрыт"}</p>
          <h1 className="mt-1 font-display text-xl uppercase">{message}</h1>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Админ-доступ выдаётся только по Telegram ID, который подтверждён сервером.</p>
        </div>
      </main>
    </div>
  );
}
