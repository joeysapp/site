# site / joeys.app
Last updated 2023-11-12T1300Z

# Features
- [x] 2023-11-11: Improved panel ux on mobile/desktop (host views, z-indexing)
- [x] 2023-11-11: Added `osrs/salmon-log` configuration info, simple gold sum
- [ ] Discord Gateway usage
- [ ] Child subprocesses (hot-swappable in, e.g. single proc for sockets, sql)
- [ ] Discord Gateway as child subprocess
- [ ] Adding several new `salmon-log` tables and visuals
- [ ] "Remote procedure call" handler as subprocesses (e.g. machine running LLMs, Arduinos running plotter)
- [ ] Simple "users" / generic method of allowing site interactions w/o auth (e.g. guestbook, settings)

# Architecture
- [ ] **[XL]** Clearly defined socket lifecycles (e.g. root event listeners, resumptions)
- [ ] **[XL]** Clearly defined protocol use (e.g. URIs, streaming of SQL rows vs. utf-8 object strings)
- [ ] Clearly defined .env files
- [ ] Cleanup of NGINX configurations

# Spikes
- [ ] Roadmap of `bots as a service` (mvp and requirements)
- [ ] Review of web request/response communication best practices
- [ ] Review of node EventListener best practices (e.g. rw/duplex streams, error handling)

# Tooling
- [x] 2023-11-10: Basic server/build "hot reloading" functionality
- [x] 2023-11-10: Basic server/build deployment scripts
- [x] 2023-11-11: Setting local dev environment back up (postgres, certs)
- [x] 2023-11-11: Clearly define nginx static caching and error routing
- [x] 2023-11-11: Clearly define webpack build pipeline
- [ ] Server-side REPL for testing
- [ ] Sync git submodules for local server and frontend dev
- [ ] Handle simple HTTP1 erroring out (crash reports)
- [ ] Handle HTTP1.1 sockets erroring out (e.g. try 5 times over 10 minutes / posting in crash reports)


# Bugfixes
- [x] 2023-11-10: Chrome and Android websocket issue
- [x] 2023-11-11: Brave stale caching issue (fix: `no-store`)
- [x] 2023-11-12: Safari and iOS websocket payload/rolling frame issue
