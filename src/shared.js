// (c) Andrea Giammarchi - MIT

import {
  ACTION_INIT,
  ACTION_NOTIFY,
  ACTION_WAIT,
  Atomics,
  isChannel,
  withResolvers,
} from 'sabayon/shared';

const { BYTES_PER_ELEMENT: I32_BYTES } = Int32Array;
const { BYTES_PER_ELEMENT: UI16_BYTES } = Uint16Array;

const { notify } = Atomics;

const decoder = new TextDecoder('utf-16');

const buffers = new WeakSet;
const transfer = (...args) => (buffers.add(args), args);

let seppuku = 0;
const results = new Map;
const actionLength = (stringify, transform) => async (callback, id, sb, args) => {
  try {
    seppuku++;
    const result = await callback(...args);
    if (result !== void 0) {
      const serialized = stringify(transform ? transform(result) : result);
      results.set(id, serialized);
      sb[1] = serialized.length;
    }
  }
  finally {
    seppuku--;
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
const actionWait = (waitLength, map, [id, sb, name, args]) => {
  const callback = map.get(name);
  if (!callback) throw new Error(`Unknown proxy.${name}()`);
  waitLength(callback, id, sb, args);
};

let uid = 0;
const invoke = (
  [
    CHANNEL,
    Int32Array,
    SharedArrayBuffer,
    postMessage,
    ignore,
    parse,
    transform,
    waitAsync,
  ],
  name,
) => (...args) => {
  if (seppuku) throw new Error(`💀🔒 - Deadlock on proxy.${name}()`);
  const id = uid++;
  const transfer = [];
  if (buffers.has(args.at(-1) || transfer))
    buffers.delete(transfer = args.pop());
  const data = ignore(transform ? args.map(transform) : args);
  let sb = new Int32Array(new SharedArrayBuffer(I32_BYTES * 2));
  postMessage([CHANNEL, ACTION_WAIT, id, sb, name, data], { transfer });
  return waitAsync(sb, 0).value.then(() => {
    const length = sb[1];
    if (!length) return;
    const bytes = UI16_BYTES * length;
    sb = new Int32Array(new SharedArrayBuffer(bytes + (bytes % I32_BYTES)));
    postMessage([CHANNEL, ACTION_NOTIFY, id, sb]);
    return waitAsync(sb, 0).value.then(() => parse(
      decoder.decode(new Uint16Array(sb.buffer).slice(0, length))
    ));
  });
};

const createProxy = (details, map) => new Proxy(map, {
  get: (map, name) => (
    map.get(name) ||
    map.set(name, invoke(details, name)).get(name)
  ),
  set: (map, name, callback) => !!map.set(name, callback),
});

export {
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
};
