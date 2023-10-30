// Global event system for safe shutdowns/restarts
import { EventEmitter } from 'node:events';
import { log as _log, what, fg, bold } from '../../common/utils/index.mjs';
// const log = () => {}; const what = () => {}; const fg = () => {}; const bold = () => {};

function RootEmitter(props = {}) {
  let { id = 'RootEmitter' } = props;
  let _id = id;
  let _emitter = new EventEmitter();
  _emitter.captureRejections = true;

  function log(a='', b='', c='', d='', e='', f='') {
    _id = 'RootEmitter';
    _log(_id, a, b, c, d, e, f);     
  };

  log('init', 'what even');

  let sigintString = fg([255, 50, 50], 'sigint');
  _emitter.on('shutdown', (shutdownCallback) => {
    log('shutdown', `${sigintString} -> [listeners()] -> ${bold('shutdownCallback()')}`);
    shutdownCallback();
  });

  process.once('SIGINT', function processInterrupt() {
    process.stdout.write('\n');
    log('node:process', 'once', sigintString);
    _emitter.emit('shutdown', function shutdown(shutdownCallback) {
      log('node:process', 'shutdown', sigintString);
      process.kill(process.pid, 'SIGINT'); 
    });
  });

  return _emitter;
};

const rootEmitter = new RootEmitter();
export default rootEmitter;
