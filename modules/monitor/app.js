// modules/monitor/app.js
// Tahap 4: perekaman event os:* dan getState().
(function () {
  'use strict';

  var container = null;   // elemen jendela saat terbuka, null saat tertutup
  var events = [];        // rekaman event { name, tick, detail } (state modul, bukan di DOM)

  // ---------- Pembantu DOM (semua teks lewat textContent) ----------

  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks !== undefined && teks !== null) e.textContent = String(teks);
    return e;
  }

  function sel(tr, teks) {
    tr.appendChild(buat('td', '', teks));
  }

  function kepala(teksList) {
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    teksList.forEach(function (t) { tr.appendChild(buat('th', '', t)); });
    thead.appendChild(tr);
    return thead;
  }

  // ---------- Pemformatan angka (di app.js, bukan di logic.js) ----------

  function persen(x) {
    return (x * 100).toFixed(1).replace(/\.0$/, '') + '%';
  }

  function dua(x) {
    return Number(x).toFixed(2);
  }

  // Teks detail satu event untuk tabel "15 event terakhir"
  function teksDetail(ev) {
    var d = ev.detail || {};
    if (ev.name === 'os:dispatch') return d.start + '-' + d.end;
    if (ev.name === 'os:page-fault') return 'page=' + d.page;
    return 'page=' + d.page + ';target=' + d.target + ';seek=' + d.seek;
  }

  // ---------- Ekspor berkas ----------

  function unduh(namaBerkas, isi, tipe) {
    var blob = new Blob([isi], { type: tipe });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = namaBerkas;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    try {
      var hasil = window.MonitorLogic.toCsv(events);
      if (!hasil.ok) {
        window.kirimLog('Monitor', 'gagal ekspor CSV: ' + hasil.error.message);
        return;
      }
      unduh('minios-log.csv', hasil.result.csv, 'text/csv');
      window.kirimLog('Monitor', 'ekspor minios-log.csv (' + events.length + ' event)');
    } catch (e) {
      window.kirimLog('Monitor', 'error saat ekspor CSV: ' + e.message);
    }
  }

  function exportLog() {
    try {
      var teks;
      var sumber = window.OS && window.OS.events;
      if (Array.isArray(sumber)) {
        // OS.events dari shell (bisa berupa string atau objek)
        teks = sumber.map(function (x) {
          return typeof x === 'string' ? x : JSON.stringify(x);
        }).join('\n');
      } else {
        // Cadangan: pakai rekaman milik modul sendiri
        teks = events.map(function (ev) {
          return '[t=' + ev.tick + '] ' + ev.name + ' ' +
                 (ev.detail && ev.detail.pid) + ' ' + teksDetail(ev);
        }).join('\n');
      }
      unduh('minios-log.txt', teks, 'text/plain');
      window.kirimLog('Monitor', 'ekspor minios-log.txt');
    } catch (e) {
      window.kirimLog('Monitor', 'error saat ekspor log: ' + e.message);
    }
  }

  // ---------- Bagian-bagian UI ----------

  function kartu(label, nilai) {
    var k = buat('div', 'moni-card');
    k.appendChild(buat('div', 'moni-card-value', nilai));
    k.appendChild(buat('div', 'moni-card-label', label));
    return k;
  }

  function bagianKartu(ringkasan) {
    var sec = buat('div', 'app-section');
    var grid = buat('div', 'moni-cards');
    grid.appendChild(kartu('Dispatch', ringkasan.counts.dispatch));
    grid.appendChild(kartu('Page Fault', ringkasan.counts.faults));
    grid.appendChild(kartu('Disk Ops', ringkasan.counts.diskOps));
    grid.appendChild(kartu('Fault Rate', persen(ringkasan.faultRate)));
    grid.appendChild(kartu('Rata-rata Seek', dua(ringkasan.avgSeek)));
    sec.appendChild(grid);
    return sec;
  }

  function bagianPerPid(ringkasan) {
    var sec = buat('div', 'app-section');
    sec.appendChild(buat('div', 'app-label', 'Per PID'));
    if (ringkasan.perPid.length === 0) {
      sec.appendChild(buat('div', 'empty', 'Belum ada data'));
      return sec;
    }
    var tabel = buat('table', 'app-table');
    tabel.appendChild(kepala(['PID', 'Dispatch', 'Page Fault']));
    var tbody = document.createElement('tbody');
    ringkasan.perPid.forEach(function (p) {
      var tr = document.createElement('tr');
      sel(tr, p.pid);
      sel(tr, p.dispatches);
      sel(tr, p.faults);
      tbody.appendChild(tr);
    });
    tabel.appendChild(tbody);
    sec.appendChild(tabel);
    return sec;
  }

  function bagianEventTerakhir() {
    var sec = buat('div', 'app-section');
    sec.appendChild(buat('div', 'app-label', '15 Event Terakhir'));
    if (events.length === 0) {
      sec.appendChild(buat('div', 'empty', 'Belum ada event'));
      return sec;
    }
    var tabel = buat('table', 'app-table');
    tabel.appendChild(kepala(['Tick', 'Event', 'PID', 'Detail']));
    var tbody = document.createElement('tbody');
    // Yang terbaru di atas
    var terakhir = events.slice(-15).reverse();
    terakhir.forEach(function (ev) {
      var tr = document.createElement('tr');
      sel(tr, ev.tick);
      sel(tr, ev.name);
      sel(tr, ev.detail && ev.detail.pid);
      sel(tr, teksDetail(ev));
      tbody.appendChild(tr);
    });
    tabel.appendChild(tbody);
    sec.appendChild(tabel);
    return sec;
  }

  function ambilStatus(id) {
    try {
      if (window.OS && typeof window.OS.getState === 'function') {
        return window.OS.getState(id);
      }
    } catch (e) { /* abaikan, anggap tidak tersedia */ }
    return null;
  }

  function bagianStatusAplikasi() {
    var sec = buat('div', 'app-section');
    sec.appendChild(buat('div', 'app-label', 'Status Aplikasi'));
    var tabel = buat('table', 'app-table');
    tabel.appendChild(kepala(['Aplikasi', 'Status']));
    var tbody = document.createElement('tbody');
    [['CPU', 'scheduler'], ['Memory', 'memory'], ['Disk', 'disk']].forEach(function (a) {
      var st = ambilStatus(a[1]);
      var tr = document.createElement('tr');
      sel(tr, a[0]);
      sel(tr, st === null || st === undefined ? 'tidak tersedia' : JSON.stringify(st));
      tbody.appendChild(tr);
    });
    tabel.appendChild(tbody);
    sec.appendChild(tabel);
    return sec;
  }

  function bagianTombol() {
    var sec = buat('div', 'app-section');
    var baris = buat('div', 'app-row');
    var b1 = buat('button', 'btn-primary', 'Export CSV');
    var b2 = buat('button', 'btn-secondary', 'Export Log');
    b1.type = 'button';
    b2.type = 'button';
    b1.addEventListener('click', exportCsv);
    b2.addEventListener('click', exportLog);
    baris.appendChild(b1);
    baris.appendChild(b2);
    sec.appendChild(baris);
    return sec;
  }

  // Gambar ulang dari state modul (state disimpan di variabel modul, bukan di DOM).
  function render() {
    if (!container) return;
    container.textContent = '';

    var hasil = window.MonitorLogic.summarize(events);
    var ringkasan = hasil.ok ? hasil.result : {
      counts: { dispatch: 0, faults: 0, diskOps: 0 },
      faultRate: 0, avgSeek: 0, perPid: []
    };

    container.appendChild(bagianKartu(ringkasan));
    container.appendChild(bagianPerPid(ringkasan));
    container.appendChild(bagianEventTerakhir());
    container.appendChild(bagianStatusAplikasi());
    container.appendChild(bagianTombol());
  }

  // ---------- Perekaman event (Tahap 4) ----------

  // Nilai tick saat ini dari shell; 0 bila tidak valid (supaya rekaman tetap lolos validasi logic.js)
  function tickSekarang() {
    var t = window.OS && window.OS.tick;
    return (typeof t === 'number' && isFinite(t) && Math.floor(t) === t && t >= 0) ? t : 0;
  }

  // Membuat pendengar untuk satu nama event. Didaftarkan sekali saat file dimuat.
  function rekam(nama) {
    window.addEventListener(nama, function (e) {
      try {
        var detail = (e && e.detail) || {};
        // pid wajib string (kontrak logic.js); bila tidak, abaikan event ini
        if (typeof detail.pid !== 'string') {
          window.kirimLog('Monitor', 'event ' + nama + ' diabaikan: pid bukan string');
          return;
        }
        events.push({ name: nama, tick: tickSekarang(), detail: detail });
        render();   // render() sendiri berhenti bila container === null
      } catch (err) {
        window.kirimLog('Monitor', 'error saat merekam ' + nama + ': ' + err.message);
      }
    });
  }

  rekam('os:dispatch');
  rekam('os:page-fault');
  rekam('os:disk-served');

  // Listener event os:* didaftarkan SEKALI di sini (bukan di mount),
  // supaya tetap berjalan walaupun jendela modul sedang ditutup.
  window.addEventListener('os:reset', function () {
    try {
      events = [];
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
    },
    unmount: function () { container = null; },
    // Ringkasan state sesuai kontrak: { events, counts: { dispatch, faults, diskOps } }
    getState: function () {
      var hasil = window.MonitorLogic.summarize(events);
      var c = hasil.ok ? hasil.result.counts : { dispatch: 0, faults: 0, diskOps: 0 };
      return {
        events: events.length,
        counts: { dispatch: c.dispatch, faults: c.faults, diskOps: c.diskOps }
      };
    },
  });
})();