import assert from "node:assert/strict";
import test from "node:test";
import { isPrivilegedSupabaseServerKey } from "./supabaseServerKey.ts";

function makeLegacyJwt(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.signature`;
}

test("accepts current Supabase server secret keys", () => {
  assert.equal(
    isPrivilegedSupabaseServerKey("sb_secret_example-server-only-key"),
    true
  );
});

test("accepts only service_role from legacy JWT keys", () => {
  assert.equal(isPrivilegedSupabaseServerKey(makeLegacyJwt("service_role")), true);
  assert.equal(isPrivilegedSupabaseServerKey(makeLegacyJwt("anon")), false);
  assert.equal(isPrivilegedSupabaseServerKey("not-a-key"), false);
});
