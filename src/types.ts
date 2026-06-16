export type ClinkEnvironment = "sandbox" | "production";

export type OutputMode = "pretty" | "json";

export interface GlobalOptions {
  json?: boolean;
  profile?: string;
  env?: ClinkEnvironment;
  baseUrl?: string;
  apiKey?: string;
  dryRun?: boolean;
}

export interface RuntimeConfig {
  profile: string;
  environment: ClinkEnvironment;
  baseUrl: string;
  apiKey?: string;
  apiKeySource?: string;
  webhookSigningKey?: string;
  webhookSigningKeySource?: string;
  dryRun: boolean;
  outputMode: OutputMode;
}

export interface StoredProfile {
  environment?: ClinkEnvironment;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  webhookSigningKey?: string;
  webhookSigningKeyEnv?: string;
}

export interface StoredConfig {
  defaultProfile?: string;
  profiles: Record<string, StoredProfile>;
}

