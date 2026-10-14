#!/usr/bin/env node
// Copies the AI service + dashboards from RydraLLM into the booking-system repo.
//   node scripts/integrate-into-booking.mjs --to /path/to/booking-repo            (dry run: changes nothing)
//   node scripts/integrate-into-booking.mjs --to /path/to/booking-repo --apply    (copy new files, skip conflicts)
//   add --force to overwrite conflicting files (originals are backed up), --allow-dirty to skip the git check
// It never overwrites middleware.ts (a differing one is written as middleware.rydra.ts for a manual merge),
// never prints secret values (env NAMES only), and never touches layout/page/globals.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { builtinModules } from 'node:module';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = flag('--apply'), FORCE = flag('--force'), ALLOW_DIRTY = flag('--allow-dirty');
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

const SRC = path.resolve(val('--from') || process.cwd());
if (!val('--to')) die('Usage: node scripts/integrate-into-booking.mjs --to /path/to/booking-repo [--apply] [--force] [--allow-dirty]');
const DST = path.resolve(val('--to'));

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const readLoose = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')); } catch { return null; } };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const srcPkg = readJson(path.join(SRC, 'package.json'));
if (!srcPkg || !fs.existsSync(path.join(SRC, 'app'))) die(`${SRC} does not look like the RydraLLM project (no package.json or app/).`);
const dstPkg = readJson(path.join(DST, 'package.json'));
if (!dstPkg) die(`${DST} has no package.json.`);
if (SRC === DST || DST.startsWith(SRC + path.sep) || SRC.startsWith(DST + path.sep)) die('Source and target folders must be separate.');
const dstDeps = { ...(dstPkg.devDependencies || {}), ...(dstPkg.dependencies || {}) };
if (!dstDeps.next) die(`${DST} does not look like a Next.js project (no "next" dependency).`);

const BASE = fs.existsSync(path.join(DST, 'src', 'app')) ? 'src' : fs.existsSync(path.join(DST, 'app')) ? '' : null;
if (BASE === null) die(`${DST} has neither app/ nor src/app/ (is it using the pages router?).`);

// ─── What gets copied ────────────────────────────────────────────────────────
const ROOTS = ['app/merchant', 'app/o', 'app/components', 'app/api', 'lib', 'middleware.ts'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.venv', '.turbo', '.vercel', '__MACOSX']);
const SKIP_FILE = /(^|\/)(\.DS_Store|tsconfig\.tsbuildinfo)$/;
const isTest = (rel) => /^app\/api\/test/.test(rel) || (/(^|\/)(_?probe|_?test[^/]*|[^/]*\.test)\.(ts|tsx|js|mjs)$/.test(rel) && rel.startsWith('lib/'));
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;

function* walk(abs, rel) {
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(abs))) return;
    for (const n of fs.readdirSync(abs)) yield* walk(path.join(abs, n), `${rel}/${n}`);
  } else if (!SKIP_FILE.test(rel)) yield rel;
}
const files = [], excluded = [];
for (const r of ROOTS) {
  const abs = path.join(SRC, r);
  if (!fs.existsSync(abs)) continue;
  for (const rel of walk(abs, r)) (isTest(rel) ? excluded : files).push(rel);
}

// ─── Classify ────────────────────────────────────────────────────────────────
const dstOf = (rel) => (BASE ? path.join(DST, BASE, rel) : path.join(DST, rel));
const plan = files.map((rel) => {
  const to = dstOf(rel);
  if (!fs.existsSync(to)) return { rel, to, status: 'new' };
  if (sha(path.join(SRC, rel)) === sha(to)) return { rel, to, status: 'same' };
  return { rel, to: rel === 'middleware.ts' ? path.join(path.dirname(to), 'middleware.rydra.ts') : to, status: rel === 'middleware.ts' ? 'merge' : 'conflict' };
});
const by = (s) => plan.filter((p) => p.status === s);

// ─── Scans (names only, never values) ────────────────────────────────────────
const code = files.filter((r) => CODE.test(r)).map((r) => ({ rel: r, text: fs.readFileSync(path.join(SRC, r), 'utf8') }));
const pkgs = new Set(), envs = new Set();
const IMPORT = /(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const { text } of code) {
  for (const m of text.matchAll(IMPORT)) {
    const s = m[1] || m[2] || m[3] || m[4];
    if (!s || s.startsWith('.') || s.startsWith('@/') || s.startsWith('~/') || s.startsWith('node:') || builtinModules.includes(s.split('/')[0])) continue;
    pkgs.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
  }
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) envs.add(m[1] || m[2]);
}
['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL'].forEach((e) => envs.delete(e));

const srcDeps = { ...(srcPkg.devDependencies || {}), ...(srcPkg.dependencies || {}) };
const FRAMEWORK = ['next', 'react', 'react-dom'];
const missing = [...pkgs].filter((p) => !FRAMEWORK.includes(p) && !dstDeps[p]).sort();
const major = (v) => parseInt(String(v || '').replace(/[^\d.]/g, '').split('.')[0], 10);
const versionWarn = FRAMEWORK.filter((p) => dstDeps[p] && srcDeps[p] && major(dstDeps[p]) !== major(srcDeps[p])).map((p) => `${p}: booking ${dstDeps[p]} vs RydraLLM ${srcDeps[p]}`);

const envNames = new Set();
for (const f of ['.env.local', '.env', '.env.development.local']) {
  const p = path.join(DST, f);
  if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/); if (m) envNames.add(m[1]); }
}
const OPTIONAL = new Set(['AI_ALLOWED_ORIGINS', 'AI_SERVICE_KEY', 'SMS_DAILY_CAP', 'SMS_COOLDOWN_DAYS', 'COPILOT_MODEL', 'AI_PRIMARY_MODEL', 'AI_FALLBACK_MODEL', 'PORTKEY_CONFIG_ID', 'PORTKEY_PRIMARY_KEY', 'PORTKEY_FALLBACK_KEY', 'MERCHANT_USER', 'ALKAMI_BOOKING_URL', 'NEXT_PUBLIC_AI_BASE_URL', 'COPILOT_ALLOW_UNAUTHENTICATED']);
const missingEnv = [...envs].filter((e) => !envNames.has(e) && !OPTIONAL.has(e)).sort();

const tsc = readLoose(path.join(DST, 'tsconfig.json'));
const alias = tsc?.compilerOptions?.paths?.['@/*']?.[0];
const wantAlias = BASE ? './src/*' : './*';
const tw = major(dstDeps.tailwindcss);
const srcVercel = readJson(path.join(SRC, 'vercel.json')), dstVercel = readJson(path.join(DST, 'vercel.json'));

// ─── Report ──────────────────────────────────────────────────────────────────
const L = (s = '') => console.log(s);
L(`\nRydraLLM → booking repo   ${APPLY ? (FORCE ? '[APPLY + FORCE]' : '[APPLY]') : '[DRY RUN: nothing will be changed]'}`);
L(`  from  ${SRC}\n  to    ${DST}   (${BASE ? 'src/ layout' : 'root app/ layout'})\n`);
L(`FILES  ${files.length} considered · ${by('new').length} new · ${by('same').length} identical · ${by('conflict').length} conflicts · ${by('merge').length} middleware merge · ${excluded.length} excluded as test/probe`);
if (excluded.length) L(`  excluded: ${excluded.join(', ')}`);
for (const p of by('conflict')) L(`  CONFLICT  ${p.rel}  (exists and differs${FORCE ? '; will be overwritten, original backed up' : '; will be skipped'})`);
for (const p of by('merge')) L(`  MERGE     middleware.ts  -> written as ${path.relative(DST, p.to)}; merge by hand, your existing middleware is never touched`);
L(`\nDEPENDENCIES the copied code imports that the booking repo lacks:\n  ${missing.length ? `npm install ${missing.map((p) => (srcDeps[p] ? `${p}@"${srcDeps[p]}"` : p)).join(' ')}` : 'none'}`);
for (const p of missing.filter((m) => !srcDeps[m])) L(`  note: ${p} is not in RydraLLM's package.json; check which version you want`);
if (versionWarn.length) L(`\n⚠ FRAMEWORK VERSIONS DIFFER (check before merging):\n  ${versionWarn.join('\n  ')}`);
if (tw && tw < 4) L(`\n⚠ Booking repo uses Tailwind v${tw}; RydraLLM uses v4. Arbitrary-value classes work in both, but check the dashboard visually.`);
if (alias !== wantAlias) L(`\n⚠ tsconfig "@/*" maps to ${alias ?? '(not set)'} in the booking repo; the copied code needs "${wantAlias}".`);
L(`\nENV VARS the copied code reads that are NOT in the booking repo's .env files (names only):\n  ${missingEnv.length ? missingEnv.join('\n  ') : 'none missing'}`);
if (envNames.has('NEXT_PUBLIC_AI_BASE_URL')) L('  ⚠ NEXT_PUBLIC_AI_BASE_URL is set in the booking repo. Remove it so the AI is called on the same origin.');
if (srcVercel?.crons?.length) L(`\nCRONS in RydraLLM's vercel.json to merge into the booking repo's vercel.json${dstVercel?.crons ? ' (it already has its own crons)' : ''}:\n  ${srcVercel.crons.map((c) => `${c.schedule}  ${c.path}`).join('\n  ')}`);
L('\nNOT COPIED (do by hand): app/layout.tsx, app/page.tsx, app/globals.css, supabase/ migrations, mcp-server/, scripts/, .env files.');

// ─── Apply ───────────────────────────────────────────────────────────────────
if (!APPLY) { L('\nDry run only. Re-run with --apply on a fresh git branch to copy the files.\n'); process.exit(0); }

let dirty = null;
try { dirty = execFileSync('git', ['-C', DST, 'status', '--porcelain'], { encoding: 'utf8' }).trim(); } catch { dirty = 'NOT_A_GIT_REPO'; }
if (!ALLOW_DIRTY && dirty) die(dirty === 'NOT_A_GIT_REPO' ? 'The booking repo is not a git repository, so this cannot be undone. Commit-track it, or re-run with --allow-dirty.' : 'The booking repo has uncommitted changes. Commit or stash them (and use a new branch), or re-run with --allow-dirty.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let copied = 0, overwritten = 0, skipped = 0;
for (const p of plan) {
  if (p.status === 'same') continue;
  if (p.status === 'conflict' && !FORCE) { skipped++; continue; }
  if (p.status === 'conflict') {
    const b = path.join(DST, '.integration-backup', stamp, path.relative(DST, p.to));
    fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(p.to, b); overwritten++;
  }
  fs.mkdirSync(path.dirname(p.to), { recursive: true });
  fs.copyFileSync(path.join(SRC, p.rel), p.to);
  if (p.status === 'new' || p.status === 'merge') copied++;
}
L(`\n✔ Done: ${copied} files copied, ${overwritten} overwritten (backups in .integration-backup/${stamp}), ${skipped} conflicts skipped.`);
L('Next: install the dependencies above, add the missing env vars, merge middleware.rydra.ts, then run: npx tsc --noEmit && npm run dev\n');
