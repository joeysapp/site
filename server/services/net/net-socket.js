import { what, log as _log, fg } from '../../../common/utils/index.mjs';
import { Proto, Info, Sock as SiteUser } from '../../../common/types/index.mjs';
import { asBuffer, asFrame } from '../../../common/types/proto.mjs';

import { EventEmitter } from 'node:events';
import { RootEmitter } from '../index.js';
import rootEmitter from '../root-emitter.js';

const NETWORK_LAYERS = {
  application: '--', transport: 'TCP', internet: '--', link: 'MAC',
  remoteAddress: '', remotePort: '', localAddress: '', localPort: '',
};

const DEBUG = process.env.DEBUG;
const SHOW_READABLE = true;

function NetSocket({
  nodeSocket = {},
  // request = {},
  // response = {},

  onData,
  onResume,
  onReadable,
  onRead,
  onEnd,
  onFinish,
  onClose,

  timeout = false,
  onTimeout = function(nodeSocket, timeout) {
    log('NetSocket', 'timeout', 'nodeSocket.end()/nodeSocket.destroy();');
    nodeSocket.end();
  },
}) {
  let {
    connecting,
    buffer,
    bytesRead,
    bytesWritten,
    remoteAddress,
    remoteFamily,
    remotePort,
    localAddress,
    localFamily,
    localPort,
    headers = {},
  } = nodeSocket;
  
  function LOG_NODE_SOCKET(method, idx) {
    let nodeSocketOptions = {
      readableFlowing: nodeSocket.readableFlowing,
      closed: nodeSocket.closed,
      destroyed: nodeSocket.destroyed,
      readable: nodeSocket.readable,
      readableDidRead: nodeSocket.readableDidRead,
      readableEnded: nodeSocket.readableEnded,
      timeout: nodeSocket.timeout,
      readyState: nodeSocket.readyState,
      noDelay: nodeSocket.noDelay,
      keepAlive: nodeSocket.keepAlive,
      pending: nodeSocket.pending,
      destroyed: nodeSocket.destroyed,
      connecting: nodeSocket.connecting,
      bytesRead: nodeSocket.bytesRead,
      bytesWritten: nodeSocket.bytesWritten,
      DEP_bufferSize: nodeSocket.bufferSize,
      writableLength: nodeSocket.writableLength,
      address: nodeSocket.address(),
      buffer: nodeSocket. buffer,
    };
    console.log(`\n\n ${method} ${idx}\n${what(nodeSocketOptions)}`);
  }
  let readChunks = [];
  // :-|
  let data = null;

  const CREATED = Date.now();
  let _id = nodeSocket.id;
  log('init');
  // LOG_NODE_SOCKET('init', 0);

  // I... think? we can't add listeners here, right after connection?
  // nodeSocket.on('shutdown', function(nil) {
  //   log('shutdown', 'set in constructor?');
  // });
  // nodeSocket.on('osrs/salmon/log', function(proto) {
  //   log('osrs/salmon/log', `set in constructor? ${what(proto)}`);
  // });
  // let { upgrade = '' } = headers;
  // if (upgrade === 'websocket') {
  //   rootEmitter.on(['osrs', 'salmon', 'log'].join('/'), function(data) {
  //     log('rootEmitter', `[osrs/salmon/log] Heard this, so write it back to socket: ${data}`);
  //   });
  // }
  // 

  nodeSocket.on('resume', function(nil) {
    log('resume'); DEBUG && LOG_NODE_SOCKET('resume', 0);
    data = null;
    readChunks = [];
    nodeSocket.on('session', function(session) {
      log('resume.session');
    });

  });
  nodeSocket.on('readable', function() {
    (SHOW_READABLE || DEBUG) && log('readable', 'init', ``);
    let chunk;
    while ((chunk = nodeSocket.read()) !== null) {
      (SHOW_READABLE || DEBUG) && log('readable', `read in <${chunk.length} b>`);
      readChunks.push(chunk);
    }
    DEBUG && LOG_NODE_SOCKET('readable', 2);

    // This probabaly won't work for large posts, but does for WSS.
    // setDataToString();

    
    if (nodeSocket.readyState === 'open' && nodeSocket.timeout === 0 ) {
      log('readable', 'fin socket.readyState=open / socket.timeout=0');
    } else if (nodeSocket.readyState === 'open') {
      log('readable', 'fin socket.readyState=open');
    } else {
      log('readable', `fin socket.readyState=${nodeSocket.readyState} (..we already wrote to it? and it's ending?)`);
    }
  });

  // This can be:
  // * http GET, e.g. favicon
  // * http POST
  // * http GET with UPGRADE header
  // * Proto from an already-established connection
  nodeSocket.on('data', async function(buffer) {
    const { headers, id, contentType, requests } = nodeSocket;
    let msg = null;

    log('data', `requests=${requests}`);
    let isProto = nodeSocket.contentType === 'proto.joeys.app.utf8' && requests > 0;
    nodeSocket.requests += 1;

    if (isProto) {
      msg = Proto.prototype.fromFrame(buffer);
      let isActuallyBuffer = msg.readBigInt64BE
      if (isActuallyBuffer) {
        msg = buffer.toString('utf8');
        log('data', `[ERR - NOT Proto, likely first request.]\n${what(msg, { compact: true })}`);
      } else {
        let { URI } = msg;
        // nodeSocket.addListener(URI.join('/'), function(proto) {
        //   log(URI.join('/'), `[todo] Uh, do something I guess? Do we just write the proto?\n${what(proto)}`);
        // });
        log('data', `[todo] Parse out proto - should this netsocket emit the event...? And the rootEmitter is listening for it?`);
        nodeSocket.emit(URI.join('/'), msg, nodeSocket);
        // log('data', `[Proto -> netSocket.addListener(URI), RootEmitter.emit([${URI.join('/')}])]\n${what(msg, { compact: true })}\nListeners=[${what(nodeSocket.eventNames())}]`);
      }
    } else {
      // } else if (nodeSocket.contentType.indexOf('application/json') !== -1) {
      let string = buffer.toString('utf8');
      let requestRows = string.split('\r\n');
      let signature = requestRows.shift().toLowerCase();
      let payload = requestRows.pop();
      try {
        payload = JSON.parse(payload);
      } catch {

      }
      requestRows.pop();
      let headers = requestRows.reduce((acc, header, idx) => {
        let [key, val] = header.split(': ');
        return {
          ...acc,
          [key]: val,
        };
      }, {});

      let auth = headers['Authorization'] || headers['authorization'] || 'nil';
      msg = {
        // headers,
        requests,
        auth,
        signature,
        payload,
        contentType: nodeSocket.contentType,
      };
      log('data', `\n${what(msg, { compact: true })}`);
    }

    // [tbd] Passing out info for various handlers...? Might not be needed.
    if (onData) {
      onData(nodeSocket.request, nodeSocket.response, nodeSocket, msg);      
    }
  });
  nodeSocket.on('read', function() { log('read'); });

  // [todo] Need to have like, setDataToHTTPRequest, setDataToUTF8, setDataToBinary, etc.
  function setDataToString() {
    data = readChunks.join('');
    let returnSeq = '\r\n\r\n';
    let headerIdx = data.indexOf(returnSeq);
    let headers;
    let signature;
    if (headerIdx !== -1) {
      headers = data.slice(0, headerIdx).split('\r\n');
      signature = headers.shift();
      headers = headers.map(h => {
        let firstColon = h.indexOf(':');
        return [h.substring(0, firstColon), h.substring(firstColon+1).trim()];
      });
      data = data.slice(headerIdx + returnSeq.length);
    }
    data = {
      signature,
      headers: headers && headers.reduce((acc, kv = []) => {
        let [key, val] = kv;
        return {
          ...acc,
          [key]: val,
        };
      }, {}),
      data,
    };
    log('setDataToString()', `\n${what(data), { compact: false }}`);
  }
  nodeSocket.on('end', function() {
    log('end', `age=${(Date.now() - CREATED)/1000.0} s`);
    if (!data) {
      // setDataToString();
    }
    onEnd && onEnd(this, data);
  });
  nodeSocket.on('finish', function(error) {
    log('finish');
    onFinish && onFinish(this, data);
  });
  nodeSocket.on('close', function(hadError = true) {
    log('close', `age=${(Date.now() - CREATED)/1000.0} s`);
    if (!data) {
      // setDataToString();
    }
    onClose && onClose(this, data);
  });

  nodeSocket.on('connect', function() { log('connect'); });
  nodeSocket.on('ready', function() { log('ready'); });
  nodeSocket.on('drain', function() { log('drain'); });
  nodeSocket.on('error', function(error) { log('error', `\n${what(error)}\n`); });
  nodeSocket.on('lookup', function(error, address, family, host) { log('lookup', `address=${address} family=${family} host=${host}`); });
  nodeSocket.on('pause', function(data) { log('pause'); });
  nodeSocket.on('pipe', function(error) { log('pipe'); }); 
  nodeSocket.on('unpipe', function() { log('unpipe'); });

  // nodeSocket.once('session', function(sessionBuffer) {
  //   log('session', `<${sessionBuffer.length} bytes>`);
  // });


  function log(a='', b='', c='', d='') {
    // _id = `${id}<`+`???`.padStart(5, ' ')+'>';
    // _id = `${id}<_______>`;

    // After .on(close), our server and the socket will no longer be bound.
    const { address = '--', port = '--', family = '--' } = nodeSocket.address();
    // Our reverse proxy will be shown here, so look at remote that we set in http-server/bindSocket
    let { remote = {} } = nodeSocket;    
    let { remoteAddress, remotePort, remoteFamily } = remote;

    let application = nodeSocket.encrypted ? 'tls' : 'net';
    const _NETWORK_LAYERS = {
      ...NETWORK_LAYERS,
      application,
      localAddress: address,
      localPort: port,
      remoteAddress,
      remotePort,
      internet: remoteAddress ? remoteFamily : family,
    };
    _id = nodeSocket.id;
    _log(_NETWORK_LAYERS, _id, a, b, c, d);
    if (family !== remoteFamily) {
      // _log(_NETWORK_LAYERS, id, `localFamily !== remoteFamily, ${family} !== ${remoteFamily}`);
    }
  };
  return nodeSocket;
}
export default NetSocket;
