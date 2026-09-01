export type LevelInfo = {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  benefit: string;
};

export function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 100) + 1);
}

export function levelTitle(level: number) {
  if (level >= 30) return "Легенда";
  if (level >= 20) return "Ветеран";
  if (level >= 10) return "Профи";
  if (level >= 5) return "Опытный игрок";
  if (level >= 2) return "Участник";
  return "Новичок";
}

export function levelBenefit(level: number) {
  if (level >= 30) return "Уникальный статус «Легенда» в профиле.";
  if (level >= 20) return "Статус «Ветеран» и специальный бейдж профиля.";
  if (level >= 10) return "Статус «Профи» и специальный бейдж профиля.";
  if (level >= 5) return "Статус «Опытный игрок» и специальный бейдж профиля.";
  if (level >= 2) return "Статус «Участник» и первый уровень прогресса профиля.";
  return "Начальный статус. Набирай XP за спины и Daily Gift.";
}

export function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = levelFromXp(safeXp);
  const currentLevelXp = (level - 1) * 100;
  const nextLevelXp = level * 100;
  const progressPercent = Math.min(100, Math.max(0, ((safeXp - currentLevelXp) / 100) * 100));
  return {
    level,
    title: levelTitle(level),
    currentLevelXp,
    nextLevelXp,
    progressPercent,
    benefit: levelBenefit(level),
  };
}
