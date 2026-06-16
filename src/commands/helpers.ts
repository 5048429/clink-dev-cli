import type { Command } from "commander";
import { ClinkApiClient } from "../api/client.js";
import { resolveRuntimeConfig } from "../config.js";
import type { GlobalOptions, RuntimeConfig } from "../types.js";

export async function getCommandContext(command: Command): Promise<{
  config: RuntimeConfig;
  client: ClinkApiClient;
}> {
  const options = command.optsWithGlobals<GlobalOptions>();
  const config = await resolveRuntimeConfig(options);
  return {
    config,
    client: new ClinkApiClient(config),
  };
}

export function parseMetadata(values: string[] | undefined): Record<string, string> | undefined {
  if (!values || values.length === 0) return undefined;
  const metadata: Record<string, string> = {};

  for (const value of values) {
    const [key, ...rest] = value.split("=");
    if (!key || rest.length === 0) {
      throw new Error(`Invalid metadata "${value}". Use key=value.`);
    }
    metadata[key] = rest.join("=");
  }

  return metadata;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

