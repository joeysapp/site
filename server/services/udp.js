import dgram from 'node:dgram';
// [todo] import DNS from './dns.js';
import { lookup } from 'node:dns';

// todos
import { Info, Status } from '../lib/common/types/index.mjs';

// Utils
import what from '../lib/common/utils/what-server.mjs'; import _log from '../lib/common/utils/log.mjs';
import { hexdump, } from '@thi.ng/hex';

// https://nodejs.org/api/dgram.html
// - Extends the EventEmitter
// [info] https://en.wikipedia.org/wiki/User_Datagram_Protocol
function UDPSocket (opts = {}) {
  let {
    localAddress = '192.168.0.2',
    localPort,
    remoteAddress,
    remotePort,
  } = opts;
  
  const layers = {
    application: 'http',
    transport: 'udp',
    internet: 'IPv4',
    link: 'MAC',
    remoteAddress,
    remotePort,
    localAddress,
    localPort,
  };
  function log(a='', b='', c='', d='', e='', f='') { _log(layers, a, b, c, d, e, f) };
  log('new');

  const socket = dgram.createSocket({
    type: 'udp4',
    // When true socket.bind() will reuse the address,
    // even if another process has already bound a socket on it. Default: false.
    reuseAddr: true,
  });

  socket.on('close', () => {
    log('close');
  });

  // The 'connect' event is emitted after a socket is associated
  // to a remote address as a result of a successful connect() call.
  socket.on('connect', () => {
    let { address, family, port } = socket.remoteAddress();
    layers.remoteAddress = address;
    layers.remotePort = port;
    
    log('connect', `${what(socket.remoteAddress())}`);
  });

  socket.on('error', (err) => {
    log(`error`, `${err.stack}`);
    close();
  });

  // The 'listening' event is emitted once the dgram.Socket is addressable
  // and can receive data. This happens either explicitly with socket.bind()
  // or implicitly the first time data is sent using socket.send().
  // 
  // Until the dgram.Socket is listening, the underlying system resources do not
  // exist and calls such as socket.address() and socket.setTTL() will fail.
  socket.on('listening', () => {
    // https://nodejs.org/api/dgram.html#socketsetttlttl
    socket.setTTL(5);
    log(`listening`);
  });

  // 
  socket.on('message', (msg, rinfo = {}) => {
    let { address, family, port, size } = rinfo;
    
    // Handle the arduinos that are just spraying us info :^)
    if (!layers.remoteAddress) {
      layers.remoteAddress = address;
      layers.remotePort = port;
    }

    // If the source address of the incoming packet is an IPv6 link-local address, the interface name is added to the address.
    // For example, a packet received on the en0 interface might have the address field set to
    // 'fe80::2618:1234:ab11:3b9c%en0', where '%en0' is the interface name as a zone ID suffix.
    log('message',  `<${size} b>`, `${hexdump(msg, 0, msg.length)}`);
  });
  
  // https://nodejs.org/api/dgram.html#socketbindoptions-callback
  // For UDP sockets, causes the dgram.Socket to listen for datagram messages on a named port and optional address.
  // If port is not specified or is 0, the operating system will attempt to bind to a random port. If address is not
  // specified, the operating system will attempt to listen on all addresses. Once binding is complete, a 'listening'
  // event is emitted and the optional callback function is called.
  // 
  // A bound datagram socket keeps the Node.js process running to receive datagram messages.
  // By default, binding a socket will cause it to block the Node.js process from exiting as long as the socket is open.
  // The socket.unref() method can be used to exclude the socket from the reference counting that keeps the Node.js process
  // active. The socket.ref() method adds the socket back to the reference counting and restores the default behavior.
  socket.bind({ address: localAddress, port: localPort }, () => {
    log('bound');
  });

  function send(msg, port, address, callback) {
    socket.send(msg, port, address, callback);
  }

  return {
    send,
  };
};
export default UDPSocket;
