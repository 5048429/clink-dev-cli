import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runClink(args: string[], tempDir: string): CliResult {
  const tempConfig = join(tempDir, "config.json");
  mkdirSync(dirname(tempConfig), { recursive: true });

  const env = {
    ...process.env,
    CLINK_CONFIG_PATH: tempConfig,
    CLINK_SECRET_KEY: "",
    CLINK_API_KEY: "",
  };

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeCatalog(tempDir: string): string {
  const catalogPath = join(tempDir, "catalog.json");
  writeFileSync(
    catalogPath,
    `${JSON.stringify({
      version: 1,
      source: {
        site: "https://merchant.example/pricing",
      },
      products: [
        {
          sourceId: "starter-plan",
          name: "Starter",
          description: "Starter subscription plan",
          imageId: "oss_starter",
          taxCategory: "software_service",
          localizedNames: {
            "en-US": "Starter",
          },
          prices: [
            {
              sourceId: "starter-monthly",
              type: "recurring",
              amount: 9.99,
              currency: "USD",
              interval: "month",
              intervalCount: 1,
              default: true,
            },
            {
              sourceId: "starter-yearly",
              type: "recurring",
              amount: 99.99,
              currency: "USD",
              interval: "year",
              intervalCount: 1,
            },
          ],
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
  return catalogPath;
}

describe("catalog commands", () => {
  it("validates agent-produced catalog JSON", () => {
    const tempDir = join(tmpdir(), `clink-catalog-validate-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const catalogPath = writeCatalog(tempDir);
      const result = runClink(["--json", "catalog", "validate", "--file", catalogPath], tempDir);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        catalog: {
          products: [
            {
              sourceId: "starter-plan",
              prices: [
                { sourceId: "starter-monthly" },
                { sourceId: "starter-yearly" },
              ],
            },
          ],
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts catalog JSON files with a UTF-8 BOM", () => {
    const tempDir = join(tmpdir(), `clink-catalog-bom-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const catalogPath = writeCatalog(tempDir);
      const raw = "\ufeff" + JSON.stringify({
        version: 1,
        products: [
          {
            sourceId: "starter-plan",
            name: "Starter",
            imageId: "oss_starter",
            taxCategory: "software_service",
            prices: [
              {
                sourceId: "starter-monthly",
                type: "recurring",
                amount: 9.99,
                currency: "USD",
              },
            ],
          },
        ],
      });
      writeFileSync(catalogPath, raw, "utf8");

      const result = runClink(["--json", "catalog", "validate", "--file", catalogPath], tempDir);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects currencies that are not supported by the official API", () => {
    const tempDir = join(tmpdir(), `clink-catalog-currency-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const catalogPath = writeCatalog(tempDir);
      const raw = JSON.stringify({
        version: 1,
        products: [
          {
            sourceId: "starter-plan",
            name: "Starter",
            imageId: "oss_starter",
            taxCategory: "software_service",
            prices: [
              {
                sourceId: "starter-monthly",
                type: "recurring",
                amount: 9.99,
                currency: "CHF",
              },
            ],
          },
        ],
      });
      writeFileSync(catalogPath, raw, "utf8");

      const result = runClink(["--json", "catalog", "validate", "--file", catalogPath], tempDir);
      const output = JSON.parse(result.stdout) as { ok: boolean; errors: Array<{ path: string; message: string }> };

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.errors).toContainEqual(expect.objectContaining({
        path: "$.products[0].prices[0].currency",
      }));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("plans creates and skips from the local catalog mapping", () => {
    const tempDir = join(tmpdir(), `clink-catalog-plan-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const catalogPath = writeCatalog(tempDir);
      const mappingPath = join(tempDir, "catalog-map.json");
      writeFileSync(
        mappingPath,
        `${JSON.stringify({
          version: 1,
          generatedBy: "clink-dev-cli",
          products: {
            "starter-plan": {
              productId: "prd_existing",
              prices: {
                "starter-monthly": {
                  priceId: "price_existing_monthly",
                  type: "recurring",
                  amount: 9.99,
                  currency: "USD",
                },
              },
            },
          },
        }, null, 2)}\n`,
        "utf8",
      );

      const result = runClink([
        "--json",
        "catalog",
        "plan",
        "--file",
        catalogPath,
        "--mapping-file",
        mappingPath,
      ], tempDir);

      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout) as {
        summary: Record<string, number>;
        products: Array<{ action: string; prices: Array<{ sourceId: string; action: string }> }>;
      };
      expect(output.summary).toMatchObject({
        createProducts: 0,
        skipProducts: 1,
        createPrices: 1,
        skipPrices: 1,
      });
      expect(output.products[0]).toMatchObject({
        action: "skip_existing_product",
        prices: [
          { sourceId: "starter-monthly", action: "skip_existing_price" },
          { sourceId: "starter-yearly", action: "create_price" },
        ],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("dry-runs catalog import without writing the mapping file", () => {
    const tempDir = join(tmpdir(), `clink-catalog-import-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const catalogPath = writeCatalog(tempDir);
      const mappingPath = join(tempDir, "catalog-map.json");

      const result = runClink([
        "--json",
        "--dry-run",
        "catalog",
        "import",
        "--file",
        catalogPath,
        "--mapping-file",
        mappingPath,
      ], tempDir);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout) as {
        mappingSaved: boolean;
        summary: Record<string, number>;
        operations: Array<{ action: string; result: { request: { method: string; url: string; body: Record<string, unknown> } } }>;
      };
      expect(output.mappingSaved).toBe(false);
      expect(output.summary).toMatchObject({
        createdProducts: 1,
        createdPrices: 2,
      });
      expect(output.operations[0].action).toBe("create_product");
      expect(output.operations[0].result.request).toMatchObject({
        method: "POST",
        url: "https://uat-api.clinkbill.com/api/product",
        body: {
          name: "Starter",
          image: "oss_starter",
          priceList: [
            {
              currency: "USD",
              unitAmount: 9.99,
              priceType: "recurring",
              isDefaultPrice: true,
              recurringDetails: {
                interval: "month",
                intervalCount: 1,
                pricingModel: "flat_rate",
              },
            },
            {
              currency: "USD",
              unitAmount: 99.99,
              priceType: "recurring",
              isDefaultPrice: false,
              recurringDetails: {
                interval: "year",
                intervalCount: 1,
                pricingModel: "flat_rate",
              },
            },
          ],
        },
      });
      expect(existsSync(mappingPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
