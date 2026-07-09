/**
 * Minimal CSInterface — the small slice of Adobe's CEP library Graphinator needs.
 * Provides evalScript() to call into the ExtendScript engine (jsx/graphinator.jsx,
 * loaded by AE via the manifest's ScriptPath).
 */
function CSInterface() {}

/**
 * Evaluate an ExtendScript expression in the host (After Effects).
 * @param {string} script   ExtendScript to run.
 * @param {function} [callback] Receives the result as a string.
 */
CSInterface.prototype.evalScript = function (script, callback) {
  callback = callback || function () {};
  if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
    window.__adobe_cep__.evalScript(script, callback);
  } else {
    callback('ERR|Not running inside a CEP host (After Effects).');
  }
};
