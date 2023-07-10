import UDPSocket from './udp.js';
import { Info, Status } from '../lib/common/types/index.mjs';

// Utils
import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';

function Serials(emitter) {
  // todo - These are shared objects, figure out logging them to tty or piping them out
  let info = new Info();
  let status = new Status();

  let localAddress = '192.168.0.2';  
  let localSockets = [];

  let arduinos = [
    { localAddress, localPort: 42000, remoteAddress: '192.168.0.6', remotePort: 420 },
  ];

  function init() {
    arduinos.forEach(options => {
      let newSocket = new UDPSocket(options);
      localSockets.push(newSocket);
    });
  }

  return {
    init,
  };
}
export default Serials;
