import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Crown, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/kit/AppShell";
import { GlassCard } from "@/components/kit/GlassCard";

export const Route = createFileRoute("/admin/access")({
  head: () => ({ meta: [{ title: "Доступ к админке — CRICKET BOX" }] }),
  component: AdminAccess,
});

type Role = "Владелец" | "Администратор";
type AdminUser = {
  id: string;
  name: string;
  username: string;
  telegramId: string;
  role: Role;
  status: "Активен" | "Ожидает";
  addedAt: string;
  addedBy: string;
  permissions: string[];
};

const INITIAL: AdminUser[] = [
  {
    id: "adm_001",
    name: "Основной владелец",
    username: "@owner",
    telegramId: "100000001",
    role: "Владелец",
    status: "Активен",
    addedAt: "31.08.2026 18:10",
    addedBy: "Система",
    permissions: ["Полный доступ", "Передача владельца", "Управление ролями"],
  },
  {
    id: "adm_olyana",
    name: "Оля",
    username: "—",
    telegramId: "1938585729",
    role: "Администратор",
    status: "Активен",
    addedAt: "31.08.2026 22:45",
    addedBy: "Основной владелец",
    permissions: ["Сезоны", "Призы", "Участники", "Прокрутки", "Выплаты", "Статистика", "Активность канала", "Личные подарки"],
  },
];

function AdminAccess() {
  const [rows, setRows] = useState(INITIAL);
  const [editing, setEditing] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>("Администратор");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newTelegramId, setNewTelegramId] = useState("");

  const owner = rows.find((x) => x.role === "Владелец");
  const adminCount = useMemo(() => rows.filter((x) => x.role === "Администратор").length, [rows]);

  function addAdmin() {
    if (!newTelegramId.trim()) return;
    const role = newRole;
    const user: AdminUser = {
      id: `adm_${Date.now()}`,
      name: newName.trim() || "Новый администратор",
      username: newUsername.trim() || "@username",
      telegramId: newTelegramId.trim(),
      role,
      status: "Ожидает",
      addedAt: new Date().toLocaleString("ru-RU", { hour12: false }),
      addedBy: owner?.username ?? "@owner",
      permissions: role === "Владелец" ? ["Полный доступ", "Передача владельца", "Управление ролями"] : ["Сезоны", "Призы", "Участники", "Прокрутки", "Выплаты", "Статистика"],
    };
    setRows((all) => [user, ...all]);
    setNewName("");
    setNewUsername("");
    setNewTelegramId("");
  }

  function removeUser(id: string) {
    setRows((all) => all.filter((x) => x.id !== id || x.role === "Владелец"));
  }

  function changeRole(id: string, role: Role) {
    setRows((all) => all.map((x) => x.id === id ? { ...x, role, permissions: role === "Владелец" ? ["Полный доступ", "Передача владельца", "Управление ролями"] : ["Сезоны", "Призы", "Участники", "Прокрутки", "Выплаты", "Статистика"] } : x));
    setEditing(null);
  }

  return (
    <AppShell title="Доступ к админке" nav={false}>
      <div className="space-y-4 pb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowLeft className="size-3.5" /> Админ-панель
        </Link>

        <GlassCard className="px-4 py-4" glow>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Безопасность</p>
              <h1 className="mt-1 font-display text-xl uppercase">Доступ к админке</h1>
            </div>
            <ShieldCheck className="size-5 text-primary-glow" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Владелец" value={owner?.username ?? "—"} />
            <Metric label="Администраторы" value={String(adminCount)} />
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 px-3 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary-glow" />
            <div><p className="text-sm font-semibold">Добавить доступ</p><p className="text-[10px] text-muted-foreground">Для идентификации используем Telegram ID.</p></div>
          </div>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Имя" className="admin-input w-full" />
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="@username" className="admin-input w-full" />
          <input value={newTelegramId} onChange={(e) => setNewTelegramId(e.target.value.replace(/\D/g, ""))} placeholder="Telegram ID" inputMode="numeric" className="admin-input w-full" />
          <div className="grid grid-cols-2 gap-2">
            {(["Администратор", "Владелец"] as const).map((role) => (
              <button key={role} type="button" onClick={() => setNewRole(role)} className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${newRole === role ? "border-primary/40 bg-primary/10" : "border-glass-border bg-muted/10 text-muted-foreground"}`}>{role}</button>
            ))}
          </div>
          <button type="button" onClick={addAdmin} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold active:scale-[0.99]">
            <UserPlus className="size-4" /> Добавить
          </button>
        </GlassCard>

        <section>
          <h2 className="section-label mb-2">Участники доступа</h2>
          <div className="space-y-2.5">
            {rows.map((user) => (
              <GlassCard key={user.id} className="px-3.5 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-glass-border bg-muted/20">
                    {user.role === "Владелец" ? <Crown className="size-4 text-primary-glow" /> : <ShieldCheck className="size-4 text-primary-glow" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{user.name}</p><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{user.role}</span><span className="rounded-full border border-glass-border px-2 py-0.5 text-[9px]">{user.status}</span></div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{user.username} · ID {user.telegramId}</p>
                    <p className="mt-2 text-[10px] text-muted-foreground">Добавлен: {user.addedAt} · кем: {user.addedBy}</p>
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Права: {user.permissions.join(" · ")}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2 border-t border-glass-border pt-3">
                  {user.role !== "Владелец" && <>
                    <button type="button" onClick={() => setEditing(editing === user.id ? null : user.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-glass-border bg-muted/10 px-3 py-2 text-[10px] font-semibold"><Pencil className="size-3.5" /> Изменить роль</button>
                    <button type="button" onClick={() => removeUser(user.id)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] font-semibold"><Trash2 className="size-3.5" /> Удалить</button>
                  </>}
                  {user.role === "Владелец" && <span className="flex-1 text-[10px] text-muted-foreground">Владельца можно передать только отдельным подтверждением.</span>}
                </div>
                {editing === user.id && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => changeRole(user.id, "Администратор")} className="rounded-xl border border-glass-border px-3 py-2 text-[10px]">Администратор</button><button type="button" onClick={() => changeRole(user.id, "Владелец")} className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px]">Владелец</button></div>}
              </GlassCard>
            ))}
          </div>
        </section>

        <GlassCard className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Сейчас доступы хранятся только для предпросмотра. При подключении backend появятся проверка Telegram ID, приглашения, подтверждение опасных действий, история выдачи прав и безопасная передача владельца.
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-glass-border bg-muted/20 px-3 py-3"><p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold truncate">{value}</p></div>;
}
