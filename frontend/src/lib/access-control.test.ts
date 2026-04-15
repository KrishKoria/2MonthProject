import { describe, expect, it } from "bun:test";
import {
  canAccessAdmin,
  canResolveEscalation,
  isOperationalRole,
  roleDisplayName,
} from "./access-control";

describe("access-control", () => {
  it("grants admin console access only to admins", () => {
    expect(canAccessAdmin("admin")).toBe(true);
    expect(canAccessAdmin("reviewer")).toBe(false);
    expect(canAccessAdmin("senior_reviewer")).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });

  it("grants escalation resolution to senior reviewers and admins", () => {
    expect(canResolveEscalation("senior_reviewer")).toBe(true);
    expect(canResolveEscalation("admin")).toBe(true);
    expect(canResolveEscalation("reviewer")).toBe(false);
    expect(canResolveEscalation(null)).toBe(false);
  });

  it("treats only assigned app roles as operational", () => {
    expect(isOperationalRole("reviewer")).toBe(true);
    expect(isOperationalRole("senior_reviewer")).toBe(true);
    expect(isOperationalRole("admin")).toBe(true);
    expect(isOperationalRole(null)).toBe(false);
  });

  it("returns stable display labels", () => {
    expect(roleDisplayName("reviewer")).toBe("Reviewer");
    expect(roleDisplayName("senior_reviewer")).toBe("Senior Reviewer");
    expect(roleDisplayName("admin")).toBe("Admin");
  });
});
