import { db } from "./db";
import type { Deps } from "./engine";
import { check } from "./host";
import { deliver } from "./listmonk";
import { getBrand } from "./settings";

export const deps: Deps = { db, brand: getBrand, deliver, check };
