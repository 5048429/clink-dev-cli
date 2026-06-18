import type { ClinkEnvironment } from "./types.js";

export const DEFAULT_PROFILE = "default";

export const BASE_URLS: Record<ClinkEnvironment, string> = {
  sandbox: "https://uat-api.clinkbill.com/api/",
  production: "https://api.clinkbill.com/api/",
};

export const DASHBOARD_UAT_BASE_URL = "https://uat-dashboard.clinkbill.com/prod-api/";
export const DASHBOARD_UAT_LOGIN_URL = "https://uat-dashboard.clinkbill.com/auth/login";
export const DASHBOARD_UAT_CLIENT_ID = "e5cd7e4891bf95d1d19206ce24a7b32e";

export const DEFAULT_PAGE_SIZE = 20;
