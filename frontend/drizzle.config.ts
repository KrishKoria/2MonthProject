import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // D-10: Use UNPOOLED connection for drizzle-kit (DDL operations).
    // DATABASE_URL (pooled) is for runtime only.
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
