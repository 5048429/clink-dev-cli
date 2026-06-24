import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { inspectImageUrl } from "../src/catalog-images.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

describe("catalog image helpers", () => {
  it("downloads and validates imageUrl assets", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": String(ONE_BY_ONE_PNG.byteLength),
      });
      response.end(ONE_BY_ONE_PNG);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const source = await inspectImageUrl(`http://127.0.0.1:${port}/assets/starter.png`);

      expect(source).toMatchObject({
        kind: "url",
        fileName: "starter.png",
        mimeType: "image/png",
        sizeBytes: ONE_BY_ONE_PNG.byteLength,
      });
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
