const ARRAY     = 'array';
const BIGINT    = 'bigint';
const BOOLEAN   = 'boolean';
const FUNCTION  = 'function';
const NULL      = 'null';
const NUMBER    = 'number';
const OBJECT    = 'object';
const STRING    = 'string';
const SYMBOL    = 'symbol';
const UNDEFINED = 'undefined';

const APPLY                        = 'apply';
const CONSTRUCT                    = 'construct';
const DEFINE_PROPERTY              = 'defineProperty';
const DELETE_PROPERTY              = 'deleteProperty';
const GET                          = 'get';
const GET_OWN_PROPERTY_DESCRIPTOR  = 'getOwnPropertyDescriptor';
const GET_PROTOTYPE_OF             = 'getPrototypeOf';
const HAS                          = 'has';
const IS_EXTENSIBLE                = 'isExtensible';
const OWN_KEYS                     = 'ownKeys';
const PREVENT_EXTENSION            = 'preventExtensions';
const SET                          = 'set';
const SET_PROTOTYPE_OF             = 'setPrototypeOf';

var handlerTraps = /*#__PURE__*/Object.freeze({
  __proto__: null,
  APPLY: APPLY,
  CONSTRUCT: CONSTRUCT,
  DEFINE_PROPERTY: DEFINE_PROPERTY,
  DELETE_PROPERTY: DELETE_PROPERTY,
  GET: GET,
  GET_OWN_PROPERTY_DESCRIPTOR: GET_OWN_PROPERTY_DESCRIPTOR,
  GET_PROTOTYPE_OF: GET_PROTOTYPE_OF,
  HAS: HAS,
  IS_EXTENSIBLE: IS_EXTENSIBLE,
  OWN_KEYS: OWN_KEYS,
  PREVENT_EXTENSION: PREVENT_EXTENSION,
  SET: SET,
  SET_PROTOTYPE_OF: SET_PROTOTYPE_OF
});

/**
 * @template V
 * @param {V} value
 * @returns {Ctx<V>}
 */
const bound = value => Context.bind(value);

// This is needed to unlock *both* apply and construct
// traps otherwise one of these might fail.
// The 'use strict' directive is needed to allow
// also primitive types to be bound.
function Context() {
  return this;
}

// TODO: is this really needed in here?
// const { hasOwn } = Object;
// const isConstructable = value => hasOwn(value, 'prototype');
// const isFunction = value => typeof value === FUNCTION;

// (c) Andrea Giammarchi - ISC

const registry = new FinalizationRegistry(
  ([onGarbageCollected, held, debug]) => {
    if (debug) console.debug(`Held value ${String(held)} not relevant anymore`);
    onGarbageCollected(held);
  }
);

const nullHandler = Object.create(null);

/**
 * @template {unknown} H
 * @typedef {Object} GCHookOptions
 * @prop {boolean} [debug=false] if `true`, logs values once these can get collected.
 * @prop {ProxyHandler<object>} [handler] optional proxy handler to use instead of the default one.
 * @prop {H} [return=H] if specified, overrides the returned proxy with its value.
 * @prop {unknown} [token=H] it's the held value by default, but it can be any other token except the returned value itself.
 */

/**
 * @template {unknown} H
 * @param {H} hold the reference to hold behind the scene and passed along the callback once it triggers.
 * @param {(held:H) => void} onGarbageCollected the callback that will receive the held value once its wrapper or indirect reference is no longer needed.
 * @param {GCHookOptions<H>} [options] an optional configuration object to change some default behavior.
 */
const create$1 = (
  hold,
  onGarbageCollected,
  { debug, handler, return: r, token = hold } = nullHandler
) => {
  // if no reference to return is defined,
  // create a proxy for the held one and register that instead.
  /** @type {H} */
  const target = r || new Proxy(hold, handler || nullHandler);
  const args = [target, [onGarbageCollected, hold, !!debug]];
  if (token !== false) args.push(token);
  // register the target reference in a way that
  // the `onGarbageCollected(held)` callback will eventually notify.
  registry.register(...args);
  return target;
};

/**
 * If previously registered as either `token` or `hold` value, allow explicit removal of the entry in the registry.
 * @param {unknown} token the token used during registration. If no `token` was passed, this can be the same `hold` reference.
 * @returns {boolean} `true` if successfully unregistered.
 */
const drop$1 = token => registry.unregister(token);

const { Object: Object$1, Proxy: Proxy$1, Reflect: Reflect$1 } = globalThis;

const { isArray: isArray$1 } = Array;
const { ownKeys: ownKeys$1 } = Reflect$1;
const { create: extend$1, hasOwn, values: values$2 } = Object$1;

const wrapOf = (ref, type) => (
  type === ARRAY ? ref[0] : (
    type === FUNCTION ? ref() : (
      type === OBJECT ? ref.$ : ref
    )
  )
);

const extendHandler = (handler, type, direct, value) => {
  const descriptors = { type: { value: type } };
  const hasValueOf = hasOwn(handler, 'valueOf');
  for(const trap of values$2(handlerTraps)) {
    let descriptor = value(handler[trap] || Reflect$1[trap]);
    if (hasValueOf && trap === GET) {
      const { valueOf } = handler;
      const { value } = descriptor;
      descriptor = {
        value($, s, ..._) {
          return s === direct ?
            valueOf.call(this, wrapOf($, type)) :
            value.call(this, $, s, ..._);
        }
      };
    }
    descriptors[trap] = descriptor;
  }
  return extend$1(handler, descriptors);
};

const JSProxy = ($, target, handler, token = $) => {
  if (token === $) {
    switch (typeof $) {
      case OBJECT:
      case UNDEFINED: if (!token) token = false;
      case FUNCTION: break;
      default: {
        token = false;
        if (target === $) target = Object$1($);
      }
    }
  }
  const p = new Proxy$1(target, handler);
  const { destruct } = handler;
  return destruct ? create$1($, destruct, { token, return: p }) : p;
};

const typeOfFor = typesOf => value => {
  const type = typeof value;
  return type === OBJECT ?
    (value ?
      (typesOf.get(value) || (isArray$1(value) ? ARRAY : OBJECT)) :
      NULL
    ) :
    type;
};

const release = token => (drop$1(token), token);

var define = namespace => {
  const typesOf = new WeakMap;
  const direct = Symbol();
  const proxy = {};
  const set = (p, type) => {
    typesOf.set(p, type);
    return p;
  };
  const utils = {
    proxy,
    wrapOf,
    release,
    typeOf: typeOfFor(typesOf),
    isProxy: value => typesOf.has(value),
    valueOf: value => (value[direct] ?? value.valueOf()),
  };
  for (const type of ownKeys$1(namespace)) {
    if (hasOwn(utils, type)) continue;
    const traps = namespace[type];
    switch (type) {
      case ARRAY: {
        const handler = extendHandler(traps, type, direct, value => ({
          value([ $ ], ..._) {
            return value.call(this, $, ..._);
          }
        }));
        proxy[type] = ($, ..._) => set(JSProxy($, [ $ ], handler, ..._), ARRAY);
        break;
      }
      case FUNCTION: {
        const handler = extendHandler(traps, type, direct, value => ({
          value($, ..._) {
            return value.call(this, $(), ..._);
          }
        }));
        proxy[type] = ($, ..._) => set(JSProxy($, bound($), handler, ..._), FUNCTION);
        break;
      }
      case OBJECT: {
        const handler = extendHandler(traps, type, direct, value => ({
          value({ $ }, ..._) {
            return value.call(this, $, ..._);
          }
        }));
        proxy[type] = ($, ..._) => set(JSProxy($, { $ }, handler, ..._), OBJECT);
        break;
      }
      default: {
        const handler = extendHandler(traps, type, direct, value => ({
          value
        }));
        proxy[type] = ($, ..._) => set(JSProxy($, $, handler, ..._), type);
        break;
      }
    }
  }
  return utils;
};

let uid$1 = 0;
const ids = new Map;
const values$1 = new Map;

/**
 * Remove by id or value any previously stored reference.
 * @param {number | unknown} id the held value by id or the value itself.
 * @returns {boolean} `true` if the operation was successful, `false` otherwise.
 */
const drop = id => {
  const [a, b] = typeof id === NUMBER ? [values$1, ids] : [ids, values$1];
  const had = a.has(id);
  if (had) {
    b.delete(a.get(id));
    a.delete(id);
  }
  return had;
};

/**
 * Return the held value reference by its unique identifier.
 * @param {number} id the unique identifier for the value reference.
 * @returns {unknown} the related value / reference or undefined.
 */
const get = id => values$1.get(id);

/**
 * Create once a unique number id for a generic value reference.
 * @param {unknown} value a reference used to create a unique identifier.
 * @returns {number} a unique identifier for that reference.
 */
const hold = value => {
  if (!ids.has(value)) {
    let id;
    // a bit apocalyptic scenario but if this thread runs forever
    // and the id does a whole int32 roundtrip we might have still
    // some reference dangling around
    while (/* c8 ignore next */ values$1.has(id = uid$1++));
    ids.set(value, id);
    values$1.set(id, value);
  }
  return ids.get(value);
};

// (c) Andrea Giammarchi - MIT

const ACTION_INIT = 0;
const ACTION_NOTIFY = 1;
const ACTION_WAIT = 2;
const ACTION_SW = 3;

const { ArrayBuffer, Atomics: $Atomics, Promise: Promise$1 } = globalThis;
const { isArray } = Array;
const { create, getPrototypeOf, values } = Object;

const TypedArray = getPrototypeOf(Int32Array);
const Atomics = create($Atomics);

const dispatch = ({ currentTarget, type, origin, lastEventId, source, ports }, data) =>
  currentTarget.dispatchEvent(new MessageEvent(type, { data, origin, lastEventId, source, ports }));

const withResolvers = () => Promise$1.withResolvers();

let id = 0;
const views = new Map;
const extend = (Class, SharedArrayBuffer) => class extends Class {
  constructor(value, ...rest) {
    super(value, ...rest);
    if (value instanceof SharedArrayBuffer)
      views.set(this, [id++, 0, withResolvers()]);
  }
};

const ignoreList = new WeakSet;

/**
 * @template {T}
 * @callback PassThrough
 * @param {T} value
 * @returns {T}
 */

/** @type {PassThrough} */
const ignoreDirect = value => value;

/** @type {PassThrough} */
const ignorePatch = value => {
  ignoreList.add(value);
  return value;
};

const isChannel = (event, channel) => {
  const { data } = event;
  const yes = isArray(data) && (
    data.at(0) === channel ||
    (data.at(1) === ACTION_INIT && !channel)
  );
  if (yes) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
  return yes;
};

const isObject = value => (
  value !== null &&
  typeof value === 'object' &&
  !ignoreList.has(value)
);

const transferred = new WeakMap;
const transferViews = (data, transfer, visited) => {
  if (views.has(data))
    transfer.set(data, views.get(data)[0]);
  else if (!(data instanceof TypedArray || data instanceof ArrayBuffer)) {
    for (const value of values(data)) {
      if (isObject(value) && !visited.has(value)) {
        visited.add(value);
        transferViews(value, transfer, visited);
      }
    }
  }
};

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/waitAsync#browser_compatibility
const waitAsyncPatch = (...args) => ({
  value: new Promise$1(resolve => {
    // encodeURIComponent('onmessage=e=>postMessage(!Atomics.wait(...e.data))')
    let w = new Worker('data:application/javascript,onmessage%3De%3D%3EpostMessage(!Atomics.wait(...e.data))');
    w.onmessage = () => resolve('ok');
    w.postMessage(args);
  })
});

const waitAsyncPoly = (view, index) => {
  const value = views.get(view), [id, _, { promise }] = value;
  value[1] = index;
  return [id, promise];
};

const actionNotify = (_view, _id, _index) => {
  for (const [view, [id, index, { resolve }]] of views) {
    if (_id === id && _index === index) {
      for (let i = 0; i < _view.length; i++) view[i] = _view[i];
      views.delete(view);
      resolve('ok');
      break;
    }
  }
};

const actionWait$1 = (event, transfer, data) => {
  for (const [view, id] of transfer)
    transferred.set(view, [id, event.currentTarget]);
  dispatch(event, data);
};

const postData = (CHANNEL, data) => {
  const transfer = new Map;
  if (isObject(data)) transferViews(data, transfer, new Set);
  return transfer.size ? [CHANNEL, ACTION_WAIT, transfer, data] : data;
};

const getData = view => transferred.get(view);

// (c) Andrea Giammarchi - MIT


let {
  BigInt64Array,
  Int32Array: Int32Array$1,
  SharedArrayBuffer,
  addEventListener,
  postMessage,
} = globalThis;

let bootstrapping = true;
let ignore = ignoreDirect;
let polyfill = false;

const ready = withResolvers();

try {
  new SharedArrayBuffer(4);

  if (!Atomics.waitAsync)
    Atomics.waitAsync = waitAsyncPatch;

  ready.resolve();
}
catch (_) {
  const $postMessage = postMessage;
  const $addEventListener = addEventListener;

  const messages = [];

  let CHANNEL = '';
  let SERVICE_WORKER = '';

  SharedArrayBuffer = class extends ArrayBuffer {};
  BigInt64Array = extend(BigInt64Array, SharedArrayBuffer);
  Int32Array$1 = extend(Int32Array$1, SharedArrayBuffer);

  ignore = ignorePatch;
  polyfill = true;

  Atomics.notify = (view, index) => {
    const [id] = getData(view);
    $postMessage([CHANNEL, ACTION_NOTIFY, view, id, index]);
    return 0;
  };

  Atomics.waitAsync = (...args) => {
    const [_, value] = waitAsyncPoly(...args);
    return { value };
  };

  Atomics.wait = (view, index, ...rest) => {
    const [id] = waitAsyncPoly(view, index, ...rest);
    const xhr = new XMLHttpRequest;
    xhr.responseType = 'json';
    xhr.open('POST', `${SERVICE_WORKER}?sabayon`, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(`["${CHANNEL}",${id},${index}]`);
    const { response } = xhr;
    views.delete(view);
    for (let i = 0; i < response.length; i++) view[i] = response[i];
    return 'ok';
  };

  $addEventListener('message', event => {
    if (isChannel(event, CHANNEL)) {
      const [_, ACTION, ...rest] = event.data;
      switch (ACTION) {
        case ACTION_INIT: {
          CHANNEL = _;
          SERVICE_WORKER = rest.at(0)?.serviceWorker || '';
          if (!SERVICE_WORKER) {
            Atomics.wait = null;
            ready.resolve();
          }
          break;
        }
        case ACTION_NOTIFY: {
          actionNotify(...rest);
          break;
        }
        case ACTION_WAIT: {
          actionWait$1(event, ...rest);
          break;
        }
        case ACTION_SW: {
          ready.resolve();
          break;
        }
      }
    }
    else if (bootstrapping) {
      const { currentTarget, type, origin, lastEventId, source, ports } = event;
      messages.push([{ currentTarget, type, origin, lastEventId, source, ports }, event.data]);
    }
  });

  addEventListener = (type, ...args) => {
    $addEventListener(type, ...args);
    if (messages.length) {
      for (const args of messages.splice(0))
        dispatch(...args);
    }
  };

  postMessage = (data, ...rest) => $postMessage(postData(CHANNEL, data), ...rest);
}

await ready.promise;

bootstrapping = false;

// (c) Andrea Giammarchi - MIT


const { BYTES_PER_ELEMENT: I32_BYTES } = Int32Array;
const { BYTES_PER_ELEMENT: UI16_BYTES } = Uint16Array;

const { notify } = Atomics;

const decoder = new TextDecoder('utf-16');

const buffers = new WeakSet;
const transfer = (...args) => (buffers.add(args), args);

let seppuku = '';
const results = new Map;
const actionLength = (stringify, transform) => async (callback, [name, id, sb, args, isSync]) => {
  if (isSync) seppuku = name;
  try {
    const result = await callback(...args);
    if (result !== void 0) {
      const serialized = stringify(transform ? transform(result) : result);
      results.set(id, serialized);
      sb[1] = serialized.length;
    }
  }
  finally {
    if (isSync) seppuku = '';
    sb[0] = 1;
    notify(sb, 0);
  }
};
const actionFill = (id, sb) => {
  const result = results.get(id);
  results.delete(id);
  for (let ui16a = new Uint16Array(sb.buffer), i = 0, { length } = result; i < length; i++)
    ui16a[i] = result.charCodeAt(i);
  notify(sb, 0);
};
const actionWait = (waitLength, map, rest) => {
  const [name] = rest;
  const callback = map.get(name);
  if (!callback) throw new Error(`Unknown proxy.${name}()`);
  waitLength(callback, rest);
};

let uid = 0;
const invoke = (
  [
    CHANNEL,
    Int32Array,
    SharedArrayBuffer,
    ignore,
    isSync,
    parse,
    polyfill,
    postMessage,
    transform,
    waitAsync,
  ],
  name,
) => (...args) => {
  if (seppuku !== '')
    throw new Error(`💀🔒 - proxy.${name}() deadlock in proxy.${seppuku}()`);
  const id = uid++;
  const transfer = [];
  if (buffers.has(args.at(-1) || transfer))
    buffers.delete(transfer = args.pop());
  const data = ignore(transform ? args.map(transform) : args);
  let sb = new Int32Array(new SharedArrayBuffer(I32_BYTES * 2));
  postMessage([CHANNEL, ACTION_WAIT, name, id, sb, data, isSync], { transfer });
  return waitAsync(sb, 0).value.then(() => {
    const length = sb[1];
    if (!length) return;
    const bytes = UI16_BYTES * length;
    sb = new Int32Array(new SharedArrayBuffer(bytes + (bytes % I32_BYTES)));
    postMessage([CHANNEL, ACTION_NOTIFY, id, sb]);
    return waitAsync(sb, 0).value.then(() =>{
      const ui16a = new Uint16Array(sb.buffer);
      const sub = polyfill ? ui16a.subarray(0, length) : ui16a.slice(0, length);
      return parse(decoder.decode(sub));
    });
  });
};

const createProxy = (details, map) => new Proxy(map, {
  get: (map, name) => (
    map.get(name) ||
    map.set(name, invoke(details, name)).get(name)
  ),
  set: (map, name, callback) => !!map.set(name, callback),
});

// (c) Andrea Giammarchi - MIT


const { wait, waitAsync } = Atomics;

var coincident = ({
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
                Int32Array$1,
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

// this literal allows mapping right away
// string types into numeric values so that
// the transported and transformed arrays
// would use less bytes to satisfy te same
// contract while exchanging information.
// basically this is an home-made ENUM like
// object literal ... that's it.
// TBD: should this be part of js-proxy? it feels
//      to me like it would rather belong in there.
var numeric = Object.fromEntries([
  ARRAY,
  BIGINT,
  BOOLEAN,
  FUNCTION,
  NULL,
  NUMBER,
  OBJECT,
  STRING,
  SYMBOL,
  UNDEFINED,
].map((k, i) => [k, i]));

const DESTRUCT = 'destruct';
const VALUE_OF = 'valueOf';

const { [OWN_KEYS]: ownKeys } = Reflect;


const known = new Map(
  ownKeys(Symbol)
    .filter(s => typeof Symbol[s] === SYMBOL)
    .map(s => [Symbol[s], s])
);

const fromSymbol = value => {
  if (value.startsWith('.'))
    return Symbol.for(value.slice(1));
  for (const [symbol, name] of known) {
    if (name === value)
      return symbol;
  }
};

const toSymbol = value => (
  known.get(value) ||
  `.${Symbol.keyFor(value) || ''}`
);

const CHANNEL = 'd7c9d1a3-b35f-4a8b-9fad-6883fe008204';
const MAIN = 'M' + CHANNEL;
const WORKER = 'W' + CHANNEL;

const { [APPLY]: apply } = Reflect;

var worker = async (options) => {
  const exports = await coincident(options);
  const $ = options?.transform || ((o) => o);
  const { [MAIN]: __main__ } = exports.proxy;

  const proxies = new Map();
  const proxied = (value, proxy) => {
    let ref = proxies.get(value)?.deref();
    if (!ref) proxies.set(value, new WeakRef((ref = proxy(value))));
    return ref;
  };

  const fromEntry = ([numericTYPE, value]) => {
    switch (numericTYPE) {
      case numeric[OBJECT]: return (
        value == null ?
          globalThis :
          typeof value === NUMBER ?
            proxied(value, proxy.object) :
            value
      );
      case numeric[ARRAY]: return typeof value === NUMBER ? proxied(value, proxy.array) : value;
      case numeric[FUNCTION]: return (
        typeof value === NUMBER ?
          proxied(value, proxy.function) :
          get(parseInt(value))
      );
      case numeric[SYMBOL]: return fromSymbol(value);
      default: return value;
    }
  };

  const toEntry = (value) => {
    const TYPE = typeOf(value);
    switch (TYPE) {
      case OBJECT: {
        let ref = value;
        if (value === globalThis || value == null) ref = null;
        else if (!(value instanceof TypedArray)) {
          ref = valueOf($(value), TYPE);
          if (typeof ref === OBJECT) {
            // TBD: would Object.fromEntries be better or overkill?
            for (const key in ref) ref[key] = toEntry(ref[key]);
          }
        }
        return [numeric[OBJECT], ref];
      }
      case ARRAY: {
        let ref = valueOf($(value), TYPE);
        return [numeric[ARRAY], typeof ref === NUMBER ? ref : ref.map(toEntry)];
      }
      case FUNCTION: {
        let ref = valueOf($(value), TYPE);
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
    [DEFINE_PROPERTY]: (ref, name, descriptor) => asEntry(DEFINE_PROPERTY, ref, toEntry(name), toEntry(descriptor)),
    [DELETE_PROPERTY]: (ref, name) => asEntry(DELETE_PROPERTY, ref, toEntry(name)),
    [GET]: (ref, name) => asEntry(GET, ref, toEntry(name)),
    [GET_PROTOTYPE_OF]: (ref) => asEntry(GET_PROTOTYPE_OF, ref),
    [GET_OWN_PROPERTY_DESCRIPTOR]: (ref, name) => {
      const descriptor = asEntry(
        GET_OWN_PROPERTY_DESCRIPTOR,
        ref,
        toEntry(name),
      );
      if (descriptor) {
        const { get, set, value } = descriptor;
        if (get) descriptor.get = fromEntry(get);
        if (set) descriptor.set = fromEntry(set);
        if (value) descriptor.value = fromEntry(value);
      }
      return descriptor;
    },
    [HAS]: (ref, name) => asEntry(HAS, ref, toEntry(name)),
    [IS_EXTENSIBLE]: (ref) => asEntry(IS_EXTENSIBLE, ref),
    [OWN_KEYS]: (ref) => asEntry(OWN_KEYS, ref).map(fromEntry),
    [PREVENT_EXTENSION]: (ref) => asEntry(PREVENT_EXTENSION, ref),
    [SET]: (ref, name, value) => asEntry(SET, ref, toEntry(name), toEntry(value)),
    [SET_PROTOTYPE_OF]: (ref, proto) => asEntry(SET_PROTOTYPE_OF, ref, toEntry(proto)),

    [VALUE_OF]: (ref) => ref,
    [DESTRUCT](ref) {
      proxies.delete(ref);
      __main__(DESTRUCT, ref);
    },
  };

  const { proxy, isProxy, typeOf, wrapOf } = define({
    object: handler,
    array: handler,
    function: {
      ...handler,
      [APPLY]: (ref, ...args) => asEntry(APPLY, ref, ...args.map(toEntry)),
      [CONSTRUCT]: (ref, ...args) => asEntry(CONSTRUCT, ref, ...args.map(toEntry)),
    },
  });

  const valueOf = (value, type) => (
    isProxy(value) ? wrapOf(value, type) : value
  );

  const window = proxy.object(null);

  // for the time being this is used only to invoke callbacks
  // attached as listeners or as references' fields.
  exports.proxy[WORKER] = (TRAP, ref, ...args) => {
    const id = parseInt(ref);
    switch (TRAP) {
      case APPLY:
        return toEntry(apply(get(id), ...args.map(fromEntry)));
      case DESTRUCT:
        drop(id);
    }
  };

  const debug = exports.proxy[WORKER];
  exports.proxy[WORKER] = (...args) => {
    console.log(...args);
    const result = debug(...args);
    console.log(result);
    return result;
  };

  return {
    ...exports,
    window,
    isWindowProxy: isProxy,
  };
};

export { worker as default };
