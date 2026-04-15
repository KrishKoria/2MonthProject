import { describe, expect, test } from "bun:test";

// These imports will fail until Wave 1 implementation exists.
// That is the expected RED state for Wave 0.
import { auth } from "@/lib/auth";

describe("auth config — AUTH-01: invite-only email/password", () => {
  test("disables public email signup (disableSignUp: true)", () => {
    const emailConfig = (auth as unknown as { options: { emailAndPassword: { disableSignUp: boolean } } }).options.emailAndPassword;
    expect(emailConfig.disableSignUp).toBe(true);
  });

  test("exposes auth as a betterAuth instance (has api property)", () => {
    expect(auth !== undefined && auth !== null).toBe(true);
    expect(typeof auth.api).toBe("object");
  });
});

describe("auth config — AUTH-02: Google social login email enforcement", () => {
  test("has google social provider configured", () => {
    const social = (auth as unknown as { options: { socialProviders: { google: unknown } } }).options.socialProviders;
    expect(social.google !== undefined && social.google !== null).toBe(true);
  });

  test("enforces allowDifferentEmails: false (prevents social linking to non-invited email)", () => {
    const linking = (auth as unknown as { options: { account: { accountLinking: { allowDifferentEmails: boolean } } } }).options.account?.accountLinking;
    expect(linking?.allowDifferentEmails).toBe(false);
  });
});

describe("auth config — AUTH-03: Microsoft social login", () => {
  test("has microsoft social provider configured", () => {
    const social = (auth as unknown as { options: { socialProviders: { microsoft: { tenantId: string } } } }).options.socialProviders;
    expect(social.microsoft !== undefined && social.microsoft !== null).toBe(true);
  });

  test("sets tenantId: common to allow personal and org Microsoft accounts", () => {
    const social = (auth as unknown as { options: { socialProviders: { microsoft: { tenantId: string } } } }).options.socialProviders;
    expect(social.microsoft.tenantId).toBe("common");
  });
});
