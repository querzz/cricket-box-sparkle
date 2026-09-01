import { createFileRoute, useParams } from "@tanstack/react-router";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { EmptyState, LoadingState } from "@/components/kit/States";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { formatDate } from "@/lib/format";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/profile/$section")({
  head: () => ({ meta: [{ title: "Информация — CRICKET BOX" }, { name: "description", content: "Таблица лидеров, правила, FAQ, история и поддержка." }] }),
  component: SectionScreen,
});

const titles: Record<string, string> = { leaderboard: "Лидеры", rules: "Правила", faq: "FAQ", history: "История активности", support: "Поддержка" };
const leaders = [
  { name: "@nightowl", stars: 480 }, { name: "@mika", stars: 415 }, { name: "@username", stars: 125 }, { name: "@sable", stars: 90 },
];
const rules = [
  "Каждый сезон имеет собственный период, состояние и призовой фонд.",
  "Во время ACTIVE/ENDING участник с выполненными условиями может использовать бесплатную попытку по правилам сезона.",
  "Обычная дополнительная прокрутка оплачивается отдельно настоящими Telegram Stars через Telegram invoice.",
  "Stars на балансе CRICKET BOX — это внутренняя наградная сумма. Они не списываются за обычную дополнительную прокрутку.",
  "Баланс CRICKET BOX Stars ограничен максимумом 500 ⭐. Если места не хватает, зачисляется только доступная часть награды.",
  "Ежедневный подарок доступен не чаще одного раза в 24 часа и не зачисляется, когда баланс уже заполнен.",
  "Вывод баланса доступен после закрытия сезона в разрешённой фазе выдачи.",
  "Физические, Premium и другие материальные награды проходят обработку администратором после проверки результата.",
];
const faq = [
  { q: "CRICKET BOX Stars и Telegram Stars — это одно и то же?", a: "Нет. CRICKET BOX Stars — внутренний баланс наград, который хранится в аккаунте CRICKET BOX. Telegram Stars используются отдельно для оплаты дополнительных прокруток." },
  { q: "Почему я не могу оплатить прокрутку Stars с баланса CRICKET BOX?", a: "Так разделена экономика приложения: выигранные Stars предназначены для вывода и других внутриигровых возможностей, а обычная дополнительная прокрутка оплачивается отдельно через Telegram." },
  { q: "Почему награда Stars зачислилась не полностью?", a: "У внутреннего баланса есть максимум 500 ⭐. Если свободного места меньше размера награды, зачисляется только доступная часть." },
  { q: "Почему ежедневный подарок недоступен?", a: "Проверь подписку и участие в активном сезоне, а также время последнего получения. Подарок можно получить один раз в 24 часа, а при балансе 500/500 ⭐ он временно недоступен." },
  { q: "Когда можно вывести Stars?", a: "После окончания активного сезона, когда сезон находится в CLOSED, PAYOUT или ARCHIVED и вывод разрешён правилами проекта." },
  { q: "Когда приходит выигранный приз?", a: "Результат фиксируется сразу, а выдача Premium, физических и других призов может требовать проверки и ручной обработки администратором." },
];

function SectionScreen() {
  const { section } = useParams({ from: "/profile/$section" });
  const { snapshot, loading } = useSession();
  const title = titles[section] ?? "Раздел";
  if (loading && !snapshot) return <AppShell title={title} back="/profile"><LoadingState label="Загрузка" /></AppShell>;

  const historyRewards = snapshot?.rewards.filter((reward) => reward.kind !== "EMPTY") ?? [];

  return (
    <AppShell title={title} back="/profile">
      {section === "leaderboard" && <GlassCard className="divide-y divide-glass-border"><div className="px-4 py-3 text-[10px] text-muted-foreground">Таблица будет показывать реальные данные сезона после накопления активности.</div>{leaders.map((leader, i) => <div key={leader.name} className="flex items-center gap-3 px-4 py-3.5"><span className="w-5 shrink-0 font-display text-sm text-primary">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{leader.name}</span><span className="shrink-0 font-display text-sm tabular-nums">{leader.stars} ⭐</span></div>)}</GlassCard>}
      {section === "rules" && <div className="space-y-2.5"><GlassCard className="px-4 py-4"><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Как работают Stars</p><p className="mt-2 text-sm font-semibold">Баланс CRICKET BOX отдельно от оплаты Telegram</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Внутренний баланс нужен для наград и вывода. Дополнительная обычная прокрутка оплачивается отдельно через Telegram Stars.</p></GlassCard><GlassCard className="space-y-3 px-4 py-4">{rules.map((rule) => <p key={rule} className="text-xs leading-relaxed text-muted-foreground">— {rule}</p>)}</GlassCard></div>}
      {section === "faq" && <div className="space-y-2.5">{faq.map((item) => <GlassCard key={item.q} className="px-4 py-3.5"><p className="text-sm font-semibold">{item.q}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.a}</p></GlassCard>)}</div>}
      {section === "history" && <div className="space-y-2.5">{historyRewards.length > 0 ? historyRewards.map((reward) => <GlassCard key={reward.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm">{reward.title}</p><p className="text-[11px] text-muted-foreground">{formatDate(reward.wonAt)}</p></div><StatusBadge status={{ type: "reward", value: reward.status }} /></GlassCard>) : <EmptyState title="Активность пока отсутствует" description="Полученные награды появятся здесь." />}</div>}
      {section === "support" && <GlassCard className="space-y-2 px-4 py-5 text-center"><p className="font-display text-sm uppercase tracking-[0.16em]">Нужна помощь?</p><p className="text-xs leading-relaxed text-muted-foreground">Напишите администратору сезона в Telegram. Никому не сообщайте платёжные данные — CRICKET BOX никогда не запрашивает их внутри приложения.</p></GlassCard>}
      {!(section in titles) && <EmptyState title="Раздел не найден" description="Такой страницы не существует." />}
    </AppShell>
  );
}
