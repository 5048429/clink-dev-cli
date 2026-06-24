import { DASHBOARD_UAT_CLIENT_ID } from "./constants.js";
import { maskSecret } from "./output.js";
const USER_INFO_PATH = "/platform/user/getInfo";
const API_KEY_LIST_PATH = "/platform/apikey/list";
const API_KEY_STANDARD_PATH = "/platform/apikey/standard";
const MERCHANT_LIST_PATH = "/platform/merchant/list";
const WEBHOOK_PATH = "/platform/webhook";
const WEBHOOK_LIST_PATH = "/platform/webhook/list";
const WEBHOOK_STATUS_PATH = "/platform/webhook/updateStatus";
const LANGUAGE = "zh_CN";
export class DashboardConsoleClient {
    credentials;
    dryRun;
    constructor(credentials, dryRun = false) {
        this.credentials = credentials;
        this.dryRun = dryRun;
    }
    async getInfo() {
        return this.request("GET", USER_INFO_PATH);
    }
    async listApiKeys() {
        return this.request("GET", API_KEY_LIST_PATH);
    }
    async initializeStandardApiKeys() {
        return this.request("POST", API_KEY_STANDARD_PATH);
    }
    async listMerchants(params) {
        return this.request("GET", MERCHANT_LIST_PATH, { params });
    }
    async listWebhooks(merchantId) {
        return this.request("GET", WEBHOOK_LIST_PATH, { params: { merchantId } });
    }
    async createWebhook(body) {
        return this.request("POST", WEBHOOK_PATH, { body });
    }
    async updateWebhook(body) {
        return this.request("PUT", WEBHOOK_PATH, { body });
    }
    async updateWebhookStatus(webhookKeyId, status) {
        return this.request("PUT", WEBHOOK_STATUS_PATH, { body: { webhookKeyId, status } });
    }
    async getWebhook(webhookKeyId) {
        return this.request("GET", `${WEBHOOK_PATH}/${webhookKeyId}`);
    }
    async deleteWebhook(webhookKeyId) {
        return this.request("DELETE", `${WEBHOOK_PATH}/${webhookKeyId}`);
    }
    async request(method, path, options = {}) {
        const url = buildDashboardApiUrl(this.credentials.baseUrl, path, options.params);
        const headers = buildDashboardHeaders(this.credentials);
        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }
        if (this.dryRun) {
            const request = {
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
            };
        }
        let response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
            });
        }
        catch (error) {
            throw new Error(`Dashboard API ${method} ${path} network error: ${formatFetchError(error)}`);
        }
        const text = await response.text();
        const data = parseResponseBody(text);
        if (!response.ok) {
            throw new Error(`Dashboard API ${method} ${path} failed with ${response.status}: ${sanitizeDashboardText(text, this.credentials.accessToken)}`);
        }
        assertSuccessfulDashboardEnvelope(method, path, data, this.credentials.accessToken);
        return data;
    }
}
export async function getDashboardInfoFromPage(page, credentials) {
    const path = USER_INFO_PATH;
    const url = buildDashboardApiUrl(credentials.baseUrl, path);
    const headers = buildDashboardHeaders(credentials);
    const result = await page.evaluate(async ({ headers: requestHeaders, url: requestUrl }) => {
        const response = await fetch(requestUrl, {
            method: "GET",
            headers: requestHeaders,
        });
        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        }
        catch {
            data = text;
        }
        return {
            ok: response.ok,
            status: response.status,
            text,
            data,
        };
    }, { url, headers });
    if (!result.ok) {
        throw new Error(`Dashboard browser fetch GET ${path} failed with ${result.status}: ${sanitizeDashboardText(result.text, credentials.accessToken)}`);
    }
    assertSuccessfulDashboardEnvelope("GET", path, result.data, credentials.accessToken);
    return result.data;
}
export function buildDashboardHeaders(credentials) {
    return {
        Authorization: `Bearer ${credentials.accessToken}`,
        ClientID: credentials.clientId,
        "Accept-Language": LANGUAGE,
        "Content-Language": LANGUAGE,
    };
}
export function maskDashboardHeaders(headers) {
    return {
        ...headers,
        Authorization: headers.Authorization ? "Bearer [masked]" : "[missing]",
    };
}
export function maskDashboardProfile(profile) {
    return {
        ...profile,
        accessToken: maskSecret(profile.accessToken) ?? "missing",
    };
}
export function maskDashboardApiKeyRecord(record) {
    return {
        ...record,
        keyValue: maskSecret(record.keyValue) ?? record.keyValue,
    };
}
export function maskDashboardWebhookRecord(record) {
    return {
        ...record,
        signKey: maskSecret(record.signKey) ?? record.signKey,
    };
}
export function extractDashboardApiKeyRecords(raw) {
    return extractDashboardArray(raw).map(toDashboardApiKeyRecord);
}
export function extractDashboardMerchantRecords(raw) {
    return extractDashboardArray(raw).map(toDashboardMerchantRecord);
}
export function extractDashboardWebhookRecords(raw) {
    const records = extractDashboardArray(raw).map(toDashboardWebhookRecord);
    if (records.length > 0)
        return records;
    const record = toDashboardWebhookRecord(unwrapDashboardData(raw));
    return record.webhookKeyId || record.endpoint ? [record] : [];
}
export function findDashboardSecretKey(records) {
    return records.find((record) => record.keyType === "SK" && typeof record.keyValue === "string" && record.keyValue.length > 0);
}
export function findDashboardPublishableKey(records) {
    return records.find((record) => record.keyType === "PK" && typeof record.keyValue === "string" && record.keyValue.length > 0);
}
export function findDashboardWebhookByEndpoint(records, endpoint) {
    return records.find((record) => normalizeEndpoint(record.endpoint) === normalizeEndpoint(endpoint));
}
export function extractCredentialsFromDashboardRequest(request) {
    if (!isUserInfoUrl(request.url()))
        return undefined;
    return extractCredentialsFromHeaders(request.headers());
}
export function extractCredentialsFromHeaders(headers) {
    const authorization = getHeader(headers, "authorization");
    const clientId = getHeader(headers, "clientid") ?? getHeader(headers, "client-id") ?? getHeader(headers, "client_id");
    const accessToken = normalizeBearerToken(authorization);
    if (!accessToken || !clientId)
        return undefined;
    return {
        accessToken,
        clientId,
        source: "network",
    };
}
export async function waitForDashboardCredentials(page, timeoutMs) {
    let resolved = false;
    let interval;
    let timeout;
    return new Promise((resolve, reject) => {
        const finish = (credentials) => {
            if (resolved)
                return;
            resolved = true;
            if (interval)
                clearInterval(interval);
            if (timeout)
                clearTimeout(timeout);
            page.off("request", onRequest);
            resolve(credentials);
        };
        const fail = () => {
            if (resolved)
                return;
            resolved = true;
            if (interval)
                clearInterval(interval);
            page.off("request", onRequest);
            reject(new Error("Timed out waiting for Dashboard Console access token. Finish login in the opened browser and try again."));
        };
        const onRequest = (request) => {
            const credentials = extractCredentialsFromDashboardRequest(request);
            if (credentials)
                finish(credentials);
        };
        page.on("request", onRequest);
        interval = setInterval(() => {
            void readStorageCredentials(page)
                .then((credentials) => {
                if (credentials)
                    finish(credentials);
            })
                .catch(() => {
                // Storage can be temporarily unavailable during navigation; keep waiting for network capture.
            });
        }, 1000);
        timeout = setTimeout(fail, timeoutMs);
    });
}
export async function readStorageCredentials(page) {
    const entries = await page.evaluate(() => {
        const snapshot = (storage, area) => {
            const result = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (!key)
                    continue;
                result.push({ area, key, value: storage.getItem(key) ?? "" });
            }
            return result;
        };
        return [...snapshot(window.localStorage, "localStorage"), ...snapshot(window.sessionStorage, "sessionStorage")];
    });
    return extractCredentialsFromStorageEntries(entries);
}
export function extractCredentialsFromStorageEntries(entries) {
    const found = entries.reduce((credentials, entry) => {
        const byKey = extractCredentialsFromStorageValue(entry.key, entry.value);
        return {
            accessToken: credentials.accessToken ?? byKey.accessToken,
            clientId: credentials.clientId ?? byKey.clientId,
        };
    }, {});
    if (!found.accessToken)
        return undefined;
    return {
        accessToken: found.accessToken,
        clientId: found.clientId ?? DASHBOARD_UAT_CLIENT_ID,
        source: found.clientId ? "storage" : "storage+default-client",
    };
}
export function extractDashboardUserSummary(raw) {
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
function buildDashboardApiUrl(baseUrl, path, query) {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL(path.replace(/^\//, ""), normalizedBase);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}
function isUserInfoUrl(url) {
    return url.includes(USER_INFO_PATH);
}
function getHeader(headers, name) {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerName)
            return value;
    }
    return undefined;
}
function normalizeBearerToken(value) {
    if (!value)
        return undefined;
    const trimmed = value.trim();
    const match = /^Bearer\s+(.+)$/i.exec(trimmed);
    return match ? match[1].trim() : trimmed;
}
function extractCredentialsFromStorageValue(key, value) {
    const result = {};
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
function extractCredentialsFromUnknown(value) {
    if (!value || typeof value !== "object")
        return {};
    const result = {};
    for (const [key, nestedValue] of Object.entries(value)) {
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
function isTokenKey(key) {
    return /access[_-]?token|authorization|sa-?token|satoken|tokenvalue/.test(key) || key === "token";
}
function isClientIdKey(key) {
    return /client[_-]?id|clientid/.test(key);
}
function extractTokenCandidate(value) {
    const text = normalizeBearerToken(stripQuotes(value));
    if (!text || text.length < 8)
        return undefined;
    return text;
}
function extractStringCandidate(value) {
    const text = stripQuotes(value).trim();
    return text.length > 0 ? text : undefined;
}
function stripQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function parseResponseBody(text) {
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function assertSuccessfulDashboardEnvelope(method, path, data, accessToken) {
    if (!data || typeof data !== "object")
        return;
    const envelope = data;
    if (typeof envelope.code !== "number" || envelope.code === 200)
        return;
    const rawMessage = typeof envelope.msg === "string" ? envelope.msg : JSON.stringify(data);
    const message = sanitizeDashboardText(rawMessage, accessToken);
    throw new Error(`Dashboard API ${method} ${path} returned code ${envelope.code}: ${message}`);
}
function unwrapDashboardData(raw) {
    const record = asRecord(raw);
    if (record && "data" in record)
        return record.data;
    return raw;
}
function extractDashboardArray(raw) {
    const payload = unwrapDashboardData(raw);
    const direct = firstDashboardArray(payload);
    if (direct)
        return direct;
    const fallback = firstDashboardArray(raw);
    if (fallback)
        return fallback;
    return [];
}
function firstDashboardArray(value) {
    if (Array.isArray(value))
        return value;
    const record = asRecord(value);
    for (const key of ["rows", "records", "list", "voList"]) {
        const nested = record[key];
        if (Array.isArray(nested))
            return nested;
    }
    return undefined;
}
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function toDashboardApiKeyRecord(value) {
    return asRecord(value);
}
function toDashboardMerchantRecord(value) {
    return asRecord(value);
}
function toDashboardWebhookRecord(value) {
    return asRecord(value);
}
function normalizeEndpoint(value) {
    return value?.replace(/\/+$/, "");
}
function sanitizeDashboardText(value, accessToken) {
    let sanitized = value;
    if (accessToken) {
        sanitized = sanitized.split(accessToken).join(maskSecret(accessToken) ?? "[masked]");
    }
    return sanitized.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[masked-jwt]");
}
export function formatFetchError(error) {
    if (!(error instanceof Error))
        return String(error);
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
function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function stringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const strings = value.filter((item) => typeof item === "string");
    return strings.length > 0 ? strings : undefined;
}
function roleTypes(value) {
    if (!Array.isArray(value))
        return undefined;
    const types = value
        .map((item) => asRecord(item).roleType)
        .filter((item) => typeof item === "string" && item.length > 0);
    return types.length > 0 ? types : undefined;
}
//# sourceMappingURL=dashboard-console.js.map