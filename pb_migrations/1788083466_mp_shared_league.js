/// <reference path="../pb_data/types.d.ts" />

// Shared-league multiplayer: rooms, members, per-season squad snapshots and the
// authoritative resolved league table. All rules are open — the client is
// unauthenticated, same as the existing `scores` / `pokal_stats` collections.
//
// A room plays one starting league (`mp_rooms.league`); managers who get
// promoted/relegated carry on in their new tier, so a room can span bl/2bl/3l.
// Each (room, season, division) is its own deterministic sub-league — hence
// `division` on `mp_squads` and `mp_seasons`.
//
// up() is idempotent: it only creates a collection that doesn't already exist,
// so re-running (or a history-desynced automigrate) is a harmless no-op.
migrate((app) => {
  const open = {
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };
  const DIVS = ['bl', '2bl', '3l'];

  const exists = (name) => {
    try { app.findCollectionByNameOrId(name); return true; } catch (_) { return false; }
  };
  const ensure = (spec) => {
    if (exists(spec.name)) return;
    app.save(new Collection({ ...open, type: 'base', ...spec }));
  };

  ensure({
    name: 'mp_rooms',
    fields: [
      { name: 'code', type: 'text', required: true, max: 12 },
      { name: 'host_name', type: 'text', required: true, max: 40 },
      { name: 'league', type: 'select', required: true, maxSelect: 1, values: DIVS },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['open', 'active', 'finished'] },
      { name: 'current_season', type: 'number', onlyInt: true },
      { name: 'max_players', type: 'number', onlyInt: true },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_mp_rooms_code` ON `mp_rooms` (`code`)'],
  });

  ensure({
    name: 'mp_members',
    fields: [
      { name: 'room_code', type: 'text', required: true, max: 12 },
      { name: 'player_name', type: 'text', required: true, max: 40 },
      { name: 'client_id', type: 'text', required: true, max: 64 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_mp_members_room_name` ON `mp_members` (`room_code`, `player_name`)',
      'CREATE INDEX `idx_mp_members_room` ON `mp_members` (`room_code`)',
    ],
  });

  ensure({
    name: 'mp_squads',
    fields: [
      { name: 'room_code', type: 'text', required: true, max: 12 },
      { name: 'player_name', type: 'text', required: true, max: 40 },
      { name: 'client_id', type: 'text', required: true, max: 64 },
      { name: 'season_number', type: 'number', required: true, onlyInt: true },
      { name: 'division', type: 'select', required: true, maxSelect: 1, values: DIVS },
      { name: 'team_att', type: 'number', required: true },
      { name: 'team_def', type: 'number', required: true },
      { name: 'team_ovr', type: 'number' },
      { name: 'formation', type: 'text', max: 12 },
      { name: 'scorers', type: 'json', maxSize: 200000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_mp_squads_room_name_season` ON `mp_squads` (`room_code`, `player_name`, `season_number`)',
      'CREATE INDEX `idx_mp_squads_room_season` ON `mp_squads` (`room_code`, `season_number`)',
    ],
  });

  ensure({
    name: 'mp_seasons',
    fields: [
      { name: 'room_code', type: 'text', required: true, max: 12 },
      { name: 'season_number', type: 'number', required: true, onlyInt: true },
      { name: 'division', type: 'select', required: true, maxSelect: 1, values: DIVS },
      { name: 'seed', type: 'text', required: true, max: 64 },
      { name: 'table', type: 'json', maxSize: 200000 },
      { name: 'resolved', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_mp_seasons_room_season_div` ON `mp_seasons` (`room_code`, `season_number`, `division`)',
    ],
  });
}, (app) => {
  for (const name of ['mp_seasons', 'mp_squads', 'mp_members', 'mp_rooms']) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {
      // already gone
    }
  }
});
