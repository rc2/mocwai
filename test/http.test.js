const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { serve } = require('../main');

let tmpDir;
let serverInstance = null;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocwai-http-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach((done) => {
  if (serverInstance) {
    serverInstance.server.closeAllConnections();
    serverInstance.listener.close(() => {
      serverInstance = null;
      done();
    });
  } else {
    done();
  }
});

function writeFile(filename, content) {
  fs.writeFileSync(path.join(tmpDir, filename), content);
}

function writeHandler(filename, content) {
  const filePath = path.join(tmpDir, filename);
  delete require.cache[filePath];
  fs.writeFileSync(filePath, content);
}

function startServer(httpRoutes) {
  return new Promise((resolve) => {
    const conf = { folder: tmpDir, data: { http: httpRoutes }, paths: [] };
    serverInstance = serve({ host: 'localhost', port: 0, conf });
    serverInstance.server.once('listening', () => {
      resolve(serverInstance.server.address().port);
    });
  });
}

function get(port, urlPath, headers = {}) {
  return fetch(`http://localhost:${port}${urlPath}`, { headers });
}

function request(port, urlPath, method, body, headers = {}) {
  return fetch(`http://localhost:${port}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('http routes', () => {

  describe('inline', () => {

    it('returns a JSON object', async () => {
      const port = await startServer([{
        method: 'GET', path: '/user', matchType: 'string',
        contentType: 'application/json', inline: { id: 1, name: 'alice' },
      }]);
      const res = await get(port, '/user');
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: 1, name: 'alice' });
    });

    it('returns a plain string', async () => {
      const port = await startServer([{
        method: 'GET', path: '/hello', matchType: 'string',
        contentType: 'text/plain', inline: 'hello world',
      }]);
      const res = await get(port, '/hello');
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'hello world');
    });

    it('returns a JSON array', async () => {
      const port = await startServer([{
        method: 'GET', path: '/items', matchType: 'string',
        contentType: 'application/json', inline: [1, 2, 3],
      }]);
      const res = await get(port, '/items');
      assert.deepEqual(await res.json(), [1, 2, 3]);
    });

    it('sets the correct Content-Type header', async () => {
      const port = await startServer([{
        method: 'GET', path: '/data', matchType: 'string',
        contentType: 'application/json', inline: {},
      }]);
      const res = await get(port, '/data');
      assert.match(res.headers.get('content-type'), /application\/json/);
    });

    it('sends custom response headers', async () => {
      const port = await startServer([{
        method: 'GET', path: '/headered', matchType: 'string',
        inline: 'ok', headers: { 'X-Custom': 'test-value' },
      }]);
      const res = await get(port, '/headered');
      assert.equal(res.headers.get('x-custom'), 'test-value');
    });

    it('registers multiple methods from the methods array', async () => {
      const port = await startServer([{
        methods: ['GET', 'POST'], path: '/multi', matchType: 'string',
        contentType: 'application/json', inline: { ok: true },
      }]);
      assert.equal((await get(port, '/multi')).status, 200);
      assert.equal((await request(port, '/multi', 'POST')).status, 200);
    });

  });

  describe('static', () => {

    it('serves a file from disk', async () => {
      writeFile('data.txt', 'file contents');
      const port = await startServer([{
        method: 'GET', path: '/file', matchType: 'string',
        contentType: 'text/plain', static: 'data.txt',
      }]);
      const res = await get(port, '/file');
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'file contents');
    });

    it('serves JSON from a static file', async () => {
      writeFile('data.json', JSON.stringify({ value: 42 }));
      const port = await startServer([{
        method: 'GET', path: '/json', matchType: 'string',
        contentType: 'application/json', static: 'data.json',
      }]);
      const res = await get(port, '/json');
      assert.deepEqual(await res.json(), { value: 42 });
    });

  });

  describe('handler', () => {

    it('calls the exported function matching the HTTP method', async () => {
      writeHandler('h.js', `
        module.exports = {
          get: async (req, res) => res.status(200).json({ method: 'get' }),
        };
      `);
      const port = await startServer([{
        method: 'GET', path: '/h', matchType: 'string', handler: 'h.js',
      }]);
      const res = await get(port, '/h');
      assert.deepEqual(await res.json(), { method: 'get' });
    });

    it('passes req.body to POST handlers', async () => {
      writeHandler('h.js', `
        module.exports = {
          post: async (req, res) => res.status(201).json(req.body),
        };
      `);
      const port = await startServer([{
        method: 'POST', path: '/h', matchType: 'string', handler: 'h.js',
      }]);
      const res = await request(port, '/h', 'POST', { name: 'bob' });
      assert.equal(res.status, 201);
      assert.deepEqual(await res.json(), { name: 'bob' });
    });

    it('passes req.params to handlers on params routes', async () => {
      writeHandler('h.js', `
        module.exports = {
          get: async (req, res) => res.status(200).json(req.params),
        };
      `);
      const port = await startServer([{
        method: 'GET', path: '/things/:id', matchType: 'params', handler: 'h.js',
      }]);
      const res = await get(port, '/things/42');
      assert.deepEqual(await res.json(), { id: '42' });
    });

  });

  describe('path matching', () => {

    it('string: matches the exact path', async () => {
      const port = await startServer([{
        method: 'GET', path: '/exact', matchType: 'string',
        contentType: 'text/plain', inline: 'hit',
      }]);
      assert.equal((await get(port, '/exact')).status, 200);
      assert.equal((await get(port, '/exact/extra')).status, 404);
    });

    it('regex: matches paths by pattern', async () => {
      const port = await startServer([{
        method: 'GET', path: '^/api/v[0-9]+/ping$', matchType: 'regex',
        contentType: 'text/plain', inline: 'pong',
      }]);
      assert.equal((await get(port, '/api/v1/ping')).status, 200);
      assert.equal((await get(port, '/api/v2/ping')).status, 200);
      assert.equal((await get(port, '/api/vX/ping')).status, 404);
    });

    it('params: extracts path parameters', async () => {
      const port = await startServer([{
        method: 'GET', path: '/users/:userId/posts/:postId', matchType: 'params',
        contentType: 'application/json', inline: { ok: true },
      }]);
      assert.equal((await get(port, '/users/1/posts/99')).status, 200);
    });

  });

  describe('index routes', () => {

    const items = [
      { id: '1', name: 'alpha' },
      { id: '2', name: 'beta' },
    ];

    async function startIndexServer() {
      const port = await startServer([{
        path: '/things/:id', matchType: 'params',
        contentType: 'application/json',
        inline: JSON.parse(JSON.stringify(items)), // fresh copy each test
        index: true,
      }]);
      return port;
    }

    it('GET list returns all items', async () => {
      const port = await startIndexServer();
      const res = await get(port, '/things/');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.length, 2);
    });

    it('GET item returns the matching item', async () => {
      const port = await startIndexServer();
      const res = await get(port, '/things/1');
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: '1', name: 'alpha' });
    });

    it('GET item returns 404 for unknown id', async () => {
      const port = await startIndexServer();
      assert.equal((await get(port, '/things/999')).status, 404);
    });

    it('POST creates a new item (201)', async () => {
      const port = await startIndexServer();
      const res = await request(port, '/things/', 'POST', { id: '3', name: 'gamma' });
      assert.equal(res.status, 201);
    });

    it('POST returns 409 when item already exists', async () => {
      const port = await startIndexServer();
      const res = await request(port, '/things/', 'POST', { id: '1', name: 'duplicate' });
      assert.equal(res.status, 409);
    });

    it('PATCH updates an existing item (204)', async () => {
      const port = await startIndexServer();
      const patch = await request(port, '/things/1', 'PATCH', { id: '1', name: 'updated' });
      assert.equal(patch.status, 204);
      const body = await (await get(port, '/things/1')).json();
      assert.equal(body.name, 'updated');
    });

    it('PATCH returns 404 for unknown id', async () => {
      const port = await startIndexServer();
      assert.equal((await request(port, '/things/999', 'PATCH', { id: '999', name: 'x' })).status, 404);
    });

    it('PUT replaces an existing item (204)', async () => {
      const port = await startIndexServer();
      const put = await request(port, '/things/2', 'PUT', { id: '2', name: 'replaced', extra: true });
      assert.equal(put.status, 204);
      const body = await (await get(port, '/things/2')).json();
      assert.equal(body.extra, true);
    });

    it('DELETE removes an item (204)', async () => {
      const port = await startIndexServer();
      assert.equal((await request(port, '/things/1', 'DELETE')).status, 204);
      assert.equal((await get(port, '/things/1')).status, 404);
    });

  });

});
