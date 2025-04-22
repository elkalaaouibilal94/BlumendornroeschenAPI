import express from "express";
import { requestLimiter } from "./middleware/requestLimiter.js";
import { handleCategoryRequest } from "./services/categoryService.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/get-category", (req, res) => {
  requestLimiter(() => handleCategoryRequest(req, res)).catch((err) => {
    console.error(
      "⏰ Anfrage überschritten oder fehlgeschlagen:",
      err.stack || err
    );
    if (!res.headersSent) {
      res
        .status(504)
        .json({ error: "Timeout – Anfrage hat zu lange gedauert" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
