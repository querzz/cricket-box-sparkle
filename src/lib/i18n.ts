import ru from "@/locales/ru.json";

export const locale = "ru" as const;

export type TranslationTree = typeof ru;
export type TranslationParams = Record<string, string | number>;

export function t(path: string, params?: TranslationParams): string {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, ru);

  if (typeof value !== "string") return path;
  if (!params) return value;

  return Object.entries(params).reduce((result, [key, replacement]) => result.split(`{{${key}}}`).join(String(replacement)), value);
}
