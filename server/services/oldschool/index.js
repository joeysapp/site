import path from 'node:path';
import fs from 'node:fs';

import { EventEmitter } from 'node:events';
// 2023-10-31; Trying to figure out a root/shared emitter...
import rootEmitter from '../root-emitter.js';
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

// [todo] This will probably be handled with postgres later
const SEEN_IDS = {};
function shouldExcludeLog({ auth, chatName, chatType, id, message, rank, sender, timestamp }) {
  let exclude = false;
  if (SEEN_IDS[id]) {
    exclude = true;
  } else {
    SEEN_IDS[id] = true;
  }
  // Runelite chat logger plugin sends achievements/drops with sender 'Sals Realm',
  // so exclude log entries without that sender (so no chat logging.)
  if (sender !== 'Sals Realm') exclude = true;
  if (chatName !== 'sals realm') exclude = true;
  if (message === "To talk in your clan's channel, start each line of chat with // or /c.") exclude = true;
  DEBUG && log('shouldExcludeLog', `${sender} ${chatName} ${exclude}`);
  return exclude;
};

// This will only be handling POSTS - the get to osrs.joeys.app/* will go to nginx,
// which will just place them on the base index.html (?) ... custom views?
async function oldschoolRequest(request, response, netSocket, data) {
  try {
  let id = 'oldschoolRequest';
  DEBUG && log(id, '000', ``);
  return new Promise((resolve, reject) => {
    // TBD if we want these async, or just do all stuff manually (e.g. netSocket.write(new Proto) here, and somehow b
    let { url, method, headers } = request;
    log(id, '001', `write to csv & emit(osrs/salmon/log) for tls socks`);
    if (method !== 'POST') {
      response.writeHeader(200);
      response.end();
      reject();
      return;
    }
    let { signature, auth, payload = '' } = data;
    DEBUG && log(id, '002', ``);
    if (typeof payload === 'object' && payload.length > 0) {
      payload = payload.map(msgObject => {
        return { auth, ...msgObject };
      });
      DEBUG && log(id, '003', ``);
    } else {
      log(id, '003-ERR', `${auth} ${signature}\n ${what(payload)}`);
      response.writeHeader(400, { 'Content-Type': 'text/plain' });
      response.end();
      reject();
      return;
    }
    // [todo] ROOT EMITTER ISSUES
    let eventName = ['osrs', 'salmon', 'log'].join('/');
    // //let emitter = new EventEmitter();
    log(id, 'XX', `will now use rootEmitter.emit(${eventName}) so connected sockets see this payload.`);
    let proto = new Proto({ 
      opCode: 1,
      method: ['put'],
      URI: ['osrs', 'salmon', 'log'],
      data: `{}`,
    });
    rootEmitter.emit(eventName, proto);
    
    // Log out to SQL
    // let pgQuery = {
    //   text: "",
    //   values: [],
    // };
    // let proto = new Proto({ opCode: 1, URI: ['osrs', 'salmon', 'log'], method: ['put'], data: pgQuery });
    // payload.forEach((msgObject, idx) => {
    //   
    //   RootEmitter.emit(['db', 'query'].join('/'), proto, socket);
    // });
    // return;
    // The rest of this is the old CSV methods

    DEBUG && log(id, '004', `${auth} ${signature}\n ${what(payload)}`);
    let logFile = path.resolve('/Users/zooey/Documents/code/site/files/text/salmon_log.csv');
    DEBUG && log(id, '005');
    let logStream = fs.createWriteStream(logFile, { flags: 'a' });
    DEBUG && log(id, '006');
    let logString = payload.reduce((payloadString, msgObject, idx) => {
      // Exclude all log entries that are not from sender "Sals Realm"
      DEBUG && log(id, `007 ${idx}`);
      if (shouldExcludeLog(msgObject)) return payloadString;

      let sender = msgObject.sender;
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

    DEBUG && log(id, '008', logString ? `\n${what(logString)}` : '');
    if (logString) {
      DEBUG && log(id, '009', 'Write out data to logfile');
      logStream.on('ready', () => {
        logStream.write(logString, () => {
          DEBUG && log(id, '010', 'wrote out to file');
          logStream.close();
          
          // let pgRow = { msg: logString };
          // let proto = new Proto({ opCode: 1, URI: ['osrs', 'salmon', 'log'], method: ['put'], data: pgRow });
          // RootEmitter.emit(['osrs', 'salmon', 'log'].join('/'), proto);//
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
  });
  } catch (err) {
    log('id', 'data', `[ERR]\n${what(err)}`);
  }
}
export {
  oldschoolSocket,
  oldschoolRequest,
};
