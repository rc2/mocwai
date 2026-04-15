// Room-based chat handler — broadcasts messages to all other clients in the same room.
// The room name comes from the :room path parameter (matchType: "params").
//
// Try it — open two terminals and join the same room:
//   wscat -c ws://localhost:8080/ws/chat/general
//   wscat -c ws://localhost:8080/ws/chat/general

const rooms = new Map(); // room -> Set<ws>

function broadcast(room, sender, payload) {
  const clients = rooms.get(room);
  if (!clients) return;
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const client of clients) {
    if (client !== sender && client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}

module.exports = {
  onOpen: (ws, req) => {
    const room = req.params.room;
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(ws);
    ws._room = room;
    ws.send(JSON.stringify({ type: 'joined', room, members: rooms.get(room).size }));
    broadcast(room, ws, { type: 'presence', room, members: rooms.get(room).size });
  },

  onMessage: (ws, data) => {
    broadcast(ws._room, ws, data.toString());
  },

  onClose: (ws) => {
    const room = ws._room;
    const clients = rooms.get(room);
    if (!clients) return;
    clients.delete(ws);
    if (clients.size === 0) {
      rooms.delete(room);
    } else {
      broadcast(room, ws, { type: 'presence', room, members: clients.size });
    }
  },
};
