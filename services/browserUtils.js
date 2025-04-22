import { chromium } from "playwright";

export async function launchBrowser() {
  console.log("🚀 Starte Playwright Chromium...");
  return await chromium.launch({ headless: true });
}
