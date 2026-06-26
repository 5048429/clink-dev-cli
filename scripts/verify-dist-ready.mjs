#!/usr/bin/env node
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = ["dist/index.js", "dist/index.d.ts"];

const missing = [];

for (const file of requiredFiles) {
  try {
    await access(join(root, file));
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error(
    [
      "clink-integ-cli is missing committed build output:",
      ...missing.map((file) => `  - ${file}`),
      "",
      "Run `npm run build` before packaging or installing this GitHub dependency.",
      "The prepare hook only verifies dist; it does not compile TypeScript.",
    ].join("\n"),
  );
  process.exit(1);
}
