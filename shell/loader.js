/* Memuat modul secara otomatis. File yang belum ada dilewati (dicatat di Terminal),
   anggota cukup tambah file di folder modulnya tanpa mengubah index.html. */
(function () {
  'use strict';

  var MODULES = ['cpu', 'memory', 'disk', 'monitor', 'analytics'];
  var SCRIPTS = ['logic.js', 'app.js'];

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.body.appendChild(s);
    });
  }

  function loadCss(href) {
    return new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = function () { resolve(true); };
      l.onerror = function () { l.remove(); resolve(false); };   // style.css bersifat opsional
      document.head.appendChild(l);
    });
  }

  async function boot() {
    window.kirimLog('Kernel', 'MiniOS boot');
    for (var i = 0; i < MODULES.length; i++) {
      var dir = 'modules/' + MODULES[i] + '/';
      await loadCss(dir + 'style.css');
      for (var j = 0; j < SCRIPTS.length; j++) {
        var ok = await loadScript(dir + SCRIPTS[j]);
        if (!ok) window.kirimLog('SISTEM', dir + SCRIPTS[j] + ' belum ada, dilewati');
      }
    }
    window.kirimLog('Kernel', 'MiniOS boot OK');
    window.Shell.openApp('terminal');
  }

  boot();
})();
