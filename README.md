# clink-dev-cli

Merchant developer CLI for ClinkBill integrations.

This CLI is designed for AI-assisted and Dashboard-light integration workflows. It helps developers create Clink checkout sessions, manage products and prices, create subscriptions, simulate signed webhooks locally, and run integration health checks.

## Install

Install the CLI directly from GitHub:

```bash
npm install -g github:5048429/clink-dev-cli
clink --help
```

If global installs are not available in the agent/runtime environment, install it into a project-local tools directory:

```bash
npm install --prefix ./.clink-tools github:5048429/clink-dev-cli
./.clink-tools/node_modules/.bin/clink --help
```

On Windows PowerShell, the local binary path is:

```powershell
.\.clink-tools\node_modules\.bin\clink.cmd --help
```

During CLI development in this repository:

```bash
npm install
npm run build
npm link
clink --help
```

Run without linking when debugging source changes:

```bash
npm run dev -- --help
```

Validate changes before handoff:

```bash
npm run check
npm run build
npm test
npm run pack:dry-run
```

## Configure

### Sandbox Without Browser

If you already have a ClinkBill sandbox Secret Key, you do not need `clink login` or Playwright for official public API work. Store the key in the CLI profile and all public API commands will authenticate with `X-API-KEY`:

```bash
export CLINK_SECRET_KEY=sk_test_xxx

clink auth secret set --api-key env:CLINK_SECRET_KEY --env sandbox
clink auth status
```

You can also pass a literal key when an environment variable is not available:

```bash
clink auth secret set --api-key sk_test_xxx --env sandbox
```

Literal keys are stored in the local profile file, so `env:CLINK_SECRET_KEY` is still preferred for shared machines, CI logs, and AI-agent workflows. CLI output masks Secret Keys by default.

Sandbox is the default environment and maps to:

```text
https://uat-api.clinkbill.com/api/
```

Webhook signing keys are configured separately because they are used only for local webhook signing and verification:

```bash
export CLINK_WEBHOOK_SIGNING_KEY=whsec_xxx
clink auth set --webhook-secret env:CLINK_WEBHOOK_SIGNING_KEY --env sandbox
```

### Dashboard Console Login

Use `clink login` only when a workflow needs the UAT Dashboard Console identity, for example calling Dashboard internal APIs during MVP validation. It is optional for product, price, checkout, subscription, order, refund, payment, billing portal, `api request`, doctor, smoke-test, and local webhook commands when a Secret Key is already configured:

```bash
clink login
clink dashboard whoami
clink dashboard whoami --json
```

`clink login` opens `https://uat-dashboard.clinkbill.com/auth/login` with Playwright. The CLI does not type credentials, bypass MFA, or solve CAPTCHA. After you finish login in the browser, it captures the Dashboard `/platform/user/getInfo` request headers, verifies the identity with:

```http
GET https://uat-dashboard.clinkbill.com/prod-api/platform/user/getInfo
Authorization: Bearer <token>
ClientID: <clientId>
Accept-Language: zh_CN
Content-Language: zh_CN
```

Then it saves the Dashboard base URL, ClientID, access token, and a user summary in the selected local profile. CLI output always masks the access token. `clink dashboard whoami --dry-run --json` prints the request metadata with `Authorization: Bearer [masked]`.

By default `clink login` tries an installed Chrome or Edge browser before falling back to Playwright's bundled Chromium. You can force a channel when debugging:

```bash
clink login --browser-channel chrome
clink login --browser-channel msedge
```

After login, you may resolve the current UAT Dashboard Secret Key and save it for Clink API calls. This is a fallback for Dashboard-assisted validation, not required when you manually configured a Secret Key with `clink auth secret set`:

```bash
clink dashboard apikey list --json
clink dashboard apikey ensure-secret --save --json
```

`dashboard apikey ensure-secret` first calls the Dashboard API key list endpoint. If a Secret Key already exists, it uses that key. If no Secret Key exists, it initializes the Dashboard standard Publishable Key and Secret Key pair. Secret values are masked by default; pass `--show-secret` only when you intentionally need the raw value in the terminal.

### Dashboard Webhook Setup

After `clink login`, the CLI can also configure UAT Dashboard webhook endpoints with the saved Dashboard token:

```bash
clink dashboard merchant list --json
clink dashboard webhook events
clink dashboard webhook list --json

clink dashboard webhook ensure \
  --url https://your-public-host.example.com/api/clink/webhook \
  --events core \
  --save-secret \
  --json

clink dashboard webhook update wh_xxx \
  --url https://new-public-host.example.com/api/clink/webhook \
  --events core \
  --save-secret

clink dashboard webhook enable wh_xxx
clink dashboard webhook disable wh_xxx
```

`dashboard webhook ensure` first lists the current merchant's endpoints. If the URL already exists, it updates the selected events or remark when needed. If it does not exist, it creates the endpoint. Created and updated endpoints are enabled by default; pass `--disabled` only when you intentionally want to leave one disabled. Use `dashboard webhook update <webhook-key-id>` when a local tunnel URL changes and you want to reuse the existing Dashboard webhook record instead of creating another one. The returned signing key is masked by default; `--save-secret` stores it in the current local profile for `clink webhook simulate/sign/verify`, and `--show-secret` prints the raw value only when you explicitly ask for it.

If your Dashboard account can access multiple merchants, pass `--merchant-id mcht_xxx`. Dashboard requires webhook endpoint URLs to start with `https://`, so local testing normally needs a tunnel or deployed callback URL. The CLI accepts readable event names such as `order.succeeded`, but submits the Dashboard numeric event codes used by the UAT webhook sender. The current UAT Dashboard backend rejects very long comma-separated event lists; use `--events core` or a shorter explicit list instead of `all`.

Important Secret Key boundary: the current official OpenAPI spec covers payment, checkout, product, price, subscription, order, refund, payment instrument, billing portal, coupon, promotion code, and test-clock APIs, but it does not expose a webhook endpoint management API. Therefore `clink dashboard webhook ensure/list/create/update/enable/disable` still requires `clink login` until ClinkBill publishes a Secret Key-compatible webhook management endpoint. Use `clink api request` for any official OpenAPI path that does not yet have a dedicated CLI wrapper.

## MVP Commands

```bash
export CLINK_SECRET_KEY=sk_test_xxx
clink auth secret set --api-key env:CLINK_SECRET_KEY --env sandbox
clink auth status

clink product create --name "Starter" --image-id oss_xxx --tax-category software_service --amount 9.99 --currency USD --type recurring --interval month --default
clink product list

clink price create --product-id prd_xxx --amount 9.99 --currency USD --type recurring --interval month
clink price list --product-id prd_xxx

clink checkout create --customer-email test@example.com --amount 19.99 --currency USD --name "Test Product" --success-url http://localhost:3000/success --cancel-url http://localhost:3000/cancel
clink checkout create --customer-email test@example.com --amount 9.99 --currency USD --product-id prd_xxx --price-id price_xxx --success-url http://localhost:3000/success --cancel-url http://localhost:3000/cancel
clink checkout get sess_xxx

clink subscription create --customer-email test@example.com --product-id prd_xxx --price-id price_xxx --payment-instrument-id pi_xxx --payment-method-type CARD --payment-currency USD --return-url http://localhost:3000/account
clink subscription get sub_xxx
clink subscription cancel sub_xxx --reason "No longer needed"

clink order list --page 1 --page-size 20
clink order get order_xxx

clink refund create --order-id order_xxx --refund-merchant-order-id refund_merchant_xxx --amount 9.99
clink refund get rfd_xxx

clink billing portal-session --customer-id cus_xxx --return-url https://your-site.com/account

clink payment create --data '{"customerEmail":"test@example.com","paymentInstrumentId":"pi_xxx","paymentMethodType":"CARD","amount":9.99,"currency":"USD","returnUrl":"https://your-site.com/payment/return"}'
clink payment instrument create --data '{"customerEmail":"test@example.com","paymentInstrumentType":"GCASH"}'

clink api request GET /order --query pageNum=1 --query pageSize=20
clink api request POST /refund --data '{"orderId":"order_xxx","refundMerchantOrderId":"refund_merchant_xxx","refundAmount":9.99}'

clink webhook simulate order.succeeded --secret env:CLINK_WEBHOOK_SIGNING_KEY --forward-to http://localhost:3000/api/clink/webhook

clink doctor
clink smoke-test
```

Dashboard-assisted operations remain available when needed:

```bash
clink login
clink dashboard whoami
clink dashboard apikey ensure-secret --save
clink dashboard webhook ensure --url https://your-public-host.example.com/api/clink/webhook --events core --save-secret
```

`product create --json` promotes the useful IDs to the top level so agents do not need to dig through the raw API response:

```json
{
  "productId": "prd_xxx",
  "defaultPrice": "price_xxx",
  "initialPriceId": "price_xxx",
  "checkoutCommand": "clink checkout create ..."
}
```

## Checkout Sessions

Checkout is the payment entry point. The CLI supports both price sources from the official quickstart.

Use an existing Dashboard product and price:

```bash
clink checkout create \
  --customer-email buyer@example.com \
  --amount 10 \
  --currency USD \
  --product-id prd_xxx \
  --price-id price_xxx \
  --success-url https://your-site.com/success \
  --cancel-url https://your-site.com/cancel \
  --json
```

Use inline price data for a one-time order:

```bash
clink checkout create \
  --customer-email buyer@example.com \
  --amount 10 \
  --currency USD \
  --name "A One-time purchase" \
  --quantity 1 \
  --success-url https://your-site.com/success \
  --cancel-url https://your-site.com/cancel \
  --json
```

For inline price data, `--amount` must equal `--unit-amount * --quantity`. If `--unit-amount` is omitted, the CLI uses `amount / quantity`. Add `--open` to open the hosted checkout URL after creation.

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
- [Agent CLI install guide](docs/agent-cli-install.zh-CN.md)
- [CLI 更新与发布操作指南](docs/cli-release-runbook.zh-CN.md)
- [中文需求说明](docs/requirements.zh-CN.md)
- [产品需求文档](docs/product-requirements.zh-CN.md)
- [最小 MVP：AI 生成 UAT Secret Key 并接入支付](docs/mvp-agent-secret-key-api.zh-CN.md)
- [Roadmap](docs/roadmap.md)
- [Agent workflow](docs/agent-workflow.md)
- [Exit codes](docs/exit-codes.md)
- [OpenAPI types](docs/openapi-client.md)

## Agent Skill

This repository includes `SKILL.md` so compatible coding agents can understand the CLI architecture, safety rules, and quality bar before modifying the project.
