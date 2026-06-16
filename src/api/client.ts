import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { RuntimeConfig } from "../types.js";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  multipart?: FormData;
}

export class ClinkApiClient {
  constructor(private readonly config: RuntimeConfig) {}

  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  async post<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, options);
  }

  async put<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PUT", path, options);
  }

  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.config.apiKey && !this.config.dryRun) {
      throw new Error("Missing Clink Secret Key. Set CLINK_SECRET_KEY or run auth set --api-key env:CLINK_SECRET_KEY");
    }

    const url = new URL(path.replace(/^\//, ""), this.config.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers({
      "X-API-KEY": this.config.apiKey ?? "dry_run_missing_key",
      "X-Timestamp": String(Date.now()),
    });

    let body: BodyInit | undefined;
    if (options.multipart) {
      body = options.multipart;
    } else if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    if (this.config.dryRun) {
      return {
        dryRun: true,
        request: {
          method,
          url: url.toString(),
          headers: {
            "X-API-KEY": "[masked]",
            "X-Timestamp": "[generated]",
            ...(headers.has("Content-Type") ? { "Content-Type": headers.get("Content-Type") } : {}),
          },
          body: options.body ?? (options.multipart ? "[multipart]" : undefined),
        },
      } as T;
    }

    const response = await fetch(url, { method, headers, body });
    const text = await response.text();
    const data = parseResponseBody(text);

    if (!response.ok) {
      throw new Error(`Clink API ${method} ${url.pathname} failed with ${response.status}: ${text}`);
    }

    return data as T;
  }
}

export async function createImageUploadForm(filePath: string): Promise<FormData> {
  const buffer = await readFile(filePath);
  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append("file", blob, basename(filePath));
  return form;
}

function parseResponseBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
