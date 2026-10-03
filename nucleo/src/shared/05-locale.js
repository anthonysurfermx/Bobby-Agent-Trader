/* Locale contract shared by the native and browser engines. */
(function (root) {
  'use strict';
  var LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'];
  function language(value) {
    var code = String(value || '').replace(/_/g, '-').toLowerCase().split('-')[0];
    return LANGUAGES.indexOf(code) >= 0 ? code : 'en';
  }
  function locale(value, preferred) {
    var code = language(value), tag = String(preferred || value || '').replace(/_/g, '-').toLowerCase();
    var supported = ['en-US','en-GB','en-AU','en-CA','en-IE','es-MX','es-ES','es-US','fr-FR','pt-PT','pt-BR','it-IT','de-DE'];
    for (var i = 0; i < supported.length; i++) {
      if (supported[i].toLowerCase() === tag && supported[i].split('-')[0] === code) return supported[i];
    }
    return { en:'en-US', es:'es-MX', fr:'fr-FR', pt:'pt-PT', it:'it-IT', de:'de-DE' }[code];
  }
  root.NucleoLocale = { languages: LANGUAGES, language: language, locale: locale };
})(typeof window !== 'undefined' ? window : globalThis);
