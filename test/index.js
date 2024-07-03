import coincident from '../dist/main.js';

const { Worker } = coincident();

const w = new Worker('./worker.js', {
  exports: {
    alert(...args) {
      alert(args);
      return args.join('-');
    },
  }
});

console.log(await w.proxy.log(4, 5, 6));
