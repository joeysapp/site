const _ANSI_BASE_COLOR_SEQUENCES = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    underline: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        gray: "\x1b[90m",
        crimson: "\x1b[38m"
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        gray: "\x1b[100m",
        crimson: "\x1b[48m"
    }
};
function _SETUP_ANSI_256(s) {
  for (let i = 0; i < 255; i++) {
    s.fg[i] = `\x1b[38;5;${i}m`
    s.bg[i] = `\x1b[48;5;${i}m`
  }
  return s;
}
const _ANSI_COLOR_SEQUENCES = _SETUP_ANSI_256(_ANSI_BASE_COLOR_SEQUENCES);

function _RGB_TO_ANSI_COLOR_SEQUENCE(r, g, b) {
  if (r === g && g === b) {
    if (r < 8) {
      return 16;
    }
    if (r > 248) {
      return 231;
    }
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const ANSI_256_IDX = 16
      + (36 * Math.round(r / 255 * 5))
      + (6 * Math.round(g / 255 * 5))
      + Math.round(b / 255 * 5);
  return ANSI_256_IDX;
}
export function fg(col, s, opts) { return _ansi(col, s, 0, opts); }
export function bg(col, s, opts) { return _ansi(col, s, 1, opts); }
export function _ansi(col=[150, 150, 150], s='', flag=0, opts={}) {
  let {
    rgb = true,
    hsv = false,
    hex = false,
    ansi = false,
    reset = true,
  } = opts;

  let a;
  if (ansi) {
    a = val;
  } else if (rgb) {
    a =  _RGB_TO_ANSI_COLOR_SEQUENCE(Math.min(255, col[0]), Math.min(255, col[1]), Math.min(255, col[2]));
  } else if (hsv) {
    // todo
  }
  if (typeof a !== 'number' || a === NaN) {
    a =  _RGB_TO_ANSI_COLOR_SEQUENCE(150, 150, 150);
  }
  return (flag == 0 ? _ANSI_COLOR_SEQUENCES.fg[a] : _ANSI_COLOR_SEQUENCES.bg[a]) + s +  (reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function bold(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.bold+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function ul(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.underline+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function underline(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.underline+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function dim(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.dim+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function blink(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.blink+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function reverse(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.reverse+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function hidden(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.hidden+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function reset(s='', opts={}) {
  let { reset = true } = opts;
  return _ANSI_COLOR_SEQUENCES.reset+s+(reset ? _ANSI_COLOR_SEQUENCES.reset : '');
}
export function ansi(i, j, s, k='') {
  return _ANSI_COLOR_SEQUENCES.fg[i] + _ANSI_COLOR_SEQUENCES.bg[j]+ _ANSI_COLOR_SEQUENCES[k] + s + _ANSI_COLOR_SEQUENCES.reset; 
}
export function stringToRGB(str = '') {
  // Combining a string to a single number of codePoints
  let num = `${str}`.split('').reduce((acc, char) => acc *= Number(char.codePointAt(0)), 1);
  let [r, g, b] = [
    20 + (3.1*num)%255,
    50 + (3.2*num)%255,
    60 + (4.1*num)%255,
  ];
  return [
    Math.max(98, Math.min(r, 255)),
    Math.max(98, Math.min(g, 255)),
    Math.max(98, Math.min(b, 255)),
  ];
}
