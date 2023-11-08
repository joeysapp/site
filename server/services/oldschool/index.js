import path from 'node:path';
import fs from 'node:fs';

import { Database } from '../index.js';
import rootEmitter from '../root-emitter.js';
// [todo] In the future, multiple services at /osrs, e.g. a GE discord bot
// import AchievementLogger from './achievement-logger';

// Common utils/types
import { Proto } from '../../../common/types/index.mjs';
import { asFrame } from '../../../common/types/proto.mjs';
import { log, fg, what, numToBytes, } from '../../../common/utils/index.mjs';

// [todo] This listens/hears, but TBD if necessary.
// rootEmitter.on(['osrs', 'salmon', 'log'].join('/'), function (proto, netSocket) {
//   log ('osrs', 'osrs/salmon/log', 'Heard something. wat do?');
// });

const DEBUG = false;

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

  // Debugging - allow own clan chat to log out for time being
  if (chatName === 'zyo') exclude = false;
  DEBUG && log('shouldExcludeLog', `${sender} ${chatName} ${exclude}`);
  return exclude;
};

let db = new Database('db/oldschool');
async function oldschoolInit(request, response, netSocket, data) {
  // let { remote } = netSocket;
  log('osrs', 'init', 'sending out entire table');
  let queryString = `select osrs_chat_auth, osrs_chat_timestamp, osrs_chat_entry from salmon_log order by osrs_chat_timestamp;`;
  db.query({
    text: queryString,
  }).then(function({ rows, fields }) {
    log('osrs', 'init', `[ ${rows.length} rows ] ->`);

    // Write out new SQL rows to connected frontend sockets
    let eventName = ['osrs', 'salmon', 'log'].join('/');
    let proto = new Proto({ 
      opCode: 1,
      method: ['update', 'add'],
      URI: ['osrs', 'salmon', 'log'],
      data: { rows, fields },
    });
    netSocket.write(asFrame(proto));
  });
}

// This will only be handling POSTS - the get to osrs.joeys.app/* will go to nginx
async function oldschoolRequest(request, response, netSocket, data) {
  try {
  let id = 'osrs, request';
  log(id, '000', ``);
  return new Promise((resolve, reject) => {
    DEBUG && log(id, '001');
    let { url, method, headers } = request;
    if (method !== 'POST') {
      response.writeHeader(200); response.end();
      reject(); return;
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
      response.writeHeader(400, { 'Content-Type': 'text/plain' }); response.end();
      reject(); return;
    }
    // Write out all messages as rows to SQL
    // Use prepared statements to prevent any injections
    let preparedValueString = '';
    let valueArray = [];
    let idx = 0;
    payload.forEach((msgObject) => {
      if (shouldExcludeLog(msgObject)) {
        // Skip over payload
      } else {
        let j = idx * 8;
        idx += 1;
        let { auth, timestamp, id, chatType, chatName, rank, sender, message } = msgObject;
        valueArray.push(auth, timestamp, id, chatType, chatName, rank, sender, message);
        preparedValueString = `${preparedValueString}($${j+1}, $${j+2}, $${j+3}, $${j+4}, $${j+5}, $${j+6}, $${j+7}, $${j+8}),`;
      }
    });

    // Prevent conditional adding of , with excluding logs
    preparedValueString = preparedValueString.substring(0, preparedValueString.length-1);
    let queryString = `insert into salmon_log  (osrs_chat_auth, osrs_chat_timestamp, osrs_chat_id, osrs_chat_type, osrs_chat_name, osrs_chat_rank, osrs_username, osrs_chat_entry) values ${preparedValueString} returning osrs_chat_auth, osrs_chat_timestamp, osrs_chat_entry;`;

    if (preparedValueString) {
      log('oldschool', `pvstring`,`\n${what(preparedValueString)}\n${what(valueArray)}\n`);
      db.query({
        text: queryString, values: valueArray,
      }).then(function({ rows, fields }) {
        log('oldschool', 'rows', `\n${what(fields)}\n${what(rows)}\n`);
        
        // Write out new SQL rows to connected frontend sockets
        let eventName = ['osrs', 'salmon', 'log'].join('/');
        DEBUG && log(id, 'XX', `rootEmitter.emit(${eventName}) -> https-server sends to all websockets`);
        let proto = new Proto({ 
          opCode: 1,
          method: ['update', 'add'],
          URI: ['osrs', 'salmon', 'log'],
          data: { rows, fields },
        });
        rootEmitter.emit(eventName, proto);
      });
    }
    return;   
  });
  } catch (err) {
    log('id', 'data', `[ERR]\n${what(err)}`);
    response.writeHeader(400);
    response.end();
    reject();
    return;
  }
}
export {
  oldschoolInit,
  oldschoolRequest,
};
