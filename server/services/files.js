// ================================================================================
// 
//  _   _     _       _                              _               _ 
// | |_| |__ (_)___  (_)___  __   _____ _ __ _   _  | |__   __ _  __| |
// | __| '_ \| / __| | / __| \ \ / / _ \ '__| | | | | '_ \ / _` |/ _` |
// | |_| | | | \__ \ | \__ \  \ V /  __/ |  | |_| | | |_) | (_| | (_| |
//  \__|_| |_|_|___/ |_|___/   \_/ \___|_|   \__, | |_.__/ \__,_|\__,_|
//                                           |___/                     
//                _      
//   ___ ___   __| | ___ 
//  / __/ _ \ / _` |/ _ \
// | (_| (_) | (_| |  __/
//  \___\___/ \__,_|\___|
// 
// 
// 
// 
//        _                           _                     _   
//  _ __ | | ___  __ _ ___  ___    __| | ___    _ __   ___ | |_ 
// | '_ \| |/ _ \/ _` / __|/ _ \  / _` |/ _ \  | '_ \ / _ \| __|
// | |_) | |  __/ (_| \__ \  __/ | (_| | (_) | | | | | (_) | |_ 
// | .__/|_|\___|\__,_|___/\___|  \__,_|\___/  |_| |_|\___/ \__|
// |_|                                                          
//  _             _      _                   
// | | ___   ___ | | __ | |__   ___ _ __ ___ 
// | |/ _ \ / _ \| |/ / | '_ \ / _ \ '__/ _ \
// | | (_) | (_) |   <  | | | |  __/ | |  __/
// |_|\___/ \___/|_|\_\ |_| |_|\___|_|  \___|
// 
// 
// 
// 
// 
// 
//  __   _            _         __ 
// | _| | |_ ___   __| | ___   |_ |
// | |  | __/ _ \ / _` |/ _ \   | |
// | |  | || (_) | (_| | (_) |  | |
// | |   \__\___/ \__,_|\___/   | |
// |__|                        |__|
// 
// 
// ================================================================================
import fs from 'node:fs';
import { readdir, opendir, open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// [todo] Figure out handling SIGINT on async ops, do we need child processes writing to files?
import { RootEmitter } from './index.js';
import { what, log as _log, numToBytes, fg, bold } from '../../common/utils/index.mjs';

const STATIC_BASE = "./files/";
// const STATIC_BASE = "./src/files/";

// handle the webpackDevServer proxy issues
const IS_PRODUCTION = false;

 // Cache basic files in memory for now
let MEMCACHE = {};
let MEMCACHE_SIZE = 0;
let LOADING = {};

let DO_LOG = true;
let DO_DEBUG = true;

// TODO - make this like, redirect to built JSX components somehow. Idk. Or just have them as plaintext.
//        Or go back to using proto lol...
export function BasePage(string) {
  let str = `
   <html>
   <body style="margin: 0; user-select: none; font-size: max(2vmax, 18px); -webkit-text-size-adjust:foobarnone;">
     <div style="display:flex;flex-direction:column;padding:24px;margin:12px;">
       ${Header()}
       ${string}
     </div>
   </body>
   </html>
`;
  return str.toString();
}

export function Header() {
  let str = `
    <div style="display:flex;flex-direction:column;padding:24px 10px 24px 10px;border-bottom:1px solid black;">
      <div style="display:flex;">
        <b style="font-size:48px;font-family:sans-serif;">
          joeys.app
        </b>
        <div style="display:flex;flex-direction:column;font-style: italic; margin-left: 12px;">
           <h4 style="margin:auto;">only a filehost rn but ~encrypted~ :^)</h4>
        </div>
      </div>
      <div style="display: flex;margin-top:24px;font-family:Monaco;monospace;">
        <div style="margin-left:12px;margin-right:12px;">
          <a href="/">home</a>
        </div>
        <div style="margin-left:12px;margin-right:12px;">
          <a href=".dir">files</a>
        </div>
      </div>
   </div>
`;
  return str.toString();
}

function getProcessUsage(options = {}, socks) {
  let msg = {};  
  let mem = process.memoryUsage();
  Object.keys(mem).forEach(k => msg[k] = numToBytes(mem[k]) );  
  let usage = process.resourceUsage();
  Object.keys(usage).forEach(k => {
    if (usage[k] !== 0) {
      msg[k] = usage[k];
    }
  });
  msg.maxRSS = numToBytes(msg.maxRSS);
  return msg;
}

export function LandingPage() {
    let usage = {
	uptime: `${process.uptime()} seconds`,
	...getProcessUsage(),
    };
    let procString = Object.keys(usage).reduce((acc, key, idx) => {
	return (`
          ${acc}
          <div style="display:flex;width:min(800px, 100vw);">
            <div style="font-weight:bold;">${key}</div>
            <div style="margin-right:0;margin-left:auto;">${usage[key]}</div>
          </div>
        `);
    }, '');
    
  let str = BasePage(`
    <div style="display:flex;flex-direction:column;font-family:Monaco;monospace;">
      <br/>
      <div style="font-weight:normal;display:flex;flex-direction:column;padding:12px">
         ${procString}
       </div>
    </div>
  `);
  return str.toString();
}

export function ErrorCodePage(code, string) {
  let str = BasePage(`
    <div style="display:flex;flex-direction:column;padding:32px;">
      <b style="font-size:48px;font-family:sans-serif;">
        ${code}
      </b>
     <div style="font-family: Monaco;monospace">
       ${string}
     </div>
    </div>
   </div>
`);
  return str.toString()
}

export function DirectoryPage(topDirs, allDirs, allFiles) {
  function margin(idx = 1) {
    // let depth = name.split('/').length;
    // if (idx === 0) return '';
    return `margin-left: ${(idx)*16}px;`;
  }

  function visibleName(filename, inDir = true) {
    let v = filename;
    let filetype = filename.substring(filename.lastIndexOf('.'));
    if (filetype === '.dir' && !inDir && false) {
      v = filename.substring(0, filename.lastIndexOf('.'));
      v = v.length > 1 ? v + '/' : 'Documents/';
    } else {
      v = filename.split('/').pop();
      v = v.replace('.dir', '/');
      if (v === '/') v = 'Documents/'
    }
    return v;
  }

  let topRows = topDirs.reduce((acc, filename, idx) => {
      let v = visibleName(filename, false);
    return (`
      ${acc}
      <a href="${idx !== topDirs.length-1 ? filename : ''}" style="color: rgba(41, 41, 41, 0.5); ${margin(idx)};">
        ${v}
      </a>
    `)
  }, '');    

  let dirRows = allDirs.reduce((acc, filename, idx) => {
    let v = visibleName(filename);
    return (`
      ${acc}
      <a href="${acc !== 1 ? filename : ''}" style="color: rgba(41, 41, 41, 0.7); ${margin(topDirs.length)}">
        ${v}
      </a>
    `)
  }, '');

  allFiles.sort((f1, f2) => f1.localeCompare(f2));
  allFiles.sort((f1, f2) => {
    let idx1 = f1.lastIndexOf('.');
    let idx2 = f2.lastIndexOf('.');
    return f1.substring(idx1+1).localeCompare(f2.substring(idx2+1));
  });
   
  let fileRows = allFiles.reduce((acc, filename, idx) => {
    let v = visibleName(filename);
    return (`
      ${acc}
      <a href="${acc !== 1 ? filename : ''}" style="${margin(topDirs.length)}">
        ${v}
      </a>
    `)
  }, '');

  let str = BasePage(`
     <div style="display:flex; flex-direction:column; width: 100vw; height: 100vh;">
       <div style="display:flex;flex-direction:column;font-family:Monaco;monospace; height:100%; overflow-y: scroll; padding: 12px;">
         <div style="font-weight:bold;">Directory tree</div>
            ${topRows}
            ${dirRows}
            ${fileRows}
         </div>
       </div>
     </div>
`);
  return str.toString();
}

// [ref] https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
// [ref] https://www.rfc-editor.org/rfc/rfc9110#field.content-type
export function getContentType(extension) {
  const types = {
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.mpeg': 'video/mpeg',

    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.mid': 'audio/midi',
    '.midi': 'audio/x-midi',

      '.gif': 'image/gif',
    '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.jpeg': 'image/jpeg',
    '.svg': 'svg+xml',
    '.ico': 'image',

    '.txt': 'text',
    '.css': 'text/css',

    '.json': 'application/json',
    '.pdf': 'application/pdf',

    '.dir': 'text/html',
    '.js': 'text/javascript',
    '.py': 'text/javascript',
    '.cljs': 'text/javascript',
  };
  let contentType = types[extension] || 'text/html';
  return contentType;
}

export function getFullPath(req = {}, res = {}) {
  let filename, shortpath, fullpath;
  let { url = null } = req;
  filename = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  if (!IS_PRODUCTION) {
    filename = filename.split('/'); filename.shift(1);
    if (filename[0] === 'src') filename.shift(1);
    filename = filename.join('/');      
  } else {     
    throw new Error('Files.getFullPath() -> IS_PRODUCTION');
  }
  shortpath = filename; 
  const resolvedBase = path.resolve(STATIC_BASE);
  filename = path.join(resolvedBase, filename);  
  return { filename, shortpath };
}

function Files() {
  let id = 'Files';
  let _id;
  function log(a='', b='', c='', d='', e='', f='') {
    _id = `Files[` + `${numToBytes(MEMCACHE_SIZE, { digits: 0 })}`.replaceAll(' ', '').padStart(5, ' ') + ']';
    _log(_id, a, b, c, d, e, f); 
  };
  log('init');
  RootEmitter.on('shutdown', function handleShutdown(callback) {
    log('shutdown', 'Finishing writing out to files');

    callback();
  });

  // https://nodejs.org/api/fs.html#class-fsdirent 
  async function getDirectory(req = { }, res = { }) {
    let { depth = 0, hidden = true, sort = true } = req;
    let { filename, shortpath } = getFullPath(req, res);
    log('getDirectory', filename, shortpath);
    let topDirectories = [];
    let allDirectories = [];
    let allFiles = [];
    
    // Arbitrarily allow .dirs to access directories
    let dirIdx = filename.lastIndexOf('.dir');
    if (dirIdx) filename = filename.substring(0, dirIdx);
    dirIdx = shortpath.lastIndexOf('.dir');
    if (dirIdx) shortpath = shortpath.substring(0, dirIdx);
    if (shortpath === '.dir') {
      topDirectories.push(`/${shortpath}`);
      shortpath = '';
    } else {
      let parentpath = shortpath.split('/'); parentpath.pop();
      topDirectories.push('/.dir');
      parentpath.reduce((acc, subdir, idx) => {
        let prevname = acc.indexOf('.dir') !== -1 ? acc.substring(0, acc.indexOf('.')) : acc;
        let dirname = `${prevname}/${subdir}.dir`;
        topDirectories.push(dirname);
        return dirname;
      }, '');
      topDirectories.push(`/${shortpath}.dir`);
    }
    try {
      let cwd = await readdir(filename, { withFileTypes: true, recursive: false });
      for (let f of cwd) {
        // if (!f.isDirectory() || f.isFile()) {
        // Allow symilnkxs
        if (!f.isDirectory()) {
          if ((f.name[0] !== '.') || (f.name[0] === '.' && hidden)) {
            // handle root pathing poorly
            let fname = shortpath ? `/${shortpath}/${f.name}` : `/${f.name}`;
            allFiles.push(fname);
          }
        } else if (f.isDirectory()) {
          // [todo] Verify this works with super deep dirs
          let fname = shortpath ? `/${shortpath}/${f.name}.dir` : `/${f.name}.dir`;
          allDirectories.push(fname);
          if (depth > 0) {
            let [top, dirs, files] = await getDirectory({ url: `/${shortpath}/${f.name}`, depth: depth-1 }, {});
            allDirectories.push(...dirs);
            allFiles.push(...files);
          }
        }
      };
    } catch (err) {
      
    }
    return [topDirectories, allDirectories, allFiles];
  };

  async function getFile(req = {}, res = {}) {    
    let { url = null } = req;
    let localpath;   
    let { filename, shortpath } = getFullPath(req, req);    
    filename = decodeURI(filename);
    let { root, dir, base, ext, name } = path.parse(shortpath);
    log('getFile()', `dir=${dir}, base=${base}, name=${name}, ext=${ext} `);

    let contentType = getContentType(ext || name);
    log('getContentType()', `${ext || name} -> ${contentType}`);

    if (ext === '' && name === '') {
      // res.writeHead(200);
      // res.write(LandingPage());
      // res.end();
      // return;
      name = 'files/index.html';
      ext = '.html';
      // todo - handling hostnames
      filename = 'files/index.html';
    }

    if (ext === '.dir' || name === '.dir') {
      let [top, dirs, files] = await getDirectory({ ...req, hidden: false, depth: 0, sort: 'type' });
      res.writeHead(200);
      res.write(DirectoryPage(top, dirs, files));
      res.end();
      return;  
    }
    let lastModified = new Date();
    lastModified.setFullYear(lastModified.getFullYear() - 1);
    if (MEMCACHE[filename] && MEMCACHE[filename].length && LOADING[filename] === false) {
      let s = `${shortpath} ->`; s = s.padEnd(Math.min(process.stdout.columns, 42), ' '); s = s.substring(0, 38)+'    ';
      s += `${fg([100, 100, 100], (numToBytes(MEMCACHE[filename].length).padEnd(10, ' ')))} ${fg([100, 100, 100], '/ '+numToBytes(MEMCACHE_SIZE, { digits: 1 }))}`;
      DO_LOG && log('getFile()', s);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Last-Modified': lastModified.toUTCString(),
        'Cache-Control' : 'public, max-age=36000',
        'Content-Length': MEMCACHE[filename].length,
      });
      try {
        res.write(MEMCACHE[filename]);
      } catch {
        
      }
      res.end();
      return;
    } else if (typeof MEMCACHE[filename] !== 'buffer' && !LOADING[filename]) {
      LOADING[filename] = true;
      if (!fs.existsSync(filename)) {
        DO_DEBUG && log('getFile()', `getFile/get ${filename} does not exist, return 404.`);
        MEMCACHE[filename] = null;
        LOADING[filename] = false;
        res.writeHead(404);
        res.write(ErrorCodePage(404, `File not found: ${shortpath}`));
        res.end();
        return;
      }
      const stream = fs.createReadStream(filename);
      MEMCACHE[filename] = [];
      stream.on('open', () => { 
        DO_LOG && log('getFile()', 'Read stream opened')
      });
      stream.on('data', (chunk) => {
        DO_LOG && log('getFile()', `${numToBytes(chunk.length)} load`); 
        if (MEMCACHE[filename].push) {
          MEMCACHE[filename].push(chunk);
          MEMCACHE_SIZE += chunk.length;
        }
      });
      stream.on('end', () => {
        if (typeof MEMCACHE[filename] !== 'object') {
          // [todo] There's some weird edge case where two requests could fire and we'll be writing in the file.
          return;
        } else if (!MEMCACHE[filename].byteLength) {
          try {
            MEMCACHE[filename] = Buffer.concat(MEMCACHE[filename]);
          } catch {

          }
        }
        let s = `${shortpath} ->`; s = s.padEnd(Math.min(process.stdout.columns, 42), ' '); s = s.substring(0, 38)+'    ';
        s += `${bold(numToBytes(MEMCACHE[filename].length).padEnd(10, ' '))} ${fg([100, 100, 100], '/ '+numToBytes(MEMCACHE_SIZE, { digits: 1 }))}`;
        DO_LOG && log('getFile()', s);
        LOADING[filename] = false;
      });
      stream.on('error', function(err) {
        log('getFile()', 'error', what(err));
        res.write(ErrorCodePage(406, 'getFile() - stream.on(error)'));
        res.end();
      });
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control' : 'public, max-age=36000',
        'Last-Modified': lastModified.toUTCString(),
      });
      stream.pipe(res);
    } else if (typeof MEMCACHE[filename] !== 'buffer' && LOADING[filename]) {
      log('getFile()', '[todo] File is currently being loaded in, res.end()');
      res.end();
    }
  }

  return {
    getFile,
  };
}
export default Files;

