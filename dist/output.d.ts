import type { OutputMode } from "./types.js";
export declare function printJson(value: unknown): void;
export declare function printResult(value: unknown, mode: OutputMode, pretty?: string): void;
export declare function maskSecret(value?: string): string | undefined;
export declare function requireOption(name: string, value: unknown): asserts value;
export declare function parseNumberOption(name: string, value: string | number | undefined): number;
export declare function parseIntegerOption(name: string, value: string | number | undefined): number;
