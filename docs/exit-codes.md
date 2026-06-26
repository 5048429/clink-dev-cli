# Exit Codes

`clink-integ-cli` uses stable exit codes so humans, CI jobs, and AI agents can branch on failures.

| Code | Name | Meaning |
|---:|---|---|
| 0 | `OK` | Command succeeded |
| 1 | `GENERAL_ERROR` | Unexpected error |
| 64 | `USAGE` | Invalid command usage or argument parsing failure |
| 69 | `API_UNAVAILABLE` | Clink API, network, or remote service failed |
| 75 | `TEMPORARY_FAILURE` | Retryable local or remote failure |
| 77 | `AUTH_REQUIRED` | Missing or invalid API key/authentication |
| 78 | `CONFIG` | Missing or invalid local configuration |
| 130 | `INTERRUPTED` | User interrupted the process |

## JSON Error Shape

When `--json` is provided, command failures should print:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "exitCode": 78
}
```

## Current Status

The CLI currently supports centralized error classification for common configuration, authentication, API, and usage failures. Command-specific validation should reuse these codes as commands mature.

