#!/usr/bin/env node
/**
 * Import a season schedule (CSV) as upcoming games for one of your teams.
 *
 *   node scripts/import-schedule.mjs <your-email> "<team name>" data/strikers-schedule.csv
 *
 * CSV columns: date,time,home_away,opponent,club,location,game_number
 * Signs in with the anon key from .env.local (RLS applies: you must be a coach or assistant on the
 * team). The password is read from the terminal and never written anywhere. Games already present
 * with the same opponent and date are skipped, so the script is safe to re-run.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import readline from 'node:readline';

const [email, teamName, file] = process.argv.slice(2);
if (!email || !teamName || !file) {
  console.error('usage: node scripts/import-schedule.mjs <email> "<team name>" <schedule.csv>');
  process.exit(2);
}

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl.question(prompt, (answer) => {
      rl._writeToOutput = write;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    rl._writeToOutput = () => {};
  });
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim());
  return lines
    .filter((l) => l.trim())
    .map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const password = await askHidden(`Password for ${email}: `);
const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr) {
  console.error('sign-in failed:', authErr.message);
  process.exit(1);
}

const { data: teams, error: teamErr } = await sb.from('teams').select('id,name').ilike('name', teamName);
if (teamErr || !teams?.length) {
  console.error(`no team named "${teamName}" visible to ${email}`);
  process.exit(1);
}
const team = teams[0];
const { data: season } = await sb
  .from('seasons')
  .select('id')
  .eq('team_id', team.id)
  .eq('is_current', true)
  .maybeSingle();
if (!season) {
  console.error('the team has no current season');
  process.exit(1);
}
const { data: existing } = await sb.from('games').select('opponent,game_date').eq('team_id', team.id);
const seen = new Set((existing ?? []).map((g) => `${g.opponent}|${g.game_date}`));

let added = 0;
for (const r of rows) {
  if (seen.has(`${r.opponent}|${r.date}`)) {
    console.log('skip (exists):', r.date, r.opponent);
    continue;
  }
  const notes = [r.club ? `Club: ${r.club}` : '', r.game_number ? `Game #${r.game_number}` : '']
    .filter(Boolean)
    .join(' · ');
  const { error } = await sb.from('games').insert({
    team_id: team.id,
    season_id: season.id,
    opponent: r.opponent.slice(0, 40),
    game_date: r.date,
    start_time: r.time || null,
    location: r.location || null,
    home_away: ['home', 'away', 'neutral'].includes(r.home_away) ? r.home_away : null,
    parent_notes: notes || null,
  });
  if (error) console.error('failed:', r.date, r.opponent, error.message);
  else {
    added++;
    console.log('added:', r.date, r.time, r.home_away, 'vs', r.opponent);
  }
}
console.log(`${added} game${added === 1 ? '' : 's'} added to ${team.name}`);
await sb.auth.signOut();
