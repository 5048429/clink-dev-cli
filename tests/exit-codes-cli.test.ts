import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyError, ExitCode } from "../src/exit-codes.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runClink(args: string[]): CliResult {
  const tempConfig = join(tmpdir(), `clink-cli-test-${process.pid}-${Date.now()}`, "config.json");
  mkdirSync(dirname(tempConfig), { recursive: true });

  const env = {
    ...process.env,
    CLINK_CONFIG_PATH: tempConfig,
    CLINK_SECRET_KEY: "",
    CLINK_API_KEY: "",
    CLINK_WEBHOOK_SIGNING_KEY: "",
    CLINK_WEBHOOK_SECRET: "",
  };

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });

  rmSync(dirname(tempConfig), { recursive: true, force: true });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseJsonError(stderr: string): { ok: false; error: string; exitCode: number } {
  return JSON.parse(stderr) as { ok: false; error: string; exitCode: number };
}

describe("exit code classification", () => {
  it("maps common failures to stable exit codes", () => {
    expect(classifyError(new Error("Unknown command nope"))).toBe(ExitCode.USAGE);
    expect(classifyError(new Error("Option --amount must be a number"))).toBe(ExitCode.USAGE);
    expect(classifyError(new Error("Missing Clink Secret Key"))).toBe(ExitCode.AUTH_REQUIRED);
    expect(classifyError(new Error("Invalid profile config"))).toBe(ExitCode.CONFIG);
    expect(classifyError(new Error("fetch failed: ECONNREFUSED"))).toBe(ExitCode.API_UNAVAILABLE);
    expect(classifyError(new Error("something unexpected"))).toBe(ExitCode.GENERAL_ERROR);
  });
});

describe("JSON error output", () => {
  it("prints parseable JSON and exits 64 for unknown commands", () => {
    const result = runClink(["--json", "unknown"]);

    expect(result.status).toBe(ExitCode.USAGE);
    expect(result.stdout).toBe("");
    expect(parseJsonError(result.stderr)).toMatchObject({
      ok: false,
      exitCode: ExitCode.USAGE,
    });
  });

  it("prints parseable JSON and exits 77 when API auth is required", () => {
    const result = runClink([
      "--json",
      "product",
      "create",
      "--name",
      "Test",
      "--image-id",
      "oss_test",
      "--amount",
      "9.99",
      "--currency",
      "USD",
    ]);

    expect(result.status).toBe(ExitCode.AUTH_REQUIRED);
    expect(result.stdout).toBe("");
    expect(parseJsonError(result.stderr)).toMatchObject({
      ok: false,
      exitCode: ExitCode.AUTH_REQUIRED,
    });
  });
});
