import { assets } from "@/components/assets";
import { StatusBadge } from "@/components/kit/StatusBadge";
import type { User } from "@/lib/types";

export function ProfileHeader({ user }: { user: User }) {
  const level = Math.max(1, Number(user.level ?? 1));
  const xp = Math.max(0, Number(user.xp ?? 0));
  const currentLevelBase = (level - 1) * 100;
  const nextLevelXp = Number(user.nextLevelXp ?? level * 100);
  const levelProgress = Math.min(100, Math.max(0, Number(user.levelProgress ?? ((xp - currentLevelBase) / 100) * 100)));
  const title = user.levelTitle ?? (level >= 20 ? "Ветеран" : level >= 10 ? "Профи" : level >= 5 ? "Опытный игрок" : level >= 2 ? "Участник" : "Новичок");
  const benefit = user.levelBenefit ?? "Уровень показывает твою активность и открывает более высокий статус профиля.";

  return (
    <div className="flex min-w-0 items-start gap-3">
      <img src={user.avatarUrl ?? assets.mascot} alt="Аватар профиля" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-full border border-glass-border object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-base">{user.username}</p>
          <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary-glow">{title}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusBadge
            status={{ type: "custom", label: user.isParticipant ? "Активный участник" : "Наблюдатель", tone: user.isParticipant ? "pending" : "neutral" }}
          />
          <span className="text-[10px] font-semibold text-primary-glow">Ур. {level}</span>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
            <span>Прогресс уровня</span>
            <span>{xp} / {nextLevelXp} XP</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/30">
            <div className="h-full rounded-full bg-primary/55 transition-[width]" style={{ width: `${levelProgress}%` }} />
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{benefit}</p>
      </div>
    </div>
  );
}

export function Avatar({ url, size = 36 }: { url?: string; size?: number }) {
  return <img src={url ?? assets.mascot} alt="Аватар" width={size} height={size} loading="lazy" style={{ width: size, height: size }} className="shrink-0 rounded-full border border-glass-border object-cover" />;
}
