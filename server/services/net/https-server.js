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

let { SSL_OP_NO_TLSv1, SSL_OP_NO_TLSv1_1, SSL_OP_NO_TLSv1_2 } = crypto.constants;
let secureOptions = SSL_OP_NO_TLSv1+SSL_OP_NO_TLSv1_1+SSL_OP_NO_TLSv1_2;
let TLS_OPTIONS = {
  // [tbd] Issues with a blocking read on linux..?
  key: fs.readFileSync(path.resolve(process.env.CERT_HOME, process.env.ROOT_KEY)),
  cert: fs.readFileSync(path.resolve(process.env.CERT_HOME, process.env.ROOT_CERT)),
  // ticketKeys: Buffer.from('foobar'.repeat(8)),

  requestTimeout: 500,
  handshakeTimeout: 500, // default is 12000ms
  // keepAlive: true,
  // keepAliveTimeout: 1000 * 60 * 1,

  keepAlive: false, // For just simple fileserver stuff, dc sockets.
  keepAliveTimeout: 1,
  allowHalfOpen: false,

  secureOptions,
};
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

  let keyFile = 'NO_KEY_FILE';
  let certFile ='NO_CERT_FILE';
  if (!certFile && process.env.CERT_HOME) {
    _log('new httpsServer()', 'init.error', 'Could not find certificate files on boot, attempting again');
    certFile = fs.readFileSync(path.resolve(process.env.CERT_HOME, process.env.ROOT_CERT));
    keyFile = fs.readFileSync(path.resolve(process.env.CERT_HOME, process.env.ROOT_KEY));
    TLS_OPTIONS = {
      cert: certFile,
      key: keyFile,
      ...TLS_OPTIONS,
    };
  }  

  logCiphers();
  let _httpsServer;
  // _httpsServer = https.createServer(TLS_OPTIONS);
  _httpsServer = http.createServer();

  const netSockets = {};
  let _id = '${label}<'+`${port}`.padStart(5, ' ')+'-'+`${Object.keys(netSockets).length}`.padStart(3, ' ') +'>';
  log({}, 'init');

  _httpsServer.addListener('connection', function(nodeSocket) {
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;
    const remote = { remoteAddress, remotePort, remoteFamily };
    log(remote, `connection`);   
    // Didn't fire.. trying in NetSocket..
    // nodeSocket.once('session', function(session) {
    //   log(remote, 'connection/session', 'omfg the socket.on(sessioned)');
    // });
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

  // This means the network knows there __IS__ a previous session to use.
  // Our "failure" to resume here is more "sorry we know you're X but we can't get X's data."
  _httpsServer.on('resumeSession', function(sessionID, callback) {
    let sessionKey = sessionID.toString('hex');
    let sessionData = store[sessionKey];

    // let printObj = {
    //   msg: 'The internet knows we know this session. But did we save any information about them? We should have...',
    //   msg_two: 'So uh, maybe just manually say we know sessionData.........?',
    //   sessionKey,
    //   sessionData,
    //   store: Object.keys(store).length,
    //   callback: `-> callback(null, ${sessionData})`,
    // };
    log({}, 'resumeSession', `the _INTERNET_ handled TLS1.3 for us :-D -> secureConnection -> any number of newSession chunks`);
    // log({}, 'resumeSession', `\n${what(printObj, { compact: false })}`);

    // Pretty sure this will always be undefined in TLSv1.3
    sessionData = null;
    callback(null, sessionData);
  });


  _httpsServer.on('secureConnection', function(tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };

    // TLS1.2 only: https://nodejs.org/api/tls.html#tlssocketgetsession
    // Hmm. Are we supposed to set store here....?
    
    // TLS1.3 
    // https://nodejs.org/api/tls.html#event-session
    // For TLSv1.2 and below, tls.TLSSocket.getSession() can be called once the handshake is complete. For TLSv1.3, only ticket-based resumption is allowed by the protocol, multiple tickets are sent, and the tickets aren't sent until after the handshake completes. So it is necessary to wait for the 'session' event to get a resumable session. Applications should use the 'session' event instead of getSession() to ensure they will work for all TLS versions. Applications that only expect to get or use one session should listen for this event only once:

    // Didn't fire.. trying in NetSocket...
    // tlsSocket.once('session', function(session) {
    //   log('secureConnection', `tlsSocket.on(session)\n${what(session.toString('hex'))}`);
    // });

    const { servername, alpnProtocol } = tlsSocket;
    const sessionProtocol = tlsSocket.getProtocol();
    // IDK if this boolean is reliable?
    const sessionReused = tlsSocket.isSessionReused();
    const sessionAddress = tlsSocket.address();
    // let printObj = {
    //   // msg: 'Since we sent a callback(null, null), we *think* we need to create a new session but we dont',
    //   msg: 'Apparently in TLS1.3 the ticket keys are "random" so we need to listen for the socket here to actually resume their session.',
    //   sessionProtocol,
    //   sessionReused,
    //   sessionAddress,
    // };
    let printObj = {
      msg: `connected to ${tlsSocket.getProtocol()} socket, now we wait for it to send/stream us stuff in newSession event`
    };

    log (remote, 'secureConnection', `connected to ${tlsSocket.getProtocol()} socket, now we wait for it to send/stream us stuff in newSession event`);
    // log(remote, `secureConnection`, `\n${what(printObj, { compact: false })}`);
  });

  
  // https://github.com/nodejs/node/blob/main/doc/api/tls.md#event-resumesession
  // So I believe this fires for any given connection; 
  _httpsServer.on('newSession', function(sessionID, sessionDataFromResume, callback) {
    // const nodeSocket = { thisIsHowYouResumeTLS: '[todo]' };
    // const { remoteAddress = '???', remotePort = '???', remoteFamily = '???' } = nodeSocket;
    // const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };

    let sessionKey = sessionID.toString('hex');
    let sessionData = sessionDataFromResume;
    // TLSv1.3, it looks like first 16 bytes are always the identifying header? So we can chunk in the rest?
    // https://github.com/serverless-dns/serverless-dns/commit/abf20c838ae42e5ba4cf856f5a29784bcf8be161
    // https://github.com/serverless-dns/serverless-dns/issues/30
    // "almost obsolete session resumption"?

    // As a result, I think this is not worth the effort? All of the resumption stuff
    // is being done behind the scenes

    let sessionHeader = sessionData.subarray(0, 16).toString('hex');
    let sessionIDInData = sessionData.subarray(16, 48).toString('hex');
    let supposedlyMatchingTwoBytes = sessionData.subarray(48, 50).toString('hex');
    let sessionRestData = sessionData.subarray(50).toString('hex');
    // let sessionChunkedData = sessionData;

    // store[sessionKey] = sessionData.toString('hex');
    // https://www.wolfssl.com/tls-1-3-performance-resumption/
    // Okay, so there may not even be any point here, attempting to ID the user with these chunks
    // because I'm thinking all the protocol stuff is probably behind the scenes? IDK.
    let printObj = {
      maskedChunk: sessionData,      
    };

    // let printObj = {
    //   msg: 'Okay, wait. So is newSession _ONLY_ called when resumeSession(null, null) is called, or will it also be called with resumeSession(null, store[id]), and newSession is more like, oh hey new session to handle it may or may not be previously known?',
    //   sessionKey,
    // 
    //   length: sessionDataFromResume.length,
    //   sessionIDInData,
    //   supposedlyMatchingTwoBytes,
    //   sessionRestData,
    //   sessionHeader,
    // }
    log({}, 'newSession', `TLSv1.3 (already connected?) socket is streaming in us stuff, I think`);
    // log({}, 'newSession [TODO]', `\n${what(printObj, { compact: false })}`);

    // log({}, 'newSession [TODO]', `\n${what(printObj, { compact: false })}\n${what(store, { compact: false })}\n`)
    // let essionData = `foo ${Math.floor(Math.random()*1000)}`;
    // newSessionData = `Connection #${Object.keys(store).length+1}`;
    // store[sessionKey] = newSessionData;

    callback();
  });
  

  _httpsServer.on('keylog', function(lineBuffer, tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };
    log(remote, `keylog`);
  });

  _httpsServer.on('tlsClientError', function(exception, tlsSocket) {
    const { remoteAddress, remotePort, remoteFamily } = tlsSocket;
    const remote = { remoteAddress, remotePort, remoteFamily, application: 'tls' };
    let cipher = tlsSocket.getCipher();
    let protocol = tlsSocket.getProtocol();
    let printObj = { ...exception, protocol, cipher };
    log(remote, `tlsClientError\n${what(printObj, { compact: false, showHidden: false })}`);
  });

  _httpsServer.on('listening', function() { log({}, 'listening'); });
  _httpsServer.on('connect', function() { log({}, 'connect'); });
  _httpsServer.on('checkContinue', (request, response) => { log({}, 'checkContinue'); });
  _httpsServer.on('checkExpectation', (request, response) => { log({}, 'checkExpectation'); });
  _httpsServer.on('dropRequest', (request, socket) => { log({}, 'dropRequest(request, socket)'); });
  _httpsServer.on('clientError', (error, nodeSocket) => {
    log({}, 'clientError', `\n${what(error, { showHidden: false, compact: false })}`);
    // nodeSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    // Node CLI said destroying was better on clientError
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
