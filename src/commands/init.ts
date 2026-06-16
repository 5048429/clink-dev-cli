import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { printResult } from "../output.js";
import { getCommandContext } from "./helpers.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Generate starter integration artifacts in the current project")
    .option("--out <directory>", "Output directory", ".")
    .option("--framework <name>", "Framework note, for example nextjs, express, fastapi", "generic")
    .option("--force", "Overwrite existing files")
    .action(async (options: { out: string; framework: string; force?: boolean }, command: Command) => {
      const { config } = await getCommandContext(command);
      const files = [
        {
          path: join(options.out, ".env.example"),
          content: [
            "CLINK_ENV=sandbox",
            "CLINK_BASE_URL=https://uat-api.clinkbill.com/api/",
            "CLINK_SECRET_KEY=sk_test_xxx",
            "CLINK_WEBHOOK_SIGNING_KEY=whsec_xxx",
            "",
          ].join("\n"),
        },
        {
          path: join(options.out, "docs", "clink-integration.md"),
          content: integrationDoc(options.framework),
        },
        {
          path: join(options.out, "scripts", "clink-smoke-test.sh"),
          content: smokeTestScript(),
        },
      ];

      for (const file of files) {
        await mkdir(dirname(file.path), { recursive: true });
        await writeFile(file.path, file.content, { encoding: "utf8", flag: options.force ? "w" : "wx" });
      }

      printResult(
        { files: files.map((file) => file.path), framework: options.framework },
        config.outputMode,
        `Generated ${files.length} Clink integration artifact(s) in ${options.out}`,
      );
    });
}

function integrationDoc(framework: string): string {
  return `# Clink Integration Notes

Framework: ${framework}

## Required Server Routes

- create checkout session route
- create subscription route
- receive webhook route with raw body signature verification

## Required Environment Variables

- CLINK_SECRET_KEY
- CLINK_BASE_URL
- CLINK_WEBHOOK_SIGNING_KEY

## Local Checks

\`\`\`bash
clink doctor
clink smoke-test --webhook-url http://localhost:3000/api/clink/webhook
\`\`\`
`;
}

function smokeTestScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

clink doctor
clink smoke-test "$@"
`;
}

