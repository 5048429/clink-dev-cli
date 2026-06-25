import type { Command } from "commander";
import type { Browser, BrowserType, ChromiumBrowserContext } from "playwright";
import {
  DashboardConsoleClient,
  extractDashboardUserSummary,
  getDashboardInfoFromPage,
  maskDashboardProfile,
  waitForDashboardCredentials,
} from "../dashboard-console.js";
import { getConfigPath, resolveRuntimeConfig, saveProfile } from "../config.js";
import { parseIntegerOption, printResult } from "../output.js";
import type { DashboardConsoleProfile, GlobalOptions } from "../types.js";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Open the Dashboard for manual login and save Dashboard Console credentials")
    .option("--timeout-ms <ms>", "How long to wait for the Dashboard getInfo request", "300000")
    .option("--browser-channel <channel>", "Playwright browser channel, for example chrome or msedge")
    .action(async (options: { timeoutMs: string; browserChannel?: string }, command: Command) => {
      const global = command.optsWithGlobals<GlobalOptions>();
      const profileName = global.profile ?? "default";
      const config = await resolveRuntimeConfig(global);
      const { baseUrl: dashboardBaseUrl, loginUrl: dashboardLoginUrl } = config.dashboardEndpoints;
      const outputMode = global.json ? "json" : "pretty";
      const timeoutMs = parseIntegerOption("--timeout-ms", options.timeoutMs);

      if (outputMode !== "json") {
        console.log(`Opening ${dashboardLoginUrl}`);
        console.log("Finish login in the browser. The CLI will capture the Dashboard getInfo request after login.");
      }

      const { chromium } = await import("playwright");
      const browser = await launchLoginBrowser(chromium, options.browserChannel);

      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const credentialsPromise = waitForDashboardCredentials(page, timeoutMs);
        credentialsPromise.catch(() => undefined);

        try {
          await page.goto(dashboardLoginUrl, { waitUntil: "domcontentloaded" });
        } catch (error) {
          if (outputMode !== "json") {
            console.warn(`Could not auto-open the Dashboard login page: ${(error as Error).message}`);
            console.warn(`Keep the browser open and navigate manually to: ${dashboardLoginUrl}`);
          }
        }

        const credentials = await credentialsPromise;
        const client = new DashboardConsoleClient({
          baseUrl: dashboardBaseUrl,
          accessToken: credentials.accessToken,
          clientId: credentials.clientId,
        });
        const verification = await getVerifiedDashboardInfo(client, page, {
          baseUrl: dashboardBaseUrl,
          accessToken: credentials.accessToken,
          clientId: credentials.clientId,
        }, outputMode);
        const user = extractDashboardUserSummary(verification);
        const dashboardProfile: DashboardConsoleProfile = {
          baseUrl: dashboardBaseUrl,
          loginUrl: dashboardLoginUrl,
          clientId: credentials.clientId,
          accessToken: credentials.accessToken,
          tokenSource: credentials.source,
          savedAt: new Date().toISOString(),
          user,
        };

        await saveProfile(profileName, {
          environment: config.environment,
          dashboard: dashboardProfile,
        });

        const maskedProfile = maskDashboardProfile(dashboardProfile);
        printResult(
          {
            profile: profileName,
            configPath: getConfigPath(),
            dashboard: maskedProfile,
          },
          outputMode,
          [
            `Saved Dashboard Console profile "${profileName}" at ${getConfigPath()}`,
            `Dashboard API: ${maskedProfile.baseUrl}`,
            `ClientID: ${maskedProfile.clientId}`,
            `Token: ${maskedProfile.accessToken}`,
            `User: ${formatUser(user)}`,
          ].join("\n"),
        );
      } finally {
        await browser.close().catch(() => undefined);
      }
    });
}

async function getVerifiedDashboardInfo(
  client: DashboardConsoleClient,
  page: import("playwright").Page,
  credentials: { baseUrl: string; accessToken: string; clientId: string },
  outputMode: "pretty" | "json",
): Promise<unknown> {
  try {
    return await client.getInfo();
  } catch (error) {
    if (outputMode !== "json") {
      console.warn(`Node fetch verification failed: ${(error as Error).message}`);
      console.warn("Retrying verification inside the logged-in browser context.");
    }
    return getDashboardInfoFromPage(page, credentials);
  }
}

async function launchLoginBrowser(chromium: BrowserType<ChromiumBrowserContext>, channel?: string): Promise<Browser> {
  const candidates = channel ? [channel] : ["chrome", "msedge", undefined];
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      return await chromium.launch({
        headless: false,
        ...(candidate ? { channel: candidate } : {}),
      });
    } catch (error) {
      failures.push(`${candidate ?? "bundled chromium"}: ${(error as Error).message}`);
    }
  }

  throw new Error(`Unable to launch a browser for clink login. Tried ${failures.join(" | ")}`);
}

function formatUser(user: DashboardConsoleProfile["user"]): string {
  if (!user) return "unknown";
  return user.email ?? user.username ?? user.userId ?? "unknown";
}
