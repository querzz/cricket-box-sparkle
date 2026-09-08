import ru from "@/locales/ru.json";

export const locale = "ru" as const;

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
