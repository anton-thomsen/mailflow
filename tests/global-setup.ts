import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

export default function setup(project: TestProject) {
  const env = { ...process.env, DATABASE_URL: project.config.env.DATABASE_URL };
  execSync("npx prisma migrate deploy", { stdio: "ignore", env });
}
