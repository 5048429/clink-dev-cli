export function curlForJsonRequest(method: string, url: string, body?: unknown): string {
  const lines = [
    `curl -X ${method.toUpperCase()} "${url}"`,
    `  -H "X-API-KEY: $CLINK_SECRET_KEY"`,
    `  -H "X-Timestamp: $(date +%s000)"`,
  ];

  if (body !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(body)}'`);
  }

  return lines.join(" \\\n");
}

