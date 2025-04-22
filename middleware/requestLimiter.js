import pLimit from "p-limit";

const limit = pLimit(1);

function requestLimiter(fn) {
  return limit(() => fn()); // Keine Zeitbegrenzung, läuft nacheinander ab
}

export { requestLimiter };
