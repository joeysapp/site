import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import NetSocket from './net-socket.js';
import { EventEmitter } from 'node:events';
import rootEmitter from '../root-emitter.js';

import { what, log as _log, bold, underline, fg, bg, numToBytes, msToTime } from '../../../common/utils/index.mjs';
import Proto, { asFrame } from '../../../common/types/proto.mjs';

const DEBUG = process.env.DEBUG || false;
const NETWORK_LAYERS = {
  application: '--', transport: 'tcp', internet: 'IPv4', link: 'MAC',
  remoteAddress: '', remotePort: '', localAddress: '', localPort: '',
};
const KEEPALIVE_INTERVAL = 55000;

// List of all connections seen per IP. (e.g. GETs/POSTS)
let connections = {
  // '127.0.0.1': [],
};

// Live TLS connections..
// .. Currently, this is a websockets[URI] = [...socket1, socket2]...
// .. This should probably be like, endpoints.
let websockets = {};
let knownURIs = {
  // `osrs/salmon/log`: [ socket... socket... ]

};

function doLog(request, response) {
  let { url } = request;
  console.log(url);
  if (url !== '/salmon-log') {
    return true;
  }
  return false;
}

function logEverySeenConnection() {
  let cString = Object.keys(connections).reduce((cAcc, ip, cIdx) => {
    let sockets = connections[ip];
    let socketString = sockets.reduce((acc, socket, idx) => {
      return `${acc}\t${idx}\t${socket.id}${idx < sockets.length-1 ? '\n' : ''}`;
    }, `${ip}\n`)
    if (socketString) {
      socketString = `\n${socketString}`;
    }
    return `${cAcc}${socketString}`;
  }, '');
  _log({}, 'https', `connections${cString}`);
}

// We will bind these listeners to every upgraded websocket, which our rootEmitter can emit, e.g.:
// * https.on(request), heard [POST salmon/log [DATA]] -> write to SQL, emit that data to all connected sockets
let socketListeners = [
  {
    // When we sigint the server, do this with the nodesocket. Probably ask it to refresh in 10-20s?
    eventName: 'shutdown',
    method: function() {
      log(remote, 'sigint', '[todo] nodeSocket heard sigint.');
    },
  },
  {
    // POST osrs.joeys.app/salmon-log will save item and emit a proto
    // containing sQL row(s) of new entries. The frontend will add to view.
    eventName: ['osrs', 'salmon', 'log'].join('/'),
    method: function(proto) {
      log(remote, 'osrs/salmon/log', `nodeSocket heard event! This was added in http-server.on(upgrade)!`);
      // nodeSocket.write(proto.asBuffer());
    },
  },
  {
    eventName: ['axidraw'].join('/'),
    method: function(proto) {
      // nodeSocket.write(proto.asBuffer());
    }
  }
];

function HttpsServer({
  id, host, port,
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
  onSocketEnd,
  onSocketFinish,
  onSocketClose,
}) {
  let _httpsServer;
  let _id;
  _httpsServer = http.createServer({
    // We've been setting keepAlive in the sockets themselves..
    keepAlive: true,

    // So none of the below change the 60s. (without keepAliveTrue?)
    // Keepalivetimeout: 0 is the only thing that causes it to go to 60s
    // keepAliveTimeout: 0,
    // requestTimeout: 0,
    // headersTimeout: 0,
    // Still 60s timeout with 4500, 70000.
    // connectionsCheckingInterval: 70000,
  });
  log({}, 'init');

  rootEmitter.on(['osrs', 'salmon', 'log'].join('/'), function(proto) {
    let endpoint = ['osrs', 'salmon', 'log'].join('/');
    (websockets[endpoint] || []).forEach((netSocket, idx) => {
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
  });

  _httpsServer.addListener('connection', function(nodeSocket) {
    bindSocket(null, null, nodeSocket);
    // nodeSocket.setKeepAlive(true);
    // So we don't get any of these yet AFAIK
    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;

    log(remote, 'connection');
    // Wrapper for the actual nodesocket, adding in basic handlers
    let netSocket = new NetSocket({
      nodeSocket,
      onData: function(request, response, netSocket, data) {
        let { headers, id, contentType, requests, remote } = nodeSocket;
        onSocketData(request, response, netSocket, data);
      },
      onResume: onSocketResume,
      onReadable: onSocketReadable,
      onRead: onSocketRead,
      onFinish: function(nothing) {
        log(remote, 'socketFinish', `${what(nothing)}`);
        onSocketFinish(nothing);
      },
      onClose: function(nodeSocket) {
        DEBUG && log(remote, 'socketClose', `[ nodeSocket ]`);
        // Emits on any plain HTTP (post, get) and after we hear websocket.end and then close it.
        onSocketClose && onSocketClose(nodeSocket);
      },
      onEnd: function(nodeSocket) {
        DEBUG && log(remote, 'socketEnd', `[ nodeSocket ]`);
        // Emits on a frontend's window.onunmount, which then calls .end and we hear it here.
        if (onSocketEnd) {
          onSocketEnd(nodeSocket);
        } else {
          // We need to properly signal to it close it, otherwise it'll just timeout.
          // [todo] ... Remove from our connection pool and URI listeners?
          nodeSocket.destroy();
        }
      },
    });
    onConnection && onConnection(netSocket);
  });

  // Likeliest a POST, unless there is a GET we are not handling with nginx.
  _httpsServer.addListener('request', function(request, response) {
    let { socket: nodeSocket = {}, data, reusedSocket } = request;
    bindSocket(request, response, nodeSocket);

    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    let printObj = { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, data, reusedSocket };
    if (url !== '/salmon-log') {
      log(remote, 'request', `\n${what(printObj, { compact: true })}`);
    }
    if (shouldBlock(request, response, nodeSocket)) {
      handleBlock(request, response, nodeSocket)
        .then(() => {
          log(remote, 'request', 'Blocked request');
        });
      return;
    }

    // Request listeners
    request.addListener('socket', function(nodeSocket) {
     DEBUG && log(remote, 'req(req.socket)', `${id} nodeSocket` );
    });
    request.addListener('aborted', function() {
      DEBUG && log(remote, 'req(req.aborted)', `${id} req aborted` );
    });
    request.addListener('close', function() {
      DEBUG && log(remote, 'req(req.close)', `${id} req closing` );
    });   
    request.addListener('end', function() {
      DEBUG && log(remote, 'req(req.end)', `${id}` );
    });
    // Response
    response.addListener('finish', function () {
      DEBUG && log(remote, 'req(res.finish)', `after ${id}.end()`);
      onResponseFinish && onResponseFinish(request, response, nodeSocket);
    });
    response.addListener('prefinish', function () {
      DEBUG && log(remote, 'req(res.prefinish)', `${id}`);
      onResponsePrefinish && onResponsePrefinish(request, response, nodeSocket);
    });
    response.addListener('drain', function () {
      DEBUG && log(remote, 'req(res.drain)', `${id}`);
    });
    response.addListener('end', function () {
      DEBUG && log(remote, 'req(res.end)', `${id}`);
    });
    response.addListener('close', function () {
      DEBUG && log(remote, 'req(res.close)', `after ${id}.end()`);
      onResponseClose && onResponseClose(request, response, nodeSocket);
    });

    if (onRequest) {
      onRequest(request, response, nodeSocket);
    } else {
      DEBUG && log(remote, 'request', 'closing + destroying');
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
    // nodeSocket.setKeepAlive(true);

    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, contentType, lifespan } = nodeSocket;
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
        log(remote, 'upgrade', `+ adding keepAliveInterval`);
        // if (nodeSocket.keepAliveInterval) return;

        let keepAliveInterval = setInterval(function() {
          let { readyState, lifespan, requests, bytesWritten, bytesRead } = nodeSocket;
          nodeSocket.lifespan += KEEPALIVE_INTERVAL;
          if (nodeSocket.readyState === 'open') {
            let lifespanString = `${msToTime(nodeSocket.lifespan)}`;
            log(remote, `keepAlive`, `${lifespanString} [${numToBytes(bytesWritten)} tx, ${numToBytes(bytesRead)} rx]`);
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
            log(remote, `keepalive`, '[todo] This socket should have been removed from connection pool and its interval cleared on .end/close.');
          }
        }, KEEPALIVE_INTERVAL);
        nodeSocket.keepAliveInterval = keepAliveInterval;

        // We will bind these listeners to connected websockets,
        // which our rootEmitter will emit when necessary, e.g.:
        // * https.on(request), POST salmon/log, emit that data to all connected sockets.
        let socketListeners = [
          {
            // When we sigint the server, do this with the nodesocket. Probably ask it to refresh in 10-20s?
            eventName: 'shutdown',
            method: function() {
              log(remote, 'sigint', '[todo] nodeSocket heard sigint.');
            },
          },
          {
            // POST osrs.joeys.app/salmon-log will save item and emit a proto
            // containing sQL row(s) of new entries. The frontend will add to view.
            eventName: ['osrs', 'salmon', 'log'].join('/'),
            method: function(proto) {
              log(remote, 'osrs/salmon/log', `nodeSocket heard event! This was added in http-server.on(upgrade)!`);
              // nodeSocket.write(proto.asBuffer());
            },
          },
          {
            eventName: ['axidraw'].join('/'),
            method: function(proto) {
              // nodeSocket.write(proto.asBuffer());
            }
          }
        ];
        
        socketListeners.forEach(l => {
          let { eventName, method } = l;
          log(remote, 'listeners', `+ Binding ${eventName} in http-server.on(upgrade)`);
          rootEmitter.prependListener(eventName, (proto) => method(proto));
        });

        // [todo] Connection pooling
      }).catch((error) => {
        log(remote, 'upgrade', `[ERR] \n${what(error)}`);
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
    RootEmitter.emit('shutdown', function httpsServerError(uhh_idk) {
      log({}, 'error->shutdown', `Emitted shutdown event after error ${what(uhh_idk)}`);
    });
  });
  _httpsServer.on('close', function() {
    log({}, 'close', 'httpsServer.error -> closing');
  });
  _httpsServer.listen({ host, port });

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

// Utilities

// This occurs in:
// 1. connection            (null,              null, nodeSocket)
// 2. request OR upgrade    (req = { headers }, res, nodeSocket)
function bindSocket(request = null, response = null, nodeSocket = null) {
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
  nodeSocket.requests = 0;
  nodeSocket.lifespan = 0;
  // Remote set in .request or .upgrade, fired after .data fired after .onSocketData
  if (!nodeSocket.id && nodeSocket.remote) {
    let { remoteAddress } = nodeSocket.remote;
    let ip = remoteAddress;

    // This was for....
    // .... this was for....


    if (!connections[ip]) {
      connections[ip] = [];
    }
    let ct = connections[ip].length + 1;
    let ipString = `${ip}`.split('.').reduce((acc, num, idx) => acc+`${num}`.padStart(3, ' ')+(idx < 3 ? '.' : ''), '');
    let id = `${ipString}/`+`${ct}`.padStart(3, '0')+'';
      
    nodeSocket.id = id;
    nodeSocket.ip = ip;
    connections[ip] = [ ...connections[ip], nodeSocket ];
  } else {
    nodeSocket.requests += 1;
  }
}

function shouldBlock(request = {}, response, nodeSocket) {
  let { headers = {}, method, url, statusCode, statusMessage, httpVersion } = request;
  let { accept, dnt, host, origin, upgrade, pragma } = headers;
  let block = false;

  let ip = headers['x-real-ip'] || nodeSocket.ip;
  let blockedIPs = (process.env.BLOCKED_IPV4 || '').split(';');
  if (blockedIPs.indexOf(ip) !== -1) {
    return true;
  }
  // let protocol = headers['x-forwarded-proto'];
  return false;
}

async function handleBlock(request, response=null, nodeSocket) {
  return new Promise(function(resolve, reject) {
    let { httpVersion } = nodeSocket;
    let msg = `HTTP ${httpVersion} / Bad Request`;
    setTimeout(() => {
      if (response) {
        response.end(msg, () => {
          resolve();
        });
      } else {
        nodeSocket.end(msg, () => {
          resolve();
        });
      }
      request.destroy();
    }, 1000);
  });
}

// Websocket utilities
function sha1Hash(value, type='binary', base='base64') {
  return crypto.createHash('sha1').update(value, type).digest(base);
}

// Websocket handshake
async function handleUpgrade(request, socket) {
  return new Promise((resolve, reject) => {
    let protocolAllowed = false;
    const clientProtocols = request.headers['sec-websocket-protocol'].split(', ');
    const protocols = [
      'proto.joeys.app.utf8',
      'proto.joeys.app.sql',
      'proto.joeys.app.json',
    ];
    protocols.forEach(protocol => {
      if (clientProtocols.indexOf(protocol) !== -1) {
        protocolAllowed = true;
      }
    });
    const key = request.headers['sec-websocket-key'];
    if (request.headers['upgrade'] !== 'websocket' || !key || !protocolAllowed) {
      socket.write('HTTP/1.1 Bad Request');
      socket.end();
      reject();
    }

    // [ref] GUID from websocket whitepaper
    const upgradeGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const websocketPairKey = sha1Hash([key, upgradeGUID].join(''));
    function combineHeaders(h) { return h.join('\r\n') + '\r\n\r\n'; }
    // [note] the Sec-Websocket-Accept key here could be modified for own janky ws connection
    socket.write(combineHeaders([
      'HTTP/1.1 101 Web Socket Protocol Handshake',
      'Upgrade: WebSocket',
      'Connection: Upgrade', 
      `Sec-WebSocket-Accept: ${websocketPairKey}`,
      `Sec-WebSocket-Protocol: proto.joeys.app.utf8`,
    ]));
    resolve();
  });
}

