import type { Command } from "commander";
type RegisterWebhookEndpointOptions = {
    legacyDashboardOptions?: boolean;
};
export declare function registerWebhookEndpointSubcommands(parent: Command, options?: RegisterWebhookEndpointOptions): void;
export {};
