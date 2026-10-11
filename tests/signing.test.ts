import { describe, expect, it } from "vitest";
import { issueToken, readToken, sign, verify } from "~/domain/signing";

const secret = "s".repeat(32);
const body = '{"id":"evt_1"}';

describe("request signatures", () => {
  it("accepts a fresh signature for the same purpose and body", () => {
    expect(verify(secret, "event", body, sign(secret, "event", body))).toBe(true);
  });

  it("rejects another purpose, a changed body, a wrong secret, a stale timestamp and a missing header", () => {
    const header = sign(secret, "event", body);
    expect(verify(secret, "check", body, header)).toBe(false);
    expect(verify(secret, "event", `${body} `, header)).toBe(false);
    expect(verify("x".repeat(32), "event", body, header)).toBe(false);
    expect(verify(secret, "event", body, header, Date.now() + 10 * 60_000)).toBe(false);
    expect(verify(secret, "event", body, null)).toBe(false);
  });
});

describe("tokens", () => {
  it("round-trips claims until they expire, and only for their purpose", () => {
    const now = Date.now();
    const token = issueToken(secret, "sso", { email: "admin@example.com" }, 60, now);
    expect(readToken(secret, "sso", token, now)).toMatchObject({ email: "admin@example.com" });
    expect(readToken(secret, "session", token, now)).toBeNull();
    expect(readToken(secret, "sso", token, now + 61_000)).toBeNull();
    expect(readToken(secret, "sso", `${token}x`, now)).toBeNull();
  });
});
