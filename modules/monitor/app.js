// modules/monitor/app.js
// Tahap 1 (Hello World): membuktikan aplikasi System Monitor muncul di desktop.
(function () {
  'use strict';

  var container = null;   // elemen jendela saat terbuka, null saat tertutup

  // Gambar ulang dari state modul (state disimpan di variabel modul, bukan di DOM).
  function render() {
    if (!container) return;
    container.textContent = '';
    var box = document.createElement('div');
    box.className = 'app-section';
    box.textContent = 'Modul Monitor siap';
    container.appendChild(box);
  }

  // Listener event os:* didaftarkan SEKALI di sini (bukan di mount),
  // supaya tetap berjalan walaupun jendela modul sedang ditutup.
  window.addEventListener('os:reset', function () {
    try {
      // TODO: kembalikan state modul ke awal
      render();
    } catch (e) {
      window.kirimLog('Monitor', 'error saat reset: ' + e.message);
    }
  });

  window.registerApp({
    id: 'monitor',
    title: 'System Monitor',
    width: 560,
    height: 420,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>',
    mount: function (el) {
      container = el;
      render();
      window.kirimLog('Monitor', 'Hello World');
    },
    unmount: function () { container = null; },
    // Ringkasan state (JSON sederhana) untuk Monitor dan tes integrasi; isi sesuai kontrak modulmu.
    getState: function () { return {}; },
  });
})();