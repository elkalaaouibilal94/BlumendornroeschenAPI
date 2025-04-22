import pLimit from "p-limit";
const limit = pLimit(1);

function requestLimiter(fn) {
  const timeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout überschritten")), ms)
      ),
    ]);

  return timeout(
    limit(() => fn()),
    120000
  );
}

export { requestLimiter };
