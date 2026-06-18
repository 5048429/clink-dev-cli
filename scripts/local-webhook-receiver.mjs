import { createServer } from "node:http";
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

const port = Number(readArg("--port") ?? process.env.PORT ?? 8787);
const host = readArg("--host") ?? process.env.HOST ?? "127.0.0.1";
const logDir = join(process.cwd(), "tmp");
const logFile = join(logDir, "webhook-receiver.ndjson");

await mkdir(logDir, { recursive: true });

const server = createServer(async (request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const entry = {
      receivedAt: new Date().toISOString(),
      method: request.method,
      url: request.url,
      headers: request.headers,
      rawBody,
    };

    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
    console.log(JSON.stringify(entry));

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, receivedAt: entry.receivedAt }));
  });
});

server.listen(port, host, () => {
  console.log(`Local Clink webhook receiver listening on http://${host}:${port}`);
  console.log(`Requests are logged to ${logFile}`);
});

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
