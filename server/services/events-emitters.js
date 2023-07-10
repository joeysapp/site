import { EventEmitter, getEventListeners } from 'node:events';

import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';
import { fg, bg, bold, ul, underline, dim, blink, hidden, reset} from '../lib/common/utils/ansi.mjs';

// [todo] Have this interrupt handler in a child process
// https://stackoverflow.com/questions/50477552/how-can-i-always-terminate-a-nodejs-script-with-a-timeout-even-if-the-event-loop

// class JSEmitter extends EventEmitter { /* let info = new Info() */ }

// lol, I don't.. think? this works?

// https://nodejs.org/api/events.html#class-eventemitter
export default function JSEmitter() {
  let emitter = new EventEmitter();
  let id = 'JSEmitter';
  let sigintString = bold(fg([255, 50, 50], 'SIGINT'));

  // [todo] capture async errors for [listener][event] (only if async) to be passed to [listener]["error"]
  emitter.captureRejections = true;

  // This will fire after all other prependListener fires (e.g. files.onshutdown->writeout)
  emitter.on('shutdown', (shutdownCallback) => {
    log(id, 'shutdown', `${sigintString} -> [listeners()] -> ${bold('shutdownCallback()')}`);
    shutdownCallback();
  });

  process.once('SIGINT', function processInterrupt() {
    process.stdout.write('\n');

    log('node:process', 'once', sigintString);

    // Services using the SiteEmitter should .prependListener('shutdown', ...), 
    emitter.emit('shutdown', function shutdown(shutdownCallback) {
      log('node:process', 'on', sigintString);
      process.kill(process.pid, 'SIGINT'); 
    });
  });

  return emitter;
}


// When you attach a function to an event, 'this' will reference that given base emitter.
// UNLESS it is an anonymous function!
// When appropriate, listener functions can switch to an asynchronous mode of operation using the setImmediate() or process.nextTick() methods:
// Could use the emitter.once() to handle like, connections. [new socket -> Increment total connections, only once.]
// ADD AT LEAST ONE error EVENT LISTENER TO ROOT! 
// If an EventEmitter does not have at least one listener registered for the 'error' event, and an 'error' event is emitted, the error is thrown, a stack trace is printed, and the Node.js process exits.
// Capture rejections of promises
// 4Using async functions with event handlers is problematic, because it can lead to an unhandled rejection in case of a thrown exception:


// emitter.toString = function() {
//   log('SiteEmitter');
//   this.eventNames().forEach(eventName=> {
//     log('SiteEmitter', eventName);
//     getEventListeners(this, eventName).forEach(listener => {
//       log(what(listener));
//     });
//     log('\n');
//   });
// }
