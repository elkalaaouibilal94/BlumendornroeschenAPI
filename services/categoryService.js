import { MAX_RETRIES } from "../config/constants.js";
import { launchBrowser } from "./browserUtils.js";

async function handleCategoryRequest(req, res) {
  const { ean } = req.query;
  console.log("📥 Eingehende Anfrage: ", {
    ean: ean?.slice(0, 5) + "...",
  });

  if (!ean || !/^[0-9]{8,14}$/.test(ean)) {
    console.warn("❌ Ungültige EAN:", ean);
    return res.status(400).json({ error: "Ungültiger oder fehlender EAN" });
  }

  const searchUrl = `https://www.orderchamp.com/search?search=${encodeURIComponent(
    ean
  )}`;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    console.log(
      `🔁 [${attempt}/${MAX_RETRIES}] Versuche Suche nach EAN: ${ean}`
    );
    let browser;

    try {
      browser = await launchBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 60000 });
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);

      await page.waitForFunction(
        () => {
          const productLink = document.querySelector(
            "a[href*='/store/'][href*='/listings/']"
          );
          const breadcrumbs = document.querySelector(
            ".smart-breadcrumbs__holder"
          );
          return productLink || breadcrumbs;
        },
        { timeout: 60000 }
      );

      const relativeUrl = await page.evaluate(() => {
        const link = document.querySelector(
          "a[href*='/store/'][href*='/listings/']"
        );
        return link ? link.getAttribute("href") : null;
      });

      if (!relativeUrl) {
        console.warn("⚠️ Kein Produktlink gefunden.");
        return res.status(404).json({ error: "Kein Produktlink gefunden." });
      }

      const productUrl = `https://www.orderchamp.com/de${relativeUrl}`;
      console.log("📄 Lade Produktseite:", productUrl);
      await page.goto(productUrl, { waitUntil: "networkidle", timeout: 60000 });

      await page.waitForFunction(
        () => {
          const items = document.querySelectorAll(
            ".smart-breadcrumbs__holder a"
          );
          return items.length > 0;
        },
        { timeout: 60000 }
      );

      const breadcrumbs = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".smart-breadcrumbs__holder a"))
          .map((el) => el.textContent.trim())
          .filter(Boolean)
      );

      const category = breadcrumbs.length > 0 ? breadcrumbs[0] : null;

      if (!category) {
        console.warn("⚠️ Kategorie nicht gefunden.");
        return res.status(404).json({ error: "Kategorie nicht gefunden." });
      }

      console.log("✅ Breadcrumbs gefunden:", breadcrumbs);

      return res.status(200).json({ ean, category, breadcrumbs });
    } catch (err) {
      console.error(
        `❌ Fehler beim Abrufen (Versuch ${attempt}):`,
        err.stack || err.toString()
      );

      if (attempt > MAX_RETRIES) {
        return res.status(500).json({
          error: "Serverfehler nach mehreren Versuchen.",
          details: err.stack || err.toString(),
        });
      }
    } finally {
      if (browser) await browser.close();
    }
  }
}

export { handleCategoryRequest };
