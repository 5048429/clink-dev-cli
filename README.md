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

Validate changes before handoff:

```bash
npm run check
npm run build
npm test
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

## Framework Starters

Generate starter integration files for common server frameworks:

```bash
clink init --framework nextjs --out ./tmp-next --force --json
clink init --framework express --out ./tmp-express --force --json
clink init --framework fastapi --out ./tmp-fastapi --force --json
```

Each starter includes checkout, subscription, and raw-body webhook examples, plus `.env.example`, curl examples, and integration docs. Secrets are read from environment variables such as `CLINK_SECRET_KEY` and `CLINK_WEBHOOK_SIGNING_KEY`.

## Local Webhook Development

The webhook tools do not require Dashboard setup or live Clink API access. Use a local signing key such as `env:CLINK_WEBHOOK_SIGNING_KEY` or a throwaway value like `test_secret`.

Generate a stable fixture:

```bash
clink webhook fixture invoice.paid --out ./fixtures/invoice-paid.json --json
```

Sign the exact raw file contents:

```bash
clink webhook sign --body-file ./fixtures/invoice-paid.json --secret env:CLINK_WEBHOOK_SIGNING_KEY --json
```

Verify the raw file contents, timestamp, and signature before accepting a local webhook:

```bash
clink webhook verify --body-file ./fixtures/invoice-paid.json --secret env:CLINK_WEBHOOK_SIGNING_KEY --timestamp <timestamp-from-sign> --signature <signature-from-sign> --tolerance-seconds 300 --json
```

`clink webhook verify` rejects timestamps outside the tolerance window. The default tolerance is 300 seconds. The signature is HMAC SHA-256 over:

```text
X-Clink-Timestamp + "." + rawBody
```

Supported fixtures:

```text
session.complete
session.expired
order.created
order.succeeded
order.failed
subscription.created
subscription.activated
subscription.past_due
invoice.open
invoice.paid
invoice.void
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
