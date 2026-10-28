/* MiniOS shell: API untuk modul (registerApp, kirimLog, OS) dan penghitung event.
   Modul TIDAK boleh mengubah file ini. */
(function () {
  'use strict';

  var MAX_LOG = 500;
  var apps = [];

  var OS = {
    tick: 0,
    metrics: { dispatch: 0, faults: 0, diskOps: 0 },
    events: [],   // baris log untuk Terminal
    apps: apps,   // daftar app terdaftar (dibaca windows.js)
    reset: function () {
      window.dispatchEvent(new CustomEvent('os:reset', { detail: {} }));
    },
    // Ringkasan state sebuah app (dipakai Monitor dan tes integrasi). null bila app tidak menyediakan.
    getState: function (id) {
      var a = apps.find(function (x) { return x.id === id; });
      if (!a || !a.getState) return null;
      try { return a.getState(); } catch (e) {
        kirimLog('SISTEM', 'Error getState ' + id + ': ' + (e && e.message ? e.message : e));
        return null;
      }
    },
  };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function kirimLog(module, message) {
    var line = '[t=' + pad2(OS.tick) + '] ' + String(module).padEnd(9) + ' ' + String(message);
    OS.events.push(line);
    if (OS.events.length > MAX_LOG) OS.events.shift();
    window.dispatchEvent(new CustomEvent('os:log', { detail: { line: line } }));
  }

  function validColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '';
  }

  function registerApp(app) {
    if (!app || typeof app.id !== 'string' || app.id.trim() === '') {
      kirimLog('SISTEM', 'registerApp ditolak: id harus string tidak kosong');
      return false;
    }
    if (typeof app.title !== 'string' || app.title.trim() === '') {
      kirimLog('SISTEM', 'registerApp ditolak (' + app.id + '): title wajib');
      return false;
    }
    if (typeof app.mount !== 'function') {
      kirimLog('SISTEM', 'registerApp ditolak (' + app.id + '): mount(container) wajib berupa fungsi');
      return false;
    }
    var entry = {
      id: app.id,
      title: app.title,
      icon: typeof app.icon === 'string' ? app.icon : '',
      color: validColor(app.color),
      width: Number.isFinite(app.width) ? app.width : 560,
      height: Number.isFinite(app.height) ? app.height : 420,
      mount: app.mount,
      unmount: typeof app.unmount === 'function' ? app.unmount : function () {},
      getState: typeof app.getState === 'function' ? app.getState : null,
    };
    var i = apps.findIndex(function (a) { return a.id === entry.id; });
    if (i >= 0) apps[i] = entry; else apps.push(entry);
    kirimLog('SISTEM', 'aplikasi terdaftar: ' + entry.title);
    window.dispatchEvent(new CustomEvent('shell:apps-changed'));
    return true;
  }

  function changed() { window.dispatchEvent(new CustomEvent('shell:metrics-changed')); }

  // Penghitung: shell dimuat paling awal, jadi listener ini berjalan sebelum listener modul.
  window.addEventListener('os:dispatch', function () {
    OS.tick++; OS.metrics.dispatch++; changed();
  });
  window.addEventListener('os:page-fault', function () {
    OS.metrics.faults++; changed();
  });
  window.addEventListener('os:disk-served', function () {
    OS.tick++; OS.metrics.diskOps++; changed();
  });
  window.addEventListener('os:reset', function () {
    OS.tick = 0;
    OS.metrics.dispatch = 0; OS.metrics.faults = 0; OS.metrics.diskOps = 0;
    OS.events.length = 0;
    changed();
    kirimLog('Kernel', 'simulasi di-reset');
  });

  // Error yang lolos dari modul dicatat ke Terminal, desktop tetap hidup.
  window.addEventListener('error', function (e) {
    kirimLog('SISTEM', 'Error tak tertangani: ' + (e && e.message ? e.message : 'tidak diketahui'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    kirimLog('SISTEM', 'Promise ditolak: ' + (r && r.message ? r.message : String(r)));
  });

  window.OS = OS;
  window.registerApp = registerApp;
  window.kirimLog = kirimLog;
})();
