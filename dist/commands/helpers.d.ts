import type { Command } from "commander";
import { ClinkApiClient } from "../api/client.js";
import type { RuntimeConfig } from "../types.js";
export declare function getCommandContext(command: Command): Promise<{
    config: RuntimeConfig;
    client: ClinkApiClient;
}>;
export declare function parseMetadata(values: string[] | undefined): Record<string, string> | undefined;
export declare function collect(value: string, previous: string[]): string[];
export declare function readJsonInput(options: {
    data?: string;
    dataFile?: string;
}): Promise<unknown | undefined>;
export declare function parseQuery(values: string[] | undefined): Record<string, string | number | boolean> | undefined;
export declare function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>): string;
