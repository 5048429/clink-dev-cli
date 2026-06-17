# OpenAPI Types

The CLI generates TypeScript types from the Clink OpenAPI document:

```bash
npm run openapi:refresh
```

The refresh script reads `https://docs.clinkbill.com/api-reference/openapi.json` and writes the generated output to `src/openapi/clink.openapi.ts`. Do not edit that generated file directly. Commit only successful generated output; do not commit partial downloads or temporary OpenAPI JSON files.

## Typed Surface

`src/api/openapi-types.ts` exports stable aliases over the generated `paths`, `components`, and `webhooks` types so command modules do not need to index into the raw generated file.

Currently migrated command payloads:

- `product create`: `ProductCreatePayload`, `ProductCreateResponse`
- `product list`: `ProductListQuery`, `ProductListResponse`
- `price create`: `PriceCreatePayload`, `PriceCreateResponse`
- `price list`: `PriceListQuery`, `PriceListResponse`
- `checkout create`: `CheckoutSessionCreatePayload`, `CheckoutSessionCreateResponse`
- `subscription create`: `SubscriptionCreatePayload`, `SubscriptionCreateResponse`

Generated but not yet wired to a CLI command:

- `RefundCreatePayload`
- `RefundCreateResponse`

Webhook schemas are generated and exported as:

- `OrderWebhookEvent`
- `SessionWebhookEvent`
- `RefundWebhookEvent`
- `SubscriptionWebhookEvent`
- `InvoiceWebhookEvent`
- `CustomerVerifyWebhookEvent`
- `DisputeWebhookEvent`
- `ClinkWebhookEvent`
- `ClinkWebhookEventType`

## Compatibility Notes

The existing CLI flags remain compatible. Some OpenAPI schemas are stricter than current command flags, especially enum fields such as product tax category, price currency, price type, checkout UI mode, and payment method type. Commands currently narrow those values for TypeScript without adding new runtime rejection rules; the API remains the source of truth for values the CLI has historically passed through.

Schema areas to treat as still settling:

- Webhook event payloads are exported from OpenAPI, but local simulation fixtures are maintained separately until the webhook tooling branch lands.
- Refund types are available, but there is no `refund` command yet.
- Checkout and subscription scheduled phases are generated, but the current CLI does not expose flags for them.
- OpenAPI responses sometimes expose both `application/json` and `*/*`; local aliases prefer `application/json` when present.
