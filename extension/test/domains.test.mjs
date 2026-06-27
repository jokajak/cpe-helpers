import { test } from "node:test";
import assert from "node:assert/strict";
import { domainsFor, CISSP_DOMAINS } from "../lib/domains.js";

test("there are eight CISSP domains", () => {
  assert.equal(CISSP_DOMAINS.length, 8);
});

test("matches crypto and network topics", () => {
  const d = domainsFor("A discussion of TLS encryption, certificate pinning and firewall rules");
  assert.ok(d.includes("Security Architecture and Engineering"));
  assert.ok(d.includes("Communication and Network Security"));
});

test("matches appsec and operations topics", () => {
  const d = domainsFor("An npm supply chain attack with a malicious dependency and SQL injection");
  assert.ok(d.includes("Software Development Security"));
});

test("empty input falls back to a default domain, never empty", () => {
  assert.deepEqual(domainsFor(""), ["Security Operations"]);
  assert.deepEqual(domainsFor(null), ["Security Operations"]);
});

test("every returned domain is a valid CISSP domain name", () => {
  const d = domainsFor("risk encryption network mfa pentest incident software asset");
  assert.ok(d.length > 0);
  for (const name of d) assert.ok(CISSP_DOMAINS.includes(name), `unexpected domain: ${name}`);
});
