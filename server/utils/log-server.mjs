import process from 'node:process';

import what from './what-server.mjs';
import { fg, bg, bold, ul, dim, blink, hidden, reset } from './ansi.mjs';
import { stringToRGB } from './ansi.mjs';

const TIME_START = process.hrtime.bigint();

let COL_LEFT_GUTTER = ' '.repeat(1);
let COL_SPACER = ' ';

let IDX_ALIGN_RIGHT = [0];
let IDX_COL_SIZE = [32, 20, 48];

let SHOW_TIME = false;
let SHOW_HTTP = false;
let SHOW_INIT = false;
let SHOW_SOCKETS = false;
let SHOW_FILES = false;
let SHOW_NETWORK_LAYERS = false;
export function show_time(value = !SHOW_TIME) { SHOW_TIME = value; }
export function show_http(value = !SHOW_HTTP) { SHOW_HTTP = value; }
export function show_init(value = !SHOW_INIT) { SHOW_INIT = value; }
export function show_sockets(value = !SHOW_SOCKETS) { SHOW_SOCKETS = value; }
export function show_files(value = !SHOW_FILES) { SHOW_FILES = value; }
export function show_network_layers(value = !SHOW_NETWORK_LAYERS) { SHOW_NETWORK_LAYERS = value; }
const NETWORK_LAYERS = {
  application: {
    width: 5, 
    color: function getColor(key) { 
      return ({
        'http': [100, 100, 100],
        'https': [100, 100, 255],
      }[key.toLowerCase()])
    }
  },
  transport: {
    width: 4, 
    color: function getColor(key) {
      return ({
        'udp': [150, 200, 125],
        'tcp': [100, 125, 200],
      }[key.toLowerCase()])
    },
  }, 
  internet: {
    width: 4, 
    color: function getColor(key) {
      return ({
        'ipv4': [100, 100, 100],

      }[key.toLowerCase()])
    },
  },
  link: {
    width: 4, 
    color: function getColor(key) {
      return ({
        'mac': [100, 100, 100],

      }[key.toLowerCase()])
    },
  },
  remoteAddress: {
    width: 16,
    color: stringToRGB,
  },
  remotePort: {
    width: 5,
    color: stringToRGB,
  },
  localAddress: {
    width: 16,
    color: stringToRGB,
  },
  localPort: {
    width: 5,

    color: stringToRGB,
  }
}

export default function log(caller_layers = {}, ...items) {
  let networkString = '';
  if (typeof caller_layers === 'object' && 'application' in caller_layers) {
    networkString = Object.keys(NETWORK_LAYERS).map(function(key, idx) {

      let { width, color } = NETWORK_LAYERS[key];
      let _color = color(caller_layers[key]);
      let _text = (caller_layers[key]).toString().toLowerCase().padStart(width, ' ');

      return `${fg(_color, _text)}`;
    });
    networkString = networkString.join(COL_SPACER);
  } else {
    networkString = '';
    items.unshift(caller_layers);
  }
  if (typeof items[0] === 'object') {
    // kappa
  } else {
    if (!SHOW_FILES && items[0] && items[0].toLowerCase().indexOf('files') !== -1) return;
    if (!SHOW_SOCKETS && items[0] && items[0].toLowerCase().indexOf('ns') !== -1) return;
    if (!SHOW_HTTP && items[0] && items[0].toLowerCase().indexOf('http') !== -1) return;
    if (!SHOW_INIT && items[1] && items[1].toLowerCase().indexOf('init') !== -1) return;
  }

  // Get our line's primary color, even if the ID is showing some info like filesize :^)
  let s = items[0];
  if (typeof s === 'string') {
    if (s.indexOf('[') !== -1) {
      s = s.substring(0, s.indexOf('['));
    } else if (s.indexOf('<') !== -1) {
      s = s.substring(0, s.indexOf('<'));
    }
  }
  let rootColor = stringToRGB(s);
  process.stdout.write(
    COL_LEFT_GUTTER +
    [
      SHOW_TIME ? (
        what(process.hrtime.bigint() - TIME_START)
      ) : '',
      networkString,
      ...items.map(function(string = '', idx) {
        let coloredString = getColor(string, idx, rootColor);
        let stringLength = (string || '').length;
        let coloredDiff = Math.abs(coloredString.length - stringLength);
        let padBy = IDX_COL_SIZE[idx] + coloredDiff;
        let paddedString;
        if (IDX_ALIGN_RIGHT.indexOf(idx) !== -1) {
          paddedString = `${coloredString}`.padStart(padBy, ' ');
        } else {
          paddedString = `${coloredString}`.padEnd(padBy, ' ');
        }
        if (idx === items.length-1 && !items[items.length-1]) return '\n';
        return paddedString + (idx === items.length-1 ? '\n' : '');
      }),
    ].join(COL_SPACER));
  return;
}

export function getColor(s='', idx, rootColor) {
  // Item being logged gets an identifying color
  if (idx === 0) return fg(rootColor, s);
  // Bold functions
  if (idx === 1 && typeof s === 'string' && s.indexOf('(') !== -1) return bold(fg(rootColor, s));
  // Events are all muted
  let muted = [125, 125, 125];
  if (idx === 1) return fg(muted, s);
  return fg(rootColor, s);
}
 
