// Pull a Vercel project's environment variables into .env.local using only a
// VERCEL_TOKEN. The project and team are auto-discovered from the GitHub remote
// and Vercel project list, so the user does not need to supply Project/Org IDs
// (they can still override via env vars).
//
// Env:
//   VERCEL_TOKEN        (required) Vercel access token
//   VERCEL_PROJECT_ID   (optional) project id or name
//   VERCEL_PROJECT_NAME (optional) project name fallback
//   VERCEL_ORG_ID       (optional) team id (team_...) to scope the lookup
//   VERCEL_ENV_TARGET   (optional) "production" | "preview" | "development"
//                       When unset, tries development first (readable encrypted
//                       values), then production, then preview.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN is not set");
  process.exit(2);
}

const forcedProjectRef =
  process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || "";
const forcedTeamId = process.env.VERCEL_ORG_ID || "";
const forcedTarget = process.env.VERCEL_ENV_TARGET || "";
const API = "https://api.vercel.com";
const PLACEHOLDER = "[SENSITIVE]";

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

function githubRepo() {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
    if (m) return { org: m[1], repo: m[2] };
  } catch {
    // no git remote
  }
  return { org: "", repo: "" };
}

async function candidateTeamIds() {
  if (forcedTeamId) return [forcedTeamId];
  const ids = [undefined];
  try {
    const { teams = [] } = await api("/v2/teams");
    for (const t of teams) if (t?.id) ids.push(t.id);
  } catch {
    // token may not have team access; personal scope only
  }
  return ids;
}

async function listProjects(teamId) {
  const qs = teamId
    ? `?teamId=${encodeURIComponent(teamId)}&limit=100`
    : "?limit=100";
  const data = await api(`/v9/projects${qs}`);
  return data.projects || [];
}

function projectMatches(project, { org, repo, names }) {
  const link = project.link || {};
  if (
    org &&
    repo &&
    link.type === "github" &&
    String(link.org).toLowerCase() === org.toLowerCase() &&
    String(link.repo).toLowerCase() === repo.toLowerCase()
  ) {
    return true;
  }
  const n = String(project.name || "").toLowerCase();
  return names.includes(n);
}

function candidateNames(repo) {
  const names = new Set();
  if (forcedProjectRef) names.add(forcedProjectRef.toLowerCase());
  if (repo) {
    names.add(repo.toLowerCase());
    names.add(repo.toLowerCase().replace(/_/g, "-"));
    names.add(repo.toLowerCase().replace(/-/g, ""));
  }
  names.add("event-vault");
  names.add("eventvault");
  return [...names];
}

async function discoverProject() {
  const { org, repo } = githubRepo();
  const names = candidateNames(repo);
  let lastErr;

  for (const teamId of await candidateTeamIds()) {
    if (forcedProjectRef) {
      try {
        const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
        const project = await api(
          `/v9/projects/${encodeURIComponent(forcedProjectRef)}${qs}`,
        );
        return {
          projectRef: project.id || forcedProjectRef,
          projectName: project.name || forcedProjectRef,
          teamId,
        };
      } catch (e) {
        lastErr = e;
        if (e.status && e.status !== 404) throw e;
      }
    }

    try {
      const projects = await listProjects(teamId);
      const match = projects.find((p) => projectMatches(p, { org, repo, names }));
      if (match) {
        return {
          projectRef: match.id || match.name,
          projectName: match.name,
          teamId,
        };
      }
    } catch (e) {
      lastErr = e;
      if (e.status && e.status !== 404) throw e;
    }
  }

  throw lastErr || new Error(
    `Could not find a Vercel project matching ${org ? `${org}/${repo}` : "this repo"} (tried names: ${names.join(", ")})`,
  );
}

function envMatchesTarget(env, target) {
  const t = env.target;
  if (!t) return true;
  if (Array.isArray(t)) return t.includes(target);
  return t === target;
}

function readableValue(env) {
  if (!env || env.type === "system") return null;
  if (env.type === "sensitive") return null;
  const value = env.value;
  if (value == null || value === "" || value === PLACEHOLDER) return null;
  return String(value);
}

function serialize(key, value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  return `${key}="${escaped}"`;
}

function pickReadable(envs, target) {
  const lines = [];
  let readable = 0;
  let sensitive = 0;
  let matching = 0;
  for (const env of envs) {
    if (!envMatchesTarget(env, target)) continue;
    if (env.type === "system") continue;
    matching += 1;
    const value = readableValue(env);
    if (value == null) {
      if (env.type === "sensitive" || env.value === PLACEHOLDER) sensitive += 1;
      continue;
    }
    if (!env.key) continue;
    lines.push(serialize(env.key, value));
    readable += 1;
  }
  return { lines, readable, sensitive, matching };
}

const { projectRef, projectName, teamId } = await discoverProject();
console.log(
  `==> Using Vercel project ${projectName || projectRef}${teamId ? ` (team ${teamId})` : ""}`,
);

const envQs = teamId
  ? `?teamId=${encodeURIComponent(teamId)}&decrypt=true`
  : "?decrypt=true";
let envs;
try {
  const data = await api(
    `/v9/projects/${encodeURIComponent(projectRef)}/env${envQs}`,
  );
  envs = data.envs || data.env || [];
} catch (e) {
  console.error(`Vercel env pull failed: ${e.message}`);
  process.exit(1);
}

const targets = forcedTarget
  ? [forcedTarget]
  : ["development", "production", "preview"];

let best = null;
for (const target of targets) {
  const picked = pickReadable(envs, target);
  if (!best || picked.readable > best.readable) {
    best = { target, ...picked };
  }
  if (picked.readable > 0) break;
}

if (!best || best.readable === 0) {
  const target = best?.target || targets[0];
  const sensitive = best?.sensitive || 0;
  console.error(
    `No readable "${target}" environment variables were returned for "${projectName || projectRef}".`,
  );
  if (sensitive > 0) {
    console.error(
      `${sensitive} variable(s) are Vercel Sensitive secrets and cannot be pulled into this VM.`,
    );
    console.error(
      "Add the same keys to the Vercel Development environment (not Sensitive), or set MONGODB_URI as a Cursor Cloud secret.",
    );
  }
  process.exit(3);
}

writeFileSync(".env.local", best.lines.join("\n") + "\n");
console.log(
  `Wrote ${best.readable} env vars (${best.target}${teamId ? `, team ${teamId}` : ", personal"}) to .env.local`,
);
