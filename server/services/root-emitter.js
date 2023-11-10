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

  console.log('RootEmitter.init');

  let sigintString = fg([255, 50, 50], 'sigint');
  _emitter.on('shutdown', function shutdownCallbackListener(shutdownCallback) {
    log('shutdown', `${sigintString} -> [listeners()] -> ${bold('shutdownCallback()')}`);
    shutdownCallback();
  });
  _emitter.on('uncaughtException', function(err) {
    log('uncaughtException', `${what(err)}`);
  });
  // _emitter.on('osrs/salmon/log', function(proto, netSocket) {
  //   log('osrs/salmon/log', `${what(proto)} ... [netsocket] ... Should this be registered in http-server/`);
  // });

  process.once('SIGINT', function processInterrupt() {
    process.stdout.write('\n');
    log('node:process', `once(${sigintString})`);

    let eventName = 'shutdown';
    let eventNames = _emitter.eventNames();
    let l = eventNames.reduce((acc, e, idx) => {
      let s = `RootEmitter.emit(${e})\n`;
      let listeners = _emitter.listeners(e);
      let listenerString = listeners.reduce((allListeners, listenerMethod, idx2) => {
        return `${allListeners}- ${what(listenerMethod)}\n`;
      }, '');
      s += listenerString;
      return `${acc}${s}\n`
    }, '');
    log('node:process', `${l}`);

    _emitter.emit('shutdown', function handleRootShutdown(shutdownCallback) {
      log('node:process', 'shutdown', sigintString);
      process.kill(process.pid, 'SIGINT'); 
    });
  });

  return _emitter;
};

const rootEmitter = new RootEmitter();
export default rootEmitter;
