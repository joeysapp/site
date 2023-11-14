import { env } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import rootEmitter from './services/root-emitter.js';
import { EventEmitter } from 'node:events';

// Base functions
import {
  // RootEmitter,
  Files,
  Database,
  HttpsServer,
} from './services/index.js';

// Endpoints
import { oldschoolRequest, oldschoolInit } from './services/oldschool/index.js';

// Utilities
import {
  log, fg, what, numToBytes, msToTime,
  show_sockets, show_network_layers, show_http, show_init, show_files, show_time,
} from '../common/utils/index.mjs';
import Proto, { asFrame } from '../common/types/proto.mjs';

// show_network_layers();
show_sockets();
show_http();
show_init();
show_files();
// show_time();

// 2023-11-13T2000: This was taken out of httpsserver.
let endpoints = {
  'osrs/salmon/log': [],
};
function writeLogToSockets(proto) {
  let endpoint = ['osrs', 'salmon', 'log'].join('/');
  endpoints[endpoint].forEach((netSocket, idx) => {
    let { remote } = netSocket;
    log(remote, 'https.rootEmitter', `netSocket[#${idx}] readyState=${netSocket.readyState} writable=${netSocket.writable}`);
    if (netSocket.readyState === 'writeOnly') {
      log({}, 'https.rootEmitter', '... not sure?');
    } else if (netSocket.readyState === 'open') {
      netSocket.cork();
      netSocket.write(asFrame(proto), 'buffer', function callback(foo) {
        log(remote, 'https.rootEmitter', 'Wrote out to netSocket');
      });
      netSocket.uncork();
    }
  });
}

// DOES NOT FIRE.
let osrsListener = new EventEmitter();
osrsListener.on('osrs/salmon/log', function(proto) {
  log('osrsListener', 'now writing out to endpoints');
  writeLogToSockets(proto);
});

// THIS FIRES.
rootEmitter.on('osrs/salmon/log', function(proto) {
  log('rootEmitter', 'now writing out to endpoints');
  writeLogToSockets(proto);
});

function ProtoServer() {
  let server = new HttpsServer({
    id: 'protoServer',
    host: process.env.root_host,
    port: process.env.root_port,

    onSocketData: function(request, response, netSocket, data) {
      let { url, method, headers = {}} = request;
      let { host } = headers;

      // let isSalmonLogPost = (host === 'osrs.joeys.app' && method === 'POST' && url === '/salmon-log');
      let isSalmonLogPost = (method === 'POST' && url === '/salmon-log');
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

    // 2023-11-13T2000: Took this out of http-server (which now just handles the handshake.)
    onUpgrade: function(request, nodeSocket, head) {
      let { remote: socketRemote } = nodeSocket;
      let { remoteAddress, remotePort, remoteFamily } = socketRemote;
      
      // [todo] think about memory leaks
      let layers = {
        application: '--', transport: 'tcp', internet: 'IPv4', link: 'MAC',        
        localAddress: process.env.root_host,
        localPort: process.env.root_port,
        internet: remoteAddress ? remoteFamily : 'ipv4?',
        ...socketRemote,
      };

      log(layers, 'rootServer', `upgrade`, ` + adding keepAliveInterval`);
      // if (nodeSocket.keepAliveInterval) return;
      // onUpgrade(request, nodeSocket, head);

      // Temporary fix
      endpoints['osrs/salmon/log'].push(nodeSocket);

      // DOES NOT FIRE.
      nodeSocket.on('osrs/salmon/log', function(proto) {
        log('main/nodeSocket', 'heard osrs salmon og');
      });
      let KEEPALIVE_INTERVAL = 55000;
      let keepAliveInterval = setInterval(function() {
        let { readyState, lifespan, requests, bytesWritten, bytesRead, remote } = nodeSocket;
        nodeSocket.lifespan += KEEPALIVE_INTERVAL;

        if (nodeSocket.readyState === 'open') {
          let lifespanString = `${msToTime(nodeSocket.lifespan)}`;
          log(layers, `keepAlive`, `${lifespanString} [${numToBytes(bytesWritten)} tx, ${numToBytes(bytesRead)} rx]`);
          let proto = new Proto({
            URI: ['portal', 'keepalive'],
            method: ['post'],
            opCode: 0,
            data: {},
          });
          nodeSocket.cork();
          nodeSocket.write(asFrame(proto), 'binary', function(cb) { });
          nodeSocket.uncork();
        } else if (nodeSocket.readyState === 'writeOnly') {
          log(layers, `keepalive`, '[todo] This socket should have been removed from connection pool and its interval cleared on .end/close.');
        }
      }, KEEPALIVE_INTERVAL);
      nodeSocket.keepAliveInterval = keepAliveInterval;
    },
  });
}

const protoServer = ProtoServer();
const files = new Files();
const db = new Database();
console.log(fg([25, 180, 222], 'boot'));
