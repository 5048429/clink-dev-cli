import type { Page, Request } from "playwright";
import { DASHBOARD_UAT_CLIENT_ID } from "./constants.js";
import { maskSecret } from "./output.js";
import type { DashboardConsoleProfile, DashboardUserSummary } from "./types.js";

const USER_INFO_PATH = "/platform/user/getInfo";
const API_KEY_LIST_PATH = "/platform/apikey/list";
const API_KEY_STANDARD_PATH = "/platform/apikey/standard";
const MERCHANT_LIST_PATH = "/platform/merchant/list";
const WEBHOOK_PATH = "/platform/webhook";
const WEBHOOK_LIST_PATH = "/platform/webhook/list";
const WEBHOOK_STATUS_PATH = "/platform/webhook/updateStatus";
const LANGUAGE = "zh_CN";

export interface DashboardCredentials {
  baseUrl: string;
  accessToken: string;
  clientId: string;
}

export interface CapturedDashboardCredentials {
  accessToken: string;
  clientId: string;
  source: "network" | "storage" | "storage+default-client";
}

export interface StorageEntry {
  area: "localStorage" | "sessionStorage";
  key: string;
  value: string;
}

interface StorageCredentials {
  accessToken?: string;
  clientId?: string;
}

export interface DashboardApiKeyRecord {
  apikeyId?: string;
  apikeyName?: string;
  keyValue?: string;
  keyType?: "PK" | "SK" | string;
  permissions?: string;
  effectiveTime?: string;
  expiryTime?: string | null;
  recentUsageTime?: string | null;
  updateTime?: string | null;
  createTime?: string;
  status?: string;
  viewFlag?: string;
  ipWhitelist?: string | null;
}

export interface DashboardMerchantRecord {
  merchantId?: string;
  merchantName?: string;
  tenantId?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface DashboardWebhookRecord {
  webhookKeyId?: string;
  merchantId?: string;
  endpoint?: string;
  remark?: string;
  eventType?: string;
  signKey?: string;
  status?: string | number;
  createTime?: string;
  updateTime?: string;
}

interface DashboardRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export class DashboardConsoleClient {
  constructor(
    private readonly credentials: DashboardCredentials,
    private readonly dryRun = false,
  ) {}

  async getInfo<T = unknown>(): Promise<T> {
    return this.request<T>("GET", USER_INFO_PATH);
  }

  async listApiKeys<T = unknown>(): Promise<T> {
    return this.request<T>("GET", API_KEY_LIST_PATH);
  }

  async initializeStandardApiKeys<T = unknown>(): Promise<T> {
    return this.request<T>("POST", API_KEY_STANDARD_PATH);
  }

  async listMerchants<T = unknown>(params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("GET", MERCHANT_LIST_PATH, { params });
  }

  async listWebhooks<T = unknown>(merchantId: string): Promise<T> {
    return this.request<T>("GET", WEBHOOK_LIST_PATH, { params: { merchantId } });
  }

  async createWebhook<T = unknown>(body: DashboardWebhookRecord): Promise<T> {
    return this.request<T>("POST", WEBHOOK_PATH, { body });
  }

  async updateWebhook<T = unknown>(body: DashboardWebhookRecord): Promise<T> {
    return this.request<T>("PUT", WEBHOOK_PATH, { body });
  }

  async updateWebhookStatus<T = unknown>(webhookKeyId: string, status: string): Promise<T> {
    return this.request<T>("PUT", WEBHOOK_STATUS_PATH, { body: { webhookKeyId, status } });
  }

  async getWebhook<T = unknown>(webhookKeyId: string): Promise<T> {
    return this.request<T>("GET", `${WEBHOOK_PATH}/${webhookKeyId}`);
  }

  async deleteWebhook<T = unknown>(webhookKeyId: string): Promise<T> {
    return this.request<T>("DELETE", `${WEBHOOK_PATH}/${webhookKeyId}`);
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: DashboardRequestOptions = {},
  ): Promise<T> {
    const url = buildDashboardApiUrl(this.credentials.baseUrl, path, options.params);
    const headers = buildDashboardHeaders(this.credentials);
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.dryRun) {
      const request: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: unknown;
      } = {
        method,
        url,
        headers: maskDashboardHeaders(headers),
      };
      if (options.body !== undefined) {
        request.body = options.body;
      }

      return {
        dryRun: true,
        request,
      } as T;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new Error(`Dashboard API ${method} ${path} network error: ${formatFetchError(error)}`);
    }
    const text = await response.text();
    const data = parseResponseBody(text);

    if (!response.ok) {
      throw new Error(`Dashboard API ${method} ${path} failed with ${response.status}: ${sanitizeDashboardText(text, this.credentials.accessToken)}`);
    }

    assertSuccessfulDashboardEnvelope(method, path, data, this.credentials.accessToken);
    return data as T;
  }
}

export async function getDashboardInfoFromPage<T = unknown>(page: Page, credentials: DashboardCredentials): Promise<T> {
  const path = USER_INFO_PATH;
  const url = buildDashboardApiUrl(credentials.baseUrl, path);
  const headers = buildDashboardHeaders(credentials);
  const result = await page.evaluate(
    async ({ headers: requestHeaders, url: requestUrl }) => {
      const response = await fetch(requestUrl, {
        method: "GET",
        headers: requestHeaders,
      });
      const text = await response.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = text;
      }

      return {
        ok: response.ok,
        status: response.status,
        text,
        data,
      };
    },
    { url, headers },
  );

  if (!result.ok) {
    throw new Error(`Dashboard browser fetch GET ${path} failed with ${result.status}: ${sanitizeDashboardText(result.text, credentials.accessToken)}`);
  }

  assertSuccessfulDashboardEnvelope("GET", path, result.data, credentials.accessToken);
  return result.data as T;
}

export function buildDashboardHeaders(credentials: Pick<DashboardCredentials, "accessToken" | "clientId">): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    ClientID: credentials.clientId,
    "Accept-Language": LANGUAGE,
    "Content-Language": LANGUAGE,
  };
}

export function maskDashboardHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    Authorization: headers.Authorization ? "Bearer [masked]" : "[missing]",
  };
}

export function maskDashboardProfile(profile: DashboardConsoleProfile): Omit<DashboardConsoleProfile, "accessToken"> & {
  accessToken: string;
} {
  return {
    ...profile,
    accessToken: maskSecret(profile.accessToken) ?? "missing",
  };
}

export function maskDashboardApiKeyRecord(record: DashboardApiKeyRecord): DashboardApiKeyRecord {
  return {
    ...record,
    keyValue: maskSecret(record.keyValue) ?? record.keyValue,
  };
}

export function maskDashboardWebhookRecord(record: DashboardWebhookRecord): DashboardWebhookRecord {
  return {
    ...record,
    signKey: maskSecret(record.signKey) ?? record.signKey,
  };
}

export function extractDashboardApiKeyRecords(raw: unknown): DashboardApiKeyRecord[] {
  return extractDashboardArray(raw).map(toDashboardApiKeyRecord);
}

export function extractDashboardMerchantRecords(raw: unknown): DashboardMerchantRecord[] {
  return extractDashboardArray(raw).map(toDashboardMerchantRecord);
}

export function extractDashboardWebhookRecords(raw: unknown): DashboardWebhookRecord[] {
  const records = extractDashboardArray(raw).map(toDashboardWebhookRecord);
  if (records.length > 0) return records;

  const record = toDashboardWebhookRecord(unwrapDashboardData(raw));
  return record.webhookKeyId || record.endpoint ? [record] : [];
}

export function findDashboardSecretKey(records: DashboardApiKeyRecord[]): DashboardApiKeyRecord | undefined {
  return records.find((record) => record.keyType === "SK" && typeof record.keyValue === "string" && record.keyValue.length > 0);
}

export function findDashboardPublishableKey(records: DashboardApiKeyRecord[]): DashboardApiKeyRecord | undefined {
  return records.find((record) => record.keyType === "PK" && typeof record.keyValue === "string" && record.keyValue.length > 0);
}

export function findDashboardWebhookByEndpoint(
  records: DashboardWebhookRecord[],
  endpoint: string,
): DashboardWebhookRecord | undefined {
  return records.find((record) => normalizeEndpoint(record.endpoint) === normalizeEndpoint(endpoint));
}

export function extractCredentialsFromDashboardRequest(request: Request): CapturedDashboardCredentials | undefined {
  if (!isUserInfoUrl(request.url())) return undefined;
  return extractCredentialsFromHeaders(request.headers());
}

export function extractCredentialsFromHeaders(headers: Record<string, string | undefined>): CapturedDashboardCredentials | undefined {
  const authorization = getHeader(headers, "authorization");
  const clientId = getHeader(headers, "clientid") ?? getHeader(headers, "client-id") ?? getHeader(headers, "client_id");
  const accessToken = normalizeBearerToken(authorization);

  if (!accessToken || !clientId) return undefined;

  return {
    accessToken,
    clientId,
    source: "network",
  };
}

export async function waitForDashboardCredentials(page: Page, timeoutMs: number): Promise<CapturedDashboardCredentials> {
  let resolved = false;
  let interval: NodeJS.Timeout | undefined;
  let timeout: NodeJS.Timeout | undefined;

  return new Promise<CapturedDashboardCredentials>((resolve, reject) => {
    const finish = (credentials: CapturedDashboardCredentials): void => {
      if (resolved) return;
      resolved = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      page.off("request", onRequest);
      resolve(credentials);
    };

    const fail = (): void => {
      if (resolved) return;
      resolved = true;
      if (interval) clearInterval(interval);
      page.off("request", onRequest);
      reject(new Error("Timed out waiting for Dashboard Console access token. Finish login in the opened browser and try again."));
    };

    const onRequest = (request: Request): void => {
      const credentials = extractCredentialsFromDashboardRequest(request);
      if (credentials) finish(credentials);
    };

    page.on("request", onRequest);
    interval = setInterval(() => {
      void readStorageCredentials(page)
        .then((credentials) => {
          if (credentials) finish(credentials);
        })
        .catch(() => {
          // Storage can be temporarily unavailable during navigation; keep waiting for network capture.
        });
    }, 1000);
    timeout = setTimeout(fail, timeoutMs);
  });
}

export async function readStorageCredentials(page: Page): Promise<CapturedDashboardCredentials | undefined> {
  const entries = await page.evaluate<StorageEntry[]>(() => {
    const snapshot = (storage: Storage, area: "localStorage" | "sessionStorage"): StorageEntry[] => {
      const result: StorageEntry[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        result.push({ area, key, value: storage.getItem(key) ?? "" });
      }
      return result;
    };

    return [...snapshot(window.localStorage, "localStorage"), ...snapshot(window.sessionStorage, "sessionStorage")];
  });

  return extractCredentialsFromStorageEntries(entries);
}

export function extractCredentialsFromStorageEntries(entries: StorageEntry[]): CapturedDashboardCredentials | undefined {
  const found = entries.reduce<StorageCredentials>((credentials, entry) => {
    const byKey = extractCredentialsFromStorageValue(entry.key, entry.value);
    return {
      accessToken: credentials.accessToken ?? byKey.accessToken,
      clientId: credentials.clientId ?? byKey.clientId,
    };
  }, {});

  if (!found.accessToken) return undefined;

  return {
    accessToken: found.accessToken,
    clientId: found.clientId ?? DASHBOARD_UAT_CLIENT_ID,
    source: found.clientId ? "storage" : "storage+default-client",
  };
}

export function extractDashboardUserSummary(raw: unknown): DashboardUserSummary {
  const payload = unwrapDashboardData(raw);
  const objectPayload = asRecord(payload);
  const user = objectPayload.user && typeof objectPayload.user === "object" ? asRecord(objectPayload.user) : objectPayload;

  return {
    userId: stringValue(user.userId),
    username: stringValue(user.userName) ?? stringValue(user.username),
    realName: stringValue(user.nickName) ?? stringValue(user.realName),
    email: stringValue(user.email),
    roles: stringArray(objectPayload.roles) ?? stringArray(user.roles),
    roleTypes: roleTypes(objectPayload.roles),
    permissions: stringArray(objectPayload.permissions),
  };
}

function buildDashboardApiUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBase);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isUserInfoUrl(url: string): boolean {
  return url.includes(USER_INFO_PATH);
}

function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value;
  }
  return undefined;
}

function normalizeBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function extractCredentialsFromStorageValue(key: string, value: string): StorageCredentials {
  const result: StorageCredentials = {};
  const keyHint = key.toLowerCase();

  if (isTokenKey(keyHint)) {
    result.accessToken = extractTokenCandidate(value);
  }

  if (isClientIdKey(keyHint)) {
    result.clientId = extractStringCandidate(value);
  }

  const parsed = parseJson(value);
  if (parsed !== undefined) {
    const nested = extractCredentialsFromUnknown(parsed);
    result.accessToken = result.accessToken ?? nested.accessToken;
    result.clientId = result.clientId ?? nested.clientId;
  }

  return result;
}

function extractCredentialsFromUnknown(value: unknown): StorageCredentials {
  if (!value || typeof value !== "object") return {};

  const result: StorageCredentials = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const keyHint = key.toLowerCase();
    if (typeof nestedValue === "string") {
      if (isTokenKey(keyHint)) {
        result.accessToken = result.accessToken ?? extractTokenCandidate(nestedValue);
      }
      if (isClientIdKey(keyHint)) {
        result.clientId = result.clientId ?? extractStringCandidate(nestedValue);
      }
    }

    if (nestedValue && typeof nestedValue === "object") {
      const nested = extractCredentialsFromUnknown(nestedValue);
      result.accessToken = result.accessToken ?? nested.accessToken;
      result.clientId = result.clientId ?? nested.clientId;
    }
  }

  return result;
}

function isTokenKey(key: string): boolean {
  return /access[_-]?token|authorization|sa-?token|satoken|tokenvalue/.test(key) || key === "token";
}

function isClientIdKey(key: string): boolean {
  return /client[_-]?id|clientid/.test(key);
}

function extractTokenCandidate(value: string): string | undefined {
  const text = normalizeBearerToken(stripQuotes(value));
  if (!text || text.length < 8) return undefined;
  return text;
}

function extractStringCandidate(value: string): string | undefined {
  const text = stripQuotes(value).trim();
  return text.length > 0 ? text : undefined;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseResponseBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function assertSuccessfulDashboardEnvelope(method: string, path: string, data: unknown, accessToken?: string): void {
  if (!data || typeof data !== "object") return;
  const envelope = data as { code?: unknown; msg?: unknown };
  if (typeof envelope.code !== "number" || envelope.code === 200) return;
  const rawMessage = typeof envelope.msg === "string" ? envelope.msg : JSON.stringify(data);
  const message = sanitizeDashboardText(rawMessage, accessToken);
  throw new Error(`Dashboard API ${method} ${path} returned code ${envelope.code}: ${message}`);
}

function unwrapDashboardData(raw: unknown): unknown {
  const record = asRecord(raw);
  if (record && "data" in record) return record.data;
  return raw;
}

function extractDashboardArray(raw: unknown): unknown[] {
  const payload = unwrapDashboardData(raw);
  const direct = firstDashboardArray(payload);
  if (direct) return direct;

  const fallback = firstDashboardArray(raw);
  if (fallback) return fallback;

  return [];
}

function firstDashboardArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;

  const record = asRecord(value);
  for (const key of ["rows", "records", "list", "voList"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toDashboardApiKeyRecord(value: unknown): DashboardApiKeyRecord {
  return asRecord(value) as DashboardApiKeyRecord;
}

function toDashboardMerchantRecord(value: unknown): DashboardMerchantRecord {
  return asRecord(value) as DashboardMerchantRecord;
}

function toDashboardWebhookRecord(value: unknown): DashboardWebhookRecord {
  return asRecord(value) as DashboardWebhookRecord;
}

function normalizeEndpoint(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/, "");
}

function sanitizeDashboardText(value: string, accessToken?: string): string {
  let sanitized = value;
  if (accessToken) {
    sanitized = sanitized.split(accessToken).join(maskSecret(accessToken) ?? "[masked]");
  }

  return sanitized.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[masked-jwt]");
}

export function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
    const host = "host" in cause && typeof cause.host === "string" ? cause.host : undefined;
    const port = "port" in cause && (typeof cause.port === "number" || typeof cause.port === "string") ? String(cause.port) : undefined;
    const details = [code, host ? `host=${host}` : undefined, port ? `port=${port}` : undefined].filter(Boolean).join(" ");
    return details ? `${error.message} (${details})` : error.message;
  }
  return error.message;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function roleTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const types = value
    .map((item) => asRecord(item).roleType)
    .filter((item): item is string => typeof item === "string" && item.length > 0);
  return types.length > 0 ? types : undefined;
}
