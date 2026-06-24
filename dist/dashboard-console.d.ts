import type { Page, Request } from "playwright";
import type { DashboardConsoleProfile, DashboardUserSummary } from "./types.js";
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
export declare class DashboardConsoleClient {
    private readonly credentials;
    private readonly dryRun;
    constructor(credentials: DashboardCredentials, dryRun?: boolean);
    getInfo<T = unknown>(): Promise<T>;
    listApiKeys<T = unknown>(): Promise<T>;
    initializeStandardApiKeys<T = unknown>(): Promise<T>;
    listMerchants<T = unknown>(params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    listWebhooks<T = unknown>(merchantId: string): Promise<T>;
    createWebhook<T = unknown>(body: DashboardWebhookRecord): Promise<T>;
    updateWebhook<T = unknown>(body: DashboardWebhookRecord): Promise<T>;
    updateWebhookStatus<T = unknown>(webhookKeyId: string, status: string): Promise<T>;
    getWebhook<T = unknown>(webhookKeyId: string): Promise<T>;
    deleteWebhook<T = unknown>(webhookKeyId: string): Promise<T>;
    request<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, options?: DashboardRequestOptions): Promise<T>;
}
export declare function getDashboardInfoFromPage<T = unknown>(page: Page, credentials: DashboardCredentials): Promise<T>;
export declare function buildDashboardHeaders(credentials: Pick<DashboardCredentials, "accessToken" | "clientId">): Record<string, string>;
export declare function maskDashboardHeaders(headers: Record<string, string>): Record<string, string>;
export declare function maskDashboardProfile(profile: DashboardConsoleProfile): Omit<DashboardConsoleProfile, "accessToken"> & {
    accessToken: string;
};
export declare function maskDashboardApiKeyRecord(record: DashboardApiKeyRecord): DashboardApiKeyRecord;
export declare function maskDashboardWebhookRecord(record: DashboardWebhookRecord): DashboardWebhookRecord;
export declare function extractDashboardApiKeyRecords(raw: unknown): DashboardApiKeyRecord[];
export declare function extractDashboardMerchantRecords(raw: unknown): DashboardMerchantRecord[];
export declare function extractDashboardWebhookRecords(raw: unknown): DashboardWebhookRecord[];
export declare function findDashboardSecretKey(records: DashboardApiKeyRecord[]): DashboardApiKeyRecord | undefined;
export declare function findDashboardPublishableKey(records: DashboardApiKeyRecord[]): DashboardApiKeyRecord | undefined;
export declare function findDashboardWebhookByEndpoint(records: DashboardWebhookRecord[], endpoint: string): DashboardWebhookRecord | undefined;
export declare function extractCredentialsFromDashboardRequest(request: Request): CapturedDashboardCredentials | undefined;
export declare function extractCredentialsFromHeaders(headers: Record<string, string | undefined>): CapturedDashboardCredentials | undefined;
export declare function waitForDashboardCredentials(page: Page, timeoutMs: number): Promise<CapturedDashboardCredentials>;
export declare function readStorageCredentials(page: Page): Promise<CapturedDashboardCredentials | undefined>;
export declare function extractCredentialsFromStorageEntries(entries: StorageEntry[]): CapturedDashboardCredentials | undefined;
export declare function extractDashboardUserSummary(raw: unknown): DashboardUserSummary;
export declare function formatFetchError(error: unknown): string;
export {};
