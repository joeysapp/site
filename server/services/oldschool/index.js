import path from 'node:path';
import fs from 'node:fs';

import { Database } from '../index.js';
import rootEmitter from '../root-emitter.js';

import { Proto } from '../../../common/types/index.mjs';
import { asFrame } from '../../../common/types/proto.mjs';
import {
  log, fg, what, numToBytes,
} from '../../../common/utils/index.mjs';

let DEBUG = false;
function setFields(fields) {
  // fields[0].name = 'Auth';
  // fields[1].name = 'Date';
  // fields[2].name = 'Entry';
  return fields;
}

rootEmitter.on(['osrs', 'salmon', 'log'].join('/'), function (proto, netSocket) {
  log ('osrs', 'osrs/salmon/log', 'Heard something. wat do?');
});
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

  // Debugging - allow own clan chat to log out for time being
  if (chatName === 'zyo') exclude = false;
  DEBUG && log('shouldExcludeLog', `${sender} ${chatName} ${exclude}`);
  return exclude;
};

// This will only be handling POSTS - the get to osrs.joeys.app/* will go to nginx,
// which will just place them on the base index.html (?) ... custom views?
let db = new Database('db/oldschool');
async function oldschoolInit(request, response, netSocket, data) {
  log('oldschoolInit', 'sending out the entire sql table');
  db.query({
    text: `
select
  osrs_chat_auth, osrs_chat_timestamp, osrs_chat_entry
from
  salmon_log
order by osrs_chat_timestamp
;`,
  }).then(function({ rows, fields }) {
    log('oldschool', 'rows', `\n${what(fields)}\n${what(rows)}\n`);

    // temporarily just adding in labels lol
    fields = setFields(fields);
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
    // Write out all messages as rows to SQL
    // We're writing out 8 values per row
    //  salmon_log_id | site_user_id | auth | timestamp | osrs_chat_id | osrs_chat_type | osrs_chat_name rank | osrs_username | chat_entry 
    //  chatName, chatType, id, message, rank, sender, timestamp
    let preparedValueString = '';
    let valueArray = [];
    payload.forEach((msgObject, i) => {
      // Exclude all log entries that are not from sender "Sals Realm"
      if (shouldExcludeLog(msgObject)) {

      } else {
        let { auth, timestamp, id, chatType, chatName, rank, sender, message } = msgObject;
        valueArray.push(auth, timestamp, id, chatType, chatName, rank, sender, message);
        let j = (i) * 8;
        preparedValueString = `${preparedValueString}($${j+1}, $${j+2}, $${j+3}, $${j+4}, $${j+5}, $${j+6}, $${j+7}, $${j+8}),`;
      }
    });
    // Prevent conditional adding of , with excluding logs
    preparedValueString = preparedValueString.substring(0, preparedValueString.length-1);

    log('oldschool', `pvstring`,`\n${what(preparedValueString)}\n${what(valueArray)}\n`);
    if (preparedValueString) {
    db.query({
      text: `
insert into salmon_log
  (osrs_chat_auth, osrs_chat_timestamp, osrs_chat_id, osrs_chat_type, osrs_chat_name, osrs_chat_rank, osrs_username, osrs_chat_entry)
values
  ${preparedValueString}
returning
osrs_chat_auth, osrs_chat_timestamp, osrs_chat_entry

;`,
      values: valueArray,
    }).then(function({ rows, fields }) {
      log('oldschool', 'rows', `\n${what(fields)}\n${what(rows)}\n`);
      // temporarily just adding in labels lol
      fields = setFields(fields);
      // Write out new SQL rows to connected frontend sockets
      let eventName = ['osrs', 'salmon', 'log'].join('/');
      log(id, 'XX', `rootEmitter.emit(${eventName}) -> https-server sends to all websockets`);
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

    // The rest of this is the old CSV methods
    // return

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
  oldschoolInit,
  oldschoolRequest,
};
