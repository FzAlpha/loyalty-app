# CLAUDE.md — Rewards-app (loyalty app)

## Key files
- **Plan:** [BACKEND_PLAN.md](BACKEND_PLAN.md) is the source of truth for backend design. Read the relevant section before starting any task.
- **Progress:** [backend_progress.md](backend_progress.md) tracks what is done, in progress and next. Read it at the start of every session.
- **Spec:** `Group_Rewards_App_Updated_Technical_Plan.pdf` holds the original requirements. Ignore its monorepo layout.

## Rules (must follow)
1. **Never hallucinate.** Don't invent APIs, config keys, CLI flags, library behaviour, file contents or requirements. If unsure, check the docs or code, search the web, or ask.
2. **If anything is unclear, blocked, fails, or needs a decision, stop and ask the user.** Don't guess and continue.
3. **Never hard-code** values that can change. Use env vars (secrets/URLs), the `app_settings` table (business rules), or seed/reference data files. See BACKEND_PLAN.md §3.
4. **Follow the approved folder structure** (BACKEND_PLAN.md §1): `frontend/{customer,admin,dashboard}`, `backend/{supabase,contracts,tests}`, `database/{schema,seed,tests,docs}`, `packages/{shared,api,ui}`, `tools/card-generator`, `docs/`, plus root `.github/workflows/` (CI, approved). Don't use the PDF's monorepo layout, and don't add folders outside this structure without asking.
5. **Keep it modular.** One module per domain. Modules interact only through each other's functions, not each other's tables.
6. **Security:** RLS on every table with deny by default. All writes go through `api.*` RPCs or Edge Functions. Never trust client-supplied role, business or customer IDs. Never put the service-role key in frontend code.
7. **Stick to the plan.** If something in BACKEND_PLAN.md needs to change, ask first. Once approved, update the plan.
8. **No SMS and no paid Supabase features.** Don't add SMS/OTP providers or rely on Team/Enterprise-only features without asking. Supabase Auth stays the password authority.
9. **Report honestly.** If tests fail or a step is skipped or unverified, say so.

## Progress-tracking rules
- After finishing (or starting) any task, update `backend_progress.md`.
- Keep entries **short**: one line per item, no explanations, no code. Details belong in BACKEND_PLAN.md or the code itself.
- Format: `- [x] item` done, `- [~] item` in progress, `- [ ] item` todo, `- [!] item — blocker` blocked.
- Record decisions the user makes in the "Decisions" list (one line each).
