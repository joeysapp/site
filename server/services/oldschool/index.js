// import AchievementLogger from './achievement-logger';


// This will only be handling POSTS - the get to osrs.joeys.app/* will go to nginx,
// which will just place them on the base index.html (?) ... custom views?
function oldschoolHost(request, response, netSocket, data) {
  return new Promise((resolve, reject) => {
    // TBD if we want these async, or just do all stuff manually (e.g. netSocket.write(new Proto) here, and somehow b
    let { url, method, headers } = request;

    if (method === 'GET') {
      // NGINX will handle this for now I think?
      if (response) {
        response.end();
      } else if (netSocket) {
        netSocket.end();
      }
      resolve();
      // return;
    } else if (method === 'POST') {
      let { signature, auth, payload = '' } = data;
      
      if (typeof payload === 'object' && payload.length > 0) {
        payload = payload.map(msgObject => {
          return { auth, ...msgObject };
        });
      } else {
        // netSocket.writeHeader(400);
        // netSocket.write('HTTP 1.0 / 400 BAD DATA');
        response.writeHeader(400, { 'Content-Type': 'text/plain' });
        response.end();
        reject();
        // netSocket.end();
        return;
      }
      response.writeHeader(200);
      response.end();
      let logFile = path.resolve('/Users/zooey/Documents/code/site/files/text/salmon_log.csv');
      let logStream = fs.createWriteStream(logFile, { flags: 'a' });
      let logString = payload.reduce((payloadString, msgObject, idx) => {
        let sender = msgObject.sender;
        if (sender !== 'Sals Realm') return payloadString;

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

      if (logString) {
        log(id, 'data', 'Write out data to logfile');
        logStream.on('ready', () => {
          logStream.write(logString, () => {
            log('data', 'wrote out to file');
            logStream.close();
            resolve();
          });
        });
      }
    }
  });
}
export default oldschoolHost;
