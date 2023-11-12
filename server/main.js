import { env } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

// Base functions
import {
  RootEmitter,
  Files,
  Database,
  HttpsServer,
} from './services/index.js';

// Endpoints
import { oldschoolRequest, oldschoolInit } from './services/oldschool/index.js';

// Utilities
import {
  log, fg, what, numToBytes,
  show_sockets, show_network_layers, show_http, show_init, show_files, show_time,
} from '../common/utils/index.mjs';
import { Proto } from '../common/types/index.mjs';

// show_network_layers();
show_sockets();
show_http();
show_init();
show_files();
// // show_time();

function RootServer() {
  let server = new HttpsServer({
    id: 'RootServer',
    host: process.env.root_host,
    port: process.env.root_port,

    onSocketData: function(request, response, netSocket, data) {
      let { url, method, headers = {}} = request;
      let { host } = headers;

      let isSalmonLogPost = (host === 'osrs.joeys.app' && method === 'POST' && url === '/salmon-log');
      if (isSalmonLogPost) {
        try {
        oldschoolRequest(request, response, netSocket, data)
          .then((internal_message) => {            
            // Assume all the writing/ending has been done
            if (request.somehow_not_ended) {
              request.end();
            }
          }).catch((err) => {
            // response.end();
          });
        } catch (err) {
          log('wat', err);
        }
        return;
      }

      let isWebsocketHandshake = false;
      let isWebsocketData = netSocket.keepAliveInterval
      if (isWebsocketData) {
        let { URI = [], method = [] } = data;
        let endpoint = URI.join('/');
        if (endpoint === 'osrs/salmon/log') {
          oldschoolInit(request, response, netSocket, data);
        }
      }
    },
  });
}

const rootServer = RootServer();
const files = new Files();
const db = new Database();
console.log(fg([25, 180, 222], 'boot'));
