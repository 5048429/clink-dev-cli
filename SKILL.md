---
name: clink-dev-cli
description: Use this skill when developing, testing, or extending the ClinkBill merchant developer CLI for checkout, subscriptions, products, prices, webhooks, doctor checks, and AI-friendly integration workflows.
---

# clink-dev-cli

This repository builds a merchant developer CLI for ClinkBill integrations.

Use this skill when the user asks to:

- add or change a `clink` CLI command
- improve AI-assisted ClinkBill integration workflows
- add checkout, product, price, subscription, webhook, doctor, or smoke-test behavior
- design Dashboard-light or Dashboard-less merchant developer flows
- generate framework starters for Next.js, Express, FastAPI, Laravel, or similar stacks
- improve tests, exit codes, JSON output, or command docs

## Operating Rules

- Keep the CLI API-first and sandbox-first.
- Prefer stable command flags and machine-readable JSON over interactive flows.
- Every command that returns useful data should support `--json`.
- Do not hardcode real Secret Keys or webhook signing keys.
- Prefer `env:CLINK_SECRET_KEY` and `env:CLINK_WEBHOOK_SIGNING_KEY` references for stored profiles.
- Never print unmasked secrets in normal output.
- Keep `Commander` as the core command router unless the user explicitly requests a different shell framework.
- Do not add Ink to core commands. If interactive UI is needed, add a separate `wizard` command later.
- Do not use OpenCLI as a core dependency. Treat browser/Dashboard automation as an optional experiment.

## Current Architecture

- `src/index.ts`: CLI entrypoint and global flags
- `src/commands/`: command modules
- `src/api/client.ts`: Clink REST client
- `src/config.ts`: local profile and environment resolution
- `src/webhook/`: signing and fixture helpers
- `docs/requirements.md`: product requirements
- `docs/roadmap.md`: implementation roadmap
- `docs/agent-workflow.md`: parallel agent task plan

## Quality Bar

Before finishing a change:

1. Run `npm run check`.
2. Run `npm run build`.
3. Smoke-test relevant commands with `--json` or `--dry-run`.
4. Confirm no real secrets were added to files, logs, docs, or examples.
5. Keep README/docs updated when command flags change.

## Suggested Work Order

For new command work:

1. Add or update command module under `src/commands/`.
2. Reuse `getCommandContext()` and `ClinkApiClient`.
3. Add JSON output first, then human output.
4. Add dry-run support for API writes through the shared client.
5. Update README examples.
6. Update docs if the command changes project workflow.

