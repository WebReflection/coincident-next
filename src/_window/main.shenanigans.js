import { drop, get, hold } from 'js-proxy/heap';
import { TypedArray } from 'sabayon/shared';

import coincident from '../main.js';
import numeric from './types.js';
import { fromSymbol, toSymbol } from './symbol.js';

import {
  APPLY,
  CONSTRUCT,
  DEFINE_PROPERTY,
  DELETE_PROPERTY,
  GET,
  GET_OWN_PROPERTY_DESCRIPTOR,
  GET_PROTOTYPE_OF,
  HAS,
  OWN_KEYS,
  PREVENT_EXTENSION,
  SET,

  DESTRUCT,
} from 'js-proxy/traps';

import {
  ARRAY,
  FUNCTION,
  NULL,
  NUMBER,
  OBJECT,
  STRING,
  SYMBOL,
  UNDEFINED,
} from 'js-proxy/types';

import { MAIN, WORKER } from './constants.js';

import { create } from 'gc-hook';

import handleEvent from './events.js';

const { isArray } = Array;

export default (options) => {
  const exports = coincident(options);
  const { Worker: $Worker } = exports;

  const toEntry = value => {
    const TYPE = typeof value;
    switch (TYPE) {
      case OBJECT: {
        if (value === null) return [numeric[NULL], value];
        if (value === globalThis) return [numeric[OBJECT], null];
        if (isArray(value)) return [numeric[ARRAY], hold(value)];
        return [numeric[OBJECT], value instanceof TypedArray ? value : hold(value)];
      }
      case FUNCTION: return [numeric[FUNCTION], hold(value)];
      case SYMBOL: return [numeric[SYMBOL], toSymbol(value)];
      default: return [numeric[TYPE], value];
    }
  };

  class Worker extends $Worker {
    constructor(url, options) {
      const { proxy } = super(url, options);
      const { [WORKER]: __worker__ } = proxy;

      const proxies = new Map();
      const onGC = ref => {
        proxies.delete(ref);
        __worker__(DESTRUCT, ref);
      }

      const fromEntry = ([numericTYPE, value]) => {
        switch (numericTYPE) {
          case numeric[OBJECT]: {
            if (value === null) return globalThis;
            if (typeof value === NUMBER) return get(value);
            if (!(value instanceof TypedArray)) {
              for (const key in value)
                value[key] = fromEntry(value[key]);
            }
            return value;
          };
          case numeric[ARRAY]: {
            if (typeof value === NUMBER) return get(value);
            return value.map(fromEntry);
          };
          case numeric[FUNCTION]: {
            switch (typeof value) {
              case NUMBER: return get(value);
              case STRING: {
                let fn = proxies.get(value)?.deref();
                if (!fn) {
                  fn = create(value, onGC, {
                    token: false,
                    return: function (...args) {
                      if (args.at(0) instanceof Event) handleEvent(...args);
                      return __worker__(
                        APPLY,
                        value,
                        toEntry(this),
                        args.map(toEntry),
                      );
                    }
                  });
                  proxies.set(value, new WeakRef(fn));
                }
                return fn;
              }
            }
          };
          case numeric[SYMBOL]: return fromSymbol(value);
          default: return value;
        }
      };

      proxy[MAIN] = (TRAP, ref, ...args) => {
        if (TRAP === DESTRUCT) drop(ref);
        else {
          const target = ref == null ? globalThis : get(ref);
          args = args.map(fromEntry);
          switch (TRAP) {
            case APPLY: return toEntry(target.apply(args.shift(), args));
            case CONSTRUCT: return toEntry(new target(...args));
            case DEFINE_PROPERTY: {
              const [name, descriptor] = args;
              return toEntry(Reflect[TRAP](target, name, descriptor));
            }
            case DELETE_PROPERTY: {
              const [name] = args;
              return toEntry(Reflect[TRAP](target, name));
            }
            case GET: {
              const [name] = args;
              return toEntry(target[name]);
            }
            case GET_OWN_PROPERTY_DESCRIPTOR: {
              const descriptor = Reflect[TRAP](target, ...args);
              const { get, set, value } = descriptor;
              if (get) descriptor.get = toEntry(get);
              if (set) descriptor.set = toEntry(set);
              if (value) descriptor.value = toEntry(value);
              return [numeric[value ? OBJECT : UNDEFINED], value ?? descriptor];
            }
            case GET_PROTOTYPE_OF: {
              const [name] = args;
              return toEntry(Reflect[TRAP](target, name));
            }
            case HAS: {
              const [name] = args;
              return toEntry(name in target);
            }
            case IS_EXTENSIBLE: {
              return toEntry(Reflect[TRAP](target));
            }
            case OWN_KEYS: return [numeric[ARRAY], Reflect[TRAP](target).map(toEntry)];
            case PREVENT_EXTENSION: return toEntry(Reflect[TRAP](target));
            case SET: {
              const [name, value] = args;
              return toEntry(Reflect[TRAP](target, name, value));
            }
            case SET_PROTOTYPE_OF: {
              const [proto] = args;
              return toEntry(Reflect[TRAP](target, proto));
            }
          }
        }
      };
    }
  }

  return {
    ...exports,
    Worker,
  };
};
