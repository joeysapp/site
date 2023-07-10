import http from 'node:http';
// import DNS from './dns.js';
import { lookup } from 'node:dns';

import { Info, Status } from '../lib/common/types/index.mjs';
import Files from './files.js';
import NetSocket from './netsocket.js';

// Utils
import what from '../lib/common/utils/what-server.mjs'; import _log from '../lib/common/utils/log.mjs';

function HttpServer(opts = {}) {
  let {
    host = '192.168.0.2',
    port = null,
  } = opts;

  const layers = {
    application: 'http',
    transport: 'tcp', // ... Is this technically TCP, or it just wants to be TCP until it gets the connect
    internet: 'IPv4',
    link: 'MAC',
    remoteAddress: '',
    remotePort: 0,
    localAddress: host,
    localPort: port,
  };
  function log(a='', b='', c='', d='', e='', f='') { _log(layers, a, b, c, d, e, f) };
  log('new', `Creating new HttpServer on ${host}:${port}`);

  // [todo] Figure out a shared MEMCACHE.
  let files = new Files();

  const server = http.createServer({
    allowHalfOpen: false,
    // https://nodejs.org/api/stream.html#streamgetdefaulthighwatermarkobjectmode
    highWaterMarker: 16384 ,
    pauseOnConnect: false,
    noDelay: false, 
    keepAlive: false,
    keepAliveInitialDelay: 0,
  });

  server.on('close', () => { log('close'); });
  server.on('connection', (socket) => {
    log('connection');

    // HTTP - these are typically just net.Sockets, but a createConnection() can be done by a user, and you just have a duplex.
    let newSocket = new NetSocket(
      socket,
      { layers: {
        ...layers,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
      }});
  });

  server.on('connect', (request, socket, head) => {
    log('connect');
    // Emitted each time a client requests an HTTP CONNECT method.
    // If this event is not listened for, then clients requesting a CONNECT method will have their connections closed.
    // net.Server does not implement this, it just makes the TCP stream w/o the HTTP CONNET
  });

  server.on('request', (request, response) => {
    log('request');
    files.getFile(request, response);
  });

  server.on('upgrade', (request, socket, head) => {
    log('upgrade');
  });

  server.on('listening', () => { log('listening'); });
  server.listen({
    host: host,
    port: port,
  });

  // todo - error handling/closing
  server.on('error', (error) => {
    log('error', error);
    server.close();
  });
  server.on('drop', (data) => {
    let { localAddress, localPort, localFamily, remoteAddress, remotePort, remoteFamily } = data;
    log('drop');
  });
  server.on('checkContinue', (request, response) => { log('checkContinue'); });
  server.on('checkExpectation', (request, response) => { log('checkExpectation'); });
  server.on('clientError', (error) => { log('clientError'); });
  server.on('dropRequest', (request, socket) => { log('dropRequest'); });

  return server;
};
export default HttpServer;
