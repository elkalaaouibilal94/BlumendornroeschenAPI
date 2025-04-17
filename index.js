// Datei: index.js
const express = require("express");
const puppeteer = require("puppeteer");
const app = express();

const PORT = process.env.PORT || 3000;

const VALID_API_KEY =
  "1FFGopxTLwnIsSwjIZ2SmsNgkpt9SUsUVAc0jWx1SynkgkM4m7AWpIAP56bp8TXoLv4NL8LgFbKgD02pGgz2dQImEft67Xd6WklIVILpomi7BKRiE6e8rNjgs29NZZVL";

app.get("/get-category", async (req, res) => {
  const { ean, apikey } = req.query;
  console.log("📥 Eingehende Anfrage:", { ean, apikey });

  if (!apikey || apikey !== VALID_API_KEY) {
    console.warn("❌ Ungültiger API-Key:", apikey);
    return res.status(403).json({ error: "Ungültiger API-Schlüssel" });
  }

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
    console.log("🚀 Starte lokalen Puppeteer...");
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 30000 });

    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    const productLink = bodyHTML.match(
      /href=\"(\/de\/store\/[^\"]+\/listings\/[^\"]+)\"/i
    );
    const relativeUrl = productLink ? productLink[1] : null;

    console.log("🔗 Gefundener Produktlink:", relativeUrl);

    if (!relativeUrl) {
      await browser.close();
      return res
        .status(404)
        .json({ error: "Kein Produktlink im HTML gefunden." });
    }

    const productUrl = `https://www.orderchamp.com${relativeUrl}`;
    console.log("📄 Lade Produktseite:", productUrl);
    await page.goto(productUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const breadcrumbs = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".smart-breadcrumbs__holder a"))
        .map((el) => el.textContent.trim())
        .filter((el) => el)
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
