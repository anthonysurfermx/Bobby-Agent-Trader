/* Locale contract shared by the native and browser engines. */
(function (root) {
  'use strict';
  var LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'];
  function language(value) {
    var code = String(value || '').replace(/_/g, '-').toLowerCase().split('-')[0];
    return LANGUAGES.indexOf(code) >= 0 ? code : 'en';
  }
  function locale(value, preferred) {
    var code = language(value), tag = String(preferred || value || '').replace(/_/g, '-');
    if (code === 'pt') return /(?:^|-)br(?:-|$)/i.test(tag) ? 'pt-BR' : 'pt-PT';
    return { en:'en-US', es:'es-MX', fr:'fr-FR', it:'it-IT', de:'de-DE' }[code];
  }
  root.NucleoLocale = { languages: LANGUAGES, language: language, locale: locale };
})(typeof window !== 'undefined' ? window : globalThis);
