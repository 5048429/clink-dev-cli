export function curlForJsonRequest(method, url, body) {
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
//# sourceMappingURL=curl.js.map