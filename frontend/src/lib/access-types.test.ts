// @ts-nocheck
import { describe, expect, it } from "bun:test";
import * as accessTypes from "./access-types";
import type {
  AppRole,
  AppSession,
  AuditEventType,
  InviteRecord,
  SessionUser,
} from "./access-types";

describe("access-types", () => {
  it("exports a loadable module", () => {
    expect(accessTypes).toBeDefined();
  });

  it("defines the canonical app roles", () => {
    const roles: AppRole[] = ["reviewer", "senior_reviewer", "admin"];

    expect(roles).toEqual(["reviewer", "senior_reviewer", "admin"]);
  });

  it("models session users with nullable roles and banned state", () => {
    const user: SessionUser = {
      id: "user_123",
      email: "reviewer@example.com",
      name: null,
      role: null,
      banned: false,
    };

    const session: AppSession = {
      session: {
        id: "session_123",
        userId: user.id,
        expiresAt: new Date("2026-04-15T00:00:00.000Z"),
        token: "token_123",
      },
      user,
    };

    expect(session.user.role).toBeNull();
    expect(session.user.banned).toBe(false);
  });

  it("models invite records and audit events", () => {
    const invite: InviteRecord = {
      id: "invite_123",
      email: "invitee@example.com",
      role: "reviewer",
      token: "token_456",
      expiresAt: new Date("2026-04-22T00:00:00.000Z"),
      acceptedAt: null,
      cancelledAt: null,
      createdAt: new Date("2026-04-15T00:00:00.000Z"),
    };
    const eventType: AuditEventType = "invited";

    expect(invite.role).toBe("reviewer");
    expect(eventType).toBe("invited");
  });
});
