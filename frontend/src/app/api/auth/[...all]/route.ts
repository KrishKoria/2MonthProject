/**
 * Better Auth catch-all route handler.
 *
 * Mounts the entire Better Auth API under /api/auth/*:
 * - POST /api/auth/sign-in/email
 * - GET  /api/auth/callback/google
 * - GET  /api/auth/callback/microsoft
 * - POST /api/auth/sign-out
 * - GET  /api/auth/get-session
 * - ... (all other BA endpoints)
 *
 * This route must NOT be caught by the /api/* rewrite in next.config.ts
 * (BA handles its own routing internally through toNextJsHandler).
 */
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
