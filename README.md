# site / joeys.app
Last updated 2023-11-14T0300Z

# Cool stuff
```
rm -f /tmp-axi-server; echo $(grep -v '^#' .env.deploy) ; DEBUG=0 node server/bots/repl/repl-local.mjs 
```

# Features
- [x] 2023-11-11: Improved panel ux on mobile/desktop (host views, z-indexing)
- [x] 2023-11-11: Added `osrs/salmon-log` configuration info, simple gold sum
- [x] 2023-11-12: HTTP1.1->HTTP2 for static files
- [x] 2023-11-12: `salmon-log`: New tables in backend
- [x] 2023-11-13: Improved server-to-frontend message handling (template for e.g. REPL commands)
- [x] [lots of stuff I need to put up here]
- [x] 2023-12-02: Child subprocesses (hot-swappable in, e.g. single proc for sockets, sql)
- [x] 2023-12-03: Discord Gateway as child subprocess
- [ ] Streaming/emitting events to other processes (e.g. repl -> frontend, sql -> frontend)
- [ ] `joeysapp/socks-server` -> sending data to active TLS connections
- [ ] Discord Gateway usage
- [ ] `salmon-log`: New visuals, (blocker: ipc, new protocol defns, objs/sql payloads)
- [ ] Simple 'users' or generic way of allowing interactions w/o auth (e.g. guestbook, settings)
- [ ] LAN 'rpc' handler (LLMs/Axi/Arduinos)

# Architecture
- [x] 2023-11-12: Clearly defined .env files
- [x] [lots of stuff I need to put up here]
- [x] 2023-12-04: Understand socket lifecycles inside of processes
- [ ] **[WIP]** Understand connection lifecycles between processes
- [ ] Clearly defined protocols (e.g. "Protos", endpoints, methods, streaming of SQL rows vs. utf-8 object strings)
- [ ] Cleanup of NGINX configurations

# Spikes
- [x] Review HTTP1.1 vs HTTP2 for providing static files
- [x] Review of node EventListener best practices (e.g. rw/duplex streams, error handling)
- [x] [lots of stuff I need to put up here]
- [x] Review of web request/response communication best practices
- [x] Roadmap of `bots as a service` (mvp and requirements)
- [ ] TLS resumption and how much of it is seen (or is it all done by L3?)

# Tooling
- [x] 2023-11-10: Basic server/build "hot reloading" functionality
- [x] 2023-11-10: Basic server/build deployment scripts
- [x] 2023-11-11: Setting local dev environment back up (postgres, certs)
- [x] 2023-11-11: Clearly define nginx static caching and error routing
- [x] 2023-11-11: Clearly define webpack build pipeline
- [x] 2023-11-13: SQL sync scripts between prod/local
- [x] 2023-11-13: Consolidated session logic to single location
- [x] 2023-11-13: Clearly define environment files
- [x] 2023-11-13: Deployment process roughly defined & executed w/ ~5min downtime
- [x] [lots of stuff I need to put up here]
- [x] 2023-11-29: Server-side REPL for testing and push
- [ ] **[!!!]** Simple REPL usage and features (REPL "epic")
- [ ] Sync git submodule(s) for local and deploy
- [ ] Handle connection erroring (e.g. try 5 times over 10 minutes / posting in crash reports)

# Bugfixes
- [x] 2023-11-10: Chrome and Android websocket issue
- [x] 2023-11-11: Brave stale caching issue (fix: `no-store`)
- [x] 2023-11-12: Safari and iOS websocket payload/rolling frame issue
- [x] 2023-11-12: Postgres pool memory leak
- [x] 2023-11-12: Temporary workaround for socket event listeners
- [x] [lots of stuff I need to put up here]
