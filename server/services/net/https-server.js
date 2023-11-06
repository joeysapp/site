import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import NetSocket from './net-socket.js';
import { EventEmitter } from 'node:events';
// import { RootEmitter } from '../index.js';
import rootEmitter from '../root-emitter.js';
import { what, log as _log, bold, underline, fg, bg } from '../../../common/utils/index.mjs';
import Proto, { asFrame } from '../../../common/types/proto.mjs';

const DEBUG = process.env.DEBUG || false;

const NETWORK_LAYERS = {
  application: '--', transport: 'tcp', internet: 'IPv4', link: 'MAC',
  remoteAddress: '', remotePort: '', localAddress: '', localPort: '',
};

// IP addresses to lists of connected (possibly tls) sockets
let connections = {
  // '127.0.0.1': [],
};
let websockets = {};

function logConnections() {
  let cString = Object.keys(connections).reduce((cAcc, ip, cIdx) => {
    let sockets = connections[ip];
    let socketString = sockets.reduce((acc, socket, idx) => {
      return `${acc}\t${idx}\t${socket.id}${idx < sockets.length-1 ? '\n' : ''}`;
    }, `${ip}\ns`)
    if (socketString) {
      socketString = `\n${socketString}`;
    }
    return `${cAcc}${socketString}`;
  }, '');
  _log('RootServer', `connections${cString}`);

}
// setInterval(() => {
//   logConnections();
// }, 5000);

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
    // connections[
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
    websockets[['osrs', 'salmon', 'log']].forEach((netSocket, idx) => {
      // return;
      // .. This does nothing, but I wonder, is there an issue with the keepalive interval?
      // netSocket.pipe().write(proto.protoToBuffer());

      // This causes an EPIPE. Is this a proxy issue, or should we like, pipe it..? Idk..
      // netSocket.write(proto.protoToBuffer());

      // lol, I think there just has to be some buffer period between all these requests..
      // Ideally we'd build like, a network queue I think...
      // nope, this doesn't help. just prolongs a crash
      // let RANDOM_TIME = 1000 + Math.random * 1000 + Math.random*1000;

      // ORRRRRRRRRRRRRRRRRRRRR ideally just like, update chat to users every 30s or something..........
      // setTimeout(() => {
        try {
          let { remote } = netSocket;
          log(remote, 'https.rootEmitter', `netSocket[#${idx}] w/ readyState=${netSocket.readyState} writable=${netSocket.writable}\n${what(proto)}`);
          if (netSocket.readyState === 'writeOnly') {
            log({}, 'https.rootEmitter', '... not sure?');
            // netSocket.uncork();
          } else if (netSocket.readyState === 'open') {
            log({}, 'https.rootEmitter', '... writing to!');
            // FIguring out how to deal with the keepAlive writing..
            netSocket.cork();
            netSocket.write(asFrame(proto), 'buffer', function callback(foo) {
              // ... I think having it here means that we'll only be sending them the stuff every 10s right, or w/e the keepalive interval is?
              // netSocket.uncork();
              log({}, 'https.rootEmitter', 'Succesfully wrote out proto to netSocket');
            });
            netSocket.uncork();
          }
          // netSocket.write(proto.protoToBuffer());
          // asdf was 112s
          // asdfasdf was 32s but ther ewas a lot happening in the chat...
          // netSocket.write(Buffer.from('asdf1234'));
        } catch (err) {
          log({}, `https.rootemitter`, `failed to write to netsocket #${idx}\n${what(err)}`);
        }
      // }, RANDOM_TIME);
    });
  });

  _httpsServer.addListener('connection', function(nodeSocket) {
    bindSocket(null, null, nodeSocket);
    // nodeSocket.setKeepAlive(true);
    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    log(remote, 'connection');

    // Wrapper for the actual nodesocket, adding in basic handlers
    let netSocket = new NetSocket({
      nodeSocket,
      onData: function(request, response, netSocket, data) {
        onSocketData(request, response, netSocket, data);
        let { headers, id, contentType, requests } = nodeSocket;
        if (nodeSocket.keepAliveInterval && contentType.indexOf('proto.joeys.app') !== -1) {
          let { URI, method, opCode } = data;
          // [todo] Figure out like, listening method
          _log('https', 'onSocketData', `Registering rootEmitter.on(${URI.join('/')})`);
          if (!websockets[URI]) websockets[URI] = [];
          websockets[URI].push(netSocket);
        }
      },
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
    let { socket: nodeSocket, data, reusedSocket } = request;
    bindSocket(request, response, nodeSocket);
    let netSocket = nodeSocket;

    let { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests } = nodeSocket;
    let printObj = { headers, url, method, statusCode, statusMessage, httpVersion, id, remote, requests, data, reusedSocket };
    log(remote, 'request', `\n${what(printObj, { compact: true })}`);

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
        log({}, 'upgrade', `-> Adding nodeSocket.keepAliveInterval`);
        // log({}, 'upgrade', `[todo] .. Attempt to bind all Proto eventListeners here..? \n Adding them here doesn't seem to work, so..`);

        // Tried piping socket to itself, still can't have the keepalive interval and a rootemitter writing out protos..
        // nodeSocket.pipe(nodeSocket);
        if (nodeSocket.keepAliveInterval) return;
        let keepAliveInterval = setInterval(() => {
          // return;

          // There's some issue with the rootEmitter trying to write out to the nodeSocket whil eit's writing like this
          // nodeSocket.shift('0');
          // I think writing
          log({}, `keepAlive`, `${nodeSocket.readyState} ${nodeSocket.writable}`);
          if (nodeSocket.readyState === 'open') {
            // ... This is promising? A nodesocket could be writeOnly while a buffer is still waiting to be... flushed? out to the duplex socket...?
            // nodeSocket.write(Buffer.from('0'));
            let { closed, destroyed, writable, writableAborted, writableEnded, writableCorked, writableFinished, writableHighWaterMark, writableLength, writableNeedDrain, writableObjectMode, 
                bytesRead, bytesWritten, connecting, pending, readyState, allowHalfOpen, remote } = nodeSocket;
            let logObject = { closed, destroyed, writable, writableAborted, writableEnded, writableCorked, writableFinished, writableHighWaterMark, writableLength, writableNeedDrain, writableObjectMode, 
                            bytesRead, bytesWritten, connecting, pending, readyState, allowHalfOpen };
            // log({}, `keepAlive`, `\n${what(logObject)}`);
            log(remote, `keepAlive`, `bytesRead: ${what(bytesRead)} bytesWritten: ${what(bytesWritten)}`);

            let proto = new Proto({
              URI: ['portal', 'keepalive'],
              method: ['post'],
              opCode: 0,
              data: {},
            });
            nodeSocket.cork();
            nodeSocket.write(asFrame(proto), 'binary', function(cb) {
              log({}, `keepalive`, 'keepalive callback');
              // nodeSocket.uncork();
            });
            nodeSocket.uncork();
          } else if (nodeSocket.readyState === 'writeOnly') {
            // seems to be causing crashes too... only do cork/uncork in the emitter maybe?
            log({}, `keepAlive`, `Attempting to ... uncork? ... no, not doing anything...?`);
           // nodeSocket.uncork();
          }
          // huh.. uh. this kind of worked? 
          // nodeSocket.pipe(nodeSocket);
        },10000);
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
              log({}, 'osrs/salmon/log - nodeSocket heard event, will attempt to write proto to it');
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
        // socketListeners.forEach(l => {
        //   let { eventName, method } = l;
        //   log({}, 'listeners', `+ ${eventName} [ Method ]`);
        //    [NOT SURE if we need to prepend this to the socket? or rootEmitter..."
        //   rootEmitter.prependListener(eventName, (proto) => method(proto));
        // });
        

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

