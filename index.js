const express = require("express");
const { chromium } = require("playwright");
const pLimit = require("p-limit");

const app = express();
const PORT = process.env.PORT || 3000;

const limit = pLimit(1); // Nur 1 gleichzeitige Anfrage erlaubt

// Handler-Funktion ausgelagert
async function handleCategoryRequest(req, res) {
  const { ean, apikey } = req.query;
  console.log("📥 Eingehende Anfrage:", { ean, apikey });

  if (!ean || !/^[0-9]{8,14}$/.test(ean)) {
    console.warn("❌ Ungültige EAN:", ean);
    return res.status(400).json({ error: "Ungültiger oder fehlender EAN" });
  }

  const searchUrl = `https://www.orderchamp.com/search?search=${encodeURIComponent(ean)}`;
  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    console.log(`🔁 [${attempt}/${maxRetries}] Versuche Suche nach EAN: ${ean}`);
    let browser;

    try {
      console.log("🚀 Starte Playwright Chromium...");
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 60000 });

      // Scroll und kurze Pause
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);

      // Warte auf Produktlink oder Breadcrumbs
      await page.waitForFunction(() => {
        const productLink = document.querySelector("a[href*='/store/'][href*='/listings/']");
        const breadcrumbs = document.querySelector(".smart-breadcrumbs__holder");
        return productLink || breadcrumbs;
      }, { timeout: 60000 });

      const relativeUrl = await page.evaluate(() => {
        const link = document.querySelector("a[href*='/store/'][href*='/listings/']");
        return link ? link.getAttribute("href") : null;
      });

      if (!relativeUrl) {
        console.warn("⚠️ Kein Produktlink gefunden.");
        await browser.close();
        return res.status(404).json({ error: "Kein Produktlink gefunden." });
      }

      const productUrl = `https://www.orderchamp.com/de${relativeUrl}`;
      console.log("📄 Lade Produktseite:", productUrl);
      await page.goto(productUrl, { waitUntil: "networkidle", timeout: 60000 });

      console.log("⏳ Warte auf Breadcrumbs...");
      await page.waitForFunction(() => {
        const items = document.querySelectorAll(".smart-breadcrumbs__holder a");
        return items.length > 0;
      }, { timeout: 60000 });

      const breadcrumbs = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".smart-breadcrumbs__holder a"))
          .map(el => el.textContent.trim())
          .filter(Boolean)
      );

      await browser.close();

      const category = breadcrumbs.length > 0 ? breadcrumbs[0] : null;

      if (!category) {
        console.warn("⚠️ Kategorie nicht gefunden.");
        return res.status(404).json({ error: "Kategorie nicht gefunden." });
      }

      console.log("✅ Breadcrumbs gefunden:", breadcrumbs);

      return res.status(200).json({ ean, category, breadcrumbs });

    } catch (err) {
      console.error(`❌ Fehler beim Abrufen (Versuch ${attempt}):`, err);
      if (browser) await browser.close();

      if (attempt > maxRetries) {
        return res.status(500).json({
          error: "Serverfehler nach mehreren Versuchen.",
          details: err.toString(),
        });
      }

      console.log("🔁 Wiederhole Anfrage...");
    }
  }
}

// Anfrage wird über die limitierte Queue abgewickelt
app.get("/get-category", (req, res) => {
  limit(() => handleCategoryRequest(req, res));
});

app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
