export type StarterFramework = "generic" | "nextjs" | "express" | "fastapi";

export interface StarterFile {
  relativePath: string;
  content: string;
}

export interface FrameworkStarter {
  framework: StarterFramework;
  files: StarterFile[];
}

const supportedFrameworks: StarterFramework[] = ["generic", "nextjs", "express", "fastapi"];

const frameworkAliases: Record<string, StarterFramework> = {
  generic: "generic",
  next: "nextjs",
  nextjs: "nextjs",
  "next.js": "nextjs",
  express: "express",
  fastapi: "fastapi",
  "fast-api": "fastapi",
};

export function createFrameworkStarter(frameworkName: string): FrameworkStarter {
  const framework = normalizeFramework(frameworkName);

  switch (framework) {
    case "nextjs":
      return { framework, files: nextjsFiles() };
    case "express":
      return { framework, files: expressFiles() };
    case "fastapi":
      return { framework, files: fastapiFiles() };
    case "generic":
      return { framework, files: genericFiles() };
  }
}

export function listSupportedFrameworks(): StarterFramework[] {
  return [...supportedFrameworks];
}

function normalizeFramework(frameworkName: string): StarterFramework {
  const key = (frameworkName || "generic").trim().toLowerCase();
  const framework = frameworkAliases[key];
  if (!framework) {
    throw new Error(`Unsupported framework "${frameworkName}". Supported frameworks: ${supportedFrameworks.join(", ")}`);
  }
  return framework;
}

function nextjsFiles(): StarterFile[] {
  return [
    ...commonFiles({
      framework: "Next.js App Router",
      appUrl: "http://localhost:3000",
      port: "3000",
      runCommand: "npm install\nnpm run dev",
      endpointBase: "/api/clink",
      notes: [
        "The webhook route calls request.text() so the exact raw body is verified before JSON parsing.",
        "The route files are server-only and use Node.js crypto, so they export runtime = \"nodejs\".",
      ],
    }),
    {
      relativePath: "package.json",
      content: jsonFile({
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
        },
        dependencies: {
          next: "latest",
          react: "latest",
          "react-dom": "latest",
        },
        devDependencies: {
          "@types/node": "latest",
          "@types/react": "latest",
          typescript: "latest",
        },
      }),
    },
    {
      relativePath: "next.config.mjs",
      content: lines(["/** @type {import('next').NextConfig} */", "const nextConfig = {};", "", "export default nextConfig;"]),
    },
    {
      relativePath: "tsconfig.json",
      content: jsonFile({
        compilerOptions: {
          target: "ES2017",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
        exclude: ["node_modules"],
      }),
    },
    {
      relativePath: "app/api/clink/checkout/route.ts",
      content: nextCheckoutRoute(),
    },
    {
      relativePath: "app/api/clink/subscription/route.ts",
      content: nextSubscriptionRoute(),
    },
    {
      relativePath: "app/api/clink/webhook/route.ts",
      content: nextWebhookRoute(),
    },
    {
      relativePath: "lib/clink.ts",
      content: nextClinkLibrary(),
    },
  ];
}

function expressFiles(): StarterFile[] {
  return [
    ...commonFiles({
      framework: "Express",
      appUrl: "http://localhost:3000",
      port: "3000",
      runCommand: "npm install\nnpm run dev",
      endpointBase: "/api/clink",
      notes: [
        "The webhook route is registered before JSON parsing and uses express.raw() to preserve the request body.",
        "Checkout and subscription routes proxy only server-side requests to Clink and never expose CLINK_SECRET_KEY to browsers.",
      ],
    }),
    {
      relativePath: "package.json",
      content: jsonFile({
        private: true,
        type: "module",
        scripts: {
          dev: "node --watch src/server.js",
          start: "node src/server.js",
        },
        dependencies: {
          dotenv: "latest",
          express: "latest",
        },
      }),
    },
    {
      relativePath: "src/server.js",
      content: expressServer(),
    },
  ];
}

function fastapiFiles(): StarterFile[] {
  return [
    ...commonFiles({
      framework: "FastAPI",
      appUrl: "http://localhost:8000",
      port: "8000",
      runCommand: "python -m venv .venv\n. .venv/bin/activate\npip install -r requirements.txt\nuvicorn app.main:app --reload",
      endpointBase: "/api/clink",
      notes: [
        "The webhook endpoint calls await request.body() and verifies those bytes before JSON parsing.",
        "Outbound Clink API calls use server-side environment variables only.",
      ],
    }),
    {
      relativePath: "requirements.txt",
      content: lines(["fastapi", "uvicorn[standard]", "httpx"]),
    },
    {
      relativePath: "app/main.py",
      content: fastapiMain(),
    },
  ];
}

function genericFiles(): StarterFile[] {
  return commonFiles({
    framework: "Generic HTTP server",
    appUrl: "http://localhost:3000",
    port: "3000",
    runCommand: "Add these files to your server project, then run your framework dev server.",
    endpointBase: "/api/clink",
    notes: [
      "Create checkout and subscription endpoints that proxy server-side requests to Clink.",
      "Keep the webhook raw body unchanged until after X-Clink-Signature verification.",
    ],
  });
}

function commonFiles(options: {
  framework: string;
  appUrl: string;
  port: string;
  runCommand: string;
  endpointBase: string;
  notes: string[];
}): StarterFile[] {
  return [
    {
      relativePath: ".env.example",
      content: envExample(options.appUrl, options.port),
    },
    {
      relativePath: "README.md",
      content: starterReadme(options),
    },
    {
      relativePath: "docs/clink-integration.md",
      content: integrationDoc(options),
    },
    {
      relativePath: "examples/curl-examples.sh",
      content: curlExamples(options.appUrl, options.endpointBase),
    },
    {
      relativePath: "scripts/clink-smoke-test.sh",
      content: smokeTestScript(options.appUrl),
    },
  ];
}

function envExample(appUrl: string, port: string): string {
  return lines([
    "CLINK_ENV=sandbox",
    "CLINK_BASE_URL=https://uat-api.clinkbill.com/api/",
    "CLINK_SECRET_KEY=",
    "CLINK_WEBHOOK_SIGNING_KEY=",
    `APP_URL=${appUrl}`,
    `PORT=${port}`,
  ]);
}

function starterReadme(options: {
  framework: string;
  appUrl: string;
  runCommand: string;
  endpointBase: string;
  notes: string[];
}): string {
  return lines([
    `# Clink ${options.framework} Starter`,
    "",
    "This starter shows how to create checkout sessions, create subscriptions, and receive signed Clink webhooks without hardcoding secrets.",
    "",
    "## Environment",
    "",
    "Copy `.env.example` to your local environment file and fill in:",
    "",
    "- `CLINK_SECRET_KEY`",
    "- `CLINK_WEBHOOK_SIGNING_KEY`",
    "- `CLINK_BASE_URL` if you need a non-sandbox API URL",
    "",
    "## Run",
    "",
    "```bash",
    options.runCommand,
    "```",
    "",
    "## Endpoints",
    "",
    "- `POST " + options.endpointBase + "/checkout` creates a hosted checkout session.",
    "- `POST " + options.endpointBase + "/subscription` creates a subscription.",
    "- `POST " + options.endpointBase + "/webhook` verifies `X-Clink-Timestamp` and `X-Clink-Signature` against the raw body.",
    "",
    "## Curl Examples",
    "",
    "```bash",
    "bash examples/curl-examples.sh",
    "```",
    "",
    "## Notes",
    "",
    ...options.notes.map((note) => `- ${note}`),
  ]);
}

function integrationDoc(options: {
  framework: string;
  appUrl: string;
  endpointBase: string;
}): string {
  return lines([
    "# Clink Integration",
    "",
    `Framework: ${options.framework}`,
    "",
    "## Server Routes",
    "",
    "- Checkout: `POST " + options.endpointBase + "/checkout`",
    "- Subscription: `POST " + options.endpointBase + "/subscription`",
    "- Webhook: `POST " + options.endpointBase + "/webhook`",
    "",
    "The webhook signature base string is:",
    "",
    "```text",
    "X-Clink-Timestamp + \".\" + raw request body",
    "```",
    "",
    "Verify the HMAC SHA-256 hex digest with `CLINK_WEBHOOK_SIGNING_KEY` before parsing JSON.",
    "",
    "## Local Checks",
    "",
    "```bash",
    "clink doctor",
    `clink webhook simulate order.succeeded --secret env:CLINK_WEBHOOK_SIGNING_KEY --forward-to ${options.appUrl}${options.endpointBase}/webhook --json`,
    "```",
    "",
    "## Curl Examples",
    "",
    "Run:",
    "",
    "```bash",
    "bash examples/curl-examples.sh",
    "```",
    "",
    "The script sends local checkout and subscription requests, then signs a sample webhook payload with the key in your environment.",
  ]);
}

function curlExamples(appUrl: string, endpointBase: string): string {
  return lines([
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `APP_URL="\${APP_URL:-${appUrl}}"`,
    "",
    "curl -X POST \"$APP_URL" + endpointBase + "/checkout\" \\",
    "  -H \"Content-Type: application/json\" \\",
    "  -d '{\"customerEmail\":\"buyer@example.com\",\"amount\":19.99,\"currency\":\"USD\",\"name\":\"Starter Plan\",\"successUrl\":\"http://localhost:3000/success\",\"cancelUrl\":\"http://localhost:3000/cancel\"}'",
    "",
    "curl -X POST \"$APP_URL" + endpointBase + "/subscription\" \\",
    "  -H \"Content-Type: application/json\" \\",
    "  -d '{\"customerEmail\":\"buyer@example.com\",\"productId\":\"prd_test\",\"priceId\":\"price_test\",\"paymentInstrumentId\":\"pi_test\",\"paymentMethodType\":\"CARD\",\"paymentCurrency\":\"USD\",\"returnUrl\":\"http://localhost:3000/account\"}'",
    "",
    "RAW_BODY='{\"type\":\"order.succeeded\",\"data\":{\"id\":\"ord_test\"}}'",
    "TIMESTAMP=\"$(date +%s000)\"",
    ": \"${CLINK_WEBHOOK_SIGNING_KEY:?Set CLINK_WEBHOOK_SIGNING_KEY before running the webhook curl example}\"",
    "SIGNATURE=\"$(printf '%s.%s' \"$TIMESTAMP\" \"$RAW_BODY\" | openssl dgst -sha256 -hmac \"$CLINK_WEBHOOK_SIGNING_KEY\" -hex | sed 's/^.* //')\"",
    "",
    "curl -X POST \"$APP_URL" + endpointBase + "/webhook\" \\",
    "  -H \"Content-Type: application/json\" \\",
    "  -H \"X-Clink-Timestamp: $TIMESTAMP\" \\",
    "  -H \"X-Clink-Signature: $SIGNATURE\" \\",
    "  -d \"$RAW_BODY\"",
  ]);
}

function smokeTestScript(appUrl: string): string {
  return lines([
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `WEBHOOK_URL="\${WEBHOOK_URL:-${appUrl}/api/clink/webhook}"`,
    "",
    "clink doctor",
    "clink smoke-test --webhook-url \"$WEBHOOK_URL\" \"$@\"",
  ]);
}

function nextClinkLibrary(): string {
  return lines([
    "import { createHmac, timingSafeEqual } from \"node:crypto\";",
    "",
    "const DEFAULT_BASE_URL = \"https://uat-api.clinkbill.com/api/\";",
    "",
    "export function requireEnv(name: string): string {",
    "  const value = process.env[name];",
    "  if (!value) {",
    "    throw new Error(`Missing required environment variable: ${name}`);",
    "  }",
    "  return value;",
    "}",
    "",
    "export function clinkApiUrl(path: string): string {",
    "  const baseUrl = process.env.CLINK_BASE_URL ?? DEFAULT_BASE_URL;",
    "  const normalizedBaseUrl = baseUrl.endsWith(\"/\") ? baseUrl : `${baseUrl}/`;",
    "  return new URL(path.replace(/^\\/+/, \"\"), normalizedBaseUrl).toString();",
    "}",
    "",
    "export async function postClink(path: string, body: unknown): Promise<unknown> {",
    "  const response = await fetch(clinkApiUrl(path), {",
    "    method: \"POST\",",
    "    headers: {",
    "      \"Content-Type\": \"application/json\",",
    "      \"X-API-KEY\": requireEnv(\"CLINK_SECRET_KEY\"),",
    "      \"X-Timestamp\": String(Date.now()),",
    "    },",
    "    body: JSON.stringify(body),",
    "    cache: \"no-store\",",
    "  });",
    "",
    "  const text = await response.text();",
    "  const data = parseResponseBody(text);",
    "",
    "  if (!response.ok) {",
    "    throw new Error(`Clink API request failed with ${response.status}: ${text}`);",
    "  }",
    "",
    "  return data;",
    "}",
    "",
    "export function verifyClinkWebhook(secret: string, timestamp: string, rawBody: string, signature: string): boolean {",
    "  const expected = createHmac(\"sha256\", secret).update(`${timestamp}.${rawBody}`).digest(\"hex\");",
    "  return safeCompare(expected, signature);",
    "}",
    "",
    "export function buildCheckoutPayload(input: Record<string, unknown>): Record<string, unknown> {",
    "  const amount = Number(input.amount ?? input.originalAmount ?? 19.99);",
    "  const currency = String(input.currency ?? input.originalCurrency ?? \"USD\").toUpperCase();",
    "  const body: Record<string, unknown> = {",
    "    customerEmail: input.customerEmail,",
    "    originalAmount: amount,",
    "    originalCurrency: currency,",
    "    merchantReferenceId: input.merchantReferenceId,",
    "    successUrl: input.successUrl,",
    "    cancelUrl: input.cancelUrl,",
    "    uiMode: input.uiMode ?? \"hostedPage\",",
    "    returnUrl: input.returnUrl,",
    "    paymentMethodType: input.paymentMethodType,",
    "    allowPromotionCodes: Boolean(input.allowPromotionCodes),",
    "  };",
    "",
    "  if (input.productId || input.priceId) {",
    "    body.productId = input.productId;",
    "    body.priceId = input.priceId;",
    "  } else {",
    "    body.priceDataList = [",
    "      {",
    "        name: input.name ?? \"Test Product\",",
    "        quantity: Number(input.quantity ?? 1),",
    "        unitAmount: amount,",
    "        currency,",
    "        imageUrl: input.imageUrl,",
    "      },",
    "    ];",
    "  }",
    "",
    "  return body;",
    "}",
    "",
    "export function buildSubscriptionPayload(input: Record<string, unknown>): Record<string, unknown> {",
    "  return {",
    "    customerId: input.customerId,",
    "    customerEmail: input.customerEmail,",
    "    referenceCustomerId: input.referenceCustomerId,",
    "    merchantReferenceId: input.merchantReferenceId,",
    "    productId: input.productId,",
    "    priceId: input.priceId,",
    "    paymentInstrumentId: input.paymentInstrumentId,",
    "    paymentMethodType: input.paymentMethodType ?? \"CARD\",",
    "    paymentCurrency: String(input.paymentCurrency ?? \"USD\").toUpperCase(),",
    "    returnUrl: input.returnUrl,",
    "    metadata: input.metadata,",
    "  };",
    "}",
    "",
    "export function errorMessage(error: unknown): string {",
    "  return error instanceof Error ? error.message : String(error);",
    "}",
    "",
    "function parseResponseBody(text: string): unknown {",
    "  if (!text) return {};",
    "  try {",
    "    return JSON.parse(text) as unknown;",
    "  } catch {",
    "    return text;",
    "  }",
    "}",
    "",
    "function safeCompare(a: string, b: string): boolean {",
    "  const aBuffer = Buffer.from(a);",
    "  const bBuffer = Buffer.from(b);",
    "  if (aBuffer.length !== bBuffer.length) return false;",
    "  return timingSafeEqual(aBuffer, bBuffer);",
    "}",
  ]);
}

function nextCheckoutRoute(): string {
  return lines([
    "import { NextResponse } from \"next/server\";",
    "import { buildCheckoutPayload, errorMessage, postClink } from \"../../../../lib/clink\";",
    "",
    "export const runtime = \"nodejs\";",
    "",
    "export async function POST(request: Request) {",
    "  try {",
    "    const input = (await request.json()) as Record<string, unknown>;",
    "    const result = await postClink(\"/checkout/session\", buildCheckoutPayload(input));",
    "    return NextResponse.json({ ok: true, result });",
    "  } catch (error) {",
    "    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });",
    "  }",
    "}",
  ]);
}

function nextSubscriptionRoute(): string {
  return lines([
    "import { NextResponse } from \"next/server\";",
    "import { buildSubscriptionPayload, errorMessage, postClink } from \"../../../../lib/clink\";",
    "",
    "export const runtime = \"nodejs\";",
    "",
    "export async function POST(request: Request) {",
    "  try {",
    "    const input = (await request.json()) as Record<string, unknown>;",
    "    const result = await postClink(\"/subscription\", buildSubscriptionPayload(input));",
    "    return NextResponse.json({ ok: true, result });",
    "  } catch (error) {",
    "    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });",
    "  }",
    "}",
  ]);
}

function nextWebhookRoute(): string {
  return lines([
    "import { NextResponse } from \"next/server\";",
    "import { errorMessage, requireEnv, verifyClinkWebhook } from \"../../../../lib/clink\";",
    "",
    "export const runtime = \"nodejs\";",
    "",
    "export async function POST(request: Request) {",
    "  try {",
    "    const timestamp = request.headers.get(\"x-clink-timestamp\");",
    "    const signature = request.headers.get(\"x-clink-signature\");",
    "",
    "    if (!timestamp || !signature) {",
    "      return NextResponse.json({ ok: false, error: \"Missing Clink webhook signature headers\" }, { status: 400 });",
    "    }",
    "",
    "    const rawBody = await request.text();",
    "    const secret = requireEnv(\"CLINK_WEBHOOK_SIGNING_KEY\");",
    "",
    "    if (!verifyClinkWebhook(secret, timestamp, rawBody, signature)) {",
    "      return NextResponse.json({ ok: false, error: \"Invalid Clink webhook signature\" }, { status: 400 });",
    "    }",
    "",
    "    const event = JSON.parse(rawBody) as { type?: string; eventType?: string };",
    "    console.log(\"Received Clink event\", event.type ?? event.eventType ?? \"unknown\");",
    "",
    "    return NextResponse.json({ ok: true });",
    "  } catch (error) {",
    "    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });",
    "  }",
    "}",
  ]);
}

function expressServer(): string {
  return lines([
    "import \"dotenv/config\";",
    "import { createHmac, timingSafeEqual } from \"node:crypto\";",
    "import express from \"express\";",
    "",
    "const app = express();",
    "const port = Number(process.env.PORT ?? 3000);",
    "const defaultBaseUrl = \"https://uat-api.clinkbill.com/api/\";",
    "",
    "app.post(\"/api/clink/webhook\", express.raw({ type: \"application/json\" }), (req, res) => {",
    "  const timestamp = req.header(\"x-clink-timestamp\");",
    "  const signature = req.header(\"x-clink-signature\");",
    "",
    "  if (!timestamp || !signature) {",
    "    return res.status(400).json({ ok: false, error: \"Missing Clink webhook signature headers\" });",
    "  }",
    "",
    "  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString(\"utf8\") : \"\";",
    "",
    "  if (!verifyClinkWebhook(requireEnv(\"CLINK_WEBHOOK_SIGNING_KEY\"), timestamp, rawBody, signature)) {",
    "    return res.status(400).json({ ok: false, error: \"Invalid Clink webhook signature\" });",
    "  }",
    "",
    "  const event = JSON.parse(rawBody);",
    "  console.log(\"Received Clink event\", event.type ?? event.eventType ?? \"unknown\");",
    "",
    "  return res.json({ ok: true });",
    "});",
    "",
    "app.use(express.json());",
    "",
    "app.post(\"/api/clink/checkout\", async (req, res, next) => {",
    "  try {",
    "    const result = await postClink(\"/checkout/session\", buildCheckoutPayload(req.body ?? {}));",
    "    res.json({ ok: true, result });",
    "  } catch (error) {",
    "    next(error);",
    "  }",
    "});",
    "",
    "app.post(\"/api/clink/subscription\", async (req, res, next) => {",
    "  try {",
    "    const result = await postClink(\"/subscription\", buildSubscriptionPayload(req.body ?? {}));",
    "    res.json({ ok: true, result });",
    "  } catch (error) {",
    "    next(error);",
    "  }",
    "});",
    "",
    "app.use((error, _req, res, _next) => {",
    "  const message = error instanceof Error ? error.message : String(error);",
    "  res.status(500).json({ ok: false, error: message });",
    "});",
    "",
    "app.listen(port, () => {",
    "  console.log(`Clink Express starter listening on http://localhost:${port}`);",
    "});",
    "",
    "function requireEnv(name) {",
    "  const value = process.env[name];",
    "  if (!value) {",
    "    throw new Error(`Missing required environment variable: ${name}`);",
    "  }",
    "  return value;",
    "}",
    "",
    "function clinkApiUrl(path) {",
    "  const baseUrl = process.env.CLINK_BASE_URL ?? defaultBaseUrl;",
    "  const normalizedBaseUrl = baseUrl.endsWith(\"/\") ? baseUrl : `${baseUrl}/`;",
    "  return new URL(path.replace(/^\\/+/, \"\"), normalizedBaseUrl).toString();",
    "}",
    "",
    "async function postClink(path, body) {",
    "  const response = await fetch(clinkApiUrl(path), {",
    "    method: \"POST\",",
    "    headers: {",
    "      \"Content-Type\": \"application/json\",",
    "      \"X-API-KEY\": requireEnv(\"CLINK_SECRET_KEY\"),",
    "      \"X-Timestamp\": String(Date.now()),",
    "    },",
    "    body: JSON.stringify(body),",
    "  });",
    "",
    "  const text = await response.text();",
    "  const data = parseResponseBody(text);",
    "",
    "  if (!response.ok) {",
    "    throw new Error(`Clink API request failed with ${response.status}: ${text}`);",
    "  }",
    "",
    "  return data;",
    "}",
    "",
    "function verifyClinkWebhook(secret, timestamp, rawBody, signature) {",
    "  const expected = createHmac(\"sha256\", secret).update(`${timestamp}.${rawBody}`).digest(\"hex\");",
    "  return safeCompare(expected, signature);",
    "}",
    "",
    "function buildCheckoutPayload(input) {",
    "  const amount = Number(input.amount ?? input.originalAmount ?? 19.99);",
    "  const currency = String(input.currency ?? input.originalCurrency ?? \"USD\").toUpperCase();",
    "  const body = {",
    "    customerEmail: input.customerEmail,",
    "    originalAmount: amount,",
    "    originalCurrency: currency,",
    "    merchantReferenceId: input.merchantReferenceId,",
    "    successUrl: input.successUrl,",
    "    cancelUrl: input.cancelUrl,",
    "    uiMode: input.uiMode ?? \"hostedPage\",",
    "    returnUrl: input.returnUrl,",
    "    paymentMethodType: input.paymentMethodType,",
    "    allowPromotionCodes: Boolean(input.allowPromotionCodes),",
    "  };",
    "",
    "  if (input.productId || input.priceId) {",
    "    body.productId = input.productId;",
    "    body.priceId = input.priceId;",
    "  } else {",
    "    body.priceDataList = [{",
    "      name: input.name ?? \"Test Product\",",
    "      quantity: Number(input.quantity ?? 1),",
    "      unitAmount: amount,",
    "      currency,",
    "      imageUrl: input.imageUrl,",
    "    }];",
    "  }",
    "",
    "  return body;",
    "}",
    "",
    "function buildSubscriptionPayload(input) {",
    "  return {",
    "    customerId: input.customerId,",
    "    customerEmail: input.customerEmail,",
    "    referenceCustomerId: input.referenceCustomerId,",
    "    merchantReferenceId: input.merchantReferenceId,",
    "    productId: input.productId,",
    "    priceId: input.priceId,",
    "    paymentInstrumentId: input.paymentInstrumentId,",
    "    paymentMethodType: input.paymentMethodType ?? \"CARD\",",
    "    paymentCurrency: String(input.paymentCurrency ?? \"USD\").toUpperCase(),",
    "    returnUrl: input.returnUrl,",
    "    metadata: input.metadata,",
    "  };",
    "}",
    "",
    "function parseResponseBody(text) {",
    "  if (!text) return {};",
    "  try {",
    "    return JSON.parse(text);",
    "  } catch {",
    "    return text;",
    "  }",
    "}",
    "",
    "function safeCompare(a, b) {",
    "  const aBuffer = Buffer.from(a);",
    "  const bBuffer = Buffer.from(b);",
    "  if (aBuffer.length !== bBuffer.length) return false;",
    "  return timingSafeEqual(aBuffer, bBuffer);",
    "}",
  ]);
}

function fastapiMain(): string {
  return lines([
    "from __future__ import annotations",
    "",
    "import hashlib",
    "import hmac",
    "import json",
    "import os",
    "import time",
    "from typing import Any",
    "",
    "import httpx",
    "from fastapi import FastAPI, Header, HTTPException, Request",
    "",
    "app = FastAPI(title=\"Clink FastAPI Starter\")",
    "DEFAULT_BASE_URL = \"https://uat-api.clinkbill.com/api/\"",
    "",
    "",
    "@app.post(\"/api/clink/checkout\")",
    "async def create_checkout_session(payload: dict[str, Any]) -> dict[str, Any]:",
    "    result = await post_clink(\"/checkout/session\", build_checkout_payload(payload))",
    "    return {\"ok\": True, \"result\": result}",
    "",
    "",
    "@app.post(\"/api/clink/subscription\")",
    "async def create_subscription(payload: dict[str, Any]) -> dict[str, Any]:",
    "    result = await post_clink(\"/subscription\", build_subscription_payload(payload))",
    "    return {\"ok\": True, \"result\": result}",
    "",
    "",
    "@app.post(\"/api/clink/webhook\")",
    "async def clink_webhook(",
    "    request: Request,",
    "    x_clink_timestamp: str | None = Header(default=None, alias=\"X-Clink-Timestamp\"),",
    "    x_clink_signature: str | None = Header(default=None, alias=\"X-Clink-Signature\"),",
    ") -> dict[str, bool]:",
    "    if not x_clink_timestamp or not x_clink_signature:",
    "        raise HTTPException(status_code=400, detail=\"Missing Clink webhook signature headers\")",
    "",
    "    raw_body = await request.body()",
    "    if not verify_clink_webhook(",
    "        require_env(\"CLINK_WEBHOOK_SIGNING_KEY\"),",
    "        x_clink_timestamp,",
    "        raw_body,",
    "        x_clink_signature,",
    "    ):",
    "        raise HTTPException(status_code=400, detail=\"Invalid Clink webhook signature\")",
    "",
    "    try:",
    "        event = json.loads(raw_body)",
    "    except json.JSONDecodeError as exc:",
    "        raise HTTPException(status_code=400, detail=\"Invalid JSON body\") from exc",
    "",
    "    print(\"Received Clink event\", event.get(\"type\") or event.get(\"eventType\") or \"unknown\")",
    "    return {\"ok\": True}",
    "",
    "",
    "async def post_clink(path: str, body: dict[str, Any]) -> Any:",
    "    headers = {",
    "        \"Content-Type\": \"application/json\",",
    "        \"X-API-KEY\": require_env(\"CLINK_SECRET_KEY\"),",
    "        \"X-Timestamp\": str(int(time.time() * 1000)),",
    "    }",
    "",
    "    async with httpx.AsyncClient(timeout=20) as client:",
    "        response = await client.post(clink_api_url(path), headers=headers, json=body)",
    "",
    "    try:",
    "        data: Any = response.json()",
    "    except ValueError:",
    "        data = response.text",
    "",
    "    if response.status_code >= 400:",
    "        raise HTTPException(",
    "            status_code=502,",
    "            detail=f\"Clink API request failed with {response.status_code}: {response.text}\",",
    "        )",
    "",
    "    return data",
    "",
    "",
    "def clink_api_url(path: str) -> str:",
    "    base_url = os.environ.get(\"CLINK_BASE_URL\", DEFAULT_BASE_URL)",
    "    normalized_base_url = base_url if base_url.endswith(\"/\") else f\"{base_url}/\"",
    "    return normalized_base_url + path.lstrip(\"/\")",
    "",
    "",
    "def require_env(name: str) -> str:",
    "    value = os.environ.get(name)",
    "    if not value:",
    "        raise RuntimeError(f\"Missing required environment variable: {name}\")",
    "    return value",
    "",
    "",
    "def verify_clink_webhook(secret: str, timestamp: str, raw_body: bytes, signature: str) -> bool:",
    "    signed_payload = timestamp.encode(\"utf-8\") + b\".\" + raw_body",
    "    expected = hmac.new(secret.encode(\"utf-8\"), signed_payload, hashlib.sha256).hexdigest()",
    "    return hmac.compare_digest(expected, signature)",
    "",
    "",
    "def build_checkout_payload(input_data: dict[str, Any]) -> dict[str, Any]:",
    "    amount = float(input_data.get(\"amount\") or input_data.get(\"originalAmount\") or 19.99)",
    "    currency = str(input_data.get(\"currency\") or input_data.get(\"originalCurrency\") or \"USD\").upper()",
    "    body: dict[str, Any] = {",
    "        \"customerEmail\": input_data.get(\"customerEmail\"),",
    "        \"originalAmount\": amount,",
    "        \"originalCurrency\": currency,",
    "        \"merchantReferenceId\": input_data.get(\"merchantReferenceId\"),",
    "        \"successUrl\": input_data.get(\"successUrl\"),",
    "        \"cancelUrl\": input_data.get(\"cancelUrl\"),",
    "        \"uiMode\": input_data.get(\"uiMode\") or \"hostedPage\",",
    "        \"returnUrl\": input_data.get(\"returnUrl\"),",
    "        \"paymentMethodType\": input_data.get(\"paymentMethodType\"),",
    "        \"allowPromotionCodes\": bool(input_data.get(\"allowPromotionCodes\")),",
    "    }",
    "",
    "    if input_data.get(\"productId\") or input_data.get(\"priceId\"):",
    "        body[\"productId\"] = input_data.get(\"productId\")",
    "        body[\"priceId\"] = input_data.get(\"priceId\")",
    "    else:",
    "        body[\"priceDataList\"] = [",
    "            {",
    "                \"name\": input_data.get(\"name\") or \"Test Product\",",
    "                \"quantity\": int(input_data.get(\"quantity\") or 1),",
    "                \"unitAmount\": amount,",
    "                \"currency\": currency,",
    "                \"imageUrl\": input_data.get(\"imageUrl\"),",
    "            }",
    "        ]",
    "",
    "    return body",
    "",
    "",
    "def build_subscription_payload(input_data: dict[str, Any]) -> dict[str, Any]:",
    "    return {",
    "        \"customerId\": input_data.get(\"customerId\"),",
    "        \"customerEmail\": input_data.get(\"customerEmail\"),",
    "        \"referenceCustomerId\": input_data.get(\"referenceCustomerId\"),",
    "        \"merchantReferenceId\": input_data.get(\"merchantReferenceId\"),",
    "        \"productId\": input_data.get(\"productId\"),",
    "        \"priceId\": input_data.get(\"priceId\"),",
    "        \"paymentInstrumentId\": input_data.get(\"paymentInstrumentId\"),",
    "        \"paymentMethodType\": input_data.get(\"paymentMethodType\") or \"CARD\",",
    "        \"paymentCurrency\": str(input_data.get(\"paymentCurrency\") or \"USD\").upper(),",
    "        \"returnUrl\": input_data.get(\"returnUrl\"),",
    "        \"metadata\": input_data.get(\"metadata\"),",
    "    }",
  ]);
}

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function lines(value: string[]): string {
  return `${value.join("\n")}\n`;
}
