# mocwai

**mocwai** is a quick mocking server for HTTP and Socket.IO. For dev, test, and prototyping.

## Rules

- Don't expose to bright light
- Don't get it wet
- Never feed after midnight

## Summary

It operates off of a config file, supports serving static assets, inline data, supports automatic simple indexing of json/yaml data, as well as custom javascript handlers for more advanced use cases. Support for http and socket.io. Watches route for changes and reloads on change (using `--watch` switch).

## JSON Schema

- See [`./lib/schema/data/schema.json`](https://raw.githubusercontent.com/rc2/mocwai/refs/heads/master/lib/schema/data/schema.json)

---

## Considerations

- When using custom handlers in mocwai within an ESM project (i.e. `{type: "module"}`) you must use `.cjs` extension.
- Indexed endpoints do not need to define method/methods. They automatically receive GET, POST, PATCH, PUT, and DELETE.
- Can serve headers via "headers" key.

---

## Links

- [![npm version](https://img.shields.io/npm/v/mocwai.svg)](https://www.npmjs.com/package/mocwai)
- [JSON Schema](https://raw.githubusercontent.com/rc2/mocwai/refs/heads/master/lib/schema/data/schema.json)

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

### Start Mock Server and Watch for Changes
```bash
mocwai serve -c <path-to-config> [-a HOST:PORT] --watch
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
- If using within an ESM project, you must name your extension `.cjs`, not `.js`.

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
  "matchType": "params",
  "path": "/things/:id",
  "index": true,
  "inline": [
    {"id": 1, "name": "thing-one"},
    {"id": 2, "name": "thing-two"}
  ]
}
```
- This builds an index by `id`. Requests to `/things` return the full array, while `/things/:id` returns a single item matched to th key "id". 
- The following endpoints will be provided automatically:
  - GET /things
  - POST /things
  - PUT /things/:id
  - PATCH patch /things/:id
  - DELETE /things/:id
- The updated inline/static data (from POST/PUT/PATCH/DELETE) will NOT persist across restarts.
---

### Serving headers

You can serve custom headers via "headers" key.

```json
{
  "method": "GET",
  "matchType": "string",
  "path": "/",
  "inline": "ok",
  "headers": {
    "X-foo": "foobar"
  }
}
```


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

### Adding files not found by file watcher

When executed in watch mode via `--watch`, all files referenced in "static" or "handler" routes will be monitored for changes and upon change, cause the server to reload all routes. This works nicely most of the time, but this may miss some files when using "handler" type routes. While the handler itself is tracked for changes, assets it uses will not be tracked (for example data that it relies on). To track assets used by the handler for changes, use the "assets" key and provide an array of the additional paths you would like to monitor for changes. Technically, the assets don't have to be related to your handler.

```json5
{
  "method": "GET",
  "matchType": "params",
  "path": "/widgets/:name",
  "handler": "./my-handler/main.js", // in this case ./main.js relies on ./data.json
  "assets": [
    "./my-handler/data.json",
    "../some/possibly/related/file.txt"
  ]
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
      "contentType": "text/html"
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
