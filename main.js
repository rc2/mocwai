#!/usr/bin/env node
const fs = require("fs");
const pathlib = require("path");
const readline = require("readline");

const express = require("express");

const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const yaml = require("js-yaml");
const chokidar = require("chokidar");
const { Command } = require("commander");
const Ajv = require("ajv");

const packageJson = require(pathlib.join(__dirname, "package.json"));

const { getVarsFromParamsPath, isText } = require("./lib/util");
const validate = require('./lib/schema/validate');

const program = new Command();
program
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);



program
  .command("serve")
  .description("start mocwai server")
  .option(
    "-a, --address <host:port>",
    "host and port to bind",
    "localhost:8080"
  )
  .option("-c, --config <path>", "path to config JSON file", "")
  .option("--watch", "reload on config/handler/static changes")
  .action(({ address, config, watch }) => {
    let currentServer;
    let conf = {folder:'', data: '', paths: []};

    function start() {
      if (!!currentServer) {
        console.log("⏹️ stopping server...");
        currentServer.listener.close();
      }
      const [host, port] = address.split(":");
      console.log("🔁 loading config...");
      conf = loadAndValidateConfig(pathlib.resolve(config));
      console.log("▶️  starting server...");
      currentServer = serve({ host, port, conf });
    }

    start();

    if (!!watch) {
      conf.paths.forEach(path => {
        console.log(`👀 watching ${path} for changes`);
      });
      const watcher = chokidar.watch([conf.folder, ...conf.paths], { ignoreInitial: true });
      watcher.setMaxListeners(Infinity);
      watcher.on("all", (event, filePath) => {
        console.log(`📄 file ${event}: ${filePath}`);
        start();
      });
    }

  });

program
  .command("validate")
  .description("validate a mocwai config file")
  .argument("<path>", "config file path")
  .action((configPath) => {
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    const schema = require(pathlib.join(
      __dirname,
      "lib",
      "schema",
      "data",
      "schema.json"
    ));
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const validate = ajv.compile(schema);

    if (validate(data)) {
      console.log("✅ config is valid");
    } else {
      console.error("❌ config is invalid");
      console.error(validate.errors);
      process.exit(1);
    }
  });

function serve({ host, port, conf }) {

  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server);

  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    req.context = { conf };
    next();
  });

  app.use((req, res, next) => {
    process.stdout.write("\n");
    console.dir(
      {
        method: req.method,
        path: req.path,
        body: req.body,
        params: req.params,
        query: JSON.parse(JSON.stringify(req.query)),
      },
      { depth: null, colors: true }
    );
    process.stdout.write("> ");
    next();
  });

  const handlerCache = new Map();
  const httpRoutes = conf.data.http || [];

  // integrity check
  httpRoutes.forEach((route, index) => {
    if (!!route.static && !fs.existsSync(pathlib.join(conf.folder, route.static))) {
      console.error(
        `static path for route[${index}] does not exist: ${route.static}`
      );
      process.exit(-1);
    }
    if (!!route.handler && !fs.existsSync(pathlib.join(conf.folder, route.handler))) {
      console.error(
        `handler path for route[${index}] does not exist ${route.handler}`
      );
      process.exit(-1);
    }
    if (!!route.index && route.matchType !== "params") {
      console.error(
        `indexed routes must use matchType=="params"`
      )
      process.exit(-1);
    }
    if (!!route.index && route.contentType !== "application/json") {
      console.error(
        `only contentType=="application/json" is indexable`
      )
      process.exit(-1);
    }
  });

  httpRoutes.forEach((route) => {
    const methods = (Array.isArray(route.methods)
      ? route.methods
      : [route.method]).map(m=>m.toLowerCase());
    let paths = [
      route.matchType === "regex" ? new RegExp(route.path) : route.path
    ];

    methods.forEach((method) => {
      if (!!route.handler) {
        if (!handlerCache[route.handler]) {
          const handlerPath = pathlib.join(conf.folder, route.handler);
          delete require.cache[require.resolve(handlerPath)];
          handlerCache[route.handler] = require(handlerPath);
        }
        // registering route
        paths.forEach(path => {
          console.info("✅ registering route with user defined handler", {method, path, contentType: route.contentType});
          if (!!route.contentType) {
            app[method](path, async(req, res, next) => {
              res.setHeader('Content-Type', route.contentType);
              await handlerCache[route.handler][method](req, res, next);
            });
          } else {
            app[method](path, async(req, res, next) => {
              await handlerCache[route.handler][method](req, res, next);
            });
          }
        })
      } else if (!!route.static || !!route.inline) {
        const routeType = !!route.static ? "static" : "inline";
        if (!!route.index) {
          const index = {};
          let varnames = [];
          let items = null;
          try {
            varnames = getVarsFromParamsPath(route.path);
          } catch (e) {
            console.error(`could not extract vars from path "${route.path}"`);
            process.exit(-1);
          }
          if (!!route.static) {
            items = yaml.load(fs.readFileSync(pathlib.resolve(conf.folder, route.static)).toString());
          } else if (!!route.inline) {
            items = route.inline;
          }
          // build the index
          if (!Array.isArray(items)) {
            console.error(`only array's are indexable`);
            process.exit(-1);
          }
          // build index
          items.forEach((item) => {
            const key = varnames.map((varname) => item[varname]); // extract related values to get the key
            index[key] = item;
          });
          // add a list endpoint
          if (varnames.length == 1) { // like "/some/path/:varname" not "/some/path/:varname1/and/:varname2"
            paths.push(route.path.replace(':' + varnames[0], ''));
          }
          const routeHandlerFunc = (req, res, next) => {
            if (!!route.contentType) {
              res.setHeader('Content-Type', route.contentType);
            }
            if (Object.keys(req.params).length > 0) {
              const key = varnames.map((varname) => req.params[varname]); // get the key
              const item = index[key];
              if (!item) {
                res.status(404).send(null);
              } else {
                res.status(200).send(JSON.stringify(item, null, 2));
              }
            } else {
              res.status(200).send(JSON.stringify(items, null, 2));
            }
          };
          // registering route
          paths.forEach(path => {
            console.info(`✅ registering ${routeType} route with index`, {method, path,  contentType: route.contentType});
            app[method](path, routeHandlerFunc);
          });
        } else {
          let payload = null;
          if (!!route.static) {
            const staticPath = pathlib.resolve(conf.folder, route.static);
            const stats = fs.statSync(staticPath);
            if (stats.isDirectory()) {
              console.info(`✅ registering static folder route`, {method, path: route.static});
              app.use(
                route.path,
                express.static(staticPath)
              );
              return;
            } else {
              const raw = fs.readFileSync(staticPath);
              switch (route.contentType) {
                case "application/json":
                case "application/yaml":
                case "application/x-yaml":
                  payload = yaml.load(raw.toString());
                break;
                default:
                  if (isText(route.contentType)) {
                    payload = raw.toString();
                  } else {
                    payload = raw;
                  }
                break;
              }
            }
          } else if (!!route.inline) {
            // inline base64 with mimetype
            if (typeof(route.inline) === "string") {
              const inlineBase64 = route.inline.match(/^data:(.*?);base64,(.*?)$/);
              if (!!inlineBase64) {
                let contentType = inlineBase64[1];
                let base64Data = inlineBase64[2];
                if (route.contentType.length == 0) {
                  route.contentType = contentType;
                }
                const raw = atob(base64Data);
                if (isText(contentType)) {
                  payload = raw.toString();
                } else {
                  payload = raw;
                }
              } else {
                payload = route.inline;
              }
            } else {
              payload = route.inline;
            }
            if (typeof(route.contentType)==="string" && !!route.contentType.match(/json|yaml/)) {
              let formatted = null;
              try {
                formatted = JSON.stringify(payload, null, 2);
              } catch {
                formatted = payload;
              }
              payload = formatted;
            }
          }
          const routeHandlerFunc = (req, res, next) => {
            if (!!route.contentType) {
              res.setHeader('Content-Type', route.contentType);
            }
            res.status(200).send(payload);
          };
          // registering route
          paths.forEach(path => {
            console.info(`✅ registering ${routeType} route`, {method, path, contentType: route.contentType});
            app[method](path, routeHandlerFunc);
          })
        }
      }
    });
  });


  io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);

    (conf.data.socket || []).forEach((entry) => {
      if (entry.direction !== "inbound") return;

      const isRegex = entry.matchType === "regex";
      const matcher = isRegex ? new RegExp(entry.event) : entry.event;
      const handlerPath = pathlib.resolve(__dirname, "socket", entry.handler);
      const handlerModule = require(handlerPath);

      socket.onAny((event, data) => {
        const match = isRegex ? matcher.test(event) : event === matcher;
        if (match && handlerModule[event]) {
          handlerModule[event](socket, data);
        }
      });
    });
  });

  const listener = server.listen(Number(port), host, () => {
    console.log(`mocwai server running on http://${host}:${port}`);
    shell(io);
  });

  return { server, app, io, listener };
}

function loadAndValidateConfig(configPath) {
  const config = {
    data: JSON.parse(fs.readFileSync(configPath, "utf-8")),
    folder: pathlib.dirname(configPath),
    paths: [],
  };

  const result = validate(config.data);
  if (!result.pass) {
    console.error(`config failed validation "${configPath}"`);
    console.dir(result.errors, { depth: null, colors: true });
    process.exit(-1);
  }

  let paths = [];
  if (!!config.data.http) {
    config.data.http.forEach(route => {
      if (!!route.static) {
        paths.push(pathlib.join(config.folder, route.static));
      } else if (!!route.handler) {
        paths.push(pathlib.join(config.folder, route.handler));
        if (!!route.assets && Array.isArray(route.assets)) {
          route.assets.forEach(asset => {
            paths.push(pathlib.join(config.folder, asset));
          });
        }
      }
    });
  }
  if (!!config.data.socket) {
    paths.push(...config.data.socket.map(route => {
      return !!route.handler ? pathlib.join(config.folder, route.handler) : undefined;
    }).filter(path=>!!path));
  }
  config.paths = Array.from(new Set(paths));

  return config;
}

function shell(io) {
  function shellUsage() {
    console.log("mocwai shell");
    console.log("");
    console.log("Usage:");
    console.log("");
    console.log("Commands:");
    console.log("  help|?                      display this help");
    console.log("  send <message> <payload>    send a socket.io message");
    console.log(
      "  quit|q                      quit the shell and app (CTRL-C works too)"
    );
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.on("SIGINT", () => {
    rl.close();
    process.exit(0);
  });

  shellUsage();
  rl.prompt();

  rl.on("line", (line) => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (cmd == "help" || cmd == "?") {
      shellUsage();
    } else if (cmd === "quit" || cmd == "q") {
      rl.close();
      process.exit(0);
    } else if (cmd === "send") {
      const [eventName, ...payloadParts] = rest;
      const payload = payloadParts.join(" ");
      try {
        const parsed = payload ? JSON.parse(payload) : {};
        io.emit(eventName, parsed);
        console.log(`📤 sent '${eventName}' with payload`, parsed);
      } catch (e) {
        console.error("⚠️  invalid JSON payload");
      }
    } else {
      console.log("unknown command");
    }
    rl.prompt();
  });
}

program.parse();
