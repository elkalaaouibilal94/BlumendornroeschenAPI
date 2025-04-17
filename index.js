// Datei: index.js
const express = require("express");
const { chromium } = require("playwright"); // ⬅️ Playwright Chromium verwenden
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/get-category", async (req, res) => {
  const { ean, apikey } = req.query;
  console.log("📥 Eingehende Anfrage:", { ean, apikey });

  if (!ean || !/^[0-9]{8,14}$/.test(ean)) {
    console.warn("❌ Ungültige EAN:", ean);
    return res.status(400).json({ error: "Ungültiger oder fehlender EAN" });
  }

  const searchUrl = `https://www.orderchamp.com/search?search=${encodeURIComponent(
    ean
  )}`;
  console.log(`🔍 Suche nach EAN auf: ${searchUrl}`);

  let browser;

  try {
    console.log("🚀 Starte Playwright Chromium...");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: "networkidle" });

    await page.waitForFunction(
      () => {
        return !!document.querySelector(
          "a[href*='/store/'][href*='/listings/']"
        );
      },
      { timeout: 20000 }
    );

    const relativeUrl = await page.evaluate(() => {
      const link = document.querySelector(
        "a[href*='/store/'][href*='/listings/']"
      );
      return link ? link.getAttribute("href") : null;
    });

    console.log("🔗 Gefundener Produktlink:", relativeUrl);

    if (!relativeUrl) {
      await browser.close();
      return res.status(404).json({ error: "Kein Produktlink gefunden." });
    }

    const productUrl = `https://www.orderchamp.com/de${relativeUrl}`;
    console.log("📄 Lade Produktseite:", productUrl);
    await page.goto(productUrl, { waitUntil: "networkidle" });

    const breadcrumbs = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".smart-breadcrumbs__holder a"))
        .map((el) => el.textContent.trim())
        .filter(Boolean)
    );

    console.log("🧭 Breadcrumbs gefunden:", breadcrumbs);

    await browser.close();

    const category = breadcrumbs.length > 0 ? breadcrumbs[0] : null;

    if (!category) {
      return res.status(404).json({ error: "Kategorie nicht gefunden." });
    }

    return res.status(200).json({ ean, category, breadcrumbs });
  } catch (err) {
    console.error("❌ Fehler beim Abrufen:", err);
    if (browser) await browser.close();
    return res.status(500).json({
      error: "Serverfehler beim Abrufen der Kategorie.",
      details: err.toString(),
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
