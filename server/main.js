import { env } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

import {
  RootEmitter,
  Files,
  // Database,
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
  // let siteUsers = [];
  // Gonna guess for now we should just track connections outside of the http-server type

  let server = new HttpsServer({
    id,
    host: process.env.SITE_ADDRESS,
    port: process.env.SITE_HTTPS_PORT,

    onSocketData: function(request, response, netSocket, data) {
      let { url, method, headers} = request;
      let { host } = headers;
      log(id, 'data', `${method} ${host} ${url}`);

      // These would just be like, a loaded in module we pass the data to I think?
      // Hmm. Should we try to have this in request...? no... that's way slower..
      if (host === 'osrs.joeys.app') {
        if (method === 'POST') {
          oldschoolRequest(request, response, netSocket, data)
              .then((internal_message) => {
                // assume all the writing/ending has been done
                if (request.somehow_not_ended) {
                  request.end();
                }
              }).catch((err) => {
                // request.write(err);
                response.end();
              });
        }
        return;
      }

      // .. *I BELIEVE* the rest of the hosts should be internally proxieid...?
      // So I think a given netSocket needs to set their initial host otherwise idk how we know where the data/proto needs to go
      log(id, 'data', 'None of the hosts were hit, so this is likely an internal redirect?... ');
      log(id, 'data', ` Connections.length: ${this}`);
      oldschoolSocket(request, response, netSocket, data);
    },

    // There may be multiple requests over a single connection 
    onRequest: function(request, response, netSocket) {
      let { url, method, headers } = request;
      let { host } = headers;
      log(id, 'request', `${method} ${host} ${url} `);

      // [todo] This should be a thennable, but it's just piping to response and holding in memcache for now.
      if (method.toLowerCase() === 'get') {
        // files.getFile(request, response);
        // files.streamFileTo(request, response)
        //   .then((something) => {
        // 
        //   }).catch((err) => {
        // 
        //   });        
      } else if (method === 'POST') {
        // https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.1

        // Assume this was handled in ___Host behavior...?
        response.end(null, () => {
          netSocket.destroy();
          request.destroy();
        });

        // response.writeHead(200);
        // response.end('HTTP 1.0 / 200 OK', () => {
        //   request.destroy();
        //   netSocket.destroy();
        // });
      }
    },
  });
}

// Startup
const rootServer = RootServer();
const files = new Files();
console.log(fg([25, 180, 222], 'boot'));

