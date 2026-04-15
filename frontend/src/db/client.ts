/**
 * Neon Postgres db client using WebSocket Pool for transaction support.
 *
 * IMPORTANT: Uses drizzle-orm/neon-serverless (NOT drizzle-orm/neon-http).
 * The neon-http driver has no transaction support and breaks Better Auth social
 * OAuth account creation. See: github.com/better-auth/better-auth/issues/4747
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Required in Node.js: Neon serverless Pool needs a WebSocket constructor.
// This is NOT needed in Cloudflare Workers / Edge runtime (different env).
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });
