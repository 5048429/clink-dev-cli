import type { ClinkEnvironment } from "./types.js";

export const DEFAULT_PROFILE = "default";

export const BASE_URLS: Record<ClinkEnvironment, string> = {
  sandbox: "https://uat-api.clinkbill.com/api/",
  production: "https://api.clinkbill.com/api/",
};

export const DEFAULT_PAGE_SIZE = 20;

