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


    onSocketData: function(request, response, netSocket, data) {
      let { url, method, headers} = request;
      let { host } = headers;
      log(id, 'data', `${method.toLowerCase()} ${host} ${url}`);

      // These would just be like, a loaded in module we pass the data to I think?
      if (host === 'osrs.joeys.app') {
        let { signature, auth, payload } = data;
        let salmonFile = path.resolve('/Users/zooey/Documents/code/site/files/text/salmon_log.csv');
        let stream = fs.createWriteStream(salmonFile, { flags: 'a' });
        let string = payload.reduce((payloadString, msgObject, idx) => {
          let sender = msgObject.sender;
          if (sender !== 'Sals Realm') return payloadString;

          let line = Object.keys(msgObject).reduce((line, key, idx) => {
            let s = `${line}${msgObject[key]}`;
            if (idx === Object.keys(msgObject).length-1) {
              s += '\n';
            } else {
              s += ',';
            }
            return s;
          }, '');
          
          return `${payloadString}${line}`;
        }, '');
        if (string) {
          log(id, 'data', 'Write out data to logfile');
          stream.on('ready', () => {
            stream.write(string, () => {
              log('data', 'wrote out to file');
              stream.close();
            });
          });
        }
      }
    },

    onRequest: function(request, response, netSocket) {
      let { url, method, headers } = request;
      let { host } = headers;
      log(id, 'request', `${method.toLowerCase()} ${host} ${url} `);

      // [todo] This should be a thennable, but it's just piping to response and holding in memcache for now.
      if (method.toLowerCase() === 'get') {
        // files.getFile(request, response);
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

