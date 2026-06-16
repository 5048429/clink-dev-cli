# clink-dev-cli

Merchant developer CLI for ClinkBill integrations.

This CLI is designed for AI-assisted and Dashboard-light integration workflows. It helps developers create Clink checkout sessions, manage products and prices, create subscriptions, simulate signed webhooks locally, and run integration health checks.

## Install

```bash
npm install
npm run build
node dist/index.js --help
```

During local development:

```bash
npm run dev -- --help
```

## Configure

Prefer environment-variable references instead of storing secrets directly:

```bash
export CLINK_SECRET_KEY=sk_test_xxx
export CLINK_WEBHOOK_SIGNING_KEY=whsec_xxx

clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox
clink auth status
```

Sandbox is the default environment and maps to:

```text
https://uat-api.clinkbill.com/api/
```

## MVP Commands

```bash
clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox
clink auth status

clink product create --name "Starter" --image-id oss_xxx --tax-category software_service
clink product list

clink price create --product-id prd_xxx --amount 9.99 --currency USD --type recurring --interval month
clink price list --product-id prd_xxx

clink checkout create --customer-email test@example.com --amount 19.99 --currency USD --name "Test Product" --success-url http://localhost:3000/success --cancel-url http://localhost:3000/cancel

clink subscription create --customer-email test@example.com --product-id prd_xxx --price-id price_xxx --payment-instrument-id pi_xxx --payment-method-type CARD --payment-currency USD --return-url http://localhost:3000/account

clink webhook simulate order.succeeded --secret env:CLINK_WEBHOOK_SIGNING_KEY --forward-to http://localhost:3000/api/clink/webhook

clink doctor
clink smoke-test
```

## AI-Friendly Output

All commands accept `--json` so coding agents can parse results reliably:

```bash
clink checkout create ... --json
```

## Project Docs

- [Requirements](docs/requirements.md)
- [Roadmap](docs/roadmap.md)
- [Agent workflow](docs/agent-workflow.md)
- [Exit codes](docs/exit-codes.md)

## Agent Skill

This repository includes `SKILL.md` so compatible coding agents can understand the CLI architecture, safety rules, and quality bar before modifying the project.
