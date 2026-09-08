# CRICKET BOX — MASTER SPECIFICATION v3.0

**Single source of truth for future development.**

## 0. Non-negotiable product decisions

- Only **Telegram Stars (⭐)** are used. There is no Cricket Credits, Cricket Points, or any second/internal currency.
- User-facing UI must be **Russian** by default. Code and variable names may remain English. Architecture must support future `en`/`uk` i18n.
- Current repository: `querzz/cricket-box-sparkle`.
- Current user frontend is an existing TanStack Start + React mock implementation. Preserve it; do not rebuild from scratch.
- The repository now contains the PostgreSQL-backed backend, Telegram integration, admin panel, and production-shaped security controls described below; remaining production gaps are tracked in `docs/IMPLEMENTATION_STATUS.md`.
