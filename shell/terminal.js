/* Aplikasi Terminal bawaan: menampilkan semua baris dari kirimLog. */
(function () {
  'use strict';

  var body = null;   // elemen terminal saat jendela terbuka, null saat tertutup

  function render() {
    if (!body) return;
    body.textContent = '';
    window.OS.events.forEach(function (line) {
      var d = document.createElement('div');
      d.textContent = line;
      body.appendChild(d);
    });
    body.scrollTop = body.scrollHeight;
  }

  window.addEventListener('os:log', render);

  window.registerApp({
    id: 'terminal',
    title: 'Terminal',
    color: '#1e293b',
    width: 620,
    height: 360,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>',
    mount: function (container) {
      body = document.createElement('div');
      body.className = 'terminal-body';
      container.appendChild(body);
      render();
    },
    unmount: function () { body = null; },
  });
})();
