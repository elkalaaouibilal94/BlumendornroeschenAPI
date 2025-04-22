import { MAX_RETRIES } from "../config/constants.js";
import { launchBrowser } from "./browserUtils.js";

async function handleCategoryRequest(req, res) {
  const { ean } = req.query;
  const requestTime = new Date().toISOString();

  console.log(`📥 Anfrage um ${requestTime}: ${ean?.slice(0, 5)}...`);

  if (!ean || !/^[0-9]{8,14}$/.test(ean)) {
    console.warn("❌ Ungültige EAN:", ean);
    return res.status(400).json({ error: "Ungültiger oder fehlender EAN" });
  }

  const searchUrl = `https://www.orderchamp.com/search?search=${encodeURIComponent(
    ean
  )}`;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    let browser;

    console.log(`🔁 [${attempt}/${MAX_RETRIES}] Suche nach EAN: ${ean}`);

    try {
      browser = await launchBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollBy(0, 500));

      const bodyText = await page.textContent("body");
      if (bodyText.includes("Derzeit gibt es keine Ergebnisse")) {
        console.warn("⚠️ Kein Produkt auf der Suchseite gefunden.");
        return res.status(404).json({ ean, category: null, breadcrumbs: [] });
      }

      const productLink = await page.$(
        "a[href*='/store/'][href*='/listings/']"
      );
      if (!productLink) {
        console.warn("⚠️ Kein Produktlink auf der Seite gefunden.");
        return res.status(404).json({ ean, category: null, breadcrumbs: [] });
      }

      const relativeUrl = await productLink.getAttribute("href");
      const productUrl = `https://www.orderchamp.com/de${relativeUrl}`;
      console.log("📄 Lade Produktseite: ", productUrl);
      await page.goto(productUrl, { waitUntil: "networkidle", timeout: 60000 });

      await page.waitForFunction(
        () =>
          document.querySelectorAll(".smart-breadcrumbs__holder a").length > 0,
        { timeout: 60000 }
      );

      const breadcrumbs = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".smart-breadcrumbs__holder a"))
          .map((el) => el.textContent.trim())
          .filter(Boolean)
      );

      const category = breadcrumbs[0] || null;
      console.log("✅ Breadcrumbs gefunden:", breadcrumbs);

      return res.status(200).json({ ean, category, breadcrumbs });
    } catch (err) {
      console.error(
        `❌ Technischer Fehler bei Versuch ${attempt}:`,
        err.stack || err.toString()
      );

      if (attempt >= MAX_RETRIES) {
        return res.status(500).json({
          ean,
          category: null,
          breadcrumbs: [],
          error: "Scraper-Fehler nach mehreren Versuchen",
        });
      }

      // Nur bei echten Fehlern nochmal versuchen
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      if (browser) await browser.close();
      console.log("🧹 Browser geschlossen.");
    }
  }
}

export { handleCategoryRequest };
