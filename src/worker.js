// (c) Andrea Giammarchi - MIT

import {
  Atomics,
  Int32Array,
  SharedArrayBuffer,
  addEventListener,
  postMessage,
  ignore,
} from 'sabayon/worker';

import {
  ACTION_INIT,
  ACTION_WAIT,
  ACTION_NOTIFY,

  actionLength,
  actionFill,

  createExports,
  createProxy,

  isChannel,
  transfer,
  withResolvers,
} from './shared.js';

const { wait, waitAsync } = Atomics;

export default ({
  interrupt,
  parse,
  stringify,
  transform,
} = JSON) => {
  const waitLength = actionLength(stringify, transform);

  const ready = withResolvers();
  const callbacks = [];

  let CHANNEL = '';
  let waitSync = wait;
  if (wait && interrupt) {
    const { handler, timeout = 42 } = interrupt;
    waitSync = (sb, index, result) => {
      while ((result = wait(sb, index, 0, timeout)) === 'timed-out')
        handler();
      return result;
    };
  }

  addEventListener('message', event => {
    if (isChannel(event, CHANNEL)) {
      const [_, ACTION, ...rest] = event.data;
      switch (ACTION) {
        case ACTION_INIT: {
          CHANNEL = _;
          ready.resolve({
            transfer,
            proxy: createProxy(
              [
                CHANNEL,
                Int32Array,
                SharedArrayBuffer,
                postMessage,
                ignore,
                parse,
                transform,
                wait ?
                  (...args) => ({ value: { then: fn => fn(waitSync(...args)) } }) :
                  waitAsync,
              ],
              rest[0].exports,
            ),
            exports(exports) {
              postMessage(ignore([
                CHANNEL,
                ACTION_INIT,
                createExports(callbacks, exports),
              ]));
            }
          });
          break;
        }
        case ACTION_WAIT: {
          const [id, sb, index, args] = rest;
          waitLength(callbacks[index], id, sb, args);
          break;
        }
        case ACTION_NOTIFY: {
          actionFill(...rest);
          break;
        }
      }
    }
  });
  return ready.promise;
};
