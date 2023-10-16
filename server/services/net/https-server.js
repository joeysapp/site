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
