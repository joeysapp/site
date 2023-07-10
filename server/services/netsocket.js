
import _log from '../lib/common/utils/log.mjs';

function NetSocket(socket, options={}) {
  
  let {
    fd, allowHalfOpen, readable, writable, signal,

    layers
  } = options;
  function log(a='', b='', c='', d='', e='', f='') { _log(layers, a, b, c, d, e, f) };


  socket.on('close', function(hadError = true) {
    log('close');
  });

  socket.on('connect', function() {
    log('connect');
  });

  socket.on('readable', function(data) {
    log('readable');
    this.read();
  });

  socket.on('resume', function(data) {
    log('resume');
  });

  socket.on('data', function(data) {
    log('data'); // buffer or string
  });

  socket.on('drain', function() {
    log('drain');
  });

  socket.on('end', function() {
    log('end');
  });
  
  socket.on('error', function(error) {
    log('error');
  });

  socket.on('finish', function(error) {
    log('finish');
  });
  
  socket.on('lookup', function(error, address, family, host) {
    log('lookup');/*
      Emitted after resolving the host name but before connecting. Not applicable to Unix sockets.

      err <Error> | <null> The error object. See dns.lookup().
      address <string> The IP address.
      family <number> | <null> The address type. See dns.lookup().
      host <string> The host name.
    */
  });

  socket.on('pause', function(data) {
    log('pause');
  });

  socket.on('pipe', function(error) {
    log('pipe');
  });

  socket.on('ready', function() {
    log('ready'); // triggered immediately after connect
  });

  socket.on('timeout', function() {
    log('timeout');
  });

  socket.on('unpipe', function() {
    log('unpipe');
  });

  return this;
}

export default NetSocket;
