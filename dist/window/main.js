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
const { isArray: isArray$1 } = Array;
const { create: create$1, getPrototypeOf, values } = Object;

const TypedArray = getPrototypeOf(Int32Array);
const Atomics = create$1($Atomics);

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
  const yes = isArray$1(data) && (
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
  Worker: Worker$1,
} = globalThis;

let ignore = ignoreDirect;
let polyfill = false;

const asModule = options => ({ ...options, type: 'module' });

try {
  new SharedArrayBuffer(4);

  Worker$1 = class extends Worker$1 {
    constructor(url, options) {
      super(url, asModule(options));
    }
  };

  if (!Atomics.waitAsync)
    Atomics.waitAsync = waitAsyncPatch;
}
catch (_) {
  const CHANNEL = crypto.randomUUID();

  const sync = new Map;

  const addListener = (self, type, handler, ...rest) => {
    self.addEventListener(type, handler, ...rest);
  };

  const register = ({ serviceWorker: s }, sw, done) => {
    let w;
    addListener(s, 'message', event => {
      if (isChannel(event, CHANNEL)) {
        const [_, id, index] = event.data;
        const uid = [id, index].join(',');
        const done = view => {
          sync.delete(uid);
          w.postMessage([ CHANNEL, id, index, view ]);
        };
        const view = sync.get(uid);
        if (view) done(view);
        else {
          const { promise, resolve } = withResolvers();
          sync.set(uid, resolve);
          promise.then(done);
        }
      }
    });
    s.register(sw).then(function ready(r) {
      w = (r.installing || r.waiting || r.active);
      if (w.state === 'activated')
        done();
      else
        addListener(w, 'statechange', () => ready(r), { once: true });
    });
  };

  ignore = ignorePatch;
  polyfill = true;

  Atomics.notify = (view, index) => {
    const [id, worker] = getData(view);
    const uid = [id, index].join(',');
    const known = sync.get(uid);
    if (known) known(view);
    else sync.set(uid, view);
    worker.postMessage([CHANNEL, ACTION_NOTIFY, view, id, index]);
    return 0;
  };

  Atomics.waitAsync = (view, ...rest) => {
    const [_, value] = waitAsyncPoly(view, ...rest);
    return { value };
  };

  SharedArrayBuffer = class extends ArrayBuffer {};
  BigInt64Array = extend(BigInt64Array, SharedArrayBuffer);
  Int32Array$1 = extend(Int32Array$1, SharedArrayBuffer);

  let serviceWorker = null;
  Worker$1 = class extends Worker$1 {
    constructor(url, options) {
      let sw = options?.serviceWorker || '';
      if (sw) {
        sw = new URL(sw, location.href).href;
        options = { ...options, serviceWorker: sw };
        if (!serviceWorker) {
          const { promise, resolve } = withResolvers();
          register(navigator, sw, resolve);
          serviceWorker = promise;
        }
        serviceWorker.then(
          () => super.postMessage([CHANNEL, ACTION_SW])
        );
      }
      super(url, asModule(options));
      super.postMessage([CHANNEL, ACTION_INIT, options]);
      addListener(this, 'message', event => {
        if (isChannel(event, CHANNEL)) {
          const [_, ACTION, ...rest] = event.data;
          switch (ACTION) {
            case ACTION_NOTIFY: {
              actionNotify(...rest);
              break;
            }
            case ACTION_WAIT: {
              actionWait$1(event, ...rest);
              break;
            }
          }
        }
      });
    }
    postMessage(data, ...rest) {
      return super.postMessage(postData(CHANNEL, data), ...rest);
    }
  };
}

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


var coincident = ({
  parse,
  stringify,
  transform,
} = JSON) => {
  const waitLength = actionLength(stringify, transform);

  const CHANNEL = crypto.randomUUID();

  class Worker extends Worker$1 {
    constructor(url, options) {
      const map = new Map;
      super(url, options);
      this.proxy = createProxy(
        [
          CHANNEL,
          Int32Array$1,
          SharedArrayBuffer,
          ignore,
          false,
          parse,
          polyfill,
          (...args) => this.postMessage(...args),
          transform,
          Atomics.waitAsync,
        ],
        map,
      );
      this.postMessage(ignore([CHANNEL, ACTION_INIT, options]));
      this.addEventListener('message', event => {
        if (isChannel(event, CHANNEL)) {
          const [_, ACTION, ...rest] = event.data;
          switch (ACTION) {
            case ACTION_WAIT: {
              actionWait(waitLength, map, rest);
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
    polyfill,
    transfer,
  };
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

const DEFINE_PROPERTY              = 'defineProperty';
const GET_OWN_PROPERTY_DESCRIPTOR  = 'getOwnPropertyDescriptor';
const OWN_KEYS                     = 'ownKeys';

const DESTRUCT = 'destruct';

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
const create = (
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

const { addEventListener } = EventTarget.prototype;
const eventsHandler = new WeakMap();
Reflect.defineProperty(EventTarget.prototype, "addEventListener", {
  value(type, listener, ...options) {
    const invoke = options.at(0)?.invoke;
    if (invoke) {
      let map = eventsHandler.get(this);
      if (!map) eventsHandler.set(this, (map = new Map()));
      map.set(type, [].concat(invoke));
      delete options[0].invoke;
    }
    return addEventListener.call(this, type, listener, ...options);
  },
});

var handleEvent = event => {
  const { currentTarget, target, type } = event;
  const methods = eventsHandler.get(currentTarget || target)?.get(type);
  if (methods) for (const method of methods) event[method]();
};

const { isArray } = Array;

var main = (options) => {
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
      };

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
          }          case numeric[ARRAY]: {
            if (typeof value === NUMBER) return get(value);
            return value.map(fromEntry);
          }          case numeric[FUNCTION]: {
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
          }          case numeric[SYMBOL]: return fromSymbol(value);
          default: return value;
        }
      };

      const asEntry = (method, target, args) => toEntry(method(target, ...args.map(fromEntry)));

      const asDescriptor = (descriptor, asEntry) => {
        const { get, set, value } = descriptor;
        if (get) descriptor.get = asEntry(get);
        if (set) descriptor.set = asEntry(set);
        if (value) descriptor.value = asEntry(value);
        return descriptor;
      };

      proxy[MAIN] = (TRAP, ref, ...args) => {
        if (TRAP === DESTRUCT) drop(ref);
        else {
          const method = Reflect[TRAP];
          const target = ref == null ? globalThis : get(ref);
          switch (TRAP) {
            case DEFINE_PROPERTY: {
              const [name, descriptor] = args.map(fromEntry);
              return toEntry(method(target, name, asDescriptor(descriptor, fromEntry)));
            }
            case GET_OWN_PROPERTY_DESCRIPTOR: {
              const value = method(target, ...args.map(fromEntry));
              return [numeric[value ? OBJECT : UNDEFINED], value ?? asDescriptor(value, toEntry)];
            }
            case OWN_KEYS: return [numeric[ARRAY], method(target).map(toEntry)];
            default: return asEntry(method, target, args);
          }
        }
      };

      const debug = proxy[MAIN];
      proxy[MAIN] = (...args) => {
        console.log(...args);
        const result = debug(...args);
        console.log(result);
        return result;
      };
    }
  }

  return {
    ...exports,
    Worker,
  };
};

export { main as default };
