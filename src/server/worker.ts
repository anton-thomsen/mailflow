import { config } from "./config";
import { deps } from "./deps";
import { tick } from "./engine";
import { installExample } from "./install";

let started = false;

export async function startWorker() {
  if (started || config().WORKER === "off") return;
  started = true;
  await installExample(deps.db);
  const loop = async () => {
    try {
      await tick(deps);
    } catch (e) {
      console.error("mailflow tick failed", e);
    }
    setTimeout(loop, config().WORKER_INTERVAL_MS);
  };
  void loop();
}
