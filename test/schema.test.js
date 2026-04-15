const assert = require('assert');
const fs = require('fs');
const path = require('path');
const validate = require('../lib/schema/validate');

describe('schema validation', () => {

  describe('existing fixtures', () => {
    it('passes a valid config', () => {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/schema/testdata/pass.json')));
      assert.equal(validate(config).pass, true);
    });

    it('fails an invalid config', () => {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/schema/testdata/fail.json')));
      assert.equal(validate(config).pass, false);
    });
  });

  describe('http routes', () => {

    describe('valid', () => {

      it('accepts a route with method + inline', () => {
        const result = validate({ http: [{ method: 'GET', path: '/health', inline: 'ok' }] });
        assert.equal(result.pass, true);
      });

      it('accepts a route with methods array', () => {
        const result = validate({ http: [{ methods: ['GET', 'POST'], path: '/items', inline: [] }] });
        assert.equal(result.pass, true);
      });

      it('accepts a route with static', () => {
        const result = validate({ http: [{ method: 'GET', path: '/file', static: 'data.txt' }] });
        assert.equal(result.pass, true);
      });

      it('accepts a route with handler', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api', handler: 'h.js' }] });
        assert.equal(result.pass, true);
      });

      it('accepts matchType: string', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api', inline: 'ok', matchType: 'string' }] });
        assert.equal(result.pass, true);
      });

      it('accepts matchType: regex', () => {
        const result = validate({ http: [{ method: 'GET', path: '^/api$', inline: 'ok', matchType: 'regex' }] });
        assert.equal(result.pass, true);
      });

      it('accepts matchType: params', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api/:id', inline: 'ok', matchType: 'params' }] });
        assert.equal(result.pass, true);
      });

      it('accepts a route with headers', () => {
        const result = validate({ http: [{ method: 'GET', path: '/h', inline: 'ok', headers: { 'X-Foo': 'bar' } }] });
        assert.equal(result.pass, true);
      });

      it('accepts an indexed route without method/methods', () => {
        const result = validate({ http: [{
          path: '/things/:id', matchType: 'params',
          contentType: 'application/json', inline: [], index: true,
        }] });
        assert.equal(result.pass, true);
      });

    });

    describe('invalid', () => {

      it('rejects a non-indexed route missing both method and methods', () => {
        const result = validate({ http: [{ path: '/api', inline: 'ok' }] });
        assert.equal(result.pass, false);
      });

      it('rejects a route missing a response type (no handler, static, or inline)', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api' }] });
        assert.equal(result.pass, false);
      });

      it('rejects an invalid method value', () => {
        const result = validate({ http: [{ method: 'INVALID', path: '/api', inline: 'ok' }] });
        assert.equal(result.pass, false);
      });

      it('rejects an invalid matchType value', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api', inline: 'ok', matchType: 'glob' }] });
        assert.equal(result.pass, false);
      });

      it('rejects a methods array with zero items', () => {
        const result = validate({ http: [{ methods: [], path: '/api', inline: 'ok' }] });
        assert.equal(result.pass, false);
      });

      it('rejects a route with more than one response type', () => {
        const result = validate({ http: [{ method: 'GET', path: '/api', inline: 'ok', handler: 'h.js' }] });
        assert.equal(result.pass, false);
      });

    });

  });

  describe('socket.io routes', () => {

    describe('valid', () => {

      it('accepts a minimal inbound route', () => {
        const result = validate({ socket: [{ direction: 'inbound', event: 'ping', handler: 'h.js' }] });
        assert.equal(result.pass, true);
      });

      it('accepts an inbound route with matchType: regex', () => {
        const result = validate({ socket: [{ direction: 'inbound', event: '^ping.*$', matchType: 'regex', handler: 'h.js' }] });
        assert.equal(result.pass, true);
      });

      it('accepts an outbound route without a handler', () => {
        const result = validate({ socket: [{ direction: 'outbound', event: 'system:ping' }] });
        assert.equal(result.pass, true);
      });

      it('accepts an outbound route with matchType: string', () => {
        const result = validate({ socket: [{ direction: 'outbound', event: 'msg', matchType: 'string' }] });
        assert.equal(result.pass, true);
      });

    });

    describe('invalid', () => {

      it('rejects a route missing direction', () => {
        const result = validate({ socket: [{ event: 'ping', handler: 'h.js' }] });
        assert.equal(result.pass, false);
      });

      it('rejects a route missing event', () => {
        const result = validate({ socket: [{ direction: 'inbound', handler: 'h.js' }] });
        assert.equal(result.pass, false);
      });

      it('rejects an inbound route missing handler', () => {
        const result = validate({ socket: [{ direction: 'inbound', event: 'ping' }] });
        assert.equal(result.pass, false);
      });

      it('rejects an invalid direction value', () => {
        const result = validate({ socket: [{ direction: 'subscribe', event: 'ping', handler: 'h.js' }] });
        assert.equal(result.pass, false);
      });

      it('rejects matchType: params (not supported for socket.io)', () => {
        const result = validate({ socket: [{ direction: 'inbound', event: 'ping', handler: 'h.js', matchType: 'params' }] });
        assert.equal(result.pass, false);
      });

    });

  });

  describe('websocket routes', () => {
    it('accepts a minimal route (path + handler)', () => {
      const result = validate({ websocket: [{ path: '/ws', handler: 'handlers/ws.js' }] });
      assert.equal(result.pass, true);
    });

    it('accepts matchType: string', () => {
      const result = validate({ websocket: [{ path: '/ws', handler: 'h.js', matchType: 'string' }] });
      assert.equal(result.pass, true);
    });

    it('accepts matchType: regex', () => {
      const result = validate({ websocket: [{ path: '^/ws/.*$', handler: 'h.js', matchType: 'regex' }] });
      assert.equal(result.pass, true);
    });

    it('accepts matchType: params', () => {
      const result = validate({ websocket: [{ path: '/chat/:roomId', handler: 'h.js', matchType: 'params' }] });
      assert.equal(result.pass, true);
    });

    it('accepts route without matchType (defaults to string)', () => {
      const result = validate({ websocket: [{ path: '/ws', handler: 'h.js' }] });
      assert.equal(result.pass, true);
    });

    it('rejects a route missing path', () => {
      const result = validate({ websocket: [{ handler: 'h.js' }] });
      assert.equal(result.pass, false);
    });

    it('rejects a route missing handler', () => {
      const result = validate({ websocket: [{ path: '/ws' }] });
      assert.equal(result.pass, false);
    });

    it('rejects an unknown property on a route', () => {
      const result = validate({ websocket: [{ path: '/ws', handler: 'h.js', unknown: true }] });
      assert.equal(result.pass, false);
    });

    it('rejects an invalid matchType value', () => {
      const result = validate({ websocket: [{ path: '/ws', handler: 'h.js', matchType: 'glob' }] });
      assert.equal(result.pass, false);
    });

    it('accepts a config with both http and websocket sections', () => {
      const result = validate({
        http: [{ method: 'GET', path: '/health', inline: 'ok' }],
        websocket: [{ path: '/ws', handler: 'h.js' }],
      });
      assert.equal(result.pass, true);
    });
  });

});
