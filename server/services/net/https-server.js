import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import NetSocket from './net-socket.js';
import { RootEmitter } from '../index.js';
import { what, log as _log } from '../../../common/utils/index.mjs';

const DEBUG = process.env.DEBUG || false;

const NETWORK_LAYERS = {
  application: '--', transport: 'tcp', internet: 'IPv4', link: 'MAC',
  remoteAddress: '', remotePort: '', localAddress: '', localPort: '',
};

// IP addresses to lists of connected (possibly tls) sockets
let connections = {
  // '127.0.0.1': [],
};

function HttpsServer({
  id,
  host,
  port,

  onConnection,
  onRequest,
  onUpgrade,
  onResponsePrefinish = function(request, response, netSocket) { DEBUG && console.log('onResponsePrefinish'); },
  onResponseFinish = function(request, response, netSocket) { DEBUG && console.log('onResponseFinish'); },
  onResponseClose = function(request, response, netSocket) { DEBUG && console.log('onResponseClose'); },

  onSocketData,
  onSocketResume,
  onSocketReadable,
  onSocketRead,
  onSocketEnd = function(netSocket, data) { DEBUG && console.log('onSocketEnd', `${netSocket.net_socket_id}\n  ${what(data)}`); },
  onSocketFinish = function(netSocket, data) { DEBUG && console.log('onSocketFinish', `${netSocket.net_socket_id}\n  ${what(data)}`); },
  onSocketClose = function(netSocket, data) { DEBUG && console.log('onSocketClose', `${netSocket.net_socket_id}\n  ${what(data)}`); },
}) {
  let _httpsServer;
  let _id;
  _httpsServer = http.createServer({
    keepAliveTimeout: 0,
    requestTimeout: 0,
    headersTimeout: 0,
  });
  log({}, 'init');

  _httpsServer.addListener('connection', function(nodeSocket) {
    bindSocket(null, null, nodeSocket);
    nodeSocket.setKeepAlive(true);
    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    log(remote, 'connection');

    // Wrapper for the actual nodesocket, adding in basic handlers
    let netSocket = new NetSocket({
      nodeSocket,
      onData: onSocketData,
      onResume: onSocketResume,
      onReadable: onSocketReadable,
      onRead: onSocketRead,
      onEnd: onSocketEnd,
      onFinish: onSocketFinish,
      onClose: onSocketClose,
    });
    onConnection && onConnection(netSocket);
  });

  _httpsServer.addListener('request', function(request, response) {
    // Bind socket setting ID and other items
    let { socket: nodeSocket, data } = request;
    bindSocket(request, response, nodeSocket);
    let netSocket = nodeSocket;

    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    let printObj = { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, data };
    log(remote, 'request', `\n${what(printObj, { compact: false })}`);

    // Just hang them, this works
    if (shouldBlock(request, response, nodeSocket)) {
      handleBlock(request, response, nodeSocket)
        .then(() => {
          log(remote, 'request', 'Blocked request');
        });
      return;
    }

    request.addListener('socket', function(nodeSocket) {
      log(remote, 'req(req.socket)', `${id} nodeSocket` );
    });
    request.addListener('aborted', function() {
      log(remote, 'req(req.aborted)', `${id} req aborted` );
    });
    request.addListener('close', function() {
      log(remote, 'req(req.close)', `${id} req closing` );
    });   
    request.addListener('end', function() {
      log(remote, 'req(req.end)', `${id}` );
    });   

    response.addListener('finish', function () {
      log(remote, 'req(res.finish)', `after ${id}.end()`);
      onResponseFinish && onResponseFinish(request, response, netSocket);
    });
    response.addListener('prefinish', function () {
      log(remote, 'req(res.prefinish)', `${id}`);
      onResponsePrefinish && onResponsePrefinish(request, response, netSocket);
    });
    response.addListener('drain', function () {
      log(remote, 'req(res.drain)', `${id}`);
    });
    response.addListener('end', function () {
      log(remote, 'req(res.end)', `${id}`);
    });
    response.addListener('close', function () {
      log(remote, 'req(res.close)', `after ${id}.end()`);
      onResponseClose && onResponseClose(request, response, netSocket);
    });

    if (onRequest) {
      onRequest(request, response, nodeSocket);
    } else {
      log(remote, 'request', 'closing + destroying');
      // https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.1
      response.writeHead(200);
      response.end(null, () => {
        nodeSocket.destroy();
        request.destroy();
      });
    }
  });

  _httpsServer.on('upgrade', function(request, nodeSocket, head) {
    bindSocket(request, null, nodeSocket);

    // [todo] Seeing if we need to do request.setSocketKeepAlive() too?
    // nodeSocket.setKeepAlive(true);
    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, contentType } = nodeSocket;
        let printObj = { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, contentType };
    log(remote, 'upgrade', `\n${what(printObj, { compact: true })}`);

    if (shouldBlock(request, null, nodeSocket)) {
      handleBlock(request, null, nodeSocket)
        .then(() => {
          log(remote, 'upgrade', 'Blocked request');
        });
      return;
    }

    handleUpgrade(request, nodeSocket, head)
      .then((something) => {
        log({}, 'upgrade', `[todo] Then we do something with this WebSocket`);
        // [todo] Add to connection pool
        // .... Figure out how to do this with separate hosts, handle connections externally, etc.
      }).catch((error) => {
        log({}, 'upgrade', `[ERR] ${error}`);
        nodeSocket.write("500 / Error");
        nodeSocket.end();
      });
  });

  _httpsServer.on('listening', function() { log({}, 'listening'); });
  _httpsServer.on('connect', function() { log({}, 'connect'); });
  _httpsServer.on('checkContinue', (request, response) => { log({}, 'checkContinue'); });
  _httpsServer.on('checkExpectation', (request, response) => { log({}, 'checkExpectation'); });
  _httpsServer.on('dropRequest', (request, socket) => { log({}, 'dropRequest(request, socket)'); });
  _httpsServer.on('clientError', (error, nodeSocket) => {
    log({}, 'clientError', `\n${what(error, { showHidden: false, compact: false })}`);
    nodeSocket.destroy();
  });

  _httpsServer.on('error', function(error) {
    log({}, 'error', `\n\n${what(error, { showHidden: false, compact: false, })}\n\n`);
    // _httpsServer.close();
    RootEmitter.emit('shutdown', function httpsServerError(uhh_idk) {
      log({}, 'error->shutdown', `Emitted shutdown event after error ${what(uhh_idk)}`);
      // uhh_idk();
    });
  });
  _httpsServer.on('close', function() {
    log({}, 'close', 'httpsServer.error -> closing');
  });
  _httpsServer.listen({
    host,
    port,
  });

  function log(remote = {}, a='', b='', c='', d='') {
    const { address = '--', port = '--', family = '--' } = _httpsServer.address() || {};
    const { remoteAddress, remotePort, remoteFamily } = remote;
    
    const _NETWORK_LAYERS = {
      ...NETWORK_LAYERS,
      localAddress: address,
      localPort: port,
      internet: remoteAddress ? remoteFamily : family,
      ...remote,
    };
    _id = `${id}[${Object.keys(connections).length}`.padStart(3, ' ')+']';
    _log(_NETWORK_LAYERS, _id, a, b, c, d)
  };
  return _httpsServer; 
}
export default HttpsServer;

// TBD where these functions should go
// Is fired on: 
// 1. connection            (null,              null, nodeSocket)
// 2. request OR upgrade    (req = { headers }, res, nodeSocket)
function bindSocket(request = null, response = null, nodeSocket = null) {
  // 1. connection(null, null, nodeSocket);
  let { remoteAddress, remotePort, remoteFamily } = nodeSocket;
  let { headers = {}, method, url, statusCode, statusMessage, httpVersion } = request || {};
  let { accept, dnt, host, origin, upgrade, pragma } = headers;
  // _log('bindSocket', `\n\nheaders=${what(headers)}\n\n`);

  if (request) {   
    nodeSocket.request = request;
    nodeSocket.response = response;
    nodeSocket.headers = headers;
    nodeSocket.contentType = headers['sec-websocket-protocol'] || headers['content-type'];
    nodeSocket.ua = headers['user-agent'];

    // TBD if these will be helpful:
    nodeSocket.method = method;
    nodeSocket.url = url;
    nodeSocket.statusCode = statusCode;
    nodeSocket.statusMessage = statusMessage;
    nodeSocket.httpVersion = httpVersion;

    // remoteAddress will be set to reverse proxy in connection, but request/upgrade gives us this header
    nodeSocket.remote = {
      remotePort, remoteFamily,
      remoteAddress: headers['x-real-ip'] || remoteAddress,
    };
  };
  
  // On upgrade or data, set ID
  nodeSocket.requests = 0;
  if (!nodeSocket.id && nodeSocket.remote) {
    let { remoteAddress } = nodeSocket.remote;
    let ip = remoteAddress;
    if (!connections[ip]) {
      connections[ip] = [];
    }
    let ct = connections[ip].length;
    let id = `<${ip} - ${ct}>`;

    nodeSocket.id = id;
    connections[ip] = [ ...connections[ip], nodeSocket ];
  } else {
    nodeSocket.requests += 1;
  }
}

function shouldBlock(request, response, nodeSocket) {
  let { headers, method, url, statusCode, statusMessage, httpVersion } = request || {};
  let { accept, dnt, host, origin, upgrade, pragma } = headers;
  let ip = headers['x-real-ip'] || nodeSocket.ip;
  let protocol = headers['x-forwarded-proto']; // https;
  
  // Prevent any get/posts to the IP entirely (nginx could/should probably do this)
  // It'll be IP:WS_SOCKET_PORT for the ws forwarding
  if (host === process.env.SITE_ADDRESS) {
    return true;
  }

  let blockedIPs = (process.env.BLOCKED_IPV4 || '').split(';');
  if (blockedIPs.indexOf(ip) !== -1) {
    return true;
  }

  let blockedUserAgents = [
    'Cloud mapping experiment. Contact research@pdrlabs.net',
  ];

  return false;
}

async function handleBlock(request, response=null, nodeSocket) {
  return new Promise(function(resolve, reject) {
    let { httpVersion } = nodeSocket;
    let msg = `HTTP ${httpVersion} / Bad Request`;
    setTimeout(() => {
      if (response) {
        // response.write(msg);
        response.end(msg, () => {
          resolve();
        });
      } else {
        // nodeSocket.write(msg);
        nodeSocket.end(msg, () => {
          resolve();
        });
      }
      // Can't callback, this is a ReadableStream
      request.destroy();
    }, 1000);
  });
}


function sha1Hash(value, type='binary', base='base64') {
  return crypto.createHash('sha1').update(value, type).digest(base);
}

// Websocket handshake
async function handleUpgrade(request, socket) {
  return new Promise((resolve, reject) => {
    const protocols = request.headers['sec-websocket-protocol'];
    const key = request.headers['sec-websocket-key'];  

    if (request.headers['upgrade'] !== 'websocket' || !key) {
      // socket.write(headers(['HTTP/1.1 Bad Request']));
      socket.write('HTTP/1.1 Bad Request');
      socket.end();
      reject();
    }

    // [ref] GUID from websocket whitepaper
    // https://github.com/websockets/ws/blob/master/doc/ws.md#event-headers
    const upgradeGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const websocketPairKey = sha1Hash([key, upgradeGUID].join(''));
    function combineHeaders(h) { return h.join('\r\n') + '\r\n\r\n'; }

    // [note] the Sec-Websocket-Accept key here could be modified for own janky ws connection
    socket.write(combineHeaders([
      'HTTP/1.1 101 Web Socket Protocol Handshake',
      'Upgrade: WebSocket',
      'Connection: Upgrade', 
      `Sec-WebSocket-Accept: ${websocketPairKey}`,
    ]));

    _log('socketHandshake()', `write back signed sha1 header`);
    resolve();
  });
}

