import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BASE_URLS, DEFAULT_PROFILE } from "./constants.js";
const DEFAULT_CONFIG_PATH = join(homedir(), ".clink-dev-cli", "config.json");
function emptyConfig() {
    return {
        defaultProfile: DEFAULT_PROFILE,
        profiles: {},
    };
}
export function getConfigPath() {
    return process.env.CLINK_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}
export async function readStoredConfig() {
    try {
        const raw = await readFile(getConfigPath(), "utf8");
        const parsed = JSON.parse(raw);
        return {
            defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
            profiles: parsed.profiles ?? {},
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return emptyConfig();
        }
        throw error;
    }
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
    const profile = await getProfile(profileName);
    const environment = options.env ?? profile.environment ?? readEnvironmentFromEnv() ?? "sandbox";
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? profile.baseUrl ?? process.env.CLINK_BASE_URL ?? BASE_URLS[environment]);
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
        webhookSigningKey: profileWebhookKey.secret ?? envWebhookKey.secret,
        webhookSigningKeySource: profileWebhookKey.source ?? envWebhookKey.source,
        dryRun: Boolean(options.dryRun),
        outputMode: options.json ? "json" : "pretty",
    };
}
function readEnvironmentFromEnv() {
    const raw = process.env.CLINK_ENV;
    if (raw === "sandbox" || raw === "production")
        return raw;
    return undefined;
}
function normalizeBaseUrl(value) {
    return value.endsWith("/") ? value : `${value}/`;
}
//# sourceMappingURL=config.js.map