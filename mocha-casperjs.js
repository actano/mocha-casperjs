module.exports = function (mocha, casper) {
  var lastError;

  // hookup to all the various casper error events and save that error to report to mocha later
  [
    'error',
    'wait.error',
    'waitFor.timeout',
    'waitFor.timeout.error',
    'event.error',
    'complete.error',
    'step.error'
  ].forEach(function(event) {
    casper.on(event, function(error) {
      lastError = lastError || error
    })
  })

  // Method for patching mocha to run casper steps is inspired by https://github.com/domenic/mocha-as-promised
  //
  Object.defineProperties(mocha.Runnable.prototype, {
    fn: {
      configurable: true,
      enumerable: true,
      get: function () {
        return this.casperWraperFn;
      },
      set: function (fn) {
        Object.defineProperty(this, 'casperWraperFn', {
          value: function (done) {
            lastError = undefined
            // Run the original `fn`, passing along `done` for the case in which it's callback-asynchronous.
            // Make sure to forward the `this` context, since you can set variables and stuff on it to share
            // within a suite.
            fn.call(this, done)

            // only flush the casper steps on test Runnables, and only if there are steps
            if (this.test && this.test.type === 'test' && casper.steps.length) {
              casper.run(function () {
                // pass any error caught by capser along to mocha
                done(lastError)
              })
            } else if (fn.length === 0) {
              // If `fn` is synchronous (i.e. didn't have a `done` parameter and didn't return a promise),
              // call `done` now. (If it's callback-asynchronous, `fn` will call `done` eventually since
              // we passed it in above.)
              done()
            }
          },
          writable: true,
          configurable: true
        })

        this.casperWraperFn.toString = function () {
          return fn.toString();
        }
      }
    },
    async: {
      configurable: true,
      enumerable: true,
      get: function () {
        return typeof this.casperWraperFn === 'function'
      },
      set: function () {
        // Ignore Mocha trying to set this - tests are always asyncronous with our wrapper
      }
    }
  })

  // Mocha needs the formating feature of console.log so copy node's format function and
  // monkey-patch it into place. This code is copied from node's, links copyright applies.
  // https://github.com/joyent/node/blob/master/lib/util.js
  console.format = function (f) {
    var i;
    if (typeof f !== 'string') {
      var objects = [];
      for (i = 0; i < arguments.length; i++) {
        objects.push(JSON.stringify(arguments[i]));
      }
      return objects.join(' ');
    }
    i = 1;
    var args = arguments;
    var len = args.length;
    var str = String(f).replace(/%[sdj%]/g, function(x) {
      if (x === '%%') return '%';
      if (i >= len) return x;
      switch (x) {
        case '%s': return String(args[i++]);
        case '%d': return Number(args[i++]);
        case '%j': return JSON.stringify(args[i++]);
        default:
          return x;
      }
    });
    for (var x = args[i]; i < len; x = args[++i]) {
      if (x === null || typeof x !== 'object') {
        str += ' ' + x;
      } else {
        str += ' ' + JSON.stringify(x);
      }
    }
    return str;
  };

  var origError = console.error,
      origLog = console.log
  console.error = function() { origError.call(console, console.format.apply(console, arguments)) }
  console.log = function() { origLog.call(console, console.format.apply(console, arguments)) }

  // Since we're using the precompiled version of mocha usually meant for the browser, 
  // patch the expossed process object (thanks mocha-phantomjs users for ensuring it's exposed)
  // https://github.com/visionmedia/mocha/issues/770
  mocha.process = mocha.process || {}
  mocha.process.stdout = require('system').stdout
}