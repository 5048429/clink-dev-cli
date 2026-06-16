# Agent Workflow

This document breaks the project into parallel workstreams. Each workstream can be assigned to a separate coding agent.

## Coordination Rules

- Base every branch on `main`.
- Keep each agent scoped to one workstream.
- Do not change shared command flags without updating README and this document.
- Run `npm run check` and `npm run build` before handoff.
- Use `--json` and `--dry-run` command examples in all demos.
- Do not commit real Clink Secret Keys or webhook signing keys.

## Workstream A: Framework Starters

Goal: make `clink init --framework <name> --write` generate useful starter code.

Suggested branch:

```bash
git checkout -b feature/framework-starters
```

Agent prompt:

```text
You are working in the clink-dev-cli repo.

Implement framework starter generation for Next.js App Router, Express, and FastAPI.

Requirements:
- Keep Commander as the CLI router.
- Extend `clink init`.
- Generate starter server routes for:
  - create checkout session
  - create subscription
  - receive webhook with raw body signature verification
- Generate `.env.example` and curl examples.
- Do not hardcode secrets.
- Do not introduce a new HTTP framework into the CLI itself.
- Use existing helpers where possible.
- Add or update docs.
- Run `npm run check` and `npm run build`.

Deliver:
- changed file list
- sample generated files
- commands used for verification
```

Acceptance checks:

```bash
npm run check
npm run build
node dist/index.js init --framework nextjs --out ./tmp-next --force --json
node dist/index.js init --framework express --out ./tmp-express --force --json
node dist/index.js init --framework fastapi --out ./tmp-fastapi --force --json
```

## Workstream B: OpenAPI Client

Goal: reduce hand-written payload drift by generating or validating request types from Clink OpenAPI.

Suggested branch:

```bash
git checkout -b feature/openapi-client
```

Agent prompt:

```text
You are working in the clink-dev-cli repo.

Add an OpenAPI-backed client layer for the Clink API.

Requirements:
- Source spec: https://docs.clinkbill.com/api-reference/openapi.json
- Keep runtime dependency small.
- Do not remove the current `ClinkApiClient` until replacements are verified.
- Add a script such as `npm run openapi:refresh`.
- Generate or validate TypeScript types for product, price, checkout session, subscription, refund, and webhook event schemas.
- Update command modules to use typed request payloads where practical.
- Run `npm run check` and `npm run build`.

Deliver:
- how to refresh the OpenAPI types
- what commands were migrated
- known unsupported or ambiguous schema parts
```

Acceptance checks:

```bash
npm run openapi:refresh
npm run check
npm run build
node dist/index.js --dry-run checkout create --customer-email test@example.com --amount 1 --currency USD --json
```

## Workstream C: Webhook Tooling

Goal: make local webhook development reliable without Dashboard setup.

Suggested branch:

```bash
git checkout -b feature/webhook-tooling
```

Agent prompt:

```text
You are working in the clink-dev-cli repo.

Improve webhook developer tooling.

Requirements:
- Add more official-looking fixtures for:
  - session.complete
  - session.expired
  - order.created
  - order.succeeded
  - order.failed
  - subscription.created
  - subscription.activated
  - subscription.past_due
  - invoice.open
  - invoice.paid
  - invoice.void
- Add timestamp tolerance verification helper.
- Add a command to write fixtures to disk.
- Keep signing logic compatible with `X-Clink-Timestamp + "." + rawBody`.
- Add docs and examples.
- Run `npm run check` and `npm run build`.

Deliver:
- new webhook command examples
- fixture coverage summary
- verification commands
```

Acceptance checks:

```bash
npm run check
npm run build
node dist/index.js webhook simulate invoice.paid --secret test_secret --json
node dist/index.js webhook fixture order.succeeded --out ./tmp-order.json --json
node dist/index.js webhook sign --body-file ./tmp-order.json --secret test_secret --json
node dist/index.js webhook verify --body-file ./tmp-order.json --secret test_secret --timestamp <timestamp> --signature <signature> --tolerance-seconds 300 --json
```

## Workstream D: Tests And Exit Codes

Goal: make the CLI safer for CI and AI agents.

Suggested branch:

```bash
git checkout -b feature/tests-exit-codes
```

Agent prompt:

```text
You are working in the clink-dev-cli repo.

Add automated tests and finish exit-code behavior.

Requirements:
- Add a test runner with minimal dependencies.
- Test config resolution, secret masking, webhook signing, and dry-run request generation.
- Document stable exit codes.
- Make command errors map to stable exit codes where possible.
- Keep JSON errors parseable.
- Run `npm run check`, `npm run build`, and the new test command.

Deliver:
- test coverage summary
- exit code mapping
- commands used for verification
```

Acceptance checks:

```bash
npm run check
npm run build
npm test
node dist/index.js doctor --skip-network --json
```

## Workstream E: Dashboard Automation Research

Goal: decide whether OpenCLI should be used as an optional Dashboard automation adapter.

Suggested branch:

```bash
git checkout -b research/opencli-dashboard
```

Agent prompt:

```text
You are working in the clink-dev-cli repo.

Research an optional OpenCLI-based Dashboard automation adapter for ClinkBill.

Requirements:
- Do not add OpenCLI as a production dependency.
- Write a design doc only.
- Identify which Dashboard actions cannot currently be done through public API.
- Propose safe browser automation boundaries for:
  - webhook endpoint registration
  - webhook signing key retrieval guidance
  - API key initialization guidance
- Include security risks and required human confirmations.

Deliver:
- docs/dashboard-automation.md
- recommended next step: build, defer, or reject
```

Acceptance checks:

```bash
npm run check
npm run build
```

## Recommended Sequence

1. Start Workstream D first so tests protect the rest.
2. Run Workstream A and C in parallel.
3. Run Workstream B after A/C stabilize, because typed payloads can touch many files.
4. Keep Workstream E as research only until ClinkBill decides whether browser automation is acceptable.
