import define from 'js-proxy';
import { drop, get, hold } from 'js-proxy/heap';
import { TypedArray } from 'sabayon/shared';

import coincident from '../worker.js';
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

const {
  [APPLY]: apply,
} = Reflect;

export default async (options) => {
  const exports = await coincident(options);
  const $ = options?.transform || (o => o);
  const { __main__ } = exports.proxy;

  const proxies = new Map;
  const proxied = (value, proxy) => {
    let ref = proxies.get(value)?.deref();
    if (!ref) proxies.set(value, new WeakRef((ref = proxy(value))));
    return ref;
  };

  const fromEntry = ([numericTYPE, value]) => {
    switch (numericTYPE) {
      case numeric[OBJECT]: return (
        value == null ?
          globalThis : (
          typeof value === NUMBER ?
            proxied(value, proxy.object) :
            value
        )
      );
      case numeric[ARRAY]: return (
        typeof value === NUMBER ?
          proxied(value, proxy.array) :
          value.map(fromEntry)
      );
      case numeric[FUNCTION]: return (
        typeof value === STRING ?
          get(parseInt(value)) :
          proxied(value, proxy.function)
      );
      case numeric[SYMBOL]: return fromSymbol(value);
      default: return value;
    }
  };

  const toEntry = value => {
    const TYPE = typeOf(value);
    switch (TYPE) {
      case OBJECT: {
        let ref = value;
        if (value === globalThis || value == null)
          ref = null;
        else if (!(value instanceof TypedArray)) {
          ref = valueOf($(value));
          if (typeof ref === OBJECT) {
            // TBD: would Object.fromEntries be better or overkill?
            for(const key in ref) ref[key] = toEntry(ref[key]);
          }
        }
        return [numeric[OBJECT], ref];
      }
      case ARRAY: {
        let ref = valueOf($(value));
        return [numeric[ARRAY], typeof ref === NUMBER ? ref : ref.map(toEntry)];
      }
      case FUNCTION: {
        let ref = valueOf($(value));
        // own local functions as String(id)
        if (typeof ref === FUNCTION) ref = String(hold(ref));
        return [numeric[FUNCTION], ref];
      }
      case SYMBOL: return [numeric[SYMBOL], toSymbol(value)];
      default: return [numeric[TYPE], value];
    }
  };

  const asEntry = (...args) => fromEntry(__main__(...args));

  const handler = {
    [DEFINE_PROPERTY]: (ref, name, descriptor) => {
      const { get, set, value } = descriptor;
      if (get) descriptor.get = toEntry(get);
      if (set) descriptor.set = toEntry(set);
      if (value) descriptor.value = toEntry(value);
      return asEntry(DEFINE_PROPERTY, ref, toEntry(name), descriptor);
    },
    [DELETE_PROPERTY]: (ref, name) => asEntry(DELETE_PROPERTY, ref, toEntry(name)),
    [GET_PROTOTYPE_OF]: ref => asEntry(GET_PROTOTYPE_OF, ref),
    [GET]: (ref, name) => asEntry(GET, ref, toEntry(name)),
    [GET_OWN_PROPERTY_DESCRIPTOR]: (ref, name) => {
      const descriptor = asEntry(GET_OWN_PROPERTY_DESCRIPTOR, ref, toEntry(name));
      if (descriptor) {
        const {get, set, value} = descriptor;
        if (get) descriptor.get = fromEntry(get);
        if (set) descriptor.set = fromEntry(set);
        if (value) descriptor.value = fromEntry(value);
      }
      return descriptor;
    },
    [HAS]: (ref, name) => asEntry(HAS, ref, toEntry(name)),
    [IS_EXTENSIBLE]: ref => asEntry(IS_EXTENSIBLE, ref),
    [OWN_KEYS]: ref => asEntry(OWN_KEYS, ref),
    [PREVENT_EXTENSION]: ref => asEntry(PREVENT_EXTENSION, ref),
    [SET]: (ref, name, value) => asEntry(SET, ref, toEntry(name), toEntry(value)),
    [SET_PROTOTYPE_OF]: (ref, proto) => asEntry(SET_PROTOTYPE_OF, ref, toEntry(proto)),

    [VALUE_OF]: ref => ref,
    [DESTRUCT](ref) {
      proxies.delete(ref);
      __main__(DESTRUCT, ref);
    },
  };

  const { proxy, typeOf, valueOf } = define({
    object: handler,
    array: handler,
    function: {
      ...handler,
      [APPLY]: (ref, ...args) => asEntry(APPLY, ref, ...args.map(toEntry)),
      [CONSTRUCT]: (ref, ...args) => asEntry(CONSTRUCT, ref, ...args.map(toEntry)),
    },
  });

  const window = proxy.object(null);

  // this is basically used only to invoke callbacks attached
  // as listeners or as references' fields.
  exports.proxy.__worker__ = (TRAP, ref, ...args) => {
    const id = parseInt(ref);
    switch (TRAP) {
      case APPLY: {
        // TBD: should this be a `toEntry(...)` too?
        return apply(get(id), ...args.map(fromEntry));
      }
      case DESTRUCT: {
        drop(id);
        break;
      }
    }
  };

  return {
    ...exports,
    window,
    isWindowProxy: value => valueOf(value) !== value,
  };
};
