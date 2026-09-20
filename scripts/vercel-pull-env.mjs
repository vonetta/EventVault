// Pull a Vercel project's environment variables into .env.local using only a
// VERCEL_TOKEN. The project and team are auto-discovered, so the user does not
// need to supply Project/Org IDs (they can still override via env vars).
//
// Env:
//   VERCEL_TOKEN        (required) Vercel access token
//   VERCEL_PROJECT_ID   (optional) project id or name; defaults to VERCEL_PROJECT_NAME or "eventvault"
//   VERCEL_PROJECT_NAME (optional) project name fallback
//   VERCEL_ORG_ID       (optional) team id (team_...) to scope the lookup
//   VERCEL_ENV_TARGET   (optional) "production" (default) | "preview" | "development"
import { writeFileSync } from "node:fs";

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN is not set");
  process.exit(2);
}

const projectRef =
  process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || "eventvault";
const forcedTeamId = process.env.VERCEL_ORG_ID || "";
const target = process.env.VERCEL_ENV_TARGET || "production";
const API = "https://api.vercel.com";

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`GET ${path} -> ${res.status} ${res.statusText} ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function q(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function candidateTeamIds() {
  if (forcedTeamId) return [forcedTeamId];
  const ids = [undefined]; // personal scope first
  try {
    const { teams = [] } = await api("/v2/teams");
    for (const t of teams) if (t?.id) ids.push(t.id);
  } catch {
    // token may not have team access; personal scope only
  }
  return ids;
}

async function fetchEnvs() {
  let lastErr;
  for (const teamId of await candidateTeamIds()) {
    try {
      const data = await api(
        `/v9/projects/${encodeURIComponent(projectRef)}/env${
          teamId ? `?teamId=${encodeURIComponent(teamId)}&decrypt=true` : "?decrypt=true"
        }`,
      );
      const envs = data.envs || data.env || [];
      return { envs, teamId };
    } catch (e) {
      lastErr = e;
      if (e.status && e.status !== 404) throw e; // auth/permission errors: stop early
    }
  }
  throw lastErr || new Error(`Project "${projectRef}" not found`);
}

function envMatchesTarget(env) {
  const t = env.target;
  if (!t) return true;
  if (Array.isArray(t)) return t.includes(target);
  return t === target;
}

function serialize(key, value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  return `${key}="${escaped}"`;
}

let envs, teamId;
try {
  ({ envs, teamId } = await fetchEnvs());
} catch (e) {
  console.error(`Vercel env pull failed: ${e.message}`);
  process.exit(1);
}
const lines = [];
let count = 0;
for (const env of envs) {
  if (env.type === "system") continue;
  if (!env.key || env.value == null || env.value === "") continue;
  if (!envMatchesTarget(env)) continue;
  lines.push(serialize(env.key, env.value));
  count++;
}

if (count === 0) {
  console.error(
    `No "${target}" environment variables with readable values were returned for "${projectRef}".`,
  );
  process.exit(3);
}

writeFileSync(".env.local", lines.join("\n") + "\n");
console.log(
  `Wrote ${count} env vars (${target}${teamId ? `, team ${teamId}` : ", personal"}) to .env.local`,
);
