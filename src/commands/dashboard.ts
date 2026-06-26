import type { Command } from "commander";
import {
  DashboardConsoleClient,
  type DashboardMerchantRecord,
  type DashboardWebhookRecord,
  extractDashboardApiKeyRecords,
  extractDashboardMerchantRecords,
  extractDashboardUserSummary,
  extractDashboardWebhookRecords,
  findDashboardPublishableKey,
  findDashboardSecretKey,
  findDashboardWebhookByEndpoint,
  maskDashboardApiKeyRecord,
  maskDashboardProfile,
  maskDashboardWebhookRecord,
} from "../dashboard-console.js";
import { resolveRuntimeConfig, saveProfile } from "../config.js";
import { maskSecret, printResult, requireOption } from "../output.js";
import type { DashboardConsoleProfile, GlobalOptions } from "../types.js";
import { registerWebhookEndpointSubcommands } from "./webhook-endpoints.js";

const DASHBOARD_WEBHOOK_EVENTS = [
  "order.created",
  "order.succeeded",
  "order.failed",
  "refund.created",
  "refund.succeeded",
  "refund.failed",
  "subscription.created",
  "subscription.trialing",
  "subscription.activated",
  "subscription.incomplete_expired",
  "subscription.past_due",
  "subscription.cancelled",
  "invoice.open",
  "invoice.paid",
  "invoice.void",
  "order.next_action",
  "subscription.updated.plan_changed",
  "subscription.updated.plan_change_canceled",
  "subscription.updated.renewed",
  "subscription.updated.cancel_at_period_end_set",
  "subscription.updated.cancel_at_period_end_revoked",
  "session.complete",
  "session.expired",
  "dispute.created",
  "dispute.updated",
  "dispute.won",
  "dispute.lost",
  "dispute.closed",
  "customer.verify",
  "payment_method.added",
  "payment_method.default_change",
  "risk_rule.updated",
  "agent_order.succeeded",
  "agent_order.failed",
  "agent_refund.succeeded",
  "agent_refund.failed",
  "agent_refund.approved",
  "agent_refund.rejected",
  "payment_method.update",
  "purchase_instruction.created",
  "purchase_instruction.activated",
  "purchase_instruction.updated",
  "purchase_instruction.cancelled",
  "vic_device.binding_succeeded",
] as const;

const DASHBOARD_WEBHOOK_CORE_EVENTS = [
  "session.complete",
  "order.succeeded",
  "order.failed",
  "refund.succeeded",
  "subscription.created",
  "invoice.paid",
] as const;

const DASHBOARD_WEBHOOK_EVENT_CODE_BY_NAME: Record<(typeof DASHBOARD_WEBHOOK_EVENTS)[number], string> = {
  "order.created": "1",
  "order.succeeded": "2",
  "order.failed": "3",
  "refund.created": "4",
  "refund.succeeded": "5",
  "refund.failed": "6",
  "subscription.created": "7",
  "subscription.trialing": "8",
  "subscription.activated": "9",
  "subscription.incomplete_expired": "10",
  "subscription.past_due": "11",
  "subscription.cancelled": "12",
  "invoice.open": "13",
  "invoice.paid": "14",
  "invoice.void": "15",
  "order.next_action": "16",
  "subscription.updated.plan_changed": "17",
  "subscription.updated.plan_change_canceled": "18",
  "subscription.updated.renewed": "19",
  "subscription.updated.cancel_at_period_end_set": "20",
  "subscription.updated.cancel_at_period_end_revoked": "21",
  "session.complete": "22",
  "session.expired": "23",
  "dispute.created": "24",
  "dispute.updated": "25",
  "dispute.won": "26",
  "dispute.lost": "27",
  "dispute.closed": "28",
  "customer.verify": "29",
  "payment_method.added": "30",
  "payment_method.default_change": "31",
  "risk_rule.updated": "32",
  "agent_order.succeeded": "33",
  "agent_order.failed": "34",
  "agent_refund.succeeded": "35",
  "agent_refund.failed": "36",
  "agent_refund.approved": "37",
  "agent_refund.rejected": "38",
  "payment_method.update": "39",
  "purchase_instruction.created": "40",
  "purchase_instruction.activated": "41",
  "purchase_instruction.updated": "42",
  "purchase_instruction.cancelled": "43",
  "vic_device.binding_succeeded": "44",
};

const DASHBOARD_WEBHOOK_EVENT_TYPE_MAX_LENGTH = 100;
const DASHBOARD_WEBHOOK_STATUS_DISABLED = "0";
const DASHBOARD_WEBHOOK_STATUS_ACTIVE = "1";

export function registerDashboard(program: Command): void {
  const dashboard = program.command("dashboard").description("Use saved Dashboard Console credentials");

  dashboard
    .command("whoami")
    .description("Call Dashboard /platform/user/getInfo with the saved Console token")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = new DashboardConsoleClient(
        {
          baseUrl: dashboardProfile.baseUrl,
          accessToken: dashboardProfile.accessToken,
          clientId: dashboardProfile.clientId,
        },
        config.dryRun,
      );

      const result = await client.getInfo();

      if (config.dryRun) {
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            result,
          },
          config.outputMode,
          "Dashboard whoami dry-run generated. Use --json to view headers.",
        );
        return;
      }

      const user = extractDashboardUserSummary(result);
      const updatedProfile: DashboardConsoleProfile = {
        ...dashboardProfile,
        user,
      };
      await saveProfile(config.profile, { dashboard: updatedProfile });

      printResult(
        {
          profile: config.profile,
          dashboard: maskDashboardProfile(updatedProfile),
          user,
        },
        config.outputMode,
        [
          `Dashboard profile: ${config.profile}`,
          `Dashboard API: ${updatedProfile.baseUrl}`,
          `ClientID: ${updatedProfile.clientId}`,
          `Token: ${maskDashboardProfile(updatedProfile).accessToken}`,
          `User: ${formatUser(user)}`,
        ].join("\n"),
      );
    });

  const apikey = dashboard.command("apikey").description("Inspect or initialize Dashboard API keys");

  apikey
    .command("list")
    .description("List Dashboard API keys for the current merchant")
    .option("--show-secret", "Print full key values instead of masking them")
    .action(async function (this: Command, options: { showSecret?: boolean }) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);

      const result = await client.listApiKeys();
      if (config.dryRun) {
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            result,
          },
          config.outputMode,
          "Dashboard API key list dry-run generated. Use --json to view headers.",
        );
        return;
      }

      const records = extractDashboardApiKeyRecords(result);
      const outputRecords = options.showSecret ? records : records.map(maskDashboardApiKeyRecord);

      printResult(
        {
          profile: config.profile,
          count: outputRecords.length,
          keys: outputRecords,
        },
        config.outputMode,
        outputRecords.length > 0
          ? outputRecords.map((record) => `${record.keyType ?? "?"} ${record.apikeyName ?? ""}: ${record.keyValue ?? "missing"}`).join("\n")
          : "No Dashboard API keys found.",
      );
    });

  apikey
    .command("ensure-secret")
    .description("Use the existing Dashboard Secret Key, or initialize standard PK/SK if none exists")
    .option("--save", "Save the resolved Secret Key into the current clink profile")
    .option("--show-secret", "Print the full Secret Key in command output")
    .action(async function (this: Command, options: { save?: boolean; showSecret?: boolean }) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);

      if (config.dryRun) {
        const listRequest = await client.listApiKeys();
        const initializeRequest = await client.initializeStandardApiKeys();
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            plan: [
              { step: "list_api_keys", result: listRequest },
              { step: "initialize_standard_keys_if_missing", result: initializeRequest },
              { step: "save_secret_key", enabled: Boolean(options.save) },
            ],
          },
          config.outputMode,
          "Dashboard API key ensure-secret dry-run generated. Use --json to view planned requests.",
        );
        return;
      }

      const listResult = await client.listApiKeys();
      let records = extractDashboardApiKeyRecords(listResult);
      let secretKey = findDashboardSecretKey(records);
      let publishableKey = findDashboardPublishableKey(records);
      let source: "existing" | "created" = "existing";

      if (!secretKey) {
        const initializeResult = await client.initializeStandardApiKeys();
        records = extractDashboardApiKeyRecords(initializeResult);
        secretKey = findDashboardSecretKey(records);
        publishableKey = findDashboardPublishableKey(records);
        source = "created";
      }

      if (!secretKey?.keyValue) {
        throw new Error("Dashboard did not return a Secret Key. Check Developers -> API Keys in the Dashboard.");
      }

      if (options.save) {
        await saveProfile(config.profile, {
          environment: "sandbox",
          apiKey: secretKey.keyValue,
          dashboard: dashboardProfile,
        });
      }

      const outputSecret = options.showSecret ? secretKey.keyValue : maskSecret(secretKey.keyValue);
      const outputPublishable = publishableKey?.keyValue
        ? options.showSecret
          ? publishableKey.keyValue
          : maskSecret(publishableKey.keyValue)
        : undefined;

      printResult(
        {
          profile: config.profile,
          source,
          saved: Boolean(options.save),
          secretKey: outputSecret,
          publishableKey: outputPublishable,
          secretKeyRecord: options.showSecret ? secretKey : maskDashboardApiKeyRecord(secretKey),
          publishableKeyRecord: publishableKey
            ? options.showSecret
              ? publishableKey
              : maskDashboardApiKeyRecord(publishableKey)
            : undefined,
        },
        config.outputMode,
        [
          `${source === "created" ? "Created" : "Found"} Dashboard Secret Key: ${outputSecret}`,
          outputPublishable ? `Publishable Key: ${outputPublishable}` : undefined,
          options.save ? `Saved Secret Key into profile "${config.profile}" for Clink API calls.` : "Secret Key was not saved. Re-run with --save to store it.",
        ]
          .filter(Boolean)
        .join("\n"),
      );
    });

  const merchant = dashboard.command("merchant").description("Inspect Dashboard merchant context");

  merchant
    .command("list")
    .description("List Dashboard merchants visible to the saved Console token")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);

      const result = await client.listMerchants();
      if (config.dryRun) {
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            result,
          },
          config.outputMode,
          "Dashboard merchant list dry-run generated. Use --json to view headers.",
        );
        return;
      }

      const merchants = extractDashboardMerchantRecords(result);
      printResult(
        {
          profile: config.profile,
          count: merchants.length,
          merchants,
        },
        config.outputMode,
        merchants.length > 0
          ? merchants.map(formatMerchantLine).join("\n")
          : "No Dashboard merchants found.",
      );
    });

  const webhook = dashboard.command("webhook").description("Manage Clink webhook endpoints with the Secret Key API");
  registerWebhookEndpointSubcommands(webhook, { legacyDashboardOptions: true });
  // Public Secret Key endpoint management supersedes the legacy Dashboard Console implementation below.
  return;

  webhook
    .command("events")
    .description("Print Dashboard-supported webhook event names and numeric codes")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const events = getDashboardWebhookEventCatalog();
      printResult(
        {
          count: events.length,
          events,
        },
        config.outputMode,
        events.map((event) => `${event.name}\t${event.code}`).join("\n"),
      );
    });

  webhook
    .command("list")
    .description("List Dashboard webhook endpoints for the current merchant")
    .option("--merchant-id <id>", "Merchant ID. If omitted, the CLI resolves it when exactly one merchant is visible.")
    .option("--show-secret", "Print full webhook signing keys instead of masking them")
    .action(async function (this: Command, options: { merchantId?: string; showSecret?: boolean }) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);

      if (config.dryRun) {
        const merchantId = options.merchantId ?? "[resolved-dashboard-merchant-id]";
        const merchantRequest = options.merchantId ? undefined : await client.listMerchants();
        const result = await client.listWebhooks(merchantId);
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            merchantId,
            plan: [
              merchantRequest ? { step: "resolve_merchant", result: merchantRequest } : undefined,
              { step: "list_webhooks", result },
            ].filter(Boolean),
          },
          config.outputMode,
          "Dashboard webhook list dry-run generated. Use --json to view planned requests.",
        );
        return;
      }

      const merchantContext = await resolveDashboardMerchant(client, options.merchantId);
      const result = await client.listWebhooks(merchantContext.merchantId);
      const records = extractDashboardWebhookRecords(result);
      const outputRecords = options.showSecret ? records : records.map(maskDashboardWebhookRecord);

      printResult(
        {
          profile: config.profile,
          merchantId: merchantContext.merchantId,
          merchant: merchantContext.merchant,
          count: outputRecords.length,
          webhooks: outputRecords,
        },
        config.outputMode,
        outputRecords.length > 0
          ? outputRecords.map(formatWebhookLine).join("\n")
          : `No Dashboard webhooks found for merchant ${merchantContext.merchantId}.`,
      );
    });

  webhook
    .command("create")
    .description("Create a Dashboard webhook endpoint")
    .requiredOption("--url <https-url>", "HTTPS webhook endpoint URL")
    .requiredOption("--events <events>", "Comma-separated event names, or core")
    .option("--remark <text>", "Dashboard webhook remark/description", "Created by clink-integ-cli")
    .option("--merchant-id <id>", "Merchant ID. If omitted, the CLI resolves it when exactly one merchant is visible.")
    .option("--save-secret", "Save the returned signing key into the current clink profile")
    .option("--show-secret", "Print the full signing key in command output")
    .option("--allow-unknown-events", "Allow event names not in the current Dashboard event list")
    .option("--disabled", "Create the webhook but leave it disabled")
    .action(async function (
      this: Command,
      options: {
        url: string;
        events: string;
        remark?: string;
        merchantId?: string;
        saveSecret?: boolean;
        showSecret?: boolean;
        allowUnknownEvents?: boolean;
        disabled?: boolean;
      },
    ) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);
      const endpoint = parseHttpsEndpoint(options.url);
      const eventType = parseWebhookEventType(options.events, Boolean(options.allowUnknownEvents));

      if (config.dryRun) {
        const merchantId = options.merchantId ?? "[resolved-dashboard-merchant-id]";
        const merchantRequest = options.merchantId ? undefined : await client.listMerchants();
        const createRequest = await client.createWebhook(buildWebhookPayload(endpoint, eventType, options.remark));
        const enableRequest = options.disabled
          ? undefined
          : await client.updateWebhookStatus("[created-webhook-key-id]", DASHBOARD_WEBHOOK_STATUS_ACTIVE);
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            merchantId,
            plan: [
              merchantRequest ? { step: "resolve_merchant", result: merchantRequest } : undefined,
              { step: "create_webhook", result: createRequest },
              enableRequest ? { step: "enable_webhook", result: enableRequest } : undefined,
              { step: "save_signing_key", enabled: Boolean(options.saveSecret) },
            ].filter(Boolean),
          },
          config.outputMode,
          "Dashboard webhook create dry-run generated. Use --json to view planned requests.",
        );
        return;
      }

      const merchantContext = await resolveDashboardMerchant(client, options.merchantId);
      const result = await client.createWebhook(buildWebhookPayload(endpoint, eventType, options.remark));
      const record = await enableWebhookIfRequested(
        client,
        await resolveWebhookRecordAfterWrite(client, result, merchantContext.merchantId, endpoint),
        !options.disabled,
      );
      await saveWebhookSecretIfRequested(config.profile, record, Boolean(options.saveSecret));

      const outputRecord = options.showSecret ? record : maskDashboardWebhookRecord(record);
      printResult(
        {
          profile: config.profile,
          merchantId: merchantContext.merchantId,
          saved: Boolean(options.saveSecret),
          webhook: outputRecord,
        },
        config.outputMode,
        [
          `Created Dashboard webhook: ${outputRecord.endpoint ?? endpoint}`,
          `Webhook ID: ${outputRecord.webhookKeyId ?? "unknown"}`,
          `Events: ${eventCount(outputRecord.eventType)} selected`,
          `Signing key: ${outputRecord.signKey ?? "missing"}`,
          options.saveSecret ? `Saved signing key into profile "${config.profile}".` : "Signing key was not saved. Re-run with --save-secret to store it.",
        ].join("\n"),
      );
    });

  webhook
    .command("update <webhook-key-id>")
    .description("Update a Dashboard webhook endpoint by ID")
    .requiredOption("--url <https-url>", "HTTPS webhook endpoint URL")
    .requiredOption("--events <events>", "Comma-separated event names, or core")
    .option("--remark <text>", "Dashboard webhook remark/description", "Created by clink-integ-cli")
    .option("--save-secret", "Save the resolved signing key into the current clink profile")
    .option("--show-secret", "Print the full signing key in command output")
    .option("--allow-unknown-events", "Allow event names not in the current Dashboard event list")
    .option("--disabled", "Update the webhook but leave it disabled")
    .action(async function (
      this: Command,
      webhookKeyId: string,
      options: {
        url: string;
        events: string;
        remark?: string;
        saveSecret?: boolean;
        showSecret?: boolean;
        allowUnknownEvents?: boolean;
        disabled?: boolean;
      },
    ) {
      requireOption("webhook-key-id", webhookKeyId);
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);
      const endpoint = parseHttpsEndpoint(options.url);
      const eventType = parseWebhookEventType(options.events, Boolean(options.allowUnknownEvents));

      if (config.dryRun) {
        const updateRequest = await client.updateWebhook({
          webhookKeyId,
          endpoint,
          remark: options.remark,
          eventType,
        });
        const enableRequest = options.disabled
          ? undefined
          : await client.updateWebhookStatus(webhookKeyId, DASHBOARD_WEBHOOK_STATUS_ACTIVE);
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            webhookKeyId,
            plan: [
              { step: "update_webhook", result: updateRequest },
              enableRequest ? { step: "enable_webhook", result: enableRequest } : undefined,
              { step: "save_signing_key", enabled: Boolean(options.saveSecret) },
            ].filter(Boolean),
          },
          config.outputMode,
          "Dashboard webhook update dry-run generated. Use --json to view planned requests.",
        );
        return;
      }

      const result = await client.updateWebhook({
        webhookKeyId,
        endpoint,
        remark: options.remark,
        eventType,
      });
      const record = await enableWebhookIfRequested(
        client,
        await resolveWebhookRecordAfterStatusWrite(client, result, webhookKeyId),
        !options.disabled,
      );
      await saveWebhookSecretIfRequested(config.profile, record, Boolean(options.saveSecret));

      const outputRecord = options.showSecret ? record : maskDashboardWebhookRecord(record);
      printResult(
        {
          profile: config.profile,
          saved: Boolean(options.saveSecret),
          webhook: outputRecord,
        },
        config.outputMode,
        [
          `Updated Dashboard webhook: ${outputRecord.endpoint ?? endpoint}`,
          `Webhook ID: ${outputRecord.webhookKeyId ?? webhookKeyId}`,
          `Status: ${formatWebhookStatus(outputRecord.status)}`,
          `Events: ${eventCount(outputRecord.eventType)} selected`,
          `Signing key: ${outputRecord.signKey ?? "missing"}`,
          options.saveSecret ? `Saved signing key into profile "${config.profile}".` : "Signing key was not saved. Re-run with --save-secret to store it.",
        ].join("\n"),
      );
    });

  webhook
    .command("ensure")
    .description("Create a Dashboard webhook endpoint, or update it when the URL already exists")
    .requiredOption("--url <https-url>", "HTTPS webhook endpoint URL")
    .requiredOption("--events <events>", "Comma-separated event names, or core")
    .option("--remark <text>", "Dashboard webhook remark/description", "Created by clink-integ-cli")
    .option("--merchant-id <id>", "Merchant ID. If omitted, the CLI resolves it when exactly one merchant is visible.")
    .option("--save-secret", "Save the resolved signing key into the current clink profile")
    .option("--show-secret", "Print the full signing key in command output")
    .option("--allow-unknown-events", "Allow event names not in the current Dashboard event list")
    .option("--disabled", "Create or update the webhook but leave it disabled")
    .action(async function (
      this: Command,
      options: {
        url: string;
        events: string;
        remark?: string;
        merchantId?: string;
        saveSecret?: boolean;
        showSecret?: boolean;
        allowUnknownEvents?: boolean;
        disabled?: boolean;
      },
    ) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const config = await resolveRuntimeConfig(global);
      const dashboardProfile = requireDashboardProfile(config.dashboard);
      const client = createDashboardClient(dashboardProfile, config.dryRun);
      const endpoint = parseHttpsEndpoint(options.url);
      const eventType = parseWebhookEventType(options.events, Boolean(options.allowUnknownEvents));

      if (config.dryRun) {
        const merchantId = options.merchantId ?? "[resolved-dashboard-merchant-id]";
        const merchantRequest = options.merchantId ? undefined : await client.listMerchants();
        const listRequest = await client.listWebhooks(merchantId);
        const createRequest = await client.createWebhook(buildWebhookPayload(endpoint, eventType, options.remark));
        const updateRequest = await client.updateWebhook({
          webhookKeyId: "[existing-webhook-key-id]",
          endpoint,
          remark: options.remark,
          eventType,
        });
        const enableRequest = options.disabled
          ? undefined
          : await client.updateWebhookStatus("[created-or-existing-webhook-key-id]", DASHBOARD_WEBHOOK_STATUS_ACTIVE);
        printResult(
          {
            profile: config.profile,
            dashboard: maskDashboardProfile(dashboardProfile),
            merchantId,
            plan: [
              merchantRequest ? { step: "resolve_merchant", result: merchantRequest } : undefined,
              { step: "list_webhooks", result: listRequest },
              { step: "create_if_missing", result: createRequest },
              { step: "update_if_existing_events_differ", result: updateRequest },
              enableRequest ? { step: "enable_webhook", result: enableRequest } : undefined,
              { step: "save_signing_key", enabled: Boolean(options.saveSecret) },
            ].filter(Boolean),
          },
          config.outputMode,
          "Dashboard webhook ensure dry-run generated. Use --json to view planned requests.",
        );
        return;
      }

      const merchantContext = await resolveDashboardMerchant(client, options.merchantId);
      const listResult = await client.listWebhooks(merchantContext.merchantId);
      const existing = findDashboardWebhookByEndpoint(extractDashboardWebhookRecords(listResult), endpoint);
      let source: "existing" | "updated" | "created" = "existing";
      let record: DashboardWebhookRecord;

      if (existing?.webhookKeyId) {
        const shouldUpdate =
          !sameWebhookEventType(existing.eventType, eventType) ||
          (options.remark !== undefined && existing.remark !== options.remark);
        if (shouldUpdate) {
          const updateResult = await client.updateWebhook({
            webhookKeyId: existing.webhookKeyId,
            endpoint,
            remark: options.remark,
            eventType,
          });
          record = await resolveWebhookRecordAfterWrite(client, updateResult, merchantContext.merchantId, endpoint, existing.webhookKeyId);
          source = "updated";
        } else {
          record = await resolveWebhookRecordAfterWrite(client, existing, merchantContext.merchantId, endpoint, existing.webhookKeyId);
        }
      } else {
        const createResult = await client.createWebhook(buildWebhookPayload(endpoint, eventType, options.remark));
        record = await resolveWebhookRecordAfterWrite(client, createResult, merchantContext.merchantId, endpoint);
        source = "created";
      }

      record = await enableWebhookIfRequested(client, record, !options.disabled);
      await saveWebhookSecretIfRequested(config.profile, record, Boolean(options.saveSecret));
      const outputRecord = options.showSecret ? record : maskDashboardWebhookRecord(record);

      printResult(
        {
          profile: config.profile,
          merchantId: merchantContext.merchantId,
          source,
          saved: Boolean(options.saveSecret),
          webhook: outputRecord,
        },
        config.outputMode,
        [
          `${source === "created" ? "Created" : source === "updated" ? "Updated" : "Found"} Dashboard webhook: ${outputRecord.endpoint ?? endpoint}`,
          `Webhook ID: ${outputRecord.webhookKeyId ?? "unknown"}`,
          `Events: ${eventCount(outputRecord.eventType)} selected`,
          `Signing key: ${outputRecord.signKey ?? "missing"}`,
          options.saveSecret ? `Saved signing key into profile "${config.profile}".` : "Signing key was not saved. Re-run with --save-secret to store it.",
        ].join("\n"),
      );
    });

  webhook
    .command("enable <webhook-key-id>")
    .description("Enable a Dashboard webhook endpoint")
    .action(async function (this: Command, webhookKeyId: string) {
      await updateWebhookEnabledStatus(this, webhookKeyId, true);
    });

  webhook
    .command("disable <webhook-key-id>")
    .description("Disable a Dashboard webhook endpoint")
    .action(async function (this: Command, webhookKeyId: string) {
      await updateWebhookEnabledStatus(this, webhookKeyId, false);
    });
}

function requireDashboardProfile(profile: DashboardConsoleProfile | undefined): DashboardConsoleProfile {
  if (!profile?.accessToken || !profile.clientId || !profile.baseUrl) {
    throw new Error(
      "Missing Dashboard Console token. Current official Secret Key API coverage does not include Dashboard webhook management; use public API commands with CLINK_SECRET_KEY where available, or run clink login for Dashboard-only commands.",
    );
  }
  return profile;
}

function createDashboardClient(profile: DashboardConsoleProfile, dryRun: boolean): DashboardConsoleClient {
  return new DashboardConsoleClient(
    {
      baseUrl: profile.baseUrl,
      accessToken: profile.accessToken,
      clientId: profile.clientId,
    },
    dryRun,
  );
}

function formatUser(user: DashboardConsoleProfile["user"]): string {
  if (!user) return "unknown";
  return user.email ?? user.username ?? user.userId ?? "unknown";
}

function formatMerchantLine(record: DashboardMerchantRecord): string {
  return `${record.merchantId ?? "unknown"} ${record.merchantName ?? ""}`.trim();
}

function formatWebhookLine(record: DashboardWebhookRecord): string {
  return [
    record.webhookKeyId ?? "unknown",
    record.endpoint ?? "unknown-endpoint",
    `${eventCount(record.eventType)} events`,
    `status=${formatWebhookStatus(record.status)}`,
    record.signKey ? `signKey=${record.signKey}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatWebhookStatus(status: string | number | undefined): string {
  if (String(status) === DASHBOARD_WEBHOOK_STATUS_ACTIVE) return "active";
  if (String(status) === DASHBOARD_WEBHOOK_STATUS_DISABLED) return "disabled";
  return status === undefined ? "unknown" : String(status);
}

async function updateWebhookEnabledStatus(command: Command, webhookKeyId: string, enabled: boolean): Promise<void> {
  requireOption("webhook-key-id", webhookKeyId);
  const global = command.optsWithGlobals<GlobalOptions>();
  const config = await resolveRuntimeConfig(global);
  const dashboardProfile = requireDashboardProfile(config.dashboard);
  const client = createDashboardClient(dashboardProfile, config.dryRun);
  const status = enabled ? DASHBOARD_WEBHOOK_STATUS_ACTIVE : DASHBOARD_WEBHOOK_STATUS_DISABLED;

  if (config.dryRun) {
    const result = await client.updateWebhookStatus(webhookKeyId, status);
    printResult(
      {
        profile: config.profile,
        dashboard: maskDashboardProfile(dashboardProfile),
        webhookKeyId,
        status,
        plan: [{ step: enabled ? "enable_webhook" : "disable_webhook", result }],
      },
      config.outputMode,
      `Dashboard webhook ${enabled ? "enable" : "disable"} dry-run generated. Use --json to view planned requests.`,
    );
    return;
  }

  const result = await client.updateWebhookStatus(webhookKeyId, status);
  const record = await resolveWebhookRecordAfterStatusWrite(client, result, webhookKeyId);
  const outputRecord = maskDashboardWebhookRecord(record);

  printResult(
    {
      profile: config.profile,
      webhookKeyId,
      status,
      webhook: outputRecord,
    },
    config.outputMode,
    [
      `${enabled ? "Enabled" : "Disabled"} Dashboard webhook: ${outputRecord.endpoint ?? webhookKeyId}`,
      `Webhook ID: ${outputRecord.webhookKeyId ?? webhookKeyId}`,
      `Status: ${formatWebhookStatus(outputRecord.status)}`,
    ].join("\n"),
  );
}

async function resolveDashboardMerchant(
  client: DashboardConsoleClient,
  explicitMerchantId: string | undefined,
): Promise<{ merchantId: string; merchant?: DashboardMerchantRecord }> {
  if (explicitMerchantId) return { merchantId: explicitMerchantId };

  const result = await client.listMerchants();
  const merchants = extractDashboardMerchantRecords(result).filter((record) => record.merchantId);
  if (merchants.length === 1 && merchants[0].merchantId) {
    return { merchantId: merchants[0].merchantId, merchant: merchants[0] };
  }

  if (merchants.length === 0) {
    throw new Error("No Dashboard merchant was found. Run clink dashboard merchant list, or pass --merchant-id.");
  }

  const choices = merchants.slice(0, 5).map(formatMerchantLine).join("; ");
  throw new Error(`Multiple Dashboard merchants were found. Pass --merchant-id. Candidates: ${choices}`);
}

function parseHttpsEndpoint(value: string): string {
  requireOption("--url", value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Option --url must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Option --url must start with https:// because Dashboard webhook endpoints require HTTPS.");
  }

  return url.toString();
}

function parseWebhookEventType(value: string, allowUnknownEvents: boolean): string {
  requireOption("--events", value);
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "all") {
    const allEventType = DASHBOARD_WEBHOOK_EVENTS.join(",");
    throw new Error(
      `Dashboard currently rejects all webhook events in one endpoint because the eventType string is ${allEventType.length} characters. ` +
        `Use --events core or a shorter comma-separated event list.`,
    );
  }

  const events = normalizedValue === "core"
    ? [...DASHBOARD_WEBHOOK_CORE_EVENTS]
    : value
        .split(",")
        .map((event) => event.trim())
        .filter(Boolean);

  if (events.length === 0) {
    throw new Error("Option --events must include at least one event, or core.");
  }

  if (!allowUnknownEvents) {
    const supported = new Set<string>(DASHBOARD_WEBHOOK_EVENTS);
    const unknown = events.filter((event) => !supported.has(event) && !isWebhookEventCode(event));
    if (unknown.length > 0) {
      throw new Error(`Unknown Dashboard webhook event(s): ${unknown.join(", ")}. Run clink dashboard webhook events, or pass --allow-unknown-events.`);
    }
  }

  const eventType = [...new Set(events.map(toDashboardWebhookEventCode))].join(",");
  if (eventType.length > DASHBOARD_WEBHOOK_EVENT_TYPE_MAX_LENGTH) {
    throw new Error(
      `Dashboard currently rejects webhook eventType strings longer than ${DASHBOARD_WEBHOOK_EVENT_TYPE_MAX_LENGTH} characters. ` +
        `Your selection is ${eventType.length} characters. Use --events core or a shorter comma-separated event list.`,
    );
  }

  return eventType;
}

function toDashboardWebhookEventCode(event: string): string {
  if (isWebhookEventCode(event)) return event;

  const code = DASHBOARD_WEBHOOK_EVENT_CODE_BY_NAME[event as (typeof DASHBOARD_WEBHOOK_EVENTS)[number]];
  if (code) return code;

  throw new Error(
    `Dashboard webhook event "${event}" does not have a known numeric code in this CLI build. ` +
      `Pass the Dashboard numeric code directly, or use --events core.`,
  );
}

function isWebhookEventCode(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function getDashboardWebhookEventCatalog(): Array<{ name: string; code: string }> {
  return DASHBOARD_WEBHOOK_EVENTS.map((name) => ({
    name,
    code: DASHBOARD_WEBHOOK_EVENT_CODE_BY_NAME[name],
  }));
}

function buildWebhookPayload(
  endpoint: string,
  eventType: string,
  remark: string | undefined,
): DashboardWebhookRecord {
  return {
    endpoint,
    remark,
    eventType,
    status: 0,
  };
}

async function enableWebhookIfRequested(
  client: DashboardConsoleClient,
  record: DashboardWebhookRecord,
  enabled: boolean,
): Promise<DashboardWebhookRecord> {
  if (!enabled || String(record.status) === DASHBOARD_WEBHOOK_STATUS_ACTIVE) return record;

  if (!record.webhookKeyId) {
    throw new Error("Dashboard did not return a webhook ID, so the CLI could not enable it automatically.");
  }

  const result = await client.updateWebhookStatus(record.webhookKeyId, DASHBOARD_WEBHOOK_STATUS_ACTIVE);
  return resolveWebhookRecordAfterStatusWrite(client, result, record.webhookKeyId);
}

async function resolveWebhookRecordAfterStatusWrite(
  client: DashboardConsoleClient,
  raw: unknown,
  webhookKeyId: string,
): Promise<DashboardWebhookRecord> {
  const direct = extractDashboardWebhookRecords(raw)[0];
  if (direct?.webhookKeyId || direct?.endpoint) return direct;

  try {
    const detail = await client.getWebhook(webhookKeyId);
    const detailed = extractDashboardWebhookRecords(detail)[0];
    if (detailed) return detailed;
  } catch {
    // The status update response is enough for success; keep a minimal record if detail read fails.
  }

  return { webhookKeyId, status: undefined };
}

async function resolveWebhookRecordAfterWrite(
  client: DashboardConsoleClient,
  raw: unknown,
  merchantId: string,
  endpoint: string,
  fallbackWebhookKeyId?: string,
): Promise<DashboardWebhookRecord> {
  const direct = extractDashboardWebhookRecords(raw)[0];
  const webhookKeyId = direct?.webhookKeyId ?? fallbackWebhookKeyId;

  if (webhookKeyId) {
    try {
      const detail = await client.getWebhook(webhookKeyId);
      const detailed = extractDashboardWebhookRecords(detail)[0];
      if (detailed) return detailed;
    } catch {
      // Some write responses already include the full record; fall through to list lookup.
    }
  }

  const list = await client.listWebhooks(merchantId);
  const fromList = findDashboardWebhookByEndpoint(extractDashboardWebhookRecords(list), endpoint);
  return fromList ?? direct ?? { endpoint, eventType: undefined, webhookKeyId };
}

async function saveWebhookSecretIfRequested(profile: string, record: DashboardWebhookRecord, enabled: boolean): Promise<void> {
  if (!enabled) return;
  if (!record.signKey) {
    throw new Error("Dashboard did not return a webhook signing key. Check Developers -> Webhooks in the Dashboard.");
  }

  await saveProfile(profile, { webhookSigningKey: record.signKey });
}

function eventCount(eventType: string | undefined): number {
  if (!eventType) return 0;
  return eventType.split(",").filter(Boolean).length;
}

function sameWebhookEventType(left: string | undefined, right: string | undefined): boolean {
  return normalizeWebhookEventSet(left).join(",") === normalizeWebhookEventSet(right).join(",");
}

function normalizeWebhookEventSet(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((event) => event.trim())
    .filter(Boolean)
    .sort();
}
