# mocwai

**mocwai** is a quick mocking server for HTTP and Socket.IO. For dev, test, and prototyping.

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
