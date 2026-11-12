import { formationByName, SPORTS } from '@/sports/definitions';
import { type Formation, type Period, type SportKey } from '@/sports/types';

/* ---------- payload sent to import_legacy_backup ---------- */

export interface ImportSlot {
  position_role: string;
  position_code: string;
  player_key: string | null;
  auto_picked: boolean;
}
export interface ImportLineup {
  formation_name: string;
  slots: ImportSlot[];
}
export interface ImportEvent {
  side: 'us' | 'them';
  period_index: number;
  event_type: string;
  scorer_key: string | null;
  assist_key: string | null;
  occurred_at: string;
}
export interface ImportGame {
  opponent: string;
  game_date: string;
  status: 'upcoming' | 'live' | 'done';
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  team_name: string | null;
  notes: string;
  lineups: ImportLineup[];
  events: ImportEvent[];
  players: { key: string; name: string; number: string }[];
}
export interface ImportPayload {
  replace: boolean;
  /** The sample team (D90): the server accepts it only from a platform admin onto an empty roster. */
  example?: boolean;
  team: { side_size: number; has_gk: boolean; periods_count: number; colors: Record<string, string> };
  players: {
    key: string;
    first_name: string;
    jersey_number: string | null;
    is_available: boolean;
    batting_order: number | null;
  }[];
  template: ImportLineup[];
  last_batter_key: string | null;
  games: ImportGame[];
}

export interface ImportSummary {
  players: number;
  games: number;
  events: number;
  template: number;
  teamName: string | null;
}

/* ---------- legacy shapes (loosely typed on purpose; everything is validated) ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 1000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toIso = (ms: unknown): string | null => {
  const n = num(ms);
  return n > 0 ? new Date(n).toISOString() : null;
};
const todayISO = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

/** Is this a Mini-Messi's backup at all (v5 multi-sport, or the old v4 soccer-only shape)? */
export function isLegacyBackup(raw: unknown): raw is Obj {
  return isObj(raw) && (isObj(raw.teams) || (Array.isArray(raw.players) && Array.isArray(raw.quarters)));
}

/** Sports that have data in the file (players, periods with assignments, or games). */
export function legacySports(raw: Obj): SportKey[] {
  if (Array.isArray(raw.players) && Array.isArray(raw.quarters)) return ['soccer'];
  const teams = isObj(raw.teams) ? raw.teams : {};
  return (Object.keys(SPORTS) as SportKey[]).filter((k) => {
    const t = teams[k];
    if (!isObj(t)) return false;
    const players = Array.isArray(t.players) ? t.players.length : 0;
    const games = Array.isArray(t.games) ? t.games.length : 0;
    return players > 0 || games > 0;
  });
}

const OLD_FORMATION_MAP: Record<string, string> = { '2-4': '4-2', '3-2-1': '1-2-3', '2-3-1': '1-3-2' };

/** The legacy `normalize()` for one sport, then mapped onto the new tables' vocabulary. */
export function normalizeLegacyBackup(
  raw: Obj,
  sport: SportKey,
  replace = true,
): { payload: ImportPayload; summary: ImportSummary } {
  const S = SPORTS[sport];
  let src: Obj;
  if (Array.isArray(raw.players) && Array.isArray(raw.quarters)) {
    // v4: single soccer team
    src = {
      players: raw.players,
      size: 7,
      gk: true,
      periods: (raw.quarters as unknown[]).map((q) =>
        isObj(q) ? { formation: OLD_FORMATION_MAP[str(q.formation)] ?? q.formation, slots: q.slots } : {},
      ),
      colors: raw.colors,
      order: [],
      games: [],
    };
  } else {
    const teams = isObj(raw.teams) ? raw.teams : {};
    src = isObj(teams[sport]) ? (teams[sport] as Obj) : {};
  }

  // players
  const players = (Array.isArray(src.players) ? src.players : [])
    .filter((p): p is Obj => isObj(p) && typeof p.id === 'string' && !!str(p.name, 40).trim())
    .map((p) => ({
      key: p.id as string,
      first_name: str(p.name, 40).trim(),
      jersey_number: str(p.num ?? '', 3).replace(/\D/g, '') || null,
      is_available: p.active !== false,
    }))
    .filter((p) => p.first_name);
  const known = new Set(players.map((p) => p.key));
  const order = (Array.isArray(src.order) ? src.order : []).filter(
    (x): x is string => typeof x === 'string' && known.has(x),
  );
  const batting = new Map(order.map((id, i) => [id, i + 1]));

  // team shape
  const size = S.sizes.includes(num(src.size)) ? num(src.size) : S.defaultSize;
  const gk = typeof src.gk === 'boolean' ? src.gk : S.hasGK;
  const forms = S.formations({ size, gk });
  const colors: Record<string, string> = { ...S.defaultColors };
  const OLD = { ST: '#d92d43', MID: '#f4c63f', DEF: '#248de0', GK: '#2cbd7a' } as Record<string, string>;
  if (isObj(src.colors)) {
    const stillOld =
      sport === 'soccer' &&
      Object.keys(OLD).every((g) => str((src.colors as Obj)[g]).toLowerCase() === OLD[g]);
    if (!stillOld)
      for (const g of Object.keys(colors)) {
        const c = str((src.colors as Obj)[g]);
        if (/^#[0-9a-f]{6}$/i.test(c)) colors[g] = c;
      }
  }

  const toLineup = (q: unknown): ImportLineup => {
    const qq = isObj(q) ? q : {};
    const name = str(qq.formation);
    const f: Formation = formationByName(
      forms,
      forms.some((x) => x.name === name) ? name : (S.defaultFormation ?? forms[0]?.name ?? ''),
    );
    const slots = Array.isArray(qq.slots) ? qq.slots : [];
    const auto = new Set(Array.isArray(qq.auto) ? qq.auto.map(Number) : []);
    const seen = new Set<string>();
    return {
      formation_name: f.name,
      slots: f.positions.map((pos, i) => {
        const id = typeof slots[i] === 'string' ? (slots[i] as string) : '';
        const ok = id && known.has(id) && !seen.has(id);
        if (ok) seen.add(id);
        return {
          position_role: pos.role,
          position_code: pos.code,
          player_key: ok ? id : null,
          auto_picked: !!ok && auto.has(i),
        };
      }),
    };
  };

  const periodsRaw = Array.isArray(src.periods) && src.periods.length ? src.periods : [];
  const template = periodsRaw.length
    ? periodsRaw.map(toLineup)
    : Array.from({ length: S.defaultPeriods }, () => toLineup({}));
  const periodsCount = S.periodOptions.includes(template.length) ? template.length : S.defaultPeriods;
  while (template.length < periodsCount) template.push(toLineup({}));
  template.length = periodsCount;

  // games
  const seenGames = new Set<string>();
  const goalType = S.scoring.events[0]?.type ?? 'goal';
  const games: ImportGame[] = (Array.isArray(src.games) ? src.games : [])
    .filter((g): g is Obj => isObj(g))
    .filter((g) => {
      const id = str(g.id) || Math.random().toString(36);
      if (seenGames.has(id)) return false;
      seenGames.add(id);
      return true;
    })
    .map((g) => {
      const lineups = (Array.isArray(g.periods) ? g.periods : []).map(toLineup);
      const n = Math.max(1, lineups.length);
      const statusRaw = str(g.status);
      const status = (['upcoming', 'live', 'done'] as const).find((s) => s === statusRaw) ?? 'done';
      const events: ImportEvent[] = (Array.isArray(g.goals) ? g.goals : [])
        .filter((x): x is Obj => isObj(x))
        .map((x) => {
          const side = x.team === 'them' ? 'them' : 'us';
          const q = Math.max(1, Math.min(12, parseInt(str(x.q), 10) || num(x.q) || 1));
          const scorer = side === 'us' ? str(x.scorer) : '';
          const assist = side === 'us' ? str(x.assist) : '';
          return {
            side,
            period_index: Math.min(q, n) - 1,
            event_type: goalType,
            scorer_key: scorer && known.has(scorer) ? scorer : null,
            assist_key: assist && known.has(assist) && assist !== scorer ? assist : null,
            occurred_at: toIso(x.ts) ?? new Date().toISOString(),
          };
        });
      const snap = isObj(g.players) ? g.players : {};
      return {
        opponent: str(g.opponent, 40).trim() || 'Opponent',
        game_date: ISO_DATE.test(str(g.date)) ? str(g.date) : todayISO(),
        status,
        created_at: toIso(g.createdAt) ?? new Date().toISOString(),
        started_at: toIso(g.startedAt),
        finished_at: toIso(g.finishedAt),
        team_name: str(g.teamName, 40) || null,
        notes: str(g.notes, 4000),
        lineups,
        events,
        players: Object.entries(snap)
          .filter(([key, v]) => known.has(key) && isObj(v))
          .map(([key, v]) => ({ key, name: str((v as Obj).name, 60), number: str((v as Obj).num, 3) })),
      };
    });
  // only one game may be live
  let liveSeen = false;
  for (const g of games) {
    if (g.status === 'live') {
      if (liveSeen) g.status = 'done';
      liveSeen = true;
    }
  }

  const lastBat = str(src.lastBat);
  const payload: ImportPayload = {
    replace,
    team: { side_size: size, has_gk: gk, periods_count: periodsCount, colors },
    players: players.map((p) => ({ ...p, batting_order: batting.get(p.key) ?? null })),
    template,
    last_batter_key: lastBat && known.has(lastBat) ? lastBat : null,
    games,
  };
  return {
    payload,
    summary: {
      players: players.length,
      games: games.length,
      events: games.reduce((n, g) => n + g.events.length, 0),
      template: template.length,
      teamName: str(raw.teamName, 40) || null,
    },
  };
}

/** Build an import payload for the sport's sample team (legacy "Load example team"). */
export function examplePayload(
  sport: SportKey,
  periods: readonly Period[],
  forms: readonly Formation[],
): ImportPayload {
  const S = SPORTS[sport];
  const players = S.sample.map((name, i) => ({
    key: `p${i}`,
    first_name: name,
    jersey_number: String(i + 1),
    is_available: true,
    batting_order: i + 1,
  }));
  const template: ImportLineup[] = periods.map((q) => {
    const f = formationByName(forms, q.formation);
    return {
      formation_name: f.name,
      slots: f.positions.map((pos, i) => ({
        position_role: pos.role,
        position_code: pos.code,
        player_key: q.slots[i] || null,
        auto_picked: false,
      })),
    };
  });
  return {
    replace: true,
    example: true,
    team: {
      side_size: S.defaultSize,
      has_gk: S.hasGK,
      periods_count: periods.length,
      colors: { ...S.defaultColors },
    },
    players,
    template,
    last_batter_key: null,
    games: [],
  };
}
