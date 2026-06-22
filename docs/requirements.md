# Clink Dev CLI Requirements

## Goal

Build a merchant developer CLI that lets an AI agent or independent developer integrate ClinkBill with minimal Dashboard usage.

The CLI should focus on the standard merchant integration path:

- create checkout sessions
- create products and prices for subscription flows
- create subscriptions
- simulate and verify webhook delivery locally
- run integration health checks
- generate starter integration files for common web frameworks

## User Profile

The primary user is a developer, coding agent, or solo founder who has a ClinkBill sandbox Secret Key and wants to validate a payment integration from the terminal.

The CLI is not a replacement for merchant account registration, MFA, production approval, or legal/financial confirmation.

## MVP Scope

The first release should support:

- profile and API key configuration, including `clink auth secret set` for sandbox environments where browser login is unavailable
- sandbox-first API calls
- product creation and listing
- price creation and listing
- checkout session creation with inline one-time product data
- subscription creation with existing product, price, and payment instrument IDs
- local webhook event simulation with Clink-compatible HMAC signing
- integration doctor checks
- smoke-test command for checkout and webhook verification
- framework starter generation for Next.js App Router, Express, and FastAPI

## Non-Goals For MVP

- production onboarding
- merchant account creation
- API key generation
- requiring browser automation for merchants that already have a sandbox Secret Key
- hosted webhook relay
- remote event replay
- direct replacement for the existing customer wallet CLI

## Future Scope

Future versions should add:

- webhook endpoint management once ClinkBill exposes a public endpoint API
- event list, replay, and trigger APIs
- `clink listen` for local webhook forwarding
- OpenAPI-generated typed client
- official MCP server integration
- framework-specific code generation for Laravel, Rails, and other server stacks

## Sandbox Authentication Flow

The primary sandbox flow is Dashboard-less:

```bash
export CLINK_SECRET_KEY=sk_test_xxx
clink auth secret set --api-key env:CLINK_SECRET_KEY --env sandbox
clink auth status
```

After this, product, price, checkout, subscription, doctor, smoke-test, and local webhook commands use the configured Secret Key. `clink login` and Dashboard Console APIs are optional fallback tools for Dashboard-only operations, not prerequisites for normal Secret Key authentication.

