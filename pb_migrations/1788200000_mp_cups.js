/// <reference path="../pb_data/types.d.ts" />

// Shared multiplayer cups: one DFB-Pokal, one UCL and one UEL per room per
// season. `seed` is frozen once every seated member has submitted a season-N
// squad (same gate as mp_seasons); every client then runs the identical seeded
// bracket from sharedCups.js. `champion` + `summary` are cached so the
// standings view needs no re-sim. All rules open — matches the other mp_*
// collections. up() is idempotent: only creates the collection if missing.
migrate((app) => {
  const open = {
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };

  const exists = (name) => {
    try { app.findCollectionByNameOrId(name); return true; } catch (_) { return false; }
  };
  const ensure = (spec) => {
    if (exists(spec.name)) return;
    app.save(new Collection({ ...open, type: 'base', ...spec }));
  };

  ensure({
    name: 'mp_cups',
    fields: [
      { name: 'room_code', type: 'text', required: true, max: 12 },
      { name: 'season_number', type: 'number', required: true, onlyInt: true },
      { name: 'competition', type: 'select', required: true, maxSelect: 1, values: ['pokal', 'ucl', 'uel'] },
      { name: 'seed', type: 'text', required: true, max: 64 },
      { name: 'champion', type: 'text', max: 60 },
      { name: 'summary', type: 'json', maxSize: 200000 },
      { name: 'resolved', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_mp_cups_room_season_comp` ON `mp_cups` (`room_code`, `season_number`, `competition`)',
    ],
  });
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId('mp_cups'));
  } catch (_) {
    // already gone
  }
});
