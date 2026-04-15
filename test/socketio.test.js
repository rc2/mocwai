const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { io: ioClient } = require('socket.io-client');
const { serve } = require('../main');

let tmpDir;
let serverInstance = null;
let client = null;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocwai-sio-test-'));
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

  if (client) {
    if (client.connected) {
      client.once('disconnect', closeServer);
      client.disconnect();
    } else {
      closeServer();
    }
    client = null;
  } else {
    closeServer();
  }
});

function writeHandler(filename, content) {
  const filePath = path.join(tmpDir, filename);
  delete require.cache[filePath];
  fs.writeFileSync(filePath, content);
}

function startServer(socketRoutes) {
  return new Promise((resolve) => {
    const conf = { folder: tmpDir, data: { socket: socketRoutes }, paths: [] };
    serverInstance = serve({ host: 'localhost', port: 0, conf });
    serverInstance.server.once('listening', () => {
      resolve(serverInstance.server.address().port);
    });
  });
}

/** Connect a Socket.IO client and resolve once connected. */
function connect(port) {
  return new Promise((resolve, reject) => {
    client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

/** Emit an event and wait for a response event. */
function emitAndWait(socket, emitEvent, payload, waitEvent) {
  return new Promise((resolve) => {
    socket.once(waitEvent, resolve);
    socket.emit(emitEvent, payload);
  });
}

describe('socket.io routes', () => {

  describe('inbound event handling', () => {

    it('calls the handler for a string-matched event', async () => {
      writeHandler('h.js', `
        module.exports = {
          ping: (socket, data) => socket.emit('pong', { ok: true }),
        };
      `);
      const port = await startServer([{
        direction: 'inbound', event: 'ping', matchType: 'string', handler: 'h.js',
      }]);
      const socket = await connect(port);
      const reply = await emitAndWait(socket, 'ping', {}, 'pong');
      assert.deepEqual(reply, { ok: true });
    });

    it('calls the handler for a regex-matched event', async () => {
      writeHandler('h.js', `
        module.exports = {
          'chat:send': (socket, data) => socket.emit('chat:ack', { received: true }),
        };
      `);
      const port = await startServer([{
        direction: 'inbound', event: '^chat:.*$', matchType: 'regex', handler: 'h.js',
      }]);
      const socket = await connect(port);
      const reply = await emitAndWait(socket, 'chat:send', {}, 'chat:ack');
      assert.deepEqual(reply, { received: true });
    });

    it('passes data from the client to the handler', async () => {
      writeHandler('h.js', `
        module.exports = {
          echo: (socket, data) => socket.emit('echoed', data),
        };
      `);
      const port = await startServer([{
        direction: 'inbound', event: 'echo', matchType: 'string', handler: 'h.js',
      }]);
      const socket = await connect(port);
      const reply = await emitAndWait(socket, 'echo', { value: 42 }, 'echoed');
      assert.deepEqual(reply, { value: 42 });
    });

    it('does not call the handler for non-matching events', async () => {
      let called = false;
      writeHandler('h.js', `
        module.exports = {
          ping: (socket) => { global.__sioCalled = true; socket.emit('pong', {}); },
        };
      `);
      const port = await startServer([{
        direction: 'inbound', event: 'ping', matchType: 'string', handler: 'h.js',
      }]);
      const socket = await connect(port);
      socket.emit('other-event', {});
      // Wait briefly to confirm no pong arrives
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(global.__sioCalled, undefined);
    });

    it('handles multiple inbound routes independently', async () => {
      writeHandler('h.js', `
        module.exports = {
          foo: (socket) => socket.emit('foo-reply', 'foo'),
          bar: (socket) => socket.emit('bar-reply', 'bar'),
        };
      `);
      const port = await startServer([
        { direction: 'inbound', event: 'foo', matchType: 'string', handler: 'h.js' },
        { direction: 'inbound', event: 'bar', matchType: 'string', handler: 'h.js' },
      ]);
      const socket = await connect(port);
      const fooReply = await emitAndWait(socket, 'foo', {}, 'foo-reply');
      const barReply = await emitAndWait(socket, 'bar', {}, 'bar-reply');
      assert.equal(fooReply, 'foo');
      assert.equal(barReply, 'bar');
    });

  });

});
