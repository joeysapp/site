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
  _log('RootServer', `connections${cString}`);

}
// setInterval(() => {
//   logEverySeenConnection();
// }, KEEPALIVE_INTERVAL);

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
  onSocketEnd = function(netSocket, data) {
    let { ip, id } = netSocket;
    _log('https', `Need to remove [${ip}] ${id}`);
    DEBUG && console.log('onSocketEnd', `${netSocket.net_socket_id}\n  ${what(data)}`);
  },
  onSocketFinish = function(netSocket, data) { DEBUG && console.log('onSocketFinish', `${netSocket.net_socket_id}\n  ${what(data)}`); },
  onSocketClose = function(netSocket, data) { DEBUG && console.log('onSocketClose', `${netSocket.net_socket_id}\n  ${what(data)}`); },
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
    // log({}, 'https.rootEmitter', `osrssalmonlog, going through all websockets :D\n${proto}`);

    let endpoint = ['osrs', 'salmon', 'log'].join('/');
    (websockets[endpoint] || []).forEach((netSocket, idx) => {
      let { remote } = netSocket;
      log(remote, 'https.rootEmitter', `netSocket[#${idx}] w/ readyState=${netSocket.readyState} writable=${netSocket.writable}`);
      if (netSocket.readyState === 'writeOnly') {
        log({}, 'https.rootEmitter', '... not sure?');
        // netSocket.uncork();
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

    // So we don't get any of these yet AFAIK:
    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;   
    log(remote, 'connection');

    // Wrapper for the actual nodesocket, adding in basic handlers
    let netSocket = new NetSocket({
      nodeSocket,
      onData: function(request, response, netSocket, data) {
        onSocketData(request, response, netSocket, data);
        let { headers, id, contentType, requests } = nodeSocket;

        // Handled a websocket's initial request/upgrade, we are now receiving proto data:
        if (netSocket.keepAliveInterval && contentType.indexOf('proto.joeys.app') !== -1) {
          let { URI, method, opCode } = data;
          let endpoint = URI.join('/');

          // [todo] Figure out like, listening method

          // How do we handle initial connections - do this to keep it generic..?
          // How would we update all our other connections though?.. hmm, I did this with Sock Users and stuff. I think? Or no..
          // rootEmitter.emit(URI.join('/'), data, netSocket);

          // This will be for handling URIs that we want the http-server to be able to talk to, e.g. a live chatroom
          if (!websockets[URI.join('/')]) {
            // Weird run condition on refreshing sockets, just be explicit w/ if/else.
            websockets[URI.join('/')] = [];
          }
          websockets[URI.join('/')].push(netSocket);
          _log('https', 'onSocketData', `Registering rootEmitter.on(${URI.join('/')}) -> [${websockets[URI.join('/')].length}]`);
          // ... This is being handled in the above RootServer ATM.
          // if (endpoint === 'osrs/salmon/log') {            
          //   oldschoolInit(request, response, netSocket, data);
          // }
        }
      },
      onResume: onSocketResume,
      onReadable: onSocketReadable,
      onRead: onSocketRead,
      onFinish: onSocketFinish,
      onClose: onSocketClose,

      // This is from a websocket .close on the frontend, which occurs onUnload.
      onEnd: function(nothing) {
        onSocketEnd(nothing);
        // ... Remove from our websockets?
      },
    });
    onConnection && onConnection(netSocket);
  });

  _httpsServer.addListener('request', function(request, response) {
    // Bind socket setting ID and other items
    let { socket: nodeSocket, data, reusedSocket } = request;
    bindSocket(request, response, nodeSocket);
    let netSocket = nodeSocket;

    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    let printObj = { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, data, reusedSocket };
    if (url !== '/salmon-log') {
      log(remote, 'request', `\n${what(printObj, { compact: true })}`);
    }

    // Just hang them, this works
    if (shouldBlock(request, response, nodeSocket)) {
      handleBlock(request, response, nodeSocket)
        .then(() => {
          log(remote, 'request', 'Blocked request');
        });
      return;
    }

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

    response.addListener('finish', function () {
      DEBUG && log(remote, 'req(res.finish)', `after ${id}.end()`);
      onResponseFinish && onResponseFinish(request, response, netSocket);
    });
    response.addListener('prefinish', function () {
      DEBUG && log(remote, 'req(res.prefinish)', `${id}`);
      onResponsePrefinish && onResponsePrefinish(request, response, netSocket);
    });
    response.addListener('drain', function () {
      DEBUG && log(remote, 'req(res.drain)', `${id}`);
    });
    response.addListener('end', function () {
      DEBUG && log(remote, 'req(res.end)', `${id}`);
    });
    response.addListener('close', function () {
      DEBUG && log(remote, 'req(res.close)', `after ${id}.end()`);
      onResponseClose && onResponseClose(request, response, netSocket);
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
        log({}, 'upgrade', `-> Adding nodeSocket.keepAliveInterval`);
        // log({}, 'upgrade', `[todo] .. Attempt to bind all Proto eventListeners here..? \n Adding them here doesn't seem to work, so..`);

        if (nodeSocket.keepAliveInterval) return;
        let keepAliveInterval = setInterval(function() {
          // Cannot just add this AFAIK?
          // nodeSocket.lifespan += KEEPALIVE_INTERVAL;
          if (nodeSocket.readyState === 'open') {
            // ... This is promising? A nodesocket could be writeOnly while a buffer is still waiting to be... flushed? out to the duplex socket...?
            let { closed, destroyed, writable, writableAborted, writableEnded, writableCorked, writableFinished, writableHighWaterMark, writableLength, writableNeedDrain, writableObjectMode, 
                bytesRead, bytesWritten, connecting, pending, readyState, allowHalfOpen, remote, lifespan } = nodeSocket;
            let logObject = { closed, destroyed, writable, writableAborted, writableEnded, writableCorked, writableFinished, writableHighWaterMark, writableLength, writableNeedDrain, writableObjectMode, 
                            bytesRead, bytesWritten, connecting, pending, readyState, allowHalfOpen };
            // log({}, `keepAlive`, `\n${what(logObject)}`);

            let lifespanString = msToTime(lifespan);
            log(remote, `keepAlive`, `${lifespanString} [${numToBytes(bytesWritten)} tx, ${numToBytes(bytesRead)} rx]`);

            let proto = new Proto({
              URI: ['portal', 'keepalive'],
              method: ['post'],
              opCode: 0,
              data: {},
            });
            nodeSocket.cork();
            nodeSocket.write(asFrame(proto), 'binary', function(cb) {
              // log({}, `keepalive`, 'keepalive callback');
              // nodeSocket.uncork();
            });
            nodeSocket.uncork();
          } else if (nodeSocket.readyState === 'writeOnly') {
            // seems to be causing crashes too... only do cork/uncork in the emitter maybe?
            // log({}, `keepAlive`, `Attempting to ... uncork? ... no, not doing anything...?`);
           // nodeSocket.uncork();
          }
          // huh.. uh. this kind of worked? 
          // nodeSocket.pipe(nodeSocket);
        }, KEEPALIVE_INTERVAL);
        nodeSocket.keepAliveInterval = keepAliveInterval;
        // // nodeSocket.keepAliveInterval = true;

        // This would be passed in from main.js?
        // This will allow our RootEmitter to emit protos and a socket can hear it.
        // nodeSocket.prependListener(['osrs', 'salmon', 'log'].join('/'), function(proto) {
        //   log({}, 'upgrade', 'heard osrs/salomnoafdsfoasdlfoasdflaosdflasdofloasdfl');
        // });

        let socketListeners = [
          // {
          //   eventName: 'shutdown',
          //   method: function() {
          //     log({}, 'sigint - [todo] nodeSocket heard sigint');
          //   },
          // },
          {
            // POST osrs.joeys.app/salmon-log will save item and emit a proto
            // containing sQL row(s) of new entries. The frontend will add to view.
            eventName: ['osrs', 'salmon', 'log'].join('/'),
            method: function(proto) {
              log({}, 'osrs/salmon/log', `nodeSocket heard event! This was added in http-server.on(upgrade)!`);
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
          log({}, 'listeners', `+ Binding ${eventName} in http-server.on(upgrade)`);
          rootEmitter.prependListener(eventName, (proto) => method(proto));
        });
        

        try {
          nodeSocket.addListener('shutdown', function(foo) {
            log({}, `nodeSocket.on(shutdown) ${foo}`);
          });
          nodeSocket.addListener('osrs/salmon/log', function(foo) {
            log({}, `nodeSocket.on(osrs/salmon/log) ${foo}`);
          });
        } catch(err) {
          log({}, `[ERR]\n\n${what(err)}\n\n`);
        }

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

    nodeSocket.lifespan = 0;

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

    try {
      let ct = connections[ip].length+1;
      let ipString = `${ip}`.split('.').reduce((acc, num, idx) => acc+`${num}`.padStart(3, ' ')+(idx < 3 ? '.' : ''), '');
      let id = `${ipString}/`+`${ct}`.padStart(3, '0')+'';
      
      nodeSocket.id = id;
      nodeSocket.ip = ip;
      connections[ip] = [ ...connections[ip], nodeSocket ];
    } catch (err) {
      log('ERR', `${what(err)}`);
    }
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
    const key = request.headers['sec-websocket-key'];  

    const clientProtocols = request.headers['sec-websocket-protocol'].split(', ');
    const protocols = [
      'proto.joeys.app.utf8', 'proto.joeys.app.sql', 'proto.joeys.app.json',
    ];
    let protocolAllowed = false;
    protocols.forEach(protocol => {
      if (clientProtocols.indexOf(protocol) !== -1) {
        protocolAllowed = true;
      }
    });
    if (request.headers['upgrade'] !== 'websocket' || !key || !protocolAllowed) {
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
      `Sec-WebSocket-Protocol: proto.joeys.app.utf8`,
    ]));

    _log('socketHandshake()', `write back signed sha1 header`);
    resolve();
  });
}

