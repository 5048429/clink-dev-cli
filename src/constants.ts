import type { BuiltInEnvironment, EnvironmentDefinition } from "./types.js";

export const DEFAULT_PROFILE = "default";

export const DASHBOARD_UAT_BASE_URL = "https://uat-dashboard.clinkbill.com/prod-api/";
export const DASHBOARD_UAT_LOGIN_URL = "https://uat-dashboard.clinkbill.com/auth/login";
export const DASHBOARD_UAT_CLIENT_ID = "e5cd7e4891bf95d1d19206ce24a7b32e";

export const BUILT_IN_ENVIRONMENTS: Record<BuiltInEnvironment, EnvironmentDefinition> = {
  sandbox: {
    apiBaseUrl: "https://uat-api.clinkbill.com/api/",
    dashboardBaseUrl: DASHBOARD_UAT_BASE_URL,
    dashboardLoginUrl: DASHBOARD_UAT_LOGIN_URL,
    dashboardClientId: DASHBOARD_UAT_CLIENT_ID,
  },
  production: {
    apiBaseUrl: "https://api.clinkbill.com/api/",
  },
};

export const BASE_URLS: Record<BuiltInEnvironment, string> = {
  sandbox: BUILT_IN_ENVIRONMENTS.sandbox.apiBaseUrl,
  production: BUILT_IN_ENVIRONMENTS.production.apiBaseUrl,
};

export const DEFAULT_PAGE_SIZE = 20;
