# mocwai

**mocwai** is a quick mocking server for HTTP and Socket.IO. For dev, test, and prototyping.

## Rules
- Don't expose to bright light
- Don't get it wet
- Never feed after midnight

## Summary

It operates off of a config file, supports serving static assets, inline data, supports automatic simple indexing of json/yaml data, as well as custom javascript handlers for more advanced use cases. Support for http and socket.io.

---

## Links

[![npm version](https://img.shields.io/npm/v/mocwai.svg)](https://www.npmjs.com/package/mocwai)

---

## CLI Usage

### Validate Config
```bash
mocwai validate <path-to-config>
```

### Start Mock Server
```bash
mocwai serve -c <path-to-config> [-a HOST:PORT] # Default: localhost:8080
```

After starting the server, mocwai drops you into an interactive shell where you can manually control socket behavior:

- `send <eventName> <payload>` — manually emit a socket.io message to all clients.
- `quit` — exit the server.

Example:
```bash
> send "hello" {"user":"foobar"}
> quit
```

---

## Quick Run Down for HTTP

HTTP mocking supports three modes:

### 1. `handler`
Load a JavaScript file and call exported functions (`get`, `post`, etc.).
- Can share one file across multiple routes.
- Handler is loaded once and cached.

### 2. `static`
Serve a static file from disk.
- Content-Type is based on `contentType` field.

### 3. `inline`
Respond directly with the raw value provided in the config.
- Accepts JSON-compatible types: object, array, number, string, boolean.

### Indexing static/inline data

For "static" and "inline" types you can add the `index: true` key to `static` or `inline` entries when using `matchType: "params"` to automatically index array data by path param.

Example:
```json
{
  "method": "GET",
  "matchType": "params",
  "path": "/things/:id",
  "index": true,
  "inline": [
    {"id": 1, "name": "thing-one"},
    {"id": 2, "name": "thing-two"}
  ]
}
```
This builds an index by `id`. Requests to `/things` return the full array, while `/things/:id` returns a single item matched to th key "id".

### Serving folders

```json
{
  "method": "GET",
  "matchType": "string",
  "path": "/",
  "static": "folder-path"
}
```
> see *examples/folders*

---

## Quick Run Down for Socket.IO

Socket.IO mocking supports inbound event handling:

- Define an event name (exact or regex match)
- Point to a handler file exporting functions named after events
- When a client emits the event, the matching function runs

---

## Getting Started with HTTP

### Install
```bash
npm install -g mocwai
```

### Example Config
Create a file `./config.json`:

```json
{
  "http": [
    {
      "method": "get",
      "path": "/users/1",
      "matchType": "string",
      "contentType": "application/json",
      "inline": {
        "id": 1,
        "name": "foo"
      }
    },
    {
      "method": "get",
      "path": "/index.html",
      "matchType": "string",
      "contentType": "text/html",
      "inline": "<html><body><h1>my static content</h1></body></html>"
    }
  ]
}
```

### Validate
```bash
mocwai validate ./config.json
```

### Serve
```bash
mocwai serve -c ./config.json
```

### Call
```bash
curl http://localhost:8080/users/1
```

---

## Getting Started with Socket.IO

### Example Config
```json
{
  "socket": [
    {
      "direction": "inbound",
      "event": "ping",
      "matchType": "string",
      "handler": "./handlers/ping.js"
    }
  ]
}
```

### Example Handler
`handlers/ping.js`
```js
module.exports = {
  ping: (socket, data) => {
    console.log('received ping:', data);
    socket.emit('pong', { ok: true });
  }
};
```

### Connect and Emit
Use a Socket.IO client to emit a `ping` event.

---

## More Info
See the [`./examples`](./examples) folder in the repository for more sample configs and handlers.
