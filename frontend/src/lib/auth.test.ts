import { describe, it, expect } from "bun:test";

// These imports will fail until Wave 1 implementation exists.
// That is the expected RED state for Wave 0.
import { auth } from "@/lib/auth";

describe("auth config — AUTH-01: invite-only email/password", () => {
  it("disables public email signup (disableSignUp: true)", () => {
    const emailConfig = (auth as unknown as { options: { emailAndPassword: { disableSignUp: boolean } } }).options.emailAndPassword;
    expect(emailConfig.disableSignUp).toBe(true);
  });

  it("exposes auth as a betterAuth instance (has api property)", () => {
    expect(auth).toBeDefined();
    expect(typeof auth.api).toBe("object");
  });
});

describe("auth config — AUTH-02: Google social login email enforcement", () => {
  it("has google social provider configured", () => {
    const social = (auth as unknown as { options: { socialProviders: { google: unknown } } }).options.socialProviders;
    expect(social.google).toBeDefined();
  });

  it("enforces allowDifferentEmails: false (prevents social linking to non-invited email)", () => {
    const linking = (auth as unknown as { options: { account: { accountLinking: { allowDifferentEmails: boolean } } } }).options.account?.accountLinking;
    expect(linking?.allowDifferentEmails).toBe(false);
  });
});

describe("auth config — AUTH-03: Microsoft social login", () => {
  it("has microsoft social provider configured", () => {
    const social = (auth as unknown as { options: { socialProviders: { microsoft: { tenantId: string } } } }).options.socialProviders;
    expect(social.microsoft).toBeDefined();
  });

  it("sets tenantId: common to allow personal and org Microsoft accounts", () => {
    const social = (auth as unknown as { options: { socialProviders: { microsoft: { tenantId: string } } } }).options.socialProviders;
    expect(social.microsoft.tenantId).toBe("common");
  });
});
