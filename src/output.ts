import type { OutputMode } from "./types.js";

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printResult(value: unknown, mode: OutputMode, pretty?: string): void {
  if (mode === "json") {
    printJson(value);
    return;
  }

  if (pretty) {
    console.log(pretty);
    return;
  }

  printJson(value);
}

export function maskSecret(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function requireOption(name: string, value: unknown): asserts value {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required option: ${name}`);
  }
}

export function parseNumberOption(name: string, value: string | number | undefined): number {
  requireOption(name, value);
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Option ${name} must be a number`);
  }
  return parsed;
}

export function parseIntegerOption(name: string, value: string | number | undefined): number {
  const parsed = parseNumberOption(name, value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Option ${name} must be an integer`);
  }
  return parsed;
}

