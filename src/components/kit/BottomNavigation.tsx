import { Link } from "@tanstack/react-router";
import { Home, Zap, Gift, User } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/draw", label: "Draw", icon: Zap, exact: false },
  { to: "/prizes", label: "My prizes", icon: Gift, exact: false },
  { to: "/profile", label: "Profile", icon: User, exact: false },
] as const;

export function BottomNavigation() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-glass-border bg-background/85 backdrop-blur-xl">
      <ul className="grid grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact }}
              className="press group flex flex-col items-center gap-1 rounded-xl py-2 text-muted-foreground data-[status=active]:text-primary"
            >
              <Icon className="size-5 transition-transform group-data-[status=active]:scale-110 group-data-[status=active]:drop-shadow-[0_0_8px_oklch(0.7_0.18_350_/_70%)]" />
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
