import util from 'node:util';
import DEFAULT_WHAT_OPTIONS from './what-options.mjs';

function what(object, options = {}) {
  let str = util.inspect(object, {
    ...DEFAULT_WHAT_OPTIONS,
    ...options,
  }).replaceAll('{ {', '{{').replaceAll('} }', '}}');
  return str;
}
export default what;
