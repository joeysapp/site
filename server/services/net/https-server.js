import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import NetSocket from './net-socket.js';
import { RootEmitter } from '../index.js';
import { what, log as _log } from '../../../common/utils/index.mjs';
// const _log = () => {}; const what = () => {}; const fg = () => {}; const bold = () => {}; const numToBytes = () => {};

const DEBUG = process.env.DEBUG || false;
const TLS_OPTIONS = {
  cert: fs.readFileSync(path.resolve(process.env.HOME, process.env.ROOT_CERT)),    
  key: fs.readFileSync(path.resolve(process.env.HOME, process.env.ROOT_KEY)),
  ticketKeys: Buffer.from('foobar'.repeat(8)),


  requestTimeout: 600,
  handshakeTimeout: 1000, // default is 12000ms
  // keepAlive: true,
  // keepAliveTimeout: 1000 * 60 * 1,

  keepAlive: false, // For just simple fileserver stuff, dc sockets.
  keepAliveTimeout: 1,
  allowHalfOpen: true,
};
const NETWORK_LAYERS = {
  application: 'https', transport: 'tcp', internet: 'IPv4', link: 'MAC',
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
  // Utilities
  // TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384, server pubkey is 2048bit (this TLS version forbids renegotiation)
  function logCiphers() {
    let ciphers = tls.DEFAULT_CIPHERS.split(':');
    ciphers = ciphers.reduce((acc, cipher, idx) => {
      if (idx % 3 === 0) {
        return `${acc}\n  ${cipher.padEnd(32, ' ').toLowerCase()}`;
      }
      return `${acc}${cipher.padEnd(32, ' ').toLowerCase()}`;
    }, `  Available crypto ciphers for TLS1.3\n  ${'-'.repeat(80)}`);
    _log('logCiphers', `\n${ciphers}`);
  }

  let _httpsServer;
  _httpsServer = https.createServer(TLS_OPTIONS);
  const netSockets = {};
  let _id = '${label}<'+`${port}`.padStart(5, ' ')+'-'+`${Object.keys(netSockets).length}`.padStart(3, ' ') +'>';
  log({}, 'init');

  _httpsServer.addListener('connection', function(nodeSocket) {
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily };
    log(remote, 'connection');
    onConnection && onConnection(netSocket);
  });

  _httpsServer.addListener('request', function(request, response) {
    let { socket: nodeSocket } = request;
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily };
    log(remote, 'request');

    let netSocket = new NetSocket({
      nodeSocket,
      onResume: onSocketResume,
      onReadable: onSocketReadable,
      onRead: onSocketRead,
      onEnd: onSocketEnd,
      onFinish: onSocketFinish,
      onClose: onSocketClose,
    });

    let id = Math.floor(Math.random()*100000);
    const { method, url, statusMessage, statusCode, headers, httpVersion, } = request;
    log(remote, 'request', `NetSocket<#${id}> ${method} ${url}`);

    request.addListener('aborted', function(close) {
      log(remote, 'req(req.aborted)', `<${id}> request aborted ${close}` );
    });
    request.addListener('close', function(close) {
      log(remote, 'req(req.close)', `<${id}> request closing ${close}` );
      logStore(store);
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

  // TLS
  let store = {};
  function logStore() {
    let sessionString = Object.keys(store).reduce((acc, key, idx) => {
      let str = `${acc}\n${key}: ${store[key].toString('hex')}`;
      return str;
    }, '');
    log({}, 'sessions', `[[ ${Object.keys(store).length} sessions stored ]]`);
  }
  // setInterval(() => {
  //   if (Object.keys(store).length) {
  //     logStore(store);
  //   }
  // }, 10000);

  _httpsServer.on('newSession', function(sessionID, sessionData, callback) {
    const nodeSocket = { thisIsHowYouResumeTLS: '[todo]' };
    const { remoteAddress = '???', remotePort = '???', remoteFamily = '???' } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };

    log(remote, 'newSession[TODO]', `id=${what(sessionID)}`);
    let sessionKey = sessionID.toString('hex');
    let newSessionData = `foo ${Math.floor(Math.random()*1000)}`;
    newSessionData = `Connection #${Object.keys(store).length+1}`;

    store[sessionKey] = newSessionData;
    let printObj = {
      sessionKey,
      newSessionData,
      store: Object.keys(store).length,
    };
    log(remote, 'newSession[TODO]', `\n${what(printObj, { compact: false })}`);
    callback();
  });

  _httpsServer.on('resumeSession', function(sessionID, callback) {
    const nodeSocket = { thisIsHowYouResumeTLS: '[todo]' };
    const { remoteAddress = '???', remotePort = '???', remoteFamily = '???' } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' } ;

    let sessionKey = sessionID.toString('hex');
    let prevSessionData = store[sessionKey];
    log(remote, 'resumeSession[TODO]', `${what(sessionID)}`);

    let printObj = {
      sessionKey,
      prevSessionData,
      store: Object.keys(store).length,
    };
    log(remote, 'resumeSession[TODO]', `\n${what(printObj, { compact: false })}`);

    if (prevSessionData) {
      log(remote, 'resumeSession[TODO]', 'sessionKey in store, callback with previous session data');
      callback(null, prevSessionData);
    } else {
      log(remote, 'resumeSession[TODO]', 'sessionKey is not in store, callback to create a new session');
      callback(null, null);
    }
  });
  _httpsServer.on('secureConnection', function(tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };
    // https://nodejs.org/api/tls.html#tlssocketgettlsticket
    const sessionTicket = tlsSocket.getTLSTicket();
    // https://nodejs.org/api/tls.html#tlssocketgetsession
    const session = tlsSocket.getSession().toString('hex');

    log(remote, `secureConnection[TODO]`, `\n  ${tlsSocket.getProtocol()} - session ${tlsSocket.isSessionReused() ? '' : 'not '}resumed\n  ticket: ${sessionTicket}\n  session: ${session}\n\n .. but since session is not null, we know we did actually negotiate a resumption...?`);
  });
  _httpsServer.on('keylog', function(lineBuffer, tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };
    log(remote, 'keylog[TODO]');
  });
  _httpsServer.on('tlsClientError', function(exception, tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };
    log(remote, 'tlsClientError[TODO]\n${what(exception)}');
  });

  _httpsServer.on('listening', function() { log({}, 'listening'); });
  _httpsServer.on('connect', function() { log({}, 'connect'); });
  _httpsServer.on('checkContinue', (request, response) => { log({}, 'checkContinue'); });
  _httpsServer.on('checkExpectation', (request, response) => { log({}, 'checkExpectation'); });
  _httpsServer.on('clientError', (error) => { log({}, 'clientError', `\n\n${what(error)}\n\n`); });
  _httpsServer.on('dropRequest', (request, socket) => { log({}, 'dropRequest(request, socket)'); });

  _httpsServer.on('error', function(error) {
    log({}, 'error', `\n\n${what(error, { showHidden: false })}\n\n`);
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
