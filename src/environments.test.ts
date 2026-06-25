import { describe, expect, it } from "vitest";
import {
  getEnvironmentDefinition,
  isBuiltInEnvironment,
  mergeEnvironments,
  resolveDashboardEndpoints,
} from "./environments.js";
import {
  DASHBOARD_UAT_BASE_URL,
  DASHBOARD_UAT_CLIENT_ID,
  DASHBOARD_UAT_LOGIN_URL,
} from "./constants.js";
import type { StoredConfig } from "./types.js";

function storedWith(environments: StoredConfig["environments"]): StoredConfig {
  return { defaultProfile: "default", profiles: {}, environments };
}

describe("mergeEnvironments", () => {
  it("returns built-ins when no custom environments exist", () => {
    const merged = mergeEnvironments(storedWith(undefined));
    expect(Object.keys(merged).sort()).toEqual(["production", "sandbox"]);
    expect(merged.sandbox.apiBaseUrl).toBe("https://uat-api.clinkbill.com/api/");
  });

  it("adds custom environments alongside built-ins", () => {
    const merged = mergeEnvironments(
      storedWith({ staging: { apiBaseUrl: "https://staging-api.clinkbill.com/api/" } }),
    );
    expect(merged.staging.apiBaseUrl).toBe("https://staging-api.clinkbill.com/api/");
    expect(merged.sandbox).toBeDefined();
  });

  it("lets a custom environment override a built-in name", () => {
    const merged = mergeEnvironments(
      storedWith({ sandbox: { apiBaseUrl: "https://custom-sandbox.example.com/api/" } }),
    );
    expect(merged.sandbox.apiBaseUrl).toBe("https://custom-sandbox.example.com/api/");
  });
});

describe("getEnvironmentDefinition", () => {
  it("resolves built-in and custom names, and undefined for unknown", () => {
    const stored = storedWith({ dev: { apiBaseUrl: "https://dev.example.com/api/" } });
    expect(getEnvironmentDefinition(stored, "production")?.apiBaseUrl).toBe("https://api.clinkbill.com/api/");
    expect(getEnvironmentDefinition(stored, "dev")?.apiBaseUrl).toBe("https://dev.example.com/api/");
    expect(getEnvironmentDefinition(stored, "nope")).toBeUndefined();
  });
});

describe("isBuiltInEnvironment", () => {
  it("recognizes built-in names only", () => {
    expect(isBuiltInEnvironment("sandbox")).toBe(true);
    expect(isBuiltInEnvironment("production")).toBe(true);
    expect(isBuiltInEnvironment("staging")).toBe(false);
  });
});

describe("resolveDashboardEndpoints", () => {
  it("falls back to UAT defaults when not specified", () => {
    expect(resolveDashboardEndpoints(undefined)).toEqual({
      baseUrl: DASHBOARD_UAT_BASE_URL,
      loginUrl: DASHBOARD_UAT_LOGIN_URL,
      clientId: DASHBOARD_UAT_CLIENT_ID,
    });
  });

  it("uses custom dashboard fields when provided", () => {
    const endpoints = resolveDashboardEndpoints({
      apiBaseUrl: "https://staging-api.clinkbill.com/api/",
      dashboardBaseUrl: "https://staging-dashboard.clinkbill.com/prod-api/",
      dashboardClientId: "staging-client-id",
    });
    expect(endpoints.baseUrl).toBe("https://staging-dashboard.clinkbill.com/prod-api/");
    expect(endpoints.clientId).toBe("staging-client-id");
    // loginUrl not provided -> falls back to UAT default
    expect(endpoints.loginUrl).toBe(DASHBOARD_UAT_LOGIN_URL);
  });
});
