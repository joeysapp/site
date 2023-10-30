import path from 'node:path';
import fs from 'node:fs';

import { RootEmitter } from '../../services/index.js';
import { Proto } from '../../../common/types/index.mjs';

import {
  log, fg, what, numToBytes,
} from '../../../common/utils/index.mjs';

let DEBUG = false;

// [todo] In the future, multiple services at /osrs, e.g. a GE discord bot
// import AchievementLogger from './achievement-logger';

// This will be handling after our https-server has upgraded a connection.
// They largely will emit .data events as Protos.
function oldschoolSocket(request, response, netSocket, data) {
  let id = 'oldschoolSocket';
  log(id);
  // Our nginx server routed the POST to oldschoolRequest, but this is from a ws on osrs.joeys.app.
  // So data has already been written to SQL by some unknown HTTP post - this is an HTTP2/TLS live socket.

  // From initial connection (ATM)
  // netSocket.addListener('data', function(data) {
  //   log(id, 'data', `Likely an initial WSS request: \n${what(data)}`);
  // });

  netSocket.addListener(['osrs', 'salmon', 'log'].join('/'), async function(proto = {}, someSocket__maybe) {
    let { method, URI, opCode, data } = proto;
    log('osrs/salmon/log', 'Likely a new connection, post them a shitload of SQL rows');
    
  });
}

// [todo] 
function shouldExclude({ auth, chatName, chatType, id, message, rank, sender, timestamp }) {
  if (chatName !== 'Sals Realm') return true;
  if (message === "To talk in your clan's channel, start each line of chat with // or /c.") return true;
  return false;
};

// This will only be handling POSTS - the get to osrs.joeys.app/* will go to nginx,
// which will just place them on the base index.html (?) ... custom views?
async function oldschoolRequest(request, response, netSocket, data) {
  let id = 'oldschoolRequest';
  DEBUG && log(id, '000', `${data}`);
  return new Promise((resolve, reject) => {
    // TBD if we want these async, or just do all stuff manually (e.g. netSocket.write(new Proto) here, and somehow b
    let { url, method, headers } = request;
    log(id, '001', `${url} ${method} ${headers}`);
    if (method === 'GET') {
      // NGINX will handle this for now I think?
      if (response) {
        response.end();
      } else if (netSocket) {
        netSocket.end();
      }
      resolve('The method was GET, should not see this');
      // return;
    } else if (method === 'POST') {
      let { signature, auth, payload = '' } = data;
      DEBUG && log(id, '002', `${auth} ${signature}\n ${payload}`);

      if (typeof payload === 'object' && payload.length > 0) {
        payload = payload.map(msgObject => {
          return { auth, ...msgObject };
        });
        DEBUG && log(id, '003', `${auth} ${signature}\n ${payload}`);
      } else {
        log(id, '003-ERR', `${auth} ${signature}\n ${payload}`);
        // netSocket.writeHeader(400);
        // netSocket.write('HTTP 1.0 / 400 BAD DATA');
        response.writeHeader(400, { 'Content-Type': 'text/plain' });
        response.end();
        reject();
        // netSocket.end();
        return;
      }
      DEBUG && log(id, '004', `${auth} ${signature}\n ${what(payload)}`);

      response.writeHeader(200);
      response.end();
      if (shouldExclude(data)) {
        resolve();
        return;
      }

      let logFile = path.resolve('/Users/zooey/Documents/code/site/files/text/salmon_log.csv');
      let logStream = fs.createWriteStream(logFile, { flags: 'a' });
      let logString = payload.reduce((payloadString, msgObject, idx) => {
        let sender = msgObject.sender;

        // if (sender !== 'Sals Realm') return payloadString;

        let line = Object.keys(msgObject).reduce((line, key, idx) => {
          let s = `${line}${msgObject[key]}`;
          if (idx === Object.keys(msgObject).length-1) {
            s += '\n';
          } else {
            s += ',';
          }
          return s;
        }, '');
        
        return `${payloadString}${line}`;
      }, '');

      DEBUG && log(id, '005', `\n${what(logString)}`);
      if (logString) {
        log(id, 'data', 'Write out data to logfile');
        logStream.on('ready', () => {
          logStream.write(logString, () => {
            DEBUG && log(id, 'data', 'wrote out to file');
            logStream.close();
            
            let pgRow = { msg: logString };
            let proto = new Proto({ opCode: 1, URI: ['osrs', 'salmon', 'log'], method: ['put'], data: pgRow });
            RootEmitter.emit(['osrs', 'salmon', 'log'].join('/'), proto);//
            response.writeHeader(200);
            response.end();
            resolve();
          });
        });
      } else {
        response.writeHeader(200);
        response.end();
        resolve();
      }
    }
  });
}
export {
  oldschoolSocket,
  oldschoolRequest,
};
