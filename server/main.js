import { env } from 'node:process';
const { SITE_HTTPS_PORT = 443 } = env;

import {
  RootEmitter,
  Files,
  // Database,
  HttpsServer,
} from './services/index.js';

import {
  log, fg, what, numToBytes,
  show_sockets, show_network_layers, show_http, show_init, show_files, show_time,
} from './utils//index.mjs';
// show_network_layers();
show_sockets();
show_http();
show_init();
show_files();
// show_time();

function RootServer() {
  let id = 'RootServer';
  let siteUsers = [];

  let server = new HttpsServer({
    id,
    port: SITE_HTTPS_PORT,
    onRequest: function(request, response, netSocket) {
      let { url, method, headers } = request;    
      log(id, 'request', `${method.toLowerCase()} ${url}`);

      // [todo] This should be a thennable, but it's just piping to response and holding in memcache for now.
      files.getFile(request, response);
    },
    onSocketRead: function(netSocket, readData = {}) {
      let { data, headers, signature } = readData;
      if (signature) {
        log(`${id}.NetSocket.read.signature`, `${what(signature)}`);
      }
      if (headers) {
        log(`${id}.NetSocket.read.headers`, `\n${what(headers)}`);
      }
      if (data) {
        log(`${id}.NetSocket.read.data`, `\n${what(data)}`);
      }
    },
    onSocketClose: function(netSocket, data) {
      log(`${id}.NetSocket.close`, `${netSocket.net_socket_id} [ data/headers present ]`);
    },
  });
}

// Startup
const rootServer = RootServer();
const files = new Files();
console.log(fg([25, 180, 222], 'boot'));

