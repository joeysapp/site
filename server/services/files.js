import fs from 'node:fs';
import { readdir, opendir, open } from 'node:fs/promises';
import path from 'node:path';

// [todo] Figure out handling SIGINT on async ops, do we need child processes writing to files?
import RootEmitter from '../server.js';

import { Info } from '../lib/common/types/index.mjs';
import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';

const STATIC_BASE = "./src/files/";
const IS_PRODUCTION = false; // handle the webpackDevServer proxy issues
let MEMCACHE = {}; // Cache basic files in memory for now

function Files() {
  let id = 'Files';
  let info = new Info(id);

  // [todo] https://dev.to/bfunc/upload-files-easy-with-html5-and-nodejs-44fo
  async function uploadFiles(req={}, res={}, blob=Buffer) { };

  function getFullPath(req = {}, res = {}) {
    let filename, shortpath, fullpath;
    let { url = null } = req;

    filename = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
    if (!IS_PRODUCTION) {
      // Shift the / and the src from the webpackDevServer's proxy URL
      filename = filename.split('/');
      filename.shift(1); // Get rid of the /
      if (filename[0] === 'src') filename.shift(1);
      filename = filename.join('/');      
    } else {     
      throw new Error('Files.getFullPath() -> IS_PRODUCTION');
    }
    // Maintain the original frontend's src request
    shortpath = filename; 
    const resolvedBase = path.resolve(STATIC_BASE);
    filename = path.join(resolvedBase, filename);
    return { filename, shortpath };
  }

  // [todo] Bulk saving
  async function saveFiles(req={}, res={}){ }

  async function saveFile(req={ }, res={ }) {
    return new Promise((resolve, err) => {
    let { url = null, data = null } = req;
      if (!url || !data) {
        log('files', 'saveFile', 'error', `${what(req)} ${what(res)}`);
        err('No URL or Data provided');
        return err; // lol
      }

      let { filename, shortpath } = getFullPath(req, res);
      fs.stat(filename, async function (err, stat) {
        if (err === null) {
          // [todo] Appending to a file and/or handling collisions 
          log('files', 'saveFile', 'File exists - NO OP', filename, url, data);
        } else if (err.code === 'ENOENT') {
          log('files', 'saveFile', 'Creating new file');
          const wstream = fs.createWriteStream(filename);
          wstream.on('ready', () => {
            let string = JSON.stringify(data); // he he he
            wstream.write(string);
            wstream.chown(SERVER_UID, GROUP_GID);
            wstream.close(() => {
              log('files', 'saveFile', `[${string.length} bytes] to ${shortpath}`);
              resolve(string.length);
            });
          });          
        } else {
          log('files', 'saveFile', 'File has unknown error: ', filename, err);
          err(err);
        }
      });
    });
  };

  // https://nodejs.org/api/fs.html#class-fsdirent 
  async function getDirectory(req={ }, res={ }) {
    let { depth = 0 } = req;
    let { filename, shortpath } = getFullPath(req, res);
    let cwd = await readdir(filename, { withFileTypes: true, recursive: false });

    let allFiles = [];
    for (let f of cwd) {
      if (f.isFile()) {
        allFiles.push(`/src/${shortpath}/${f.name}`);
      } else if (f.isDirectory() && depth > 0) {
        // [todo] Verify this works with super deep dirs
        let dir = await getDirectory({ filename: `/src/${shortpath}/${f.name}`, depth: depth-1 }, {});
        allFiles.push(...dir);
      }
    };
    return allFiles;
  };

  // [info] Simple function indented for server-side usage - req/res are not actual emitters >_>
  async function loadFile(req={}, res={}, opts={}) {
    return new Promise((resolve, err) => {
      let { url=null } = req;
      let { encoding = 'utf8', type = 'csv' } = opts;
      let { filename, shortpath } = getFullPath({ url });
      let { root, dir, base, ext, name } = path.parse(shortpath);
      let fileExtension = ext.split('.')[1]; // heh.

      if (MEMCACHE[filename]) {
        resolve(MEMCACHE[filename]);
      } else {
        if (!fs.existsSync(filename)) {
          log('files', 'loadFile', 'error', `${shortpath} does not exist`);
          return;
        }

        MEMCACHE[filename] = [];
        const stream = fs.createReadStream(decodeURI(filename));
        stream.on('open', () => {
          // log(id, method, 'Read stream opened')
        });
        stream.on('data', (chunk) => {
          MEMCACHE[filename].push(chunk);
        });
        stream.on('end', () => {
          if (typeof MEMCACHE[filename] !== 'object') return;
          if (encoding === 'utf8') {
            if (type === 'csv') {
              MEMCACHE[filename] = ((Buffer.concat(MEMCACHE[filename])).toString()).split('\n'); // :^)
            } else {
              MEMCACHE[filename] = ((Buffer.concat(MEMCACHE[filename])).toString());
            }
          }
          log(id, 'loadFile()', `${MEMCACHE[filename].length} loaded to memory`);
          resolve(MEMCACHE[filename]);
        });
        stream.addListener('error', function(err) {
          log(id, 'loadFile()', 'error', what(err));
        });
      }
    });
  }

  function getFile(req={}, res={}) {
    let { url=null } = req;
    let method = `getFile()`;
    let localpath;

    let { filename, shortpath } = getFullPath(req, req);
    let { root, dir, base, ext, name } = path.parse(shortpath);
    let fileExtension = ext.split('.')[1]; // heh

    // I think this largely works - just gets cleared on a hard refresh
    let lastModified = new Date();
    lastModified.setFullYear(lastModified.getFullYear() - 1);

    if (MEMCACHE[filename]) {      
      log(id, method, 'cached', 'Writing to res from in-memory cache', typeof MEMCACHE[filename]);
      res.writeHead(200, {
        'Content-Type': `image/${fileExtension}`,
        'Last-Modified': lastModified.toUTCString(),
        'Content-Length': MEMCACHE[filename].length,
      });
      res.write(MEMCACHE[filename]);
      return res.end();
    } else if (typeof MEMCACHE[filename] !== 'buffer') {
      if (!fs.existsSync(filename)) {
        res.writeHead(404, { 'Content-Type': 'text' });
        res.write('404: File never existed: '+filename);
        res.end();
        return;
      }
      const stream = fs.createReadStream(decodeURI(filename));
      MEMCACHE[filename] = [];
      stream.on('open', () => {
        log(id, method, 'Read stream opened')
      });
      stream.on('data', (chunk) => {
        log(id, method, `${chunk.length} read`);
        MEMCACHE[filename].push(chunk);
      });
      stream.on('end', () => {
        if (typeof MEMCACHE[filename] !== 'object') {
          // [todo] There's some weird edge case where two requests could fire (likely a hot reload) and we'll be writing in the file. Figure out deferring.
          return;
        }
        MEMCACHE[filename] = Buffer.concat(MEMCACHE[filename]);
        log(id, method, `${MEMCACHE[filename].length} loadin`);
      });
      stream.on('error', function(err) {
        log(id, method, 'error', what(err));
        res.write('406: getFile - stream.onerror');
        res.end();
      });
      res.writeHead(200, {
        'Content-Type': `image/${fileExtension}`,
        'Last-Modified': lastModified.toUTCString(),
      });
      stream.pipe(res);
    }
  }

  return {
    getFile,
    getDirectory,

    loadFile,

    saveFile,
    saveFiles,
  };
}
export default Files;
