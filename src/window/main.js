import define from 'js-proxy';
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
  IS_EXTENSIBLE,
  OWN_KEYS,
  PREVENT_EXTENSION,
  SET,
  SET_PROTOTYPE_OF,

  DESTRUCT,
  VALUE_OF,
} from 'js-proxy/traps';


import {
  ARRAY,
  FUNCTION,
  NUMBER,
  OBJECT,
  STRING,
  SYMBOL,
} from 'js-proxy/types';

import { MAIN, WORKER } from './constants.js';

const {
  [APPLY]: apply,
  [CONSTRUCT]: construct,
  [DEFINE_PROPERTY]: defineProperty,
  [DELETE_PROPERTY]: deleteProperty,
} = Reflect;

const { addEventListener } = EventTarget.prototype;
const eventsHandler = new WeakMap;
const handleEvent = event => {
  const {currentTarget, target, type} = event;
  const methods = eventsHandler.get(currentTarget || target)?.get(type);
  if (methods) for (const method of methods) event[method]();
};

defineProperty(EventTarget.prototype, 'addEventListener', {
  value(type, listener, ...options) {
    const invoke = options.at(0)?.invoke;
    if (invoke) {
      let map = eventsHandler.get(this);
      if (!map) eventsHandler.set(this, (map = new Map));
      map.set(type, [].concat(invoke));
      delete options[0].invoke;
    }
    return addEventListener.call(this, type, listener, ...options);
  }
});

export default options => {
  const exports = coincident(options);
  const { Worker: $Worker } = exports;
  const $ = options?.transform || (o => o);

  const fromEntry = identity => identity;
  const toEntry = identity => identity;
  const asEntry = (method, ref, args) => toEntry(method(get(ref), ...args.map(fromEntry)));

  class Worker extends $Worker {
    constructor(url, options) {
      const { proxy } = super(url, options);
      const { [WORKER]: __worker__ } = proxy;
      proxy[MAIN] = (TRAP, ref, ...args) => {
        /*
          APPLY,
          CONSTRUCT,
          DEFINE_PROPERTY,
          DELETE_PROPERTY,
          GET,
          GET_OWN_PROPERTY_DESCRIPTOR,
          GET_PROTOTYPE_OF,
          HAS,
          IS_EXTENSIBLE,
          OWN_KEYS,
          PREVENT_EXTENSION,
          SET,
          SET_PROTOTYPE_OF,

          DESTRUCT,
          VALUE_OF,
        */
        switch (TRAP) {
          case APPLY: return asEntry(apply, ref, args);
          case CONSTRUCT: return asEntry(construct, ref, args);
          case DEFINE_PROPERTY: {
            const [name, descriptor] = fromEntry(args);
            const {get, set, value} = descriptor;
            if (get) descriptor.get = fromEntry(get);
            if (set) descriptor.set = fromEntry(set);
            if (value) descriptor.value = fromEntry(value);
            return toEntry(defineProperty(get(ref), name, descriptor));
          }
          case DELETE_PROPERTY: return asEntry(deleteProperty, ref, args);
        }
      };
    }
  }

  return {
    ...exports,
    Worker,
  };
};
