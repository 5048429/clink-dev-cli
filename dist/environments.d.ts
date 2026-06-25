import type { DashboardEndpoints, EnvironmentDefinition, StoredConfig } from "./types.js";
/**
 * Merge built-in environments with the user's custom environments.
 * Custom environments override built-ins with the same name.
 */
export declare function mergeEnvironments(stored: StoredConfig): Record<string, EnvironmentDefinition>;
export declare function getEnvironmentDefinition(stored: StoredConfig, name: string): EnvironmentDefinition | undefined;
export declare function isBuiltInEnvironment(name: string): boolean;
/**
 * Resolve the Dashboard Console endpoints for an environment, falling back to the
 * UAT defaults for any field the environment does not define.
 */
export declare function resolveDashboardEndpoints(def?: EnvironmentDefinition): DashboardEndpoints;
