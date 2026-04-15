// Echo handler — reflects every message back to the sender.
//
// Try it:
//   wscat -c ws://localhost:8080/ws/echo

module.exports = {
  onOpen: (ws) => {
    ws.send(JSON.stringify({ type: 'welcome', message: 'connected to echo — send anything' }));
  },

  onMessage: (ws, data, isBinary) => {
    ws.send(data, { binary: isBinary });
  },
};
