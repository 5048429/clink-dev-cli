import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { RuntimeConfig } from "../types.js";

type QueryValue = string | number | boolean | undefined;

export interface RequestOptions<TBody = unknown, TQuery extends object = Record<string, QueryValue>> {
  query?: TQuery;
  body?: TBody;
  multipart?: FormData;
}

export class ClinkApiClient {
  constructor(private readonly config: RuntimeConfig) {}

  async delete<T = unknown, TQuery extends object = Record<string, QueryValue>>(
    path: string,
    options: RequestOptions<never, TQuery> = {},
  ): Promise<T> {
    return this.request<T, never, TQuery>("DELETE", path, options);
  }

  async get<T = unknown, TQuery extends object = Record<string, QueryValue>>(
    path: string,
    options: RequestOptions<never, TQuery> = {},
  ): Promise<T> {
    return this.request<T, never, TQuery>("GET", path, options);
  }

  async post<T = unknown, TBody = unknown, TQuery extends object = Record<string, QueryValue>>(
    path: string,
    options: RequestOptions<TBody, TQuery> = {},
  ): Promise<T> {
    return this.request<T, TBody, TQuery>("POST", path, options);
  }

  async put<T = unknown, TBody = unknown, TQuery extends object = Record<string, QueryValue>>(
    path: string,
    options: RequestOptions<TBody, TQuery> = {},
  ): Promise<T> {
    return this.request<T, TBody, TQuery>("PUT", path, options);
  }

  async request<T = unknown, TBody = unknown, TQuery extends object = Record<string, QueryValue>>(
    method: string,
    path: string,
    options: RequestOptions<TBody, TQuery> = {},
  ): Promise<T> {
    if (!this.config.apiKey && !this.config.dryRun) {
      throw new Error("Missing Clink Secret Key. Set CLINK_SECRET_KEY or run clink auth secret set --api-key env:CLINK_SECRET_KEY");
    }

    const url = new URL(path.replace(/^\//, ""), this.config.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {}) as [string, QueryValue][]) {
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

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (error) {
      throw new Error(`Clink API ${method} ${url.pathname} network error: ${formatFetchError(error)}`);
    }
    const text = await response.text();
    const data = parseResponseBody(text);

    if (!response.ok) {
      throw new Error(`Clink API ${method} ${url.pathname} failed with ${response.status}: ${text}`);
    }

    assertSuccessfulApiEnvelope(method, url.pathname, data);

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

function assertSuccessfulApiEnvelope(method: string, path: string, data: unknown): void {
  if (!data || typeof data !== "object") return;
  const envelope = data as { code?: unknown; msg?: unknown };
  if (typeof envelope.code !== "number" || envelope.code === 200) return;
  const message = typeof envelope.msg === "string" ? envelope.msg : JSON.stringify(data);
  throw new Error(`Clink API ${method} ${path} returned code ${envelope.code}: ${message}`);
}

function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
    const host = "host" in cause && typeof cause.host === "string" ? cause.host : undefined;
    const port = "port" in cause && (typeof cause.port === "number" || typeof cause.port === "string") ? String(cause.port) : undefined;
    const details = [code, host ? `host=${host}` : undefined, port ? `port=${port}` : undefined].filter(Boolean).join(" ");
    return details ? `${error.message} (${details})` : error.message;
  }
  return error.message;
}
