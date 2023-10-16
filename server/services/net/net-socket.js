import { what, log as _log, fg } from '../../../common/utils/index.mjs';

const NETWORK_LAYERS = {
  application: '--', transport: 'TCP', internet: '--', link: 'MAC',
  remoteAddress: '', remotePort: '', localAddress: '', localPort: '',
};

const DEBUG = process.env.DEBUG;

function NetSocket({
  id = 'NetSocket',

  nodeSocket = {},
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
  const {
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
  let data = null;

  const CREATED = Date.now();
  let _id = 'netSocket<'+`${id}>`.padStart(5, ' ')+'-'+`___`.padStart(3, ' ') +'>';
  log('init');
  // LOG_NODE_SOCKET('init', 0);

  nodeSocket.on('resume', function(nil) {
    log('resume'); DEBUG && LOG_NODE_SOCKET('resume', 0);
    data = null;
    readChunks = [];
    nodeSocket.on('session', function(session) {
      log('resume.session');
    });

  });
  nodeSocket.on('readable', function() {
    log('readable', 'init');
    let chunk;
    while ((chunk = nodeSocket.read()) !== null) {
      log('readable', `read in <${chunk.length} b>`);
      readChunks.push(chunk);
    }
    DEBUG && LOG_NODE_SOCKET('readable', 2);

    if (nodeSocket.readyState === 'open' && nodeSocket.timeout === 0 ) {
      log('readable', 'All chunks streamed in and socket.readyState=open / socket.timeout=0');
      setDataToString();
    } else if (nodeSocket.readyState === 'open') {
      log('readable', 'All chunks streamed in and socket.readyState=open');
    } else {
      log('readable', `All chunks streamed in and socket.readyState=${nodeSocket.readyState} (..we already wrote to it? and it's ending?)`);
      setData();
    }
  });

  nodeSocket.on('read', function() { log('read'); });
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
    log('setDataToString()');
  }
  nodeSocket.on('end', function() {
    log('end');
    if (!data) setDataToString();
    onEnd && onEnd(this, data);
  });
  nodeSocket.on('finish', function(error) {
    log('finish');
    onFinish && onFinish(this, data);
  });
  nodeSocket.on('close', function(hadError = true) {
    log('close', `age=${(Date.now() - CREATED)/1000.0} s`);
    if (!data) setDataToString();
    onClose && onClose(this, data);
  });

  nodeSocket.on('connect', function() { log('connect'); });
  nodeSocket.on('ready', function() { log('ready'); });
  nodeSocket.on('drain', function() { log('drain'); });
  nodeSocket.on('error', function(error) { log('error'); });
  nodeSocket.on('lookup', function(error, address, family, host) { log('lookup', `address=${address} family=${family} host=${host}`); });
  nodeSocket.on('pause', function(data) { log('pause'); });
  nodeSocket.on('pipe', function(error) { log('pipe'); }); 
  nodeSocket.on('unpipe', function() { log('unpipe'); });

  // nodeSocket.once('session', function(sessionBuffer) {
  //   log('session', `<${sessionBuffer.length} bytes>`);
  // });


  function log(a='', b='', c='', d='') {
    // _id = `${id}<`+`???`.padStart(5, ' ')+'>';
    _id = `${id}<_______>`;

    // After .on(close), our server and the socket will no longer be bound.
    const { address = '--', port = '--', family = '--' } = nodeSocket.address();
    const { remoteAddress, remotePort, remoteFamily } = nodeSocket;   
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
    _log(_NETWORK_LAYERS, id, a, b, c, d);
    if (family !== remoteFamily) {
      // _log(_NETWORK_LAYERS, id, `localFamily !== remoteFamily, ${family} !== ${remoteFamily}`);
    }
  };
  return nodeSocket;
}
export default NetSocket;

