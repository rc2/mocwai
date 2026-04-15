const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { serve } = require('../main');

let tmpDir;
let serverInstance = null;
let wsClient = null;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocwai-ws-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach((done) => {
  const closeServer = () => {
    if (serverInstance) {
      serverInstance.server.closeAllConnections();
      serverInstance.listener.close(() => {
        serverInstance = null;
        done();
      });
    } else {
      done();
    }
  };

  if (wsClient) {
    if (wsClient.readyState !== WebSocket.CLOSED) {
      wsClient.once('close', closeServer);
      wsClient.terminate();
    } else {
      closeServer();
    }
    wsClient = null;
  } else {
    closeServer();
  }
});

/**
 * Write a handler file to the temp directory.
 * Clears the require cache so each test gets a fresh module.
 */
function writeHandler(filename, content) {
  const filePath = path.join(tmpDir, filename);
  delete require.cache[filePath];
  fs.writeFileSync(filePath, content);
}

/**
 * Start a server with the given websocket route config.
 * Resolves with the bound port once the server is listening.
 */
function startServer(websocketRoutes) {
  return new Promise((resolve) => {
    const conf = {
      folder: tmpDir,
      data: { websocket: websocketRoutes },
      paths: [],
    };
    serverInstance = serve({ host: 'localhost', port: 0, conf });
    serverInstance.server.once('listening', () => {
      resolve(serverInstance.server.address().port);
    });
  });
}

/**
 * Create a WebSocket connection and return the client and a promise that
 * resolves when the connection is open.
 *
 * The listener is registered BEFORE the TCP handshake begins, so message
 * listeners added to ws immediately after this call will never miss a
 * server-initiated message sent in onOpen.
 */
function connect(port, pathStr = '/ws') {
  const ws = new WebSocket(`ws://localhost:${port}${pathStr}`);
  wsClient = ws;
  const openPromise = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, openPromise };
}

/** Convenience: wait for the next message from a ws client. */
function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (d) => resolve(d.toString())));
}

describe('websocket routes', () => {

  describe('lifecycle hooks', () => {

    it('calls onOpen when a client connects', async () => {
      writeHandler('h.js', `
        module.exports = {
          onOpen: (ws) => ws.send('opened'),
        };
      `);
      const port = await startServer([{ path: '/ws', handler: 'h.js' }]);

      // Register the message listener before the handshake so we cannot
      // miss the message sent by onOpen.
      const { ws, openPromise } = connect(port);
      const msgPromise = nextMessage(ws);
      await openPromise;
      assert.equal(await msgPromise, 'opened');
    });

    it('calls onMessage with the data sent by the client', async () => {
      writeHandler('h.js', `
        module.exports = {
          onMessage: (ws, data) => ws.send('echo:' + data),
        };
      `);
      const port = await startServer([{ path: '/ws', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port);
      await openPromise;
      ws.send('hello');
      assert.equal(await nextMessage(ws), 'echo:hello');
    });

    it('calls onClose when the client disconnects', async () => {
      writeHandler('h.js', `
        module.exports = {
          onClose: () => { global.__onCloseCalled = true; },
        };
      `);
      const port = await startServer([{ path: '/ws', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port);
      await openPromise;
      await new Promise((resolve) => {
        ws.once('close', resolve);
        ws.close();
      });
      // Give the server-side close handler a tick to run
      await new Promise((r) => setImmediate(r));
      assert.equal(global.__onCloseCalled, true);
      delete global.__onCloseCalled;
    });

    it('works when only some hooks are defined', async () => {
      writeHandler('h.js', `
        // only onMessage — no onOpen or onClose
        module.exports = {
          onMessage: (ws, data) => ws.send('got:' + data),
        };
      `);
      const port = await startServer([{ path: '/ws', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port);
      await openPromise;
      ws.send('ping');
      assert.equal(await nextMessage(ws), 'got:ping');
    });

  });

  describe('path matching', () => {

    it('string: matches the exact configured path', async () => {
      writeHandler('h.js', `
        module.exports = { onOpen: (ws) => ws.send('ok') };
      `);
      const port = await startServer([{ path: '/exact', matchType: 'string', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port, '/exact');
      const msgPromise = nextMessage(ws);
      await openPromise;
      assert.equal(await msgPromise, 'ok');
    });

    it('regex: matches paths by pattern', async () => {
      writeHandler('h.js', `
        module.exports = { onOpen: (ws) => ws.send('regex-ok') };
      `);
      const port = await startServer([{ path: '^/stream/.*$', matchType: 'regex', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port, '/stream/live');
      const msgPromise = nextMessage(ws);
      await openPromise;
      assert.equal(await msgPromise, 'regex-ok');
    });

    it('params: matches parameterized paths and populates req.params', async () => {
      writeHandler('h.js', `
        module.exports = {
          onOpen: (ws, req) => ws.send(JSON.stringify(req.params)),
        };
      `);
      const port = await startServer([{ path: '/chat/:roomId', matchType: 'params', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port, '/chat/room-42');
      const msgPromise = nextMessage(ws);
      await openPromise;
      assert.deepEqual(JSON.parse(await msgPromise), { roomId: 'room-42' });
    });

    it('params: populates multiple path parameters', async () => {
      writeHandler('h.js', `
        module.exports = {
          onOpen: (ws, req) => ws.send(JSON.stringify(req.params)),
        };
      `);
      const port = await startServer([{ path: '/org/:org/repo/:repo', matchType: 'params', handler: 'h.js' }]);
      const { ws, openPromise } = connect(port, '/org/acme/repo/widget');
      const msgPromise = nextMessage(ws);
      await openPromise;
      assert.deepEqual(JSON.parse(await msgPromise), { org: 'acme', repo: 'widget' });
    });

  });

  describe('multiple routes', () => {

    it('dispatches to the correct handler based on path', async () => {
      writeHandler('a.js', `module.exports = { onMessage: (ws) => ws.send('handler-a') };`);
      writeHandler('b.js', `module.exports = { onMessage: (ws) => ws.send('handler-b') };`);
      const port = await startServer([
        { path: '/a', handler: 'a.js' },
        { path: '/b', handler: 'b.js' },
      ]);

      const { ws: wsA, openPromise: openA } = connect(port, '/a');
      await openA;
      wsA.send('go');
      const msgA = await nextMessage(wsA);
      wsA.terminate();

      // connect() sets wsClient; after terminate above we reassign it to wsB
      const { ws: wsB, openPromise: openB } = connect(port, '/b');
      await openB;
      wsB.send('go');
      const msgB = await nextMessage(wsB);

      assert.equal(msgA, 'handler-a');
      assert.equal(msgB, 'handler-b');
    });

  });

});
