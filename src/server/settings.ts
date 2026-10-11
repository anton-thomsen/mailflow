import { type Brand, brandSchema, DEFAULT_BRAND } from "~/domain/brand";
import { db } from "./db";

export async function getBrand(): Promise<Brand> {
  const row = await db.setting.findUnique({ where: { key: "brand" } });
  const parsed = brandSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_BRAND;
}

export async function saveBrand(brand: Brand) {
  await db.setting.upsert({
    where: { key: "brand" },
    create: { key: "brand", value: brand },
    update: { value: brand },
  });
}
