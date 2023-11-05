import { env } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

import {
  RootEmitter,
  Files,
  Database,
  HttpsServer,
} from './services/index.js';
import {
  log, fg, what, numToBytes,
  show_sockets, show_network_layers, show_http, show_init, show_files, show_time,
} from '../common/utils/index.mjs';

import { oldschoolRequest, oldschoolSocket } from './services/oldschool/index.js';

// show_network_layers();
show_sockets();
show_http();
show_init();
show_files();
// // show_time();

function RootServer() {
  let id = 'RootServer';
  let server = new HttpsServer({
    id,
    host: process.env.SITE_ADDRESS,
    port: process.env.SITE_HTTPS_PORT,

    onSocketData: function(request, response, netSocket, data) {
      let { url, method, headers} = request;
      let { host } = headers;
      log(id, 'data', `${method} ${host} ${url} [${netSocket.contentType}]`);

      // These would just be like, a loaded in module we pass the data to I think?
      let isSalmonLogPost = (host === 'osrs.joeys.app' && method === 'POST' && url === '/salmon-log');
      if (isSalmonLogPost) {
        oldschoolRequest(request, response, netSocket, data)
          .then((internal_message) => {
            // Assume all the writing/ending has been done
            if (request.somehow_not_ended) {
              request.end();
            }
          }).catch((err) => {
            // request.write(err);
            response.end();
          });
        return;
      }

      let isAxidrawControlPost = (method === 'POST' && url === '/axidraw/control');

      let isWebsocketHandshake = (
        false
      );

      let isWebsocketData = (
        false
      );
      // .. *I BELIEVE* the rest of the hosts should be internally proxieid...?
      // So I think a given netSocket needs to set their initial host otherwise idk how we know where the data/proto needs to go
      log(id, 'data', 'Is socket established? ');
      // oldschoolSocket(request, response, netSocket, data);      
    },
  });
}

// Startup
const rootServer = RootServer();
const files = new Files();
const db = new Database();
console.log(fg([25, 180, 222], 'boot'));

