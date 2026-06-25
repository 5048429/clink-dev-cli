import type { GlobalOptions, RuntimeConfig, StoredConfig, StoredProfile } from "./types.js";
export declare function getConfigPath(): string;
export declare function readStoredConfig(): Promise<StoredConfig>;
export declare function writeStoredConfig(config: StoredConfig): Promise<void>;
export declare function resolveSecretRef(value: string | undefined, envFallbacks: string[]): {
    secret?: string;
    source?: string;
    envName?: string;
    literal?: string;
};
export declare function getProfile(name: string): Promise<StoredProfile>;
export declare function saveProfile(name: string, profile: StoredProfile): Promise<void>;
export declare function resolveRuntimeConfig(options: GlobalOptions): Promise<RuntimeConfig>;
export declare function normalizeBaseUrl(value: string): string;
