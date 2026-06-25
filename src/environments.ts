import {
  BUILT_IN_ENVIRONMENTS,
  DASHBOARD_UAT_BASE_URL,
  DASHBOARD_UAT_CLIENT_ID,
  DASHBOARD_UAT_LOGIN_URL,
} from "./constants.js";
import type { DashboardEndpoints, EnvironmentDefinition, StoredConfig } from "./types.js";

/**
 * Merge built-in environments with the user's custom environments.
 * Custom environments override built-ins with the same name.
 */
export function mergeEnvironments(stored: StoredConfig): Record<string, EnvironmentDefinition> {
  return {
    ...BUILT_IN_ENVIRONMENTS,
    ...(stored.environments ?? {}),
  };
}

export function getEnvironmentDefinition(stored: StoredConfig, name: string): EnvironmentDefinition | undefined {
  return mergeEnvironments(stored)[name];
}

export function isBuiltInEnvironment(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_ENVIRONMENTS, name);
}

/**
 * Resolve the Dashboard Console endpoints for an environment, falling back to the
 * UAT defaults for any field the environment does not define.
 */
export function resolveDashboardEndpoints(def?: EnvironmentDefinition): DashboardEndpoints {
  return {
    baseUrl: def?.dashboardBaseUrl ?? DASHBOARD_UAT_BASE_URL,
    loginUrl: def?.dashboardLoginUrl ?? DASHBOARD_UAT_LOGIN_URL,
    clientId: def?.dashboardClientId ?? DASHBOARD_UAT_CLIENT_ID,
  };
}
