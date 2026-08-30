/// <reference path="../pb_data/types.d.ts" />

// Public/private multiplayer rooms: a public room (status=open) is discoverable
// in the lobby's browse list; a private one is join-by-code only.
// up() is idempotent — skips if `visibility` already exists.
migrate((app) => {
  const rooms = app.findCollectionByNameOrId('mp_rooms');
  if (rooms.fields.some((f) => f.name === 'visibility')) return;

  rooms.fields.add(new SelectField({
    name: 'visibility',
    required: false,
    maxSelect: 1,
    values: ['public', 'private'],
  }));
  rooms.addIndex('idx_mp_rooms_browse', false, 'visibility, status', '');
  app.save(rooms);
}, (app) => {
  const rooms = app.findCollectionByNameOrId('mp_rooms');
  rooms.fields.removeByName('visibility');
  try { rooms.removeIndex('idx_mp_rooms_browse'); } catch (_) {}
  app.save(rooms);
});
