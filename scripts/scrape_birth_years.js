#!/usr/bin/env node
// Scrapes birth dates from Transfermarkt using the TM player IDs from the SQLite DBs.
// Reads players from bundesliga_draft.db + zweite_liga_draft.db, deduplicates by tm_id.
// Output: src/data/playerBirthDates.json  { [tm_id]: "YYYY-MM-DD" | null }
// Safe to interrupt and resume — already-fetched entries are skipped.
//
// Usage:  node scripts/scrape_birth_years.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Load all unique players from both DBs ─────────────────────────────────────

const players = new Map(); // tm_id → name

for (const file of ['bundesliga_draft.db', 'zweite_liga_draft.db']) {
  const db = new DatabaseSync(join(ROOT, file));
  for (const row of db.prepare('SELECT tm_id, name FROM players').all()) {
    if (!players.has(row.tm_id)) players.set(row.tm_id, row.name);
  }
  db.close();
}

console.log(`Unique players across both DBs: ${players.size}`);

// ── Resume support ────────────────────────────────────────────────────────────

const OUTPUT = join(ROOT, 'src/data/playerBirthDates.json');
const cache  = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : {};

const todo = [...players.entries()].filter(([id]) => !(String(id) in cache));
console.log(`Already cached: ${Object.keys(cache).length} | Remaining: ${todo.length}\n`);

if (todo.length === 0) {
  console.log('All done!');
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns "YYYY-MM-DD" or null
function parseBirthDate(html) {
  const m = html.match(/itemprop="birthDate"[^>]*>[\s\S]{0,80}?(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

// Parse player name from <title> tag: "Firstname Lastname - ... | Transfermarkt"
function parseTmName(html) {
  const m = html.match(/<title[^>]*>([^<]+)/);
  if (!m) return null;
  return m[1].split(' - ')[0].trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'Referer': 'https://www.transfermarkt.de/',
};

// ── Main loop ─────────────────────────────────────────────────────────────────

let checkpoint = 0;
let matched = 0, mismatched = 0, notFound = 0;

for (let i = 0; i < todo.length; i++) {
  const [tmId, name] = todo[i];
  const url = `https://www.transfermarkt.de/-/profil/spieler/${tmId}`;

  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });

    if (res.status === 404) {
      cache[String(tmId)] = null;
      notFound++;
      console.log(`[${i+1}/${todo.length}] ${name.padEnd(30)} 404`);
    } else if (res.status === 429) {
      console.warn('\n⚠ Rate limited — sleeping 30s...\n');
      await sleep(30_000);
      i--; // retry
      continue;
    } else if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    } else {
      const html    = await res.text();
      const date    = parseBirthDate(html);
      const tmName  = parseTmName(html);
      const nameOk  = tmName && norm(tmName) === norm(name);

      cache[String(tmId)] = date;

      if (nameOk) {
        matched++;
        console.log(`[${i+1}/${todo.length}] ✓ ${name.padEnd(30)} ${date ?? '—'}`);
      } else {
        mismatched++;
        console.log(`[${i+1}/${todo.length}] ✗ ${name.padEnd(30)} TM: "${tmName}" (${date})`);
      }
    }
  } catch (e) {
    console.log(`[${i+1}/${todo.length}] ${name.padEnd(30)} ERROR: ${e.message}`);
    cache[String(tmId)] = null;
  }

  if (++checkpoint % 100 === 0) {
    writeFileSync(OUTPUT, JSON.stringify(cache));
    const done = Object.keys(cache).length;
    console.log(`\n--- checkpoint: ${done} saved (✓${matched} ✗${mismatched} 404:${notFound}) ---\n`);
  }

  await sleep(1200);
}

writeFileSync(OUTPUT, JSON.stringify(cache));
const found = Object.values(cache).filter(v => v !== null).length;
console.log(`\nDone. ${found}/${players.size} birth dates found. ✓${matched} name-verified, ✗${mismatched} name mismatch.`);
