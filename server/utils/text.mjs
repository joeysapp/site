export function numToBytes(n, options = {}) {
  const {
    longform = false,
    digits = 2,
    // [todo] 
    bytes = true,
  } = options;

  let byteCt = n;
  if (typeof num === 'string') try { byteCt = Number(n); } catch { return 'NIL'; }
  
  let sizes = [];
  if (longform) {
    sizes = bytes ? 
      ['bytes', 'kilobytes', 'megabytes', 'gigabytes', 'terabytes', 'petabytes']
      : ['bits', 'kilobits', 'megabits', 'gigabits', 'terabits', 'petabits'];
  } else {
    sizes = bytes
      ? ['b ', 'kb', 'mb', 'gb', 'tb', 'pb']
      : ['b ', 'kB', 'mB', 'gB', 'tB', 'pB'];
  }

  let idx = 0;
  while (byteCt >= 1000) {
    idx += 1;
    byteCt /= 1000.0;
  } 
  // 27.3 kB is actually (23.3 * 8 * 1000) bits...
  let rounded = byteCt;
  rounded = byteCt * Math.pow(10, digits);
  rounded = Math.floor(rounded);
  rounded = rounded / Math.pow(10, digits);
  rounded = `${rounded}`;
  return `${rounded} ${sizes[idx]}`
}
