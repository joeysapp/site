// Global event system for safe shutdowns/restarts
import { EventEmitter } from 'node:events';
// import { log, what, fg, bold } from '../utils/index.mjs';
const log = () => {}; const what = () => {}; const fg = () => {}; const bold = () => {};

function RootEmitter() {
  let _emitter = new EventEmitter();
  _emitter.captureRejections = true;
  log('init');

  let sigintString = fg([255, 50, 50], 'sigint');
  _emitter.on('shutdown', (shutdownCallback) => {
    _log('shutdown', `${sigintString} -> [listeners()] -> ${bold('shutdownCallback()')}`);
    shutdownCallback();
  });

  process.once('SIGINT', function processInterrupt() {
    process.stdout.write('\n');
    _log('node:process', 'once', sigintString);
    _emitter.emit('shutdown', function shutdown(shutdownCallback) {
      _log('node:process', 'shutdown', sigintString);
      process.kill(process.pid, 'SIGINT'); 
    });
  });

  function _log(a='', b='', c='', d='', e='', f='') {
    let _id = `RootEmitter[${null}]`;
    log(_id, a, b, c, d, e, f);
  };
  return _emitter;
};

const rootEmitter = new RootEmitter();
export default rootEmitter;
