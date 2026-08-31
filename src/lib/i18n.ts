export const locale = "ru" as const;

const ru = {
  navigation: {
    home: "Главная",
    draw: "Розыгрыш",
    prizes: "Мои призы",
    profile: "Профиль",
  },
  common: {
    back: "Назад",
    close: "Закрыть",
    claim: "Забрать",
    open: "Открыть",
    unavailable: "Недоступно",
    claimed: "Получено",
    continue: "Продолжить",
    confirm: "Подтвердить",
    cancel: "Отмена",
    retry: "Повторить",
    loading: "Загрузка",
    processing: "Обработка",
    settings: "Настройки",
  },
  errors: {
    network: "Не удалось связаться с сервером Cricket Box. Проверь соединение и попробуй ещё раз.",
  },
} as const;

export type TranslationTree = typeof ru;

export function t(path: string): string {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, ru);

  return typeof value === "string" ? value : path;
}
