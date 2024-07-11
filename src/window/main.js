
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

const {
  [DEFINE_PROPERTY]: defineProperty,
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
