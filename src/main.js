// (c) Andrea Giammarchi - MIT

import {
  Atomics,
  Int32Array,
  SharedArrayBuffer,
  Worker as $Worker,
  ignore,
} from 'sabayon/main';

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

export default ({
  parse,
  stringify,
  transform,
} = JSON) => {
  const waitLength = actionLength(stringify, transform);

  const CHANNEL = crypto.randomUUID();

  class Worker extends $Worker {
    constructor(url, options) {
      const ready = withResolvers();
      const callbacks = [];
      options = {
        ...options,
        exports: createExports(callbacks, options?.exports || {}),
      };
      super(url, options);
      this.proxy = new Proxy(ready.promise, {
        get(promise, key) {
          return async (...args) => {
            const proxy = await promise;
            return proxy[key](...args);
          };
        }
      });
      this.postMessage(ignore([CHANNEL, ACTION_INIT, options]));
      this.addEventListener('message', event => {
        if (isChannel(event, CHANNEL)) {
          const [_, ACTION, ...rest] = event.data;
          switch (ACTION) {
            case ACTION_INIT: {
              ready.resolve(createProxy(
                [
                  CHANNEL,
                  Int32Array,
                  SharedArrayBuffer,
                  this.postMessage.bind(this),
                  ignore,
                  parse,
                  transform,
                  Atomics.waitAsync,
                ],
                ...rest
              ));
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
    }
  }

  return {
    Worker,
    transfer,
  };
};
