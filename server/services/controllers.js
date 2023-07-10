// [todo] This likely can be refactored entirely - e.g. have a NetServer and a shared pipe.

// [todo] Could create the actual dualsense process here,
//        https://nodejs.org/api/child_process.html#child_processspawncommand-args-options

// [todo] Make a non-blocking child process for reading the pipe
//        import { spawn } from 'node:child_process';
//        let c = spawn(
//          `ls `,
//          { shell: true, signal: true, timeout },
//          { cwd: path, env: process.env },
//        );
//        c.stdout.ondata)....
import { fs } from '../library.mjs';

import RootEmitter from '../server.js';

import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';

// [future todos]
// https://github.com/mdn/dom-examples/blob/main/webgl-examples/tutorial/sample5/webgl-demo.js
function Controllers() {
  let connections = 0;
  let pipe = null;

  // Signal from a TCPSocket's proto from the frontend
  RootEmitter.on(['controllers', 'dualsense'].join('/'), async (proto, sock) => {
    connections += 1;
    let disconnectEvent = `socks/users/disconnect/${sock.socketID}`;

    // 'Once' so the event listener is removed after it's called
    RootEmitter.once(disconnectEvent, function controllersDisconnect(data) {
      log('Controllers', '', '', `Heard ${sock.socketID} disconnect`);
      connections -= 1;
      if (connections === 0) {
        log('Controllers', '', '', 'No other connections, closing stream IF it wasn\'t closed by us.');
        if (pipe) pipe.destroy();
        pipe = null;
      }
    });
    
    // Set up pipe
    if (pipe !== null) {
      log('Controllers', '', '', 'Stream is open, adding listener');

      pipe.addListener('data', (data) => {
        let json = {};
        try {
          json = JSON.parse(data);
        } catch (err) {
          log('Controllers', `${what(err)}`);
        }
        // Post this out to the given TCPSocket that is listening for the dualsense event
        RootEmitter.emit('socks/broadcast/controllers/dualsense', json);
      });
    } else {
      log('Controllers',  '', '','Creating new stream and adding listener');

      let path = '/Users/zooey/Documents/code/python/dualsense-pipes/ds_pipe';
      pipe = fs.createReadStream(path, { flags: fs.constants.O_RDWR });
      pipe.on('readable', () => {
        let data;
        if (null === (data = pipe.read())) {
          console.log('controllers/readable/error');
          return;
        }

        // [todo] Try/catch for < 3ms reading of pipe. 
        let json = {};
        try {
          json = JSON.parse(data);
        } catch {
          log('Controllers', `${what(err)}`);
        }
        RootEmitter.emit('socks/broadcast/controllers/dualsense', json);
      });

      pipe.on('close', (data) => {
        log('Controllers', '', '', 'pipe.onclose()');

        // So this is firing on the hot reload from the frontend, but I'm not sure why?
        if (pipe) pipe.destroy();
        pipe = null;
      });

      RootEmitter.prependListener('shutdown', function controllersShutdown(event) {
        if (pipe && !pipe.closed) {
          log('Controllers', 'shutdown', '', 'Destroying pipe');
          pipe.destroy()
          log(pipe.destroyed);
        } else {
          log('Controllers', 'shutdown', '', 'Pipe was already closed', what(pipe));
        }
      });
    }
  });
};
export default Controllers;
