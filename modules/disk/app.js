// modules/disk/app.js
// UI + event terintegrasi modul Disk Scheduling. Perhitungan ada di logic.js (DiskLogic).
(function () {
  'use strict';

  var ALGOS = ['FCFS', 'SSTF', 'SCAN'];
  var MAX_CYL = 199;
  var START_HEAD = 53;
  var MAX_QUEUE = 30;
  // Data klasik (Silberschatz) untuk Compare All
  var CLASSIC_QUEUE = [98, 183, 37, 122, 14, 124, 65, 67];

  var container = null; // elemen jendela saat terbuka, null saat tertutup

  // State disimpan di closure modul (bukan di DOM).
  var state = {
    algorithm: 'FCFS',
    head: START_HEAD,
    direction: 'up',
    totalSeek: 0,
    queue: [],            // [{ pid, page, cylinder }]
    path: [START_HEAD],   // titik yang pernah dikunjungi head
    message: '',          // pesan status/galat untuk pengguna
    inputText: '',        // isi kolom input manual
    compare: false        // tampilkan panel Compare All
  };

  function log(msg) {
    try { window.kirimLog('Disk', msg); } catch (e) { /* log tidak boleh merusak modul */ }
  }

  // Bungkus event handler agar error tidak merusak desktop.
  function safe(fn) {
    return function (ev) {
      try { fn(ev); } catch (e) { log('error: ' + e.message); }
    };
  }

  function resetState() {
    state.head = START_HEAD;
    state.direction = 'up';
    state.totalSeek = 0;
    state.queue = [];
    state.path = [START_HEAD];
    state.message = '';
    state.inputText = '';
    state.compare = false;
  }

  // ---------- helper DOM (textContent, jadi aman dari injeksi) ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function pct(cyl) {
    return (cyl / MAX_CYL) * 100;
  }

  function pathText(path) {
    if (path.length > 8) return '… → ' + path.slice(-8).join(' → ');
    return path.join(' → ');
  }

  // ---------- render ----------
  function render() {
    if (!container) return;
    container.textContent = '';

    // Pilihan algoritma
    var secAlgo = el('div', 'app-section');
    secAlgo.appendChild(el('div', 'app-label', 'Algoritma:'));
    var rowAlgo = el('div', 'app-row');
    ALGOS.forEach(function (a) {
      var b = el('button', 'btn-algo' + (state.algorithm === a ? ' active' : ''), a);
      b.addEventListener('click', safe(function () { setAlgorithm(a); }));
      rowAlgo.appendChild(b);
    });
    secAlgo.appendChild(rowAlgo);

    // Arah: hanya saat SCAN
    if (state.algorithm === 'SCAN') {
      var rowDir = el('div', 'app-row disk-dir-row');
      rowDir.appendChild(el('span', 'app-label', 'Arah:'));
      var sel = el('select', 'disk-select');
      ['up', 'down'].forEach(function (d) {
        var o = el('option', '', d);
        o.value = d;
        if (state.direction === d) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', safe(function () { setDirection(sel.value); }));
      rowDir.appendChild(sel);
      secAlgo.appendChild(rowDir);
    }
    container.appendChild(secAlgo);

    // Visualisasi head 0 .. maxCylinder
    var secTrack = el('div', 'app-section');
    secTrack.appendChild(el('div', 'app-label', 'Visualisasi Head (0 - ' + MAX_CYL + '):'));
    var track = el('div', 'disk-track');
    state.queue.forEach(function (r) {
      var dot = el('div', 'disk-dot');
      dot.style.left = pct(r.cylinder) + '%';
      dot.title = 'Request silinder ' + r.cylinder;
      track.appendChild(dot);
    });
    var head = el('div', 'disk-head');
    head.style.left = pct(state.head) + '%';
    head.title = 'Head: ' + state.head;
    track.appendChild(head);
    secTrack.appendChild(track);
    var scale = el('div', 'disk-scale');
    scale.appendChild(el('span', '', '0'));
    scale.appendChild(el('span', '', 'Head: ' + state.head));
    scale.appendChild(el('span', '', String(MAX_CYL)));
    secTrack.appendChild(scale);
    container.appendChild(secTrack);

    // Total seek + jalur
    var secStat = el('div', 'app-section disk-stat');
    var seekLabel = el('div', 'app-label', 'Total Seek: ');
    seekLabel.appendChild(el('strong', 'disk-seek', String(state.totalSeek)));
    secStat.appendChild(seekLabel);
    var pathLabel = el('div', 'app-label', 'Jalur: ');
    pathLabel.appendChild(el('span', 'disk-path', pathText(state.path)));
    secStat.appendChild(pathLabel);
    container.appendChild(secStat);

    // Tabel antrean
    var secQ = el('div', 'app-section');
    secQ.appendChild(el('div', 'app-label', 'Antrean Request (' + state.queue.length + '/' + MAX_QUEUE + '):'));
    var table = el('table', 'app-table');
    var thead = el('thead');
    var hr = el('tr');
    ['#', 'Page', 'PID', 'Cylinder'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    if (state.queue.length === 0) {
      var er = el('tr');
      var ec = el('td', 'empty', '(antrean kosong)');
      ec.colSpan = 4;
      er.appendChild(ec);
      tbody.appendChild(er);
    } else {
      state.queue.forEach(function (r, i) {
        var tr = el('tr');
        [i + 1, r.page, r.pid, r.cylinder].forEach(function (v) { tr.appendChild(el('td', '', String(v))); });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    secQ.appendChild(table);
    container.appendChild(secQ);

    // Input manual
    var secIn = el('div', 'app-section');
    secIn.appendChild(el('div', 'app-label', 'Tambah request manual (silinder dipisah koma):'));
    var rowIn = el('div', 'app-row');
    var input = el('input', 'disk-input');
    input.type = 'text';
    input.placeholder = 'contoh: 98, 183, 37';
    input.value = state.inputText;
    input.addEventListener('input', function () { state.inputText = input.value; });
    input.addEventListener('keydown', safe(function (ev) { if (ev.key === 'Enter') addManual(); }));
    var addBtn = el('button', 'btn-secondary', 'Tambah');
    addBtn.addEventListener('click', safe(addManual));
    rowIn.appendChild(input);
    rowIn.appendChild(addBtn);
    secIn.appendChild(rowIn);
    container.appendChild(secIn);

    // Pesan status
    if (state.message) container.appendChild(el('div', 'disk-msg', state.message));

    // Tombol utama
    var svc = el('button', 'btn-primary', 'Service Next');
    svc.addEventListener('click', safe(serviceNext));
    container.appendChild(svc);

    var rowBtn = el('div', 'app-section app-row');
    var resetBtn = el('button', 'btn-secondary', 'Reset');
    resetBtn.addEventListener('click', safe(doReset));
    var cmpBtn = el('button', 'btn-secondary', 'Compare All');
    cmpBtn.addEventListener('click', safe(toggleCompare));
    rowBtn.appendChild(resetBtn);
    rowBtn.appendChild(cmpBtn);
    container.appendChild(rowBtn);

    if (state.compare) container.appendChild(buildCompare());
  }

  // Panel Compare All: data klasik, tidak mengubah simulasi aktif.
  function buildCompare() {
    var sec = el('div', 'app-section disk-compare');
    sec.appendChild(el('div', 'app-label',
      'Perbandingan (head ' + START_HEAD + ', SCAN arah up, antrean: ' + CLASSIC_QUEUE.join(', ') + ')'));

    var results = [];
    for (var i = 0; i < ALGOS.length; i++) {
      var r = window.DiskLogic.run({
        algorithm: ALGOS[i], head: START_HEAD, maxCylinder: MAX_CYL,
        direction: 'up', queue: CLASSIC_QUEUE
      });
      if (!r.ok) {
        sec.appendChild(el('div', 'disk-msg', r.error.message));
        return sec;
      }
      results.push(r.result);
    }
    var best = Math.min.apply(null, results.map(function (x) { return x.totalSeek; }));

    var table = el('table', 'app-table');
    var thead = el('thead');
    var hr = el('tr');
    ['Algoritma', 'Total Seek', ''].forEach(function (h) { hr.appendChild(el('th', '', h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    results.forEach(function (x) {
      var isBest = x.totalSeek === best;
      var tr = el('tr', isBest ? 'disk-best' : '');
      tr.appendChild(el('td', '', x.algorithm));
      tr.appendChild(el('td', '', String(x.totalSeek)));
      tr.appendChild(el('td', '', isBest ? '✓ terkecil' : ''));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    sec.appendChild(table);

    results.forEach(function (x) {
      var line = el('div', 'disk-compare-path');
      line.appendChild(el('strong', '', x.algorithm + ': '));
      line.appendChild(el('span', 'disk-path', [START_HEAD].concat(x.order).join(' → ')));
      sec.appendChild(line);
    });
    return sec;
  }

  // ---------- aksi ----------
  function setAlgorithm(a) {
    state.algorithm = a;
    state.message = '';
    log('algoritma → ' + a);
    render();
  }

  function setDirection(d) {
    state.direction = d;
    log('arah SCAN → ' + d);
    render();
  }

  function toggleCompare() {
    state.compare = !state.compare;
    if (state.compare) log('Compare All ditampilkan');
    render();
  }

  function doReset() {
    // Reset resmi lewat shell; shell mengirim os:reset yang ditangani listener di bawah.
    if (window.OS && typeof window.OS.reset === 'function') {
      window.OS.reset();
    } else {
      resetState();
      render();
    }
  }

  // Ubah teks "98, 183" menjadi daftar silinder yang valid.
  function parseCylinders(text) {
    var parts = String(text).split(',');
    var list = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p === '') continue;
      if (!/^\d+$/.test(p)) return { error: '"' + p + '" bukan angka silinder yang valid' };
      var n = Number(p);
      if (n > MAX_CYL) return { error: 'silinder ' + n + ' melebihi batas ' + MAX_CYL };
      list.push(n);
    }
    if (list.length === 0) return { error: 'masukkan minimal satu angka silinder' };
    return { list: list };
  }

  function addManual() {
    var parsed = parseCylinders(state.inputText);
    if (parsed.error) {
      state.message = parsed.error;
      render();
      return;
    }
    if (state.queue.length + parsed.list.length > MAX_QUEUE) {
      state.message = 'antrean maksimal ' + MAX_QUEUE + ' request';
      render();
      return;
    }
    parsed.list.forEach(function (c) {
      state.queue.push({ pid: '-', page: '-', cylinder: c });
    });
    state.message = '';
    state.inputText = '';
    log('request manual masuk antrean: ' + parsed.list.join(', ') + ' (total ' + state.queue.length + ')');
    render();
  }

  function serviceNext() {
    var res = window.DiskLogic.next({
      algorithm: state.algorithm,
      head: state.head,
      maxCylinder: MAX_CYL,
      direction: state.direction,
      queue: state.queue.map(function (r) { return r.cylinder; })
    });

    if (!res.ok) {
      state.message = res.error.message;
      log('error: ' + res.error.message);
      render();
      return;
    }

    var r = res.result;
    if (r.done) {
      state.message = 'Antrean kosong';
      log('antrean kosong, tidak ada request untuk dilayani');
      render();
      return;
    }

    state.message = '';
    state.head = r.newHead;
    state.direction = r.newDirection;
    state.totalSeek += r.seek;
    state.path.push(r.target);

    if (r.isRequest) {
      var idx = -1;
      for (var i = 0; i < state.queue.length; i++) {
        if (state.queue[i].cylinder === r.target) { idx = i; break; }
      }
      var req = idx >= 0 ? state.queue.splice(idx, 1)[0] : { pid: '-', page: '-' };
      // Urutan wajib: kirim event dulu, baru kirimLog.
      window.dispatchEvent(new CustomEvent('os:disk-served', {
        detail: { pid: req.pid, page: req.page, target: r.target, seek: r.seek }
      }));
      log(state.algorithm + ' → layani page ' + req.page + ' (' + req.pid + '), head=' + r.target + ', seek=' + r.seek);
    } else {
      // Gerak ke ujung SCAN: bukan request, tidak mengirim os:disk-served.
      log('SCAN → head ke ujung ' + r.target + ', seek=' + r.seek + ', arah berbalik ' + r.newDirection);
    }
    render();
  }

  // ---------- event terintegrasi (didaftarkan SEKALI saat file dimuat) ----------
  window.addEventListener('os:page-fault', function (e) {
    try {
      var d = (e && e.detail) || {};
      var cyl = Math.min(d.page * 10, MAX_CYL);
      if (!Number.isInteger(cyl) || cyl < 0) {
        log('page-fault diabaikan: page tidak valid');
        return;
      }
      if (state.queue.length >= MAX_QUEUE) {
        log('antrean penuh (' + MAX_QUEUE + '), request page ' + d.page + ' ditolak');
        return;
      }
      var pid = d.pid === undefined || d.pid === null ? '-' : d.pid;
      state.queue.push({ pid: pid, page: d.page, cylinder: cyl });
      log('page fault ' + pid + ' page ' + d.page + ' → request silinder ' + cyl + ' masuk antrean');
      render();
    } catch (err) {
      log('error saat menerima page-fault: ' + err.message);
    }
  });

  window.addEventListener('os:reset', function () {
    try {
      resetState(); // algoritma pilihan pengguna tetap dipertahankan
      render();
    } catch (err) {
      log('error saat reset: ' + err.message);
    }
  });

  window.registerApp({
    id: 'disk',
    title: 'Disk Scheduling',
    width: 600,
    height: 460,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
    mount: function (el) {
      container = el;
      render();
    },
    unmount: function () { container = null; },
    getState: function () {
      return {
        algorithm: state.algorithm,
        head: state.head,
        direction: state.direction,
        totalSeek: state.totalSeek,
        queue: state.queue.map(function (r) { return r.cylinder; })
      };
    }
  });
})();
