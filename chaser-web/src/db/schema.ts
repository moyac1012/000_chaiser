import { CompiledQuery, type Kysely } from "kysely";

import type { Database } from "./types";

const SCHEMA_STATEMENTS = [
  `
CREATE TABLE IF NOT EXISTS user_bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  blockly_xml TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  `
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id TEXT NOT NULL,
  status TEXT NOT NULL,
  cool_bot_id INTEGER,
  hot_bot_id INTEGER,
  owner_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cool_bot_id) REFERENCES user_bots(id),
  FOREIGN KEY (hot_bot_id) REFERENCES user_bots(id)
);
`,
  `
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  max_turns INTEGER NOT NULL,
  cool_start_x INTEGER NOT NULL,
  cool_start_y INTEGER NOT NULL,
  hot_start_x INTEGER NOT NULL,
  hot_start_y INTEGER NOT NULL,
  map_data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_official INTEGER NOT NULL DEFAULT 0
);
`,
  `CREATE INDEX IF NOT EXISTS idx_maps_is_official ON maps (is_official);`,
  `
CREATE TABLE IF NOT EXISTS replays (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  winner TEXT,
  cool_bot_name TEXT NOT NULL DEFAULT '',
  hot_bot_name TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]'
);
`,
  `
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  current_step_id TEXT,
  completed_steps_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, language)
);
`,
  `CREATE INDEX IF NOT EXISTS idx_tutorial_progress_user ON tutorial_progress (user_id);`,
  `
CREATE TABLE IF NOT EXISTS tutorial_step_states (
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  step_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  blockly_xml TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, language, step_id)
);
`,
  `CREATE INDEX IF NOT EXISTS idx_tutorial_step_states_user ON tutorial_step_states (user_id);`,
  `
CREATE TABLE IF NOT EXISTS room_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  slot TEXT,
  bot_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (role IN ('owner', 'player', 'spectator')),
  CHECK (slot IN ('Cool', 'Hot') OR slot IS NULL)
);
`,
  `CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);`,
  `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'running', 'finished')),
  registration_mode TEXT NOT NULL DEFAULT 'invite',
  created_at DATETIME NOT NULL,
  finished_at DATETIME
);
`,
  `
CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);
`,
  `
CREATE TABLE IF NOT EXISTS tournament_participant_requests (
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, user_id)
);
`,
  `CREATE INDEX IF NOT EXISTS idx_tournament_participant_requests_tournament ON tournament_participant_requests(tournament_id);`,
  `
CREATE TABLE IF NOT EXISTS matchups (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  player_a_id TEXT NOT NULL,
  player_b_id TEXT NOT NULL,
  created_at DATETIME NOT NULL
);
`,
  `
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  matchup_id TEXT NOT NULL,
  cool_user_id TEXT NOT NULL,
  hot_user_id TEXT NOT NULL,
  cool_bot_id INTEGER NOT NULL,
  hot_bot_id INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  result TEXT CHECK (result IN ('cool', 'hot', 'draw')),
  status TEXT NOT NULL CHECK (status IN ('valid', 'invalid')),
  invalid_reason TEXT,
  replay_id TEXT,
  created_at DATETIME NOT NULL
);
`,
] as const;

export async function ensureSchema(db: Kysely<Database>): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.executeQuery(CompiledQuery.raw(statement));
  }

  const columns = await db.executeQuery(
    CompiledQuery.raw("PRAGMA table_info('tournaments');"),
  );
  const hasRegistrationMode = columns.rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const name = (row as { name?: unknown }).name;
    return name === "registration_mode";
  });
  if (!hasRegistrationMode) {
    await db.executeQuery(
      CompiledQuery.raw(
        "ALTER TABLE tournaments ADD COLUMN registration_mode TEXT NOT NULL DEFAULT 'invite';",
      ),
    );
  }
}
