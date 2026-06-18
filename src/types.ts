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
  dashboard?: DashboardConsoleProfile;
  webhookSigningKey?: string;
  webhookSigningKeySource?: string;
  dryRun: boolean;
  outputMode: OutputMode;
}

export interface DashboardUserSummary {
  userId?: string;
  username?: string;
  realName?: string;
  email?: string;
  roles?: string[];
  roleTypes?: string[];
  permissions?: string[];
}

export interface DashboardConsoleProfile {
  baseUrl: string;
  loginUrl?: string;
  clientId: string;
  accessToken: string;
  tokenSource?: string;
  savedAt: string;
  user?: DashboardUserSummary;
}

export interface StoredProfile {
  environment?: ClinkEnvironment;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  dashboard?: DashboardConsoleProfile;
  webhookSigningKey?: string;
  webhookSigningKeyEnv?: string;
}

export interface StoredConfig {
  defaultProfile?: string;
  profiles: Record<string, StoredProfile>;
}
