import { what, log as _log, fg } from '../../../common/utils/index.mjs';
import { Proto, Info, Sock as SiteUser } from '../../../common/types/index.mjs';
import { asBuffer, asFrame } from '../../../common/types/proto.mjs';

import { EventEmitter } from 'node:events';
import { RootEmitter } from '../index.js';
import rootEmitter from '../root-emitter.js';

const DEBUG = process.env.DEBUG;
function NetSocket({
  nodeSocket = {},
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
    lifespan,
    requests,
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
  let data = null;
  let readChunks = [];

  const CREATED = Date.now();
  let _id = nodeSocket.id;
  DEBUG && log('init');

  nodeSocket.on('resume', function(nil) {
    DEBUG && log('resume');
    data = null;
    readChunks = [];
    nodeSocket.on('session', function(session) {
      log('resume.session');
    });
  });

  nodeSocket.on('readable', function() {
    DEBUG && log('readable', 'init', ``);
    let chunk;
    while ((chunk = nodeSocket.read()) !== null) {
      DEBUG && log('readable', `read in <${chunk.length} b>`);
      readChunks.push(chunk);
    }
    DEBUG && LOG_NODE_SOCKET('readable', 2);

    if (nodeSocket.readyState === 'open' && nodeSocket.timeout === 0 ) {
      DEBUG && log('readable', 'fin socket.readyState=open / socket.timeout=0');
    } else if (nodeSocket.readyState === 'open') {
      DEBUG && log('readable', 'fin socket.readyState=open');
    } else {
      DEBUG && log('readable', `fin socket.readyState=${nodeSocket.readyState} (..we already wrote to it?.. it's ending?)`);
    }
  });

  // * http get/post/whatever (w/ upgrade header)
  // * proto from an upgraded prior socketData->data->upgrade->...
  nodeSocket.on('data', async function(buffer) {
    const { headers, id, contentType = '', requests, lifespan } = nodeSocket;
    log('data', `reqs= ${requests} lifespan=${nodeSocket.lifespan}`);
    nodeSocket.requests += 1;

    let isProto = contentType.indexOf('proto.joeys.app') !== -1 && requests > 0;
    let msg = null;
    if (isProto) {
      msg = Proto.prototype.fromFrame(buffer);
      let isActuallyBuffer = msg.readBigInt64BE
      if (isActuallyBuffer) {
        msg = buffer.toString('utf8');
        log('data', `[ERR - NOT Proto, likely first request.]\n${what(msg, { compact: true })}`);
      } else {
        let { URI = [] } = msg;
        // Emit from this nodeSocket so the parent rootEmitter in https-server
        // will hear it and pass the proto and this socket to that URI.
        nodeSocket.emit(URI.join('/'), msg, nodeSocket);
      }
    } else {
      // } else if (nodeSocket.contentType.indexOf('application/json') !== -1) {
      let string = buffer.toString('utf8');
      let requestRows = string.split('\r\n');
      let signature = requestRows.shift().toLowerCase();
      let payload = requestRows.pop();      
      // GETs will just be an empty string. See if the (POST?) is json.
      if (payload) {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          log('data', `[ERR - Received POST that is not JSON.]\n${what(payload)}`);        
        }
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
      DEBUG && log('data', `\n${what(msg, { compact: true })}`);
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

  nodeSocket.on('finish', function(error) {
    log('finish');
    onFinish && onFinish(this, data);
  });
  nodeSocket.on('end', function() {
    log('end', `requests=${nodeSocket.requests} age= ${(Date.now() - CREATED)/1000.0} lifespan=${nodeSocket.lifespan}`);
    // if (!data) {
    //    setDataToString();
    // }
    onEnd && onEnd(this, data);
  });
  nodeSocket.on('close', function(hadError = true) {
    log('close', `requests=${nodeSocket.requests} age= ${(Date.now() - CREATED)/1000.0} lifespan=${nodeSocket.lifespan}`);
    // if (!data) {
    //   setDataToString();
    // }
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
    // After .on(close), our server and the socket will no longer be bound.
    const { address = '', port = '', family = '' } = nodeSocket.address();

    // Our reverse proxy will be shown here, so look at remote that we set in http-server/bindSocket
    let { remote = {} } = nodeSocket;    
    let { remoteAddress, remotePort, remoteFamily } = remote;
    const _NETWORK_LAYERS = {
      application: nodeSocket.encrypted ? 'tls' : 'net',
      transport: 'tcp', link: 'mac',      
      localAddress: address,
      localPort: port,
      remoteAddress,
      remotePort,
      internet: remoteAddress ? remoteFamily : family,
    };
    _id = nodeSocket.id;
    _log(_NETWORK_LAYERS, _id, a, b, c, d);
  };
  return nodeSocket;
}
export default NetSocket;
