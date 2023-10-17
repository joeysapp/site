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

  onSocketResume,
  onSocketReadable,
  onSocketRead,
  onSocketEnd = function(netSocket, data) { DEBUG && console.log('onSocketEnd', `${netSocket.net_socket_id}\n  ${what(data)}`); },
  onSocketFinish = function(netSocket, data) { DEBUG && console.log('onSocketFinish', `${netSocket.net_socket_id}\n  ${what(data)}`); },
  onSocketClose = function(netSocket, data) { DEBUG && console.log('onSocketClose', `${netSocket.net_socket_id}\n  ${what(data)}`); },
}) {
  let _httpsServer;
  _httpsServer = http.createServer();

  const netSockets = {};
  let _id = '${label}<'+`${port}`.padStart(5, ' ')+'-'+`${Object.keys(netSockets).length}`.padStart(3, ' ') +'>';
  log({}, 'init');

  _httpsServer.addListener('connection', function(nodeSocket) {
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily };
    log(remote, `connection`);

    let netSocket = new NetSocket({
      nodeSocket,
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
    let { socket: nodeSocket, headers, method, url, statusCode, statusMessage, httpVersion } = request;
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily };

    let id = Math.floor(Math.random()*100000);
    let printObj = { headers, url, method, statusCode, statusMessage, httpVersion };
    log(remote, 'request', `\n${what(printObj, { compact: false })}`);

    // TBD if we want to be setting up our socket with listeners in connection or here..
    // I recall there was a problem with setting up event listeners in connection,
    // but (hopefully) that was an https/tls thing?
    let netSocket = nodeSocket;

    request.addListener('socket', function(nodeSocket) {
      log(remote, 'req(req.socket)', `<${id}> nodeSocket` );
    });
    request.addListener('aborted', function(close) {
      log(remote, 'req(req.aborted)', `<${id}> request aborted ${close}` );
    });
    request.addListener('close', function(close) {
      log(remote, 'req(req.close)', `<${id}> request closing ${close}` );
    });   
    response.addListener('finish', function () {
      log(remote, 'req(res.finish)', `after <${id}>.end()`);
      onResponseFinish && onResponseFinish(request, response, netSocket);
    });
    response.addListener('prefinish', function () {
      log(remote, 'req(res.prefinish)', `<${id}>`);
      onResponsePrefinish && onResponsePrefinish(request, response, netSocket);
    });
    response.addListener('drain', function () {
      log(remote, 'req(res.drain)', `<${id}>`);
    });
    response.addListener('close', function () {
      log(remote, 'req(res.close)', `after <${id}>.end(), deleting socket`);
      onResponseClose && onResponseClose(request, response, netSocket);
    });

    onRequest && onRequest(request, response, netSocket);
  });

  _httpsServer.on('upgrade', function(request, nodeSocket, head) {
    log({}, 'upgrade');
    handleUpgrade(request, nodeSocket, head)
      .then((something) => {
        log({}, 'upgrade', `[todo] Then we do something with this WebSocket`);
        // [todo] Add to connection pool

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
    _id = `${id}:`+`${port}`.padEnd(5, ' ')+'['+`${Object.keys(netSockets).length}]`.padStart(3, ' ') +'';
    _log(_NETWORK_LAYERS, _id, a, b, c, d)
  };
  return _httpsServer; 
}
export default HttpsServer;


// TBD where these functions should go
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

