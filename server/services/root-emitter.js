import process from 'node:process';
import { EventEmitter } from 'node:events';
import { log as _log, what, fg, bold } from '../../common/utils/index.mjs';

let DEBUG = process.env.DEBUG;

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

  // When we send a sigint to the main process, our rootEmitter will hear
  // that event and ensure that all listeners for `shutdown` are called
  // before the base node process is actually killed.
  // [IMPORTANT] You must always prepend your functions to the rootEmitter!
  let sigintString = fg([255, 50, 50], 'sigint');
  _emitter.on('shutdown', function shutdownCallbackListener(shutdownCallback) {
    log('shutdown', `${sigintString} -> [listeners()] -> ${bold('shutdownCallback()')}`);
    shutdownCallback();
  });

  // Node process heard sigint, now we 
  process.once('SIGINT', function processInterrupt() {
    process.stdout.write('\n');
    log('node:process', `once(${sigintString})`);

    // This is just pretty-logging all of the event listeners
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

  _emitter.on('uncaughtException', function(err) {
    log('uncaughtException', `${what(err)}`);
  });

  return _emitter;
};

const rootEmitter = new RootEmitter();
export default rootEmitter;
