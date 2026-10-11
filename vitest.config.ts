import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against a real Postgres (dev/compose.yml), in their own schema so they never touch dev data.
const DATABASE_URL = `${process.env.TEST_DATABASE_URL ?? "postgresql://mailflow:mailflow@127.0.0.1:55432/mailflow"}?schema=test`;

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { env: { DATABASE_URL }, globalSetup: ["./tests/global-setup.ts"], fileParallelism: false },
});
