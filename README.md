# coming soon

... it's a *WIP* ...


## About 💀🔒 Deadlock Message

This module allows different worlds to expose utilities that can be invoked elsewhere and there are two ways this can work:

  * `Atomics.wait` is usable, from a *worker*, and it will be preferred over `Atomics.waitAsync` for the simple reason that it unlocks much more than trivial *async* exchanges between the two worlds. In this case, if the worker is invoking a foreign exposed utility, it will be fully unresponsive until that utility returned a value and there's no possible workaround. When this happens, the module understands that the requested utility comes from a *worker* that is paused until such invoke returns, and if this invoke relies on a *worker* utility there won't be any chance to complete that request: the *worker* is stuck and the *main* can't use it until is not stuck anymore. In this case, an error is thrown with details around which *worker* utility was invoked while the *main* utility was executing, and the program won't just block itself forever. This is the most meaningful and reasonable deadlock case to `throw` errors unconditionally ... but ...
  * if this module runs without `Atomics.wait` ability, meaning no *COI* headers are enabled and no `serviceWorker` fallback has been used, it is possible for a *main* exported utility to query a *worker* exported utility one once executed, assuming there is no recursion in doing so (i.e. the *worker* calls `main()` that internally calls `worker()` which in turns calls `main()` again). These cases are rather infinite loops/recursions than deadlocks but if you are sure your *main* utility is invoking something in the *worker* that won't cause such infinite recursion, no *deadlock* error would be shown, as that would not be the case, strictly speaking, but also recursions won't be tracked so ... be careful with your logic!

As rule of thumb, do not ever invoke other world utilities while one of your exported utility is executing, so that code will be guaranteed to work in both `Atomics.wait` and `Atomics.waitAsync` scenarios without ever worrying about future deadlock, once all headers are available or the `serviceWorker` helper will be used.

It is, however, always possible to execute foreign utilities on the next tick, micro-task, timeout, idle state or listener, so that if a *main* exposed utility needs to invoke a *worker* utility right after, there are ways to do that.
