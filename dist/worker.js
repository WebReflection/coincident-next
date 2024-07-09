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

var worker = ({
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

export { worker as default };
