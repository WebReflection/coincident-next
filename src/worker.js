// (c) Andrea Giammarchi - MIT

import {
  Atomics,
  Int32Array,
  SharedArrayBuffer,
  addEventListener,
  postMessage,
  ignore,
  polyfill,
} from 'sabayon/worker';

import {
  ACTION_INIT,
  ACTION_WAIT,
  ACTION_NOTIFY,

  actionLength,
  actionFill,
  actionWait,

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
  const map = new Map;

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
            polyfill,
            transfer,
            proxy: createProxy(
              [
                CHANNEL,
                Int32Array,
                SharedArrayBuffer,
                ignore,
                !!wait,
                parse,
                polyfill,
                postMessage,
                transform,
                wait ?
                  (...args) => ({ value: { then: fn => fn(waitSync(...args)) } }) :
                  waitAsync,
              ],
              map,
            ),
          });
          break;
        }
        case ACTION_WAIT: {
          // give the code a chance to finish running (serviceWorker mode)
          if (!map.size) setTimeout(actionWait, 0, waitLength, map, rest);
          else actionWait(waitLength, map, rest);
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
