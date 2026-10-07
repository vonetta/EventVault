import assert from "node:assert/strict";
import { summarizeUserAgent } from "../src/lib/request-meta";

assert.equal(
  summarizeUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ),
  "iPhone · Safari",
);
assert.equal(
  summarizeUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ),
  "Windows · Chrome",
);
assert.equal(summarizeUserAgent(""), "Unknown device");

console.log("OK request-meta");
