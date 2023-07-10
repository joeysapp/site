// Global event system (DB closing, sockets disconnecting, etc.)
import Emitter from './services/events-emitters.js';

// Process
import Files from './services/files.js';
import Database from './services/db.js';
import HttpServer from './services/http.js';

// WIP stuff
import Controllers from './services/controllers.js';
import Scrapers from './services/scrapers.js';
import Serials from './services/serials.js';
import Socks from './socks/connection.js';

// Utils
import what from './lib/common/utils/what-server.mjs'; import log from './lib/common/utils/log.mjs';

const RootEmitter = new Emitter();
export default RootEmitter;

const files = new Files();
const db = new Database();
const socks = new Socks();

// WIP stuff
const controllers = new Controllers();
const serials = new Serials();
const scrapers = new Scrapers();

// [todo] The repl should just go here?
setTimeout(() => {
  // scrapers.wikiMediaScrape();
  // scrapers.wikiMediaShow();

  log('server.js', 'todos', `\n${what([
     'Do some vague planning to have HTTP/S servers do scraping/trawling',
     'Sending bytes to Arduinos',
     'Multibroadcast UDP stuff',
     'HTTPS/TLS',
     'R/W/NEW tables',
     'Logging improvements, e.g. where does localAddress/remotePort actually go (node/blessed??) (also, is LAYERS/ID really the best way?0',
     'Having a shared services/netsocket that inherits everything from services/eventsemitter, etc.\n\tORRRRRRRRR just understanding it and manually defining stuff for now.',
     'Understanding anonymous functions vs named functions, performance, securtiy.',
     'REPL',
     'Utilizing/impl of Streams, how to handle things like request/responses themselves having events [ HTTPS changes this I bet ]',
   ])}`);
  serials.init();
  
}, 500);

// TCP Server listening for HTTP UPGRADE, changes application to WebSocket.
const socksServer = new HttpServer({ port: 9001 });
socksServer.addListener('upgrade', function(request, socket, head) {
  socks.handleUpgrade(request, socket); 
});

// While using webpackDevServer we're proxying out files through staticServer
const staticServer = new HttpServer({ port: 80 });
