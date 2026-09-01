import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cricketApi, type SpinOptions } from "@/services/cricket-api";
import type { Reward, ServiceError, SeasonState, SessionSnapshot } from "@/lib/types";

interface SessionContextValue {
  snapshot: SessionSnapshot | null;
  loading: boolean;
  error: ServiceError | null;
  refresh: () => Promise<void>;
  spin: (options?: SpinOptions) => Promise<Reward | ServiceError>;
  claimGift: () => Promise<Reward | ServiceError>;
  requestWithdrawal: (amount: number) => Promise<true | ServiceError>;
  setSeasonState: (state: SeasonState) => Promise<void>;
  setSubscribed: (value: boolean) => Promise<void>;
  setStarsAmount: (amount: number) => Promise<void>;
  setSimulateNetworkError: (value: boolean) => Promise<void>;
  resetDailyFreeSpin: () => Promise<void>;
  resetSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const isError = (v: unknown): v is ServiceError =>
  typeof v === "object" && v !== null && "code" in v;

const isTelegramMiniApp = () =>
  typeof window !== "undefined" &&
  Boolean((window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData?.trim());

export function SessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ServiceError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await cricketApi.getSession();
    if (result.ok) {
      setSnapshot(result.data);
      setError(null);
    } else {
      setError(result.error);
      setSnapshot(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const spin = useCallback<SessionContextValue["spin"]>(async (options) => {
    const result = await cricketApi.spin(options);
    if (!result.ok) return result.error;
    setSnapshot(result.data.snapshot);
    return result.data.reward;
  }, []);

  const claimGift = useCallback<SessionContextValue["claimGift"]>(async () => {
    const result = await cricketApi.claimGift();
    if (!result.ok) return result.error;
    setSnapshot(result.data.snapshot);
    return result.data.reward;
  }, []);

  const requestWithdrawal = useCallback<SessionContextValue["requestWithdrawal"]>(
    async (amount) => {
      const result = await cricketApi.requestWithdrawal(amount);
      if (!result.ok) return result.error;
      setSnapshot(result.data.snapshot);
      return true;
    },
    [],
  );

  const setSeasonState = useCallback(async (state: SeasonState) => {
    const result = await cricketApi.setSeasonState(state);
    if (result.ok) setSnapshot(result.data);
  }, []);

  // Developer controls must never replace a live Telegram/DB snapshot with the
  // old local mock snapshot. They only patch the intended field in-memory.
  const setSubscribed = useCallback(async (value: boolean) => {
    const result = await cricketApi.setSubscribed(value);
    if (!result.ok) return;
    if (isTelegramMiniApp()) {
      setSnapshot((current) => current ? { ...current, user: { ...current.user, isSubscribed: value } } : current);
    } else {
      setSnapshot(result.data);
    }
  }, []);

  const setStarsAmount = useCallback(async (amount: number) => {
    const result = await cricketApi.setStarsAmount(amount);
    if (!result.ok) return;
    if (isTelegramMiniApp()) {
      setSnapshot((current) => current ? { ...current, stars: { ...current.stars, amount: Math.max(0, Math.min(current.stars.max, Math.round(amount))) } } : current);
    } else {
      setSnapshot(result.data);
    }
  }, []);

  const setSimulateNetworkError = useCallback(async (value: boolean) => {
    const result = await cricketApi.setSimulateNetworkError(value);
    if (!result.ok) return;
    if (isTelegramMiniApp()) {
      setSnapshot((current) => current ? { ...current, dev: { ...current.dev, simulateNetworkError: value } } : current);
      setError(null);
    } else {
      setSnapshot(result.data);
      setError(null);
    }
  }, []);

  const resetDailyFreeSpin = useCallback(async () => {
    const result = await cricketApi.resetDailyFreeSpin();
    if (!result.ok) return;
    if (isTelegramMiniApp()) {
      setSnapshot((current) => current ? { ...current, spin: { ...current.spin, freeSpins: 1 } } : current);
      setError(null);
    } else {
      setSnapshot(result.data);
      setError(null);
    }
  }, []);

  const resetSession = useCallback(async () => {
    if (isTelegramMiniApp()) {
      await refresh();
      return;
    }
    const result = await cricketApi.reset();
    if (result.ok) setSnapshot(result.data);
  }, [refresh]);

  const value = useMemo(
    () => ({
      snapshot,
      loading,
      error,
      refresh,
      spin,
      claimGift,
      requestWithdrawal,
      setSeasonState,
      setSubscribed,
      setStarsAmount,
      setSimulateNetworkError,
      resetDailyFreeSpin,
      resetSession,
    }),
    [
      snapshot,
      loading,
      error,
      refresh,
      spin,
      claimGift,
      requestWithdrawal,
      setSeasonState,
      setSubscribed,
      setStarsAmount,
      setSimulateNetworkError,
      resetDailyFreeSpin,
      resetSession,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export { isError as isServiceError };
