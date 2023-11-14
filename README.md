# site / joeys.app
Last updated 2023-11-14T0300Z

# Features
- [x] 2023-11-11: Improved panel ux on mobile/desktop (host views, z-indexing)
- [x] 2023-11-11: Added `osrs/salmon-log` configuration info, simple gold sum
- [x] 2023-11-12: HTTP1.1->HTTP2 for static files
- [x] 2023-11-12: `salmon-log`: New tables in backend
- [x] 2023-11-13: Improved server-to-frontend message handling (template for e.g. REPL commands)
- [ ] Discord Gateway usage
- [ ] Child subprocesses (hot-swappable in, e.g. single proc for sockets, sql)
- [ ] Discord Gateway as child subprocess
- [ ] `salmon-log`: New visuals (requires new protocol defns, objs/sql payloads)
- [ ] "Remote procedure call" handler as subprocesses (e.g. machine running LLMs, Arduinos running plotter)
- [ ] Simple "users" / generic method of allowing site interactions w/o auth (e.g. guestbook, settings)

# Architecture
- [x] 2023-11-12: Clearly defined .env files
- [ ] **[WIP]** Clearly defined socket lifecycles (e.g. root event listeners, resumptions)
- [ ] **[WIP]** Clearly defined protocol use (e.g. URIs, streaming of SQL rows vs. utf-8 object strings)
- [ ] Cleanup of NGINX configurations

# Spikes
- [x] Review HTTP1.1 vs HTTP2 for providing static files
- [x] Review of node EventListener best practices (e.g. rw/duplex streams, error handling)
- [ ] Roadmap of `bots as a service` (mvp and requirements)
- [ ] Review of web request/response communication best practices

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
- [ ] Server-side REPL for testing and push
- [ ] Sync git submodule(s) for local and deploy
- [ ] Handle simple HTTP1 erroring out (crash reports)
- [ ] Handle HTTP1.1 sockets erroring out (e.g. try 5 times over 10 minutes / posting in crash reports)

# Bugfixes
- [x] 2023-11-10: Chrome and Android websocket issue
- [x] 2023-11-11: Brave stale caching issue (fix: `no-store`)
- [x] 2023-11-12: Safari and iOS websocket payload/rolling frame issue
- [x] 2023-11-12: Postgres pool memory leak
- [x] 2023-11-12: Temporary workaround for socket event listeners
