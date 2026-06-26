import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BASE_URLS, DEFAULT_PROFILE } from "./constants.js";
import { getEnvironmentDefinition, resolveDashboardEndpoints } from "./environments.js";
function emptyConfig() {
    return {
        defaultProfile: DEFAULT_PROFILE,
        profiles: {},
    };
}
export function getConfigPath() {
    return process.env.CLINK_CONFIG_PATH || defaultConfigPath();
}
export async function readStoredConfig() {
    try {
        const raw = await readFile(getConfigPath(), "utf8");
        const parsed = JSON.parse(raw);
        return {
            defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
            profiles: parsed.profiles ?? {},
            environments: parsed.environments ?? {},
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            if (!process.env.CLINK_CONFIG_PATH) {
                return readLegacyStoredConfig();
            }
            return emptyConfig();
        }
        throw error;
    }
}
async function readLegacyStoredConfig() {
    try {
        const raw = await readFile(legacyConfigPath(), "utf8");
        const parsed = JSON.parse(raw);
        return {
            defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
            profiles: parsed.profiles ?? {},
            environments: parsed.environments ?? {},
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return emptyConfig();
        }
        throw error;
    }
}
function defaultConfigPath() {
    return join(homedir(), ".clink-integ-cli", "config.json");
}
function legacyConfigPath() {
    return join(homedir(), ".clink-dev-cli", "config.json");
}
export async function writeStoredConfig(config) {
    const configPath = getConfigPath();
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
export function resolveSecretRef(value, envFallbacks) {
    if (value) {
        if (value.startsWith("env:")) {
            const envName = value.slice("env:".length);
            return { secret: process.env[envName], source: `env:${envName}`, envName };
        }
        return { secret: value, source: "literal", literal: value };
    }
    for (const envName of envFallbacks) {
        if (process.env[envName]) {
            return { secret: process.env[envName], source: `env:${envName}`, envName };
        }
    }
    return {};
}
export async function getProfile(name) {
    const config = await readStoredConfig();
    return config.profiles[name] ?? {};
}
export async function saveProfile(name, profile) {
    const config = await readStoredConfig();
    config.defaultProfile = config.defaultProfile ?? DEFAULT_PROFILE;
    config.profiles[name] = {
        ...(config.profiles[name] ?? {}),
        ...profile,
    };
    await writeStoredConfig(config);
}
export async function resolveRuntimeConfig(options) {
    const profileName = options.profile ?? DEFAULT_PROFILE;
    const stored = await readStoredConfig();
    const profile = stored.profiles[profileName] ?? {};
    const environment = options.env ?? profile.environment ?? readEnvironmentFromEnv() ?? "sandbox";
    const envDef = getEnvironmentDefinition(stored, environment);
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? profile.baseUrl ?? process.env.CLINK_BASE_URL ?? envDef?.apiBaseUrl ?? BASE_URLS.sandbox);
    const dashboardEndpoints = resolveDashboardEndpoints(envDef);
    const apiKeyRef = resolveSecretRef(options.apiKey, ["CLINK_SECRET_KEY", "CLINK_API_KEY"]);
    const profileApiKey = profile.apiKeyEnv
        ? resolveSecretRef(`env:${profile.apiKeyEnv}`, [])
        : resolveSecretRef(profile.apiKey, []);
    const apiKey = apiKeyRef.secret ?? profileApiKey.secret;
    const apiKeySource = apiKeyRef.source ?? profileApiKey.source;
    const profileWebhookKey = profile.webhookSigningKeyEnv
        ? resolveSecretRef(`env:${profile.webhookSigningKeyEnv}`, [])
        : resolveSecretRef(profile.webhookSigningKey, []);
    const envWebhookKey = resolveSecretRef(undefined, ["CLINK_WEBHOOK_SIGNING_KEY", "CLINK_WEBHOOK_SECRET"]);
    return {
        profile: profileName,
        environment,
        baseUrl,
        apiKey,
        apiKeySource,
        dashboard: profile.dashboard,
        dashboardEndpoints,
        webhookSigningKey: profileWebhookKey.secret ?? envWebhookKey.secret,
        webhookSigningKeySource: profileWebhookKey.source ?? envWebhookKey.source,
        dryRun: Boolean(options.dryRun),
        outputMode: options.json ? "json" : "pretty",
    };
}
function readEnvironmentFromEnv() {
    const raw = process.env.CLINK_ENV?.trim();
    return raw ? raw : undefined;
}
export function normalizeBaseUrl(value) {
    return value.endsWith("/") ? value : `${value}/`;
}
//# sourceMappingURL=config.js.map