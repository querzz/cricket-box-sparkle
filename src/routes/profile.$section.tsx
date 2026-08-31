import { createFileRoute, useParams } from "@tanstack/react-router";
import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";
import { EmptyState, LoadingState } from "@/components/kit/States";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { formatDate } from "@/lib/format";
import { useSession } from "@/store/session";

export const Route = createFileRoute("/profile/$section")({
  head: () => ({ meta: [{ title: "Информация о сезоне — CRICKET BOX" }, { name: "description", content: "Таблица лидеров, правила, FAQ, история и поддержка." }] }),
  component: SectionScreen,
});

const titles: Record<string, string> = { leaderboard: "Лидеры", rules: "Правила", faq: "FAQ", history: "История активности", support: "Поддержка" };
const leaders = [
  { name: "@nightowl", stars: 480 }, { name: "@mika", stars: 415 }, { name: "@username", stars: 125 }, { name: "@sable", stars: 90 },
];
const rules = [
  "Каждый сезон проходит в течение ограниченного периода и имеет собственный призовой пул.",
  "Каждый участник получает одну бесплатную прокрутку каждый день сезона.",
  "Дополнительные прокрутки можно покупать за Stars.",
  "Баланс Stars ограничен лимитом — трата Stars сразу освобождает место.",
  "Физические и Telegram-призы выдаются администратором после проверки.",
  "Вывод открывается, когда сезон переходит в этап выдачи призов.",
];
const faq = [
  { q: "Stars внутри Cricket Box — это те же Telegram Stars?", a: "В продукте используется один Stars-концепт. Техническое разделение между балансом участника, начислениями и платёжными операциями будет закреплено на backend согласно Telegram-механике." },
  { q: "Почему мне зачислилось не всё, что я выиграл?", a: "У баланса есть максимальный лимит. Если награда превышает свободное место, зачисляется только помещающаяся часть." },
  { q: "Когда я получу свой приз?", a: "Цифровые и другие призы обрабатываются администратором после проверки результата и в соответствии с правилами сезона." },
];

function SectionScreen() {
  const { section } = useParams({ from: "/profile/$section" });
  const { snapshot, loading } = useSession();
  const title = titles[section] ?? "Раздел";
  if (loading && !snapshot) return <AppShell title={title} back="/profile"><LoadingState label="Загрузка" /></AppShell>;

  const historyRewards = snapshot?.rewards.filter((reward) => reward.kind !== "EMPTY") ?? [];

  return (
    <AppShell title={title} back="/profile">
      {section === "leaderboard" && <GlassCard className="divide-y divide-glass-border">{leaders.map((leader, i) => <div key={leader.name} className="flex items-center gap-3 px-4 py-3.5"><span className="w-5 shrink-0 font-display text-sm text-primary">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{leader.name}</span><span className="shrink-0 font-display text-sm tabular-nums">{leader.stars}</span></div>)}</GlassCard>}
      {section === "rules" && <GlassCard className="space-y-3 px-4 py-4">{rules.map((rule) => <p key={rule} className="text-xs leading-relaxed text-muted-foreground">— {rule}</p>)}</GlassCard>}
      {section === "faq" && <div className="space-y-2.5">{faq.map((item) => <GlassCard key={item.q} className="px-4 py-3.5"><p className="text-sm font-semibold">{item.q}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.a}</p></GlassCard>)}</div>}
      {section === "history" && <div className="space-y-2.5">{historyRewards.length > 0 ? historyRewards.map((reward) => <GlassCard key={reward.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm">{reward.title}</p><p className="text-[11px] text-muted-foreground">{formatDate(reward.wonAt)}</p></div><StatusBadge status={{ type: "reward", value: reward.status }} /></GlassCard>) : <EmptyState title="Активность пока отсутствует" description="Пустые прокрутки здесь не отображаются как призы." />}</div>}
      {section === "support" && <GlassCard className="space-y-2 px-4 py-5 text-center"><p className="font-display text-sm uppercase tracking-[0.16em]">Нужна помощь?</p><p className="text-xs leading-relaxed text-muted-foreground">Напишите администратору сезона в Telegram. Никому не сообщайте платёжные данные — Cricket Box никогда не запрашивает их внутри приложения.</p></GlassCard>}
      {!(section in titles) && <EmptyState title="Раздел не найден" description="Такой страницы не существует." />}
    </AppShell>
  );
}
