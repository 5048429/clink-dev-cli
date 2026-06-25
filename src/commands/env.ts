import type { Command } from "commander";
import { getConfigPath, normalizeBaseUrl, readStoredConfig, writeStoredConfig } from "../config.js";
import {
  getEnvironmentDefinition,
  isBuiltInEnvironment,
  mergeEnvironments,
  resolveDashboardEndpoints,
} from "../environments.js";
import { printResult, requireOption } from "../output.js";
import type { EnvironmentDefinition, GlobalOptions } from "../types.js";

const ENV_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function registerEnv(program: Command): void {
  const env = program.command("env").description("Manage Clink API environments (request domains)");

  env
    .command("list")
    .description("List built-in and custom environments")
    .action(async function (this: Command) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const outputMode = global.json ? "json" : "pretty";
      const stored = await readStoredConfig();
      const merged = mergeEnvironments(stored);

      const environments = Object.entries(merged).map(([name, def]) => ({
        name,
        builtIn: isBuiltInEnvironment(name),
        apiBaseUrl: def.apiBaseUrl,
        dashboardBaseUrl: resolveDashboardEndpoints(def).baseUrl,
      }));

      printResult(
        { count: environments.length, environments },
        outputMode,
        environments
          .map((item) => `${item.name}${item.builtIn ? " (built-in)" : ""}\t${item.apiBaseUrl}`)
          .join("\n"),
      );
    });

  env
    .command("show <name>")
    .description("Show the resolved configuration for an environment")
    .action(async function (this: Command, name: string) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const outputMode = global.json ? "json" : "pretty";
      const stored = await readStoredConfig();
      const def = getEnvironmentDefinition(stored, name);
      if (!def) {
        throw new Error(`Unknown environment "${name}". Run clink env list to see available environments.`);
      }

      const dashboard = resolveDashboardEndpoints(def);
      printResult(
        {
          name,
          builtIn: isBuiltInEnvironment(name),
          apiBaseUrl: def.apiBaseUrl,
          dashboard,
        },
        outputMode,
        [
          `Environment: ${name}${isBuiltInEnvironment(name) ? " (built-in)" : ""}`,
          `API base URL: ${def.apiBaseUrl}`,
          `Dashboard API: ${dashboard.baseUrl}`,
          `Dashboard login: ${dashboard.loginUrl}`,
          `Dashboard ClientID: ${dashboard.clientId}`,
        ].join("\n"),
      );
    });

  env
    .command("add <name>")
    .description("Add or update a custom environment")
    .requiredOption("--api-base-url <url>", "Clink API base URL for this environment")
    .option("--dashboard-base-url <url>", "Dashboard Console API base URL")
    .option("--dashboard-login-url <url>", "Dashboard Console browser login URL")
    .option("--dashboard-client-id <id>", "Dashboard Console ClientID header value")
    .option("--force", "Allow overriding a built-in environment name")
    .action(async function (
      this: Command,
      name: string,
      options: {
        apiBaseUrl: string;
        dashboardBaseUrl?: string;
        dashboardLoginUrl?: string;
        dashboardClientId?: string;
        force?: boolean;
      },
    ) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const outputMode = global.json ? "json" : "pretty";

      if (!ENV_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid environment name "${name}". Use letters, digits, "-" or "_".`);
      }
      if (isBuiltInEnvironment(name) && !options.force) {
        throw new Error(`"${name}" is a built-in environment. Pass --force to override it locally.`);
      }

      requireOption("--api-base-url", options.apiBaseUrl);
      const definition: EnvironmentDefinition = {
        apiBaseUrl: normalizeBaseUrl(validateUrl("--api-base-url", options.apiBaseUrl)),
      };
      if (options.dashboardBaseUrl) {
        definition.dashboardBaseUrl = normalizeBaseUrl(validateUrl("--dashboard-base-url", options.dashboardBaseUrl));
      }
      if (options.dashboardLoginUrl) {
        definition.dashboardLoginUrl = validateUrl("--dashboard-login-url", options.dashboardLoginUrl);
      }
      if (options.dashboardClientId) {
        definition.dashboardClientId = options.dashboardClientId;
      }

      const stored = await readStoredConfig();
      stored.environments = { ...(stored.environments ?? {}), [name]: definition };
      await writeStoredConfig(stored);

      printResult(
        { name, environment: definition, configPath: getConfigPath() },
        outputMode,
        [
          `Saved environment "${name}" at ${getConfigPath()}`,
          `API base URL: ${definition.apiBaseUrl}`,
          `Use it with: clink --env ${name} <command>`,
        ].join("\n"),
      );
    });

  env
    .command("remove <name>")
    .description("Remove a custom environment")
    .action(async function (this: Command, name: string) {
      const global = this.optsWithGlobals<GlobalOptions>();
      const outputMode = global.json ? "json" : "pretty";

      if (isBuiltInEnvironment(name)) {
        throw new Error(`"${name}" is a built-in environment and cannot be removed.`);
      }

      const stored = await readStoredConfig();
      if (!stored.environments?.[name]) {
        throw new Error(`Unknown custom environment "${name}". Run clink env list to see available environments.`);
      }

      delete stored.environments[name];
      await writeStoredConfig(stored);

      printResult(
        { name, removed: true, configPath: getConfigPath() },
        outputMode,
        `Removed environment "${name}" from ${getConfigPath()}`,
      );
    });
}

function validateUrl(option: string, value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Option ${option} must be a valid URL`);
  }
}
