// TanStack Router's Vite plugin discovers the complete file-based route tree at build time,
// but the checked-in generated route tree can lag behind when a local generator is unavailable.
// Keep TypeScript aware of the routes that exist in src/routes until the generated tree is refreshed.

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/admin": any;
    "/admin/": any;
    "/admin/access": any;
    "/admin/audit": any;
    "/admin/channel-activity": any;
    "/admin/economics": any;
    "/admin/login": any;
    "/admin/mechanics": any;
    "/admin/owner-gifts": any;
    "/admin/participants": any;
    "/admin/payouts": any;
    "/admin/prizes": any;
    "/admin/spins": any;
    "/admin/statistics": any;
    "/admin/sync-seasons": any;
    "/admin/veteran": any;
    "/api/admin/access": any;
    "/api/admin/audit": any;
    "/api/admin/participants": any;
    "/api/admin/payouts": any;
    "/api/admin/prizes": any;
    "/api/admin/seasons": any;
    "/api/admin/spins": any;
    "/api/admin/statistics": any;
    "/api/auth/telegram": any;
    "/api/dev/paid-spin": any;
    "/api/dev/user-state": any;
    "/api/gift": any;
    "/api/payment/complete": any;
    "/api/payment/invoice": any;
    "/api/session": any;
    "/api/spin": any;
    "/api/withdraw": any;
  }

  interface FileRoutesByTo {
    "/admin": any;
    "/admin/": any;
    "/admin/access": any;
    "/admin/audit": any;
    "/admin/channel-activity": any;
    "/admin/economics": any;
    "/admin/login": any;
    "/admin/mechanics": any;
    "/admin/owner-gifts": any;
    "/admin/participants": any;
    "/admin/payouts": any;
    "/admin/prizes": any;
    "/admin/spins": any;
    "/admin/statistics": any;
    "/admin/sync-seasons": any;
    "/admin/veteran": any;
  }
}
