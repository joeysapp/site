import { env } from 'node:process';
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
// show_network_layers();
show_sockets();
show_http();
show_init();
show_files();
// // show_time();

function RootServer() {
  let id = 'RootServer';
  let siteUsers = [];

  let server = new HttpsServer({
    id,
    host: process.env.SITE_ADDRESS,
    port: process.env.SITE_HTTPS_PORT,

    onRequest: function(request, response, netSocket) {
      let { url, method, headers } = request;    
      log(id, 'request', `${method.toLowerCase()} ${url} but the underlying http-server is doing everything/`);

      // [todo] This should be a thennable, but it's just piping to response and holding in memcache for now.
      if (method.toLowerCase() === 'get') {
        files.getFile(request, response);
        // files.streamFileTo(request, response)
        //   .then((something) => {
        // 
        //   }).catch((err) => {
        // 
        //   });        
      } else {
        // https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.1
        
        response.writeHead(200);
        response.end('HTTP 1.0 / 200 OK', () => {
          request.destroy();
          netSocket.destroy();
        });
      }
    },
  });
}

// Startup
const rootServer = RootServer();
const files = new Files();
console.log(fg([25, 180, 222], 'boot'));

