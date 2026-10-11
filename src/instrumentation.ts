export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await (await import("./server/worker")).startWorker();
  }
}
