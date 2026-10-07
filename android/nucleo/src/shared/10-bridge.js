/* Núcleo bridge client, protocol v1 (ARCHITECTURE.md §2).
 * The ONLY path from page JS to native. The page never fetches the network:
 * the CSP has connect-src 'none', and the API rejects the file:// origin anyway.
 *
 *   nucleoBridge.call(method, params)  -> Promise<result>   (JS -> native, request/response)
 *   nucleoBridge.on(event, fn)          -> unsubscribe fn    (native -> JS events)
 *   nucleoBridge.emit(event, payload)                         (called BY native via callAsyncJavaScript)
 *
 * Replies: native answers every envelope with {v:1, ok:true, result} or
 * {v:1, ok:false, error:{code, message}}. Domain outcomes (quota, unknown
 * asset, cancelled, signin_required, subscription_required...) are ok:true
 * results with a `status`; ok:false is only for protocol faults
 * (unknown_method, invalid_params, forbidden, busy, internal).
 */
(function () {
  'use strict';
  var V = 1;
  var METHODS = [
    'session', 'roster', 'suggestions', 'ask', 'cancel', 'read.rendered',
    'speech.permission', 'speech.requestPermission', 'speech.start', 'speech.stop',
    'speak', 'previewVoice', 'stopSpeaking', 'setMuted', 'haptic',
    'saveThesis', 'island', 'theses', 'record',
    'setCompanion', 'riskNotice', 'acceptRisk', 'signIn', 'paywall',
    'openNative', 'openClassic', 'finishOnboarding', 'markHint', 'log',
    'nudge.seen', 'nudge.act'
  ];
  var EVENTS = [
    'session.changed', 'account.changed', 'consent.withdrawn', 'app.state', 'ask.stage', 'analysis.level',
    'speech.state', 'speech.level', 'speech.partial', 'speech.final', 'speech.error',
    'voice.start', 'voice.level', 'voice.progress', 'voice.word', 'voice.end',
    'thesis.planted', 'native.sheet'
  ];
  var listeners = Object.create(null);
  var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nucleo;
  var androidHandler = window.BobbyNucleo;
  var pending = Object.create(null), nextId = 0;
  var transport = handler ? function (env) { return handler.postMessage(env); } : androidHandler ? function (env) {
    return new Promise(function (resolve, reject) {
      var id = String(++nextId);
      var timeout = setTimeout(function () { delete pending[id]; reject(BridgeError('timeout', 'native response timed out')); }, 180000);
      pending[id] = { resolve: resolve, reject: reject, timeout: timeout };
      androidHandler.postMessage(JSON.stringify({ id: id, v: env.v, method: env.method, params: env.params }));
    });
  } : null;

  function BridgeError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function call(method, params) {
    if (METHODS.indexOf(method) < 0) return Promise.reject(BridgeError('unknown_method', method));
    if (!transport) return Promise.reject(BridgeError('no_transport', 'no native handler and no mock installed'));
    var env = { v: V, method: method, params: params || {} };
    var p;
    try { p = Promise.resolve(transport(env)); } catch (err) { return Promise.reject(BridgeError('transport', String(err))); }
    return p.then(function (reply) {
      if (!reply || reply.v !== V || typeof reply.ok !== 'boolean') throw BridgeError('bad_reply', method);
      if (reply.ok) return reply.result;
      var e = reply.error || {};
      throw BridgeError(e.code || 'error', e.message);
    }, function (err) {
      if (err && err.code === 'timeout') throw err;
      // WKScriptMessageHandlerWithReply rejects with the native errorMessage string.
      throw BridgeError('transport', String(err && err.message || err));
    });
  }

  function on(name, fn) {
    if (EVENTS.indexOf(name) < 0) throw BridgeError('unknown_event', name);
    (listeners[name] = listeners[name] || []).push(fn);
    return function off() {
      var list = listeners[name] || [];
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  function emit(name, payload) {
    var list = (listeners[name] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (err) { if (window.console) console.error('[nucleoBridge]', name, err); }
    }
  }

  var api = {};
  METHODS.forEach(function (m) {
    var key = m.replace(/\.(\w)/g, function (_, c) { return c.toUpperCase(); }); // speech.start -> speechStart
    api[key] = function (params) { return call(m, params); };
  });

  window.nucleoBridge = {
    v: V,
    native: !!(handler || androidHandler),
    METHODS: METHODS.slice(),
    EVENTS: EVENTS.slice(),
    call: call,
    on: on,
    emit: emit,
    receive: function (id, reply) {
      var item = pending[id];
      if (!item) return;
      delete pending[id]; clearTimeout(item.timeout); item.resolve(reply);
    },
    api: api,
    /** Used only by dev-mock-bridge.js when there is no native handler. */
    installTransport: function (fn) { if (!handler && !androidHandler) transport = fn; },
    /** Contract tests only: send a raw envelope, bypassing the method whitelist. */
    raw: function (env) { return transport ? Promise.resolve(transport(env)) : Promise.reject(BridgeError('no_transport')); },
    mock: null
  };
})();
