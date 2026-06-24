import type { Command } from "commander";
import { saveProfile } from "../config.js";
import { maskSecret, parseIntegerOption, printResult, requireOption } from "../output.js";
import { getCommandContext } from "./helpers.js";

const WEBHOOK_ENDPOINT_PATH = "/webhook/endpoints";
const WEBHOOK_CORE_EVENTS = [
  "session.complete",
  "order.succeeded",
  "order.failed",
  "refund.succeeded",
  "subscription.created",
  "invoice.paid",
] as const;
const WEBHOOK_SUPPORTED_EVENTS = new Set<string>(WEBHOOK_CORE_EVENTS);

type WebhookEndpoint = {
  id?: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
  signingSecret?: string | null;
  maskedSigningSecret?: string | null;
  description?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

type WebhookEndpointEnvelope<T = unknown> = {
  code?: number;
  msg?: string;
  data?: T;
};

type WebhookEndpointListResponse = {
  total?: number;
  rows?: WebhookEndpoint[];
  code?: number;
  msg?: string;
};

type WebhookEndpointEnsureData = {
  source?: string;
  endpoint?: WebhookEndpoint;
  signingSecretAvailable?: boolean;
  signingSecretUnavailableReason?: string | null;
  nextAction?: string | null;
};

type RegisterWebhookEndpointOptions = {
  legacyDashboardOptions?: boolean;
};

type EventOptions = {
  allowUnknownEvents?: boolean;
};

type CommonWriteOptions = EventOptions & {
  url?: string;
  events?: string;
  description?: string;
  remark?: string;
  disabled?: boolean;
  showSecret?: boolean;
  saveSecret?: boolean;
  merchantId?: string;
};

type EnsureOptions = CommonWriteOptions & {
  rotateSecret?: boolean;
  rotateSecretIfUnavailable?: boolean;
  returnSigningSecret?: boolean;
};

export function registerWebhookEndpointSubcommands(parent: Command, options: RegisterWebhookEndpointOptions = {}): void {
  parent
    .command("events")
    .description("List Secret Key API-supported webhook event names")
    .action(async function (this: Command) {
      const { config, client } = await getCommandContext(this);
      const result = await client.get<WebhookEndpointEnvelope>("/webhook/events");
      printResult(
        {
          result,
          fallbackCoreEvents: WEBHOOK_CORE_EVENTS,
        },
        config.outputMode,
        config.dryRun ? "Webhook event list dry-run generated. Use --json to view request metadata." : formatEventResult(result),
      );
    });

  const list = parent
    .command("list")
    .description("List webhook endpoints for the current Secret Key merchant")
    .option("--page <number>", "Page number", "1")
    .option("--page-size <number>", "Page size", "20")
    .option("--enabled <boolean>", "Filter by enabled status")
    .option("--url <https-url>", "Filter by exact endpoint URL");
  if (options.legacyDashboardOptions) {
    list.option("--show-secret", "Ignored; Secret Key API list responses do not return plaintext signing secrets");
  }
  addLegacyDashboardOptions(list, options);
  list.action(async function (
    this: Command,
    listOptions: { page: string; pageSize: string; enabled?: string; url?: string; merchantId?: string; showSecret?: boolean },
  ) {
    const { config, client } = await getCommandContext(this);
    const query = {
      pageNum: parsePositiveIntegerOption("--page", listOptions.page),
      pageSize: parsePageSizeOption(listOptions.pageSize),
      enabled: parseOptionalBoolean("--enabled", listOptions.enabled),
      url: listOptions.url,
    };
    const result = await client.get<WebhookEndpointListResponse>(WEBHOOK_ENDPOINT_PATH, { query });
    const safeResult = maskWebhookSecrets(result, false);
    printResult(
      {
        profile: config.profile,
        ignoredMerchantId: listOptions.merchantId,
        ignoredShowSecret: listOptions.showSecret,
        result: safeResult,
      },
      config.outputMode,
      config.dryRun ? "Webhook endpoint list dry-run generated. Use --json to view request metadata." : formatEndpointList(result),
    );
  });

  parent
    .command("get <endpoint-id>")
    .description("Get a webhook endpoint by ID")
    .action(async function (this: Command, endpointId: string) {
      requireOption("endpoint-id", endpointId);
      const { config, client } = await getCommandContext(this);
      const result = await client.get<WebhookEndpointEnvelope<WebhookEndpoint>>(`${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}`);
      printResult(
        {
          profile: config.profile,
          result: maskWebhookSecrets(result, false),
        },
        config.outputMode,
        config.dryRun ? "Webhook endpoint get dry-run generated. Use --json to view request metadata." : formatEndpointLine(extractEndpoint(result)),
      );
    });

  const create = parent
    .command("create")
    .description("Create a webhook endpoint with the Secret Key API")
    .requiredOption("--url <https-url>", "HTTPS webhook endpoint URL")
    .requiredOption("--events <events>", "Comma-separated event names, core, or all")
    .option("--description <text>", "Webhook endpoint description")
    .option("--remark <text>", "Alias for --description")
    .option("--save-secret", "Save the returned signing secret into the current clink profile")
    .option("--show-secret", "Print the full signing secret in command output")
    .option("--allow-unknown-events", "Send event names without local validation")
    .option("--disabled", "Create the webhook but leave it disabled");
  addLegacyDashboardOptions(create, options);
  create.action(async function (this: Command, createOptions: CommonWriteOptions) {
    const { config, client } = await getCommandContext(this);
    const body = {
      url: parseHttpsEndpoint(createOptions.url),
      events: parseWebhookEvents(createOptions.events, Boolean(createOptions.allowUnknownEvents)),
      description: getDescription(createOptions),
      enabled: !createOptions.disabled,
    };
    const result = await client.post<WebhookEndpointEnvelope<WebhookEndpoint>, typeof body>(WEBHOOK_ENDPOINT_PATH, { body });
    await saveSigningSecretIfRequested(config.profile, result, Boolean(createOptions.saveSecret), config.dryRun);
    const endpoint = extractEndpoint(result);
    printResult(
      {
        profile: config.profile,
        ignoredMerchantId: createOptions.merchantId,
        saved: Boolean(createOptions.saveSecret),
        endpoint: maskWebhookSecrets(endpoint, Boolean(createOptions.showSecret)),
        result: maskWebhookSecrets(result, Boolean(createOptions.showSecret)),
      },
      config.outputMode,
      config.dryRun
        ? "Webhook endpoint create dry-run generated. Use --json to view request metadata."
        : [
            `Created webhook endpoint: ${endpoint?.url ?? body.url}`,
            `Endpoint ID: ${endpoint?.id ?? "unknown"}`,
            `Events: ${(endpoint?.events ?? body.events).join(", ")}`,
            formatSigningSecretLine(endpoint, Boolean(createOptions.showSecret)),
            createOptions.saveSecret ? `Saved signing secret into profile "${config.profile}".` : "Signing secret was not saved. Re-run with --save-secret to store it.",
          ]
            .filter(Boolean)
            .join("\n"),
    );
  });

  const update = parent
    .command("update <endpoint-id>")
    .description("Update a webhook endpoint with the Secret Key API")
    .option("--url <https-url>", "HTTPS webhook endpoint URL")
    .option("--events <events>", "Comma-separated event names, core, or all")
    .option("--description <text>", "Webhook endpoint description")
    .option("--remark <text>", "Alias for --description")
    .option("--enabled <boolean>", "Set enabled status")
    .option("--disabled", "Disable the webhook endpoint")
    .option("--allow-unknown-events", "Send event names without local validation")
    .option("--rotate-secret", "Rotate the signing secret after updating")
    .option("--save-secret", "Save the rotated signing secret into the current clink profile")
    .option("--show-secret", "Print the full rotated signing secret in command output");
  addLegacyDashboardOptions(update, options);
  update.action(async function (
    this: Command,
    endpointId: string,
    updateOptions: CommonWriteOptions & { enabled?: string; rotateSecret?: boolean },
  ) {
    requireOption("endpoint-id", endpointId);
    const { config, client } = await getCommandContext(this);
    const body = buildUpdateBody(updateOptions);
    const shouldRotate = Boolean(updateOptions.rotateSecret || updateOptions.saveSecret || updateOptions.showSecret);
    if (Object.keys(body).length === 0 && !shouldRotate) {
      throw new Error("Provide at least one of --url, --events, --description, --remark, --enabled, --disabled, or --rotate-secret.");
    }

    const updateResult = Object.keys(body).length > 0
      ? await client.patch<WebhookEndpointEnvelope<WebhookEndpoint>, typeof body>(`${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}`, { body })
      : undefined;
    const rotateResult = shouldRotate
      ? await client.post<WebhookEndpointEnvelope<WebhookEndpoint>>(`${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}/rotate-secret`)
      : undefined;
    await saveSigningSecretIfRequested(config.profile, rotateResult ?? updateResult, Boolean(updateOptions.saveSecret), config.dryRun);
    const result = rotateResult ?? updateResult;
    const endpoint = extractEndpoint(result);
    printResult(
      {
        profile: config.profile,
        ignoredMerchantId: updateOptions.merchantId,
        saved: Boolean(updateOptions.saveSecret),
        updateResult: maskWebhookSecrets(updateResult, false),
        rotateResult: maskWebhookSecrets(rotateResult, Boolean(updateOptions.showSecret)),
        endpoint: maskWebhookSecrets(endpoint, Boolean(updateOptions.showSecret)),
      },
      config.outputMode,
      config.dryRun
        ? "Webhook endpoint update dry-run generated. Use --json to view request metadata."
        : [
            `Updated webhook endpoint: ${endpoint?.url ?? endpointId}`,
            `Endpoint ID: ${endpoint?.id ?? endpointId}`,
            endpoint?.events ? `Events: ${endpoint.events.join(", ")}` : undefined,
            formatSigningSecretLine(endpoint, Boolean(updateOptions.showSecret)),
            updateOptions.saveSecret ? `Saved signing secret into profile "${config.profile}".` : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
    );
  });

  parent
    .command("delete <endpoint-id>")
    .description("Delete a webhook endpoint")
    .action(async function (this: Command, endpointId: string) {
      requireOption("endpoint-id", endpointId);
      const { config, client } = await getCommandContext(this);
      const result = await client.delete<WebhookEndpointEnvelope<null>>(`${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}`);
      printResult(
        {
          profile: config.profile,
          endpointId,
          result,
        },
        config.outputMode,
        config.dryRun ? "Webhook endpoint delete dry-run generated. Use --json to view request metadata." : `Deleted webhook endpoint: ${endpointId}`,
      );
    });

  parent
    .command("enable <endpoint-id>")
    .description("Enable a webhook endpoint")
    .action(async function (this: Command, endpointId: string) {
      await updateEndpointEnabled(this, endpointId, true);
    });

  parent
    .command("disable <endpoint-id>")
    .description("Disable a webhook endpoint")
    .action(async function (this: Command, endpointId: string) {
      await updateEndpointEnabled(this, endpointId, false);
    });

  parent
    .command("rotate-secret <endpoint-id>")
    .description("Rotate a webhook endpoint signing secret")
    .option("--save-secret", "Save the rotated signing secret into the current clink profile")
    .option("--show-secret", "Print the full signing secret in command output")
    .action(async function (this: Command, endpointId: string, rotateOptions: { saveSecret?: boolean; showSecret?: boolean }) {
      requireOption("endpoint-id", endpointId);
      const { config, client } = await getCommandContext(this);
      const result = await client.post<WebhookEndpointEnvelope<WebhookEndpoint>>(`${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}/rotate-secret`);
      await saveSigningSecretIfRequested(config.profile, result, Boolean(rotateOptions.saveSecret), config.dryRun);
      const endpoint = extractEndpoint(result);
      printResult(
        {
          profile: config.profile,
          saved: Boolean(rotateOptions.saveSecret),
          endpoint: maskWebhookSecrets(endpoint, Boolean(rotateOptions.showSecret)),
          result: maskWebhookSecrets(result, Boolean(rotateOptions.showSecret)),
        },
        config.outputMode,
        config.dryRun
          ? "Webhook signing secret rotate dry-run generated. Use --json to view request metadata."
          : [
              `Rotated webhook signing secret: ${endpoint?.url ?? endpointId}`,
              `Endpoint ID: ${endpoint?.id ?? endpointId}`,
              formatSigningSecretLine(endpoint, Boolean(rotateOptions.showSecret)),
              rotateOptions.saveSecret ? `Saved signing secret into profile "${config.profile}".` : "Signing secret was not saved. Re-run with --save-secret to store it.",
            ]
              .filter(Boolean)
              .join("\n"),
      );
    });

  const ensure = parent
    .command("ensure")
    .description("Create or update a webhook endpoint by URL with the Secret Key API")
    .requiredOption("--url <https-url>", "HTTPS webhook endpoint URL")
    .requiredOption("--events <events>", "Comma-separated event names, core, or all")
    .option("--description <text>", "Webhook endpoint description")
    .option("--remark <text>", "Alias for --description")
    .option("--save-secret", "Save the resolved signing secret into the current clink profile")
    .option("--show-secret", "Print the full signing secret in command output")
    .option("--allow-unknown-events", "Send event names without local validation")
    .option("--disabled", "Create or update the webhook but leave it disabled")
    .option("--return-signing-secret", "Request plaintext signing secret when available")
    .option("--rotate-secret", "Always rotate the signing secret for an existing endpoint")
    .option("--no-rotate-secret-if-unavailable", "Do not rotate existing endpoints when plaintext secret is unavailable");
  addLegacyDashboardOptions(ensure, options);
  ensure.action(async function (this: Command, ensureOptions: EnsureOptions) {
    const { config, client } = await getCommandContext(this);
    const wantsSigningSecret = Boolean(
      ensureOptions.saveSecret ||
      ensureOptions.showSecret ||
      ensureOptions.returnSigningSecret ||
      ensureOptions.rotateSecret,
    );
    const body = {
      url: parseHttpsEndpoint(ensureOptions.url),
      events: parseWebhookEvents(ensureOptions.events, Boolean(ensureOptions.allowUnknownEvents)),
      description: getDescription(ensureOptions),
      enabled: !ensureOptions.disabled,
      returnSigningSecret: wantsSigningSecret || undefined,
      rotateSecretIfUnavailable: wantsSigningSecret && ensureOptions.rotateSecretIfUnavailable !== false ? true : undefined,
      rotateSecret: ensureOptions.rotateSecret || undefined,
    };
    const result = await client.put<WebhookEndpointEnvelope<WebhookEndpointEnsureData>, typeof body>(
      `${WEBHOOK_ENDPOINT_PATH}/ensure`,
      { body },
    );
    await saveSigningSecretIfRequested(config.profile, result, Boolean(ensureOptions.saveSecret), config.dryRun);
    const data = result.data;
    const endpoint = data?.endpoint;
    printResult(
      {
        profile: config.profile,
        ignoredMerchantId: ensureOptions.merchantId,
        saved: Boolean(ensureOptions.saveSecret),
        source: data?.source,
        signingSecretAvailable: data?.signingSecretAvailable,
        signingSecretUnavailableReason: data?.signingSecretUnavailableReason,
        nextAction: data?.nextAction,
        endpoint: maskWebhookSecrets(endpoint, Boolean(ensureOptions.showSecret)),
        result: maskWebhookSecrets(result, Boolean(ensureOptions.showSecret)),
      },
      config.outputMode,
      config.dryRun
        ? "Webhook endpoint ensure dry-run generated. Use --json to view request metadata."
        : [
            `${formatEnsureSource(data?.source)} webhook endpoint: ${endpoint?.url ?? body.url}`,
            `Endpoint ID: ${endpoint?.id ?? "unknown"}`,
            `Events: ${(endpoint?.events ?? body.events).join(", ")}`,
            `Enabled: ${endpoint?.enabled ?? body.enabled}`,
            formatSigningSecretLine(endpoint, Boolean(ensureOptions.showSecret)),
            ensureOptions.saveSecret ? `Saved signing secret into profile "${config.profile}".` : "Signing secret was not saved. Re-run with --save-secret to store it.",
            data?.nextAction ? `Next action: ${data.nextAction}` : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
    );
  });
}

function addLegacyDashboardOptions(command: Command, options: RegisterWebhookEndpointOptions): void {
  if (!options.legacyDashboardOptions) return;
  command.option("--merchant-id <id>", "Ignored; the Secret Key selects the current merchant");
}

async function updateEndpointEnabled(command: Command, endpointId: string, enabled: boolean): Promise<void> {
  requireOption("endpoint-id", endpointId);
  const { config, client } = await getCommandContext(command);
  const result = await client.post<WebhookEndpointEnvelope<WebhookEndpoint>>(
    `${WEBHOOK_ENDPOINT_PATH}/${encodeURIComponent(endpointId)}/${enabled ? "enable" : "disable"}`,
  );
  const endpoint = extractEndpoint(result);
  printResult(
    {
      profile: config.profile,
      endpointId,
      endpoint: maskWebhookSecrets(endpoint, false),
      result: maskWebhookSecrets(result, false),
    },
    config.outputMode,
    config.dryRun
      ? `Webhook endpoint ${enabled ? "enable" : "disable"} dry-run generated. Use --json to view request metadata.`
      : `${enabled ? "Enabled" : "Disabled"} webhook endpoint: ${endpoint?.url ?? endpointId}`,
  );
}

function buildUpdateBody(options: CommonWriteOptions & { enabled?: string }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.url) body.url = parseHttpsEndpoint(options.url);
  if (options.events) body.events = parseWebhookEvents(options.events, Boolean(options.allowUnknownEvents));
  const description = getDescription(options);
  if (description !== undefined) body.description = description;
  const enabled = parseEndpointEnabled(options);
  if (enabled !== undefined) body.enabled = enabled;
  return body;
}

function parseEndpointEnabled(options: { enabled?: string; disabled?: boolean }): boolean | undefined {
  if (options.enabled !== undefined && options.disabled) {
    throw new Error("Use either --enabled or --disabled, not both.");
  }
  if (options.disabled) return false;
  return parseOptionalBoolean("--enabled", options.enabled);
}

function getDescription(options: { description?: string; remark?: string }): string | undefined {
  if (options.description !== undefined && options.remark !== undefined && options.description !== options.remark) {
    throw new Error("Use either --description or --remark, not both.");
  }
  return options.description ?? options.remark;
}

function parseHttpsEndpoint(value: string | undefined): string {
  requireOption("--url", value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Option --url must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Option --url must start with https:// because Clink webhook endpoints require HTTPS.");
  }
  if (isBlockedWebhookHost(url.hostname)) {
    throw new Error("Option --url must not use localhost, loopback, private, link-local, or multicast hosts.");
  }

  return url.toString();
}

function isBlockedWebhookHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = /^172\.(\d+)\./.exec(host);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const firstOctet = /^(\d+)\./.exec(host);
  if (firstOctet) {
    const first = Number(firstOctet[1]);
    if (first >= 224 && first <= 239) return true;
  }
  return false;
}

function parseWebhookEvents(value: string | undefined, allowUnknownEvents: boolean): string[] {
  requireOption("--events", value);
  const normalized = value.trim().toLowerCase();
  const events = normalized === "core" || normalized === "all"
    ? [...WEBHOOK_CORE_EVENTS]
    : value
        .split(",")
        .map((event) => event.trim())
        .filter(Boolean);

  if (events.length === 0) {
    throw new Error("Option --events must include at least one event, core, or all.");
  }
  const numericEvents = events.filter((event) => /^\d+$/.test(event));
  if (numericEvents.length > 0) {
    throw new Error(`Webhook endpoint Secret Key API accepts event names, not numeric event codes: ${numericEvents.join(", ")}`);
  }
  if (!allowUnknownEvents) {
    const unknown = events.filter((event) => !WEBHOOK_SUPPORTED_EVENTS.has(event));
    if (unknown.length > 0) {
      throw new Error(`Unknown webhook event(s): ${unknown.join(", ")}. Run clink webhook endpoint events, or pass --allow-unknown-events.`);
    }
  }

  return [...new Set(events)];
}

function parseOptionalBoolean(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Option ${name} must be true or false`);
}

function parsePositiveIntegerOption(name: string, value: string | number | undefined): number {
  const parsed = parseIntegerOption(name, value);
  if (parsed <= 0) {
    throw new Error(`Option ${name} must be greater than 0`);
  }
  return parsed;
}

function parsePageSizeOption(value: string | number | undefined): number {
  const parsed = parsePositiveIntegerOption("--page-size", value);
  if (parsed > 100) {
    throw new Error("Option --page-size must be less than or equal to 100");
  }
  return parsed;
}

function extractEndpoint(result: unknown): WebhookEndpoint | undefined {
  const data = getEnvelopeData(result);
  if (isRecord(data) && isRecord(data.endpoint)) return data.endpoint as WebhookEndpoint;
  return isRecord(data) ? data as WebhookEndpoint : undefined;
}

function getEnvelopeData(result: unknown): unknown {
  return isRecord(result) && "data" in result ? result.data : undefined;
}

function extractSigningSecret(result: unknown): string | undefined {
  const endpoint = extractEndpoint(result);
  return typeof endpoint?.signingSecret === "string" && endpoint.signingSecret.length > 0 ? endpoint.signingSecret : undefined;
}

async function saveSigningSecretIfRequested(profile: string, result: unknown, enabled: boolean, dryRun: boolean): Promise<void> {
  if (!enabled) return;
  if (dryRun) return;
  const signingSecret = extractSigningSecret(result);
  if (!signingSecret) {
    const data = getEnvelopeData(result);
    const nextAction = isRecord(data) && typeof data.nextAction === "string"
      ? data.nextAction
      : undefined;
    throw new Error(
      [
        "Clink did not return a plaintext webhook signing secret.",
        nextAction ? `Next action: ${nextAction}.` : "Use rotate-secret, or retry ensure with --rotate-secret.",
      ].join(" "),
    );
  }

  await saveProfile(profile, { webhookSigningKey: signingSecret });
}

function maskWebhookSecrets(value: unknown, showSecret: boolean): unknown {
  if (showSecret) return value;
  if (Array.isArray(value)) return value.map((item) => maskWebhookSecrets(item, false));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "signingSecret" && typeof nestedValue === "string") {
      result[key] = maskSecret(nestedValue);
    } else {
      result[key] = maskWebhookSecrets(nestedValue, false);
    }
  }
  return result;
}

function formatEventResult(result: unknown): string {
  const data = getEnvelopeData(result);
  const events = isRecord(data) && Array.isArray(data.events) ? data.events : [];
  if (events.length === 0) return WEBHOOK_CORE_EVENTS.join("\n");
  return events
    .map((event) => {
      if (!isRecord(event)) return String(event);
      return [event.name, event.code, event.description].filter(Boolean).join("\t");
    })
    .join("\n");
}

function formatEndpointList(result: WebhookEndpointListResponse): string {
  const rows = result.rows ?? [];
  if (rows.length === 0) return "No webhook endpoints found.";
  return rows.map((endpoint) => formatEndpointLine(endpoint)).join("\n");
}

function formatEndpointLine(endpoint: WebhookEndpoint | undefined): string {
  if (!endpoint) return "Webhook endpoint response received.";
  return [
    endpoint.id ?? "unknown",
    endpoint.url ?? "unknown-url",
    endpoint.events ? `${endpoint.events.length} events` : undefined,
    endpoint.enabled === undefined ? undefined : `enabled=${endpoint.enabled}`,
    endpoint.maskedSigningSecret ? `signingSecret=${endpoint.maskedSigningSecret}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatEnsureSource(source: string | undefined): string {
  if (source === "created") return "Created";
  if (source === "updated") return "Updated";
  if (source === "rotated") return "Rotated";
  if (source === "updated_rotated") return "Updated and rotated";
  return "Found";
}

function formatSigningSecretLine(endpoint: WebhookEndpoint | undefined, showSecret: boolean): string | undefined {
  const secret = endpoint?.signingSecret;
  if (typeof secret === "string" && secret.length > 0) {
    return `Signing secret: ${showSecret ? secret : maskSecret(secret)}`;
  }
  if (endpoint?.maskedSigningSecret) {
    return `Signing secret: ${endpoint.maskedSigningSecret}`;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
