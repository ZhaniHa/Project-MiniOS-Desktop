// modules/cpu/app.js (Tahap 3: UI CPU Scheduler)
(function () {
  'use strict';

  var ALGORITMA = ['FCFS', 'SJF', 'RR'];
  var DEFAULT_INPUT = 'P1:6, P2:3, P3:8, P4:2';
  var WARNA = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#14b8a6', '#6366f1'];

  var container = null;   // elemen jendela saat terbuka, null saat tertutup
  var state = null;       // state modul (disimpan di closure, bukan di DOM)

  // ---------- Util ----------

  function log(pesan) {
    try { window.kirimLog('CPU', pesan); } catch (e) { /* log tidak boleh merusak UI */ }
  }

  // Bungkus handler dengan try...catch
  function guard(fn) {
    return function (ev) {
      try { fn(ev); } catch (e) { log('error: ' + e.message); }
    };
  }

  // Buat elemen; teks selalu lewat textContent (otomatis aman dari injeksi HTML)
  function el(tag, cls, teks) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (teks !== undefined && teks !== null) n.textContent = String(teks);
    return n;
  }

  function fmt(n) { return n.toFixed(2); }

  // ---------- State ----------

  function stateAwal() {
    return {
      algorithm: 'FCFS',
      quantumText: '2',
      inputText: DEFAULT_INPUT,
      processes: [],    // hasil parse input
      gantt: [],        // hasil CpuLogic.run
      perProcess: [],
      pointer: 0,       // jumlah entri gantt yang sudah di-dispatch
      error: '',        // pesan error untuk ditampilkan
      compare: null     // hasil Compare All (null = belum dijalankan)
    };
  }

  // ---------- Parsing input (dilakukan di app.js sesuai spesifikasi) ----------

  function angka(s) {
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  // Format: "Nama:Burst" atau "Nama:Burst:Arrival", dipisah koma
  function parseInput(teks) {
    var potongan = String(teks).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var hasil = [];
    for (var i = 0; i < potongan.length; i++) {
      var bagian = potongan[i].split(':').map(function (s) { return s.trim(); });
      if (bagian.length < 2 || bagian.length > 3) {
        return { ok: false, message: 'format salah pada "' + potongan[i] + '", gunakan Nama:Burst atau Nama:Burst:Arrival' };
      }
      var burst = angka(bagian[1]);
      if (isNaN(burst)) {
        return { ok: false, message: 'burst "' + bagian[1] + '" pada ' + bagian[0] + ' bukan angka' };
      }
      var p = { pid: bagian[0], burst: burst };
      if (bagian.length === 3) {
        var arrival = angka(bagian[2]);
        if (isNaN(arrival)) {
          return { ok: false, message: 'arrival "' + bagian[2] + '" pada ' + bagian[0] + ' bukan angka' };
        }
        p.arrival = arrival;
      }
      hasil.push(p);
    }
    return { ok: true, processes: hasil }; // daftar kosong ditolak oleh CpuLogic (EMPTY_INPUT)
  }

  // ---------- Hitung ulang (muat data / ganti algoritma / quantum) ----------

  function setError(pesan) {
    state.error = pesan;
    state.gantt = [];
    state.perProcess = [];
    state.pointer = 0;
  }

  // alasan = teks log; null = diam (dipakai saat inisialisasi)
  function recalc(alasan) {
    state.compare = null;
    state.pointer = 0;
    state.error = '';

    var parsed = parseInput(state.inputText);
    if (!parsed.ok) {
      state.processes = [];
      setError(parsed.message);
      if (alasan) log('input tidak valid: ' + parsed.message);
      return;
    }
    state.processes = parsed.processes;

    var res = window.CpuLogic.run({
      algorithm: state.algorithm,
      quantum: Number(state.quantumText),
      processes: state.processes
    });
    if (!res.ok) {
      setError(res.error.message);
      if (alasan) log('gagal: ' + res.error.message);
      return;
    }
    state.gantt = res.result.gantt;
    state.perProcess = res.result.perProcess;
    if (alasan) {
      log(alasan + ' (' + state.algorithm + ', ' + state.processes.length + ' proses, ' + state.gantt.length + ' langkah)');
    }
  }

  function resetState() {
    state = stateAwal();
    recalc(null);
  }

  // ---------- Aksi ----------

  function pilihAlgoritma(a) {
    state.algorithm = a;
    recalc('algoritma diganti ke ' + a);
    render();
  }

  function muatData() {
    recalc('data dimuat');
    render();
  }

    function dispatch() {
    var total = state.gantt.length;
    if (total === 0) {
      log('tidak ada proses untuk di-dispatch');
      return;
    }
    if (state.pointer >= total) {
      log('semua proses selesai');
      return;
    }
    var g = state.gantt[state.pointer];
    state.pointer++;

    // Urutan wajib: kirim event DULU, baru kirimLog.
    // Dikirim walaupun modul lain belum dibuka (event tanpa pendengar tidak berbahaya).
    window.dispatchEvent(new CustomEvent('os:dispatch', {
      detail: { pid: g.pid, start: g.start, end: g.end }
    }));
    log('dispatch ' + g.pid + ' t=' + g.start + '-' + g.end + ' [' + state.algorithm + ']');
    render();
  }

  function tekanReset() {
    // Spesifikasi: tombol Reset memanggil OS.reset(); shell mengirim os:reset ke semua app.
    if (window.OS && typeof window.OS.reset === 'function') {
      window.OS.reset();
    } else {
      resetState();
      log('reset ke state awal');
      render();
    }
  }

  function compareAll() {
    if (state.error && state.processes.length === 0) {
      state.compare = [{ algo: '-', ok: false, message: state.error }];
    } else {
      state.compare = ALGORITMA.map(function (a) {
        var res = window.CpuLogic.run({
          algorithm: a,
          quantum: Number(state.quantumText),
          processes: state.processes
        });
        if (!res.ok) return { algo: a, ok: false, message: res.error.message };
        return { algo: a, ok: true, avgWaiting: res.result.avgWaiting, avgTurnaround: res.result.avgTurnaround };
      });
    }
    log('Compare All dijalankan');
    render();
  }

  // ---------- Render ----------

  // Hitung sisa burst dan status tiap proses berdasarkan langkah yang sudah jalan
  function hitungStatus() {
    var terakhir = {};   // indeks gantt terakhir tiap pid
    var dijalankan = {}; // total durasi yang sudah dieksekusi tiap pid
    state.gantt.forEach(function (g, i) {
      terakhir[g.pid] = i;
      if (i < state.pointer) dijalankan[g.pid] = (dijalankan[g.pid] || 0) + (g.end - g.start);
    });
    return { terakhir: terakhir, dijalankan: dijalankan };
  }

  function render() {
    if (!container) return;
    container.textContent = '';

    // --- Algoritma + quantum ---
    var secAlgo = el('div', 'app-section');
    secAlgo.appendChild(el('div', 'app-label', 'Algoritma:'));
    var rowAlgo = el('div', 'app-row cpu-row');
    ALGORITMA.forEach(function (a) {
      var b = el('button', 'btn-algo' + (state.algorithm === a ? ' active' : ''), a);
      b.addEventListener('click', guard(function () { pilihAlgoritma(a); }));
      rowAlgo.appendChild(b);
    });
    if (state.algorithm === 'RR') {
      rowAlgo.appendChild(el('span', 'app-label cpu-inline-label', 'Quantum:'));
      var q = el('input', 'cpu-input cpu-quantum');
      q.type = 'number';
      q.min = '1';
      q.value = state.quantumText;
      q.addEventListener('input', guard(function () { state.quantumText = q.value; }));
      q.addEventListener('change', guard(function () { state.quantumText = q.value; recalc('quantum diubah'); render(); }));
      rowAlgo.appendChild(q);
    }
    secAlgo.appendChild(rowAlgo);
    container.appendChild(secAlgo);

    // --- Input proses ---
    var secIn = el('div', 'app-section');
    secIn.appendChild(el('div', 'app-label', 'Input proses (Nama:Burst atau Nama:Burst:Arrival, pisahkan dengan koma):'));
    var rowIn = el('div', 'app-row cpu-row');
    var inp = el('input', 'cpu-input cpu-input-procs');
    inp.type = 'text';
    inp.value = state.inputText;
    inp.addEventListener('input', guard(function () { state.inputText = inp.value; }));
    inp.addEventListener('keydown', guard(function (ev) { if (ev.key === 'Enter') muatData(); }));
    rowIn.appendChild(inp);
    var btnLoad = el('button', 'btn-secondary', 'Load Data');
    btnLoad.addEventListener('click', guard(muatData));
    rowIn.appendChild(btnLoad);
    secIn.appendChild(rowIn);
    if (state.error) secIn.appendChild(el('div', 'cpu-error', state.error));
    container.appendChild(secIn);

    // --- Tabel antrean ---
    var secTab = el('div', 'app-section');
    secTab.appendChild(el('div', 'app-label', 'Antrean proses:'));
    var table = el('table', 'app-table');
    var headRow = el('tr');
    ['PID', 'Arrival', 'Burst', 'Sisa', 'Status'].forEach(function (h) { headRow.appendChild(el('th', null, h)); });
    var thead = el('thead');
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el('tbody');
    if (state.perProcess.length === 0) {
      var trKosong = el('tr');
      var tdKosong = el('td', 'empty', '(antrean kosong)');
      tdKosong.colSpan = 5;
      trKosong.appendChild(tdKosong);
      tbody.appendChild(trKosong);
    } else {
      var st = hitungStatus();
      state.perProcess.forEach(function (p) {
        var sisa = p.burst - (st.dijalankan[p.pid] || 0);
        var selesai = st.terakhir[p.pid] < state.pointer;
        var tr = el('tr');
        [p.pid, p.arrival, p.burst, sisa, selesai ? 'Selesai' : 'Menunggu'].forEach(function (v) {
          tr.appendChild(el('td', null, v));
        });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    secTab.appendChild(table);
    container.appendChild(secTab);

    // --- Gantt ---
    var secG = el('div', 'app-section');
    secG.appendChild(el('div', 'app-label', 'Gantt (urutan dispatch):'));
    var gantt = el('div', 'cpu-gantt');
    if (state.pointer === 0) {
      gantt.appendChild(el('span', 'empty', '— belum ada dispatch —'));
    } else {
      for (var i = 0; i < state.pointer; i++) {
        var g = state.gantt[i];
        var idx = state.perProcess.findIndex(function (p) { return p.pid === g.pid; });
        var blok = el('div', 'gantt-block', g.pid);
        blok.style.flexGrow = String(g.end - g.start);   // lebar sebanding durasi
        blok.style.background = WARNA[(idx < 0 ? 0 : idx) % WARNA.length];
        blok.title = g.pid + ' · t=' + g.start + '–' + g.end;
        gantt.appendChild(blok);
      }
    }
    secG.appendChild(gantt);
    if (state.pointer > 0) {
      var last = state.gantt[state.pointer - 1];
      secG.appendChild(el('div', 'cpu-note', 'Terakhir: ' + last.pid + ' (t=' + last.start + '–' + last.end + ')'));
    }
    container.appendChild(secG);

    // --- Tombol aksi ---
    var secBtn = el('div', 'app-section app-row cpu-row');
    var bDisp = el('button', 'btn-primary', 'Dispatch');
    bDisp.disabled = state.gantt.length === 0;
    bDisp.addEventListener('click', guard(dispatch));
    secBtn.appendChild(bDisp);
    var bReset = el('button', 'btn-secondary', 'Reset');
    bReset.addEventListener('click', guard(tekanReset));
    secBtn.appendChild(bReset);
    var bCmp = el('button', 'btn-secondary', 'Compare All');
    bCmp.addEventListener('click', guard(compareAll));
    secBtn.appendChild(bCmp);
    secBtn.appendChild(el('div', 'cpu-spacer'));
    var stt = hitungStatus();
    var selesaiList = state.perProcess.filter(function (p) { return stt.terakhir[p.pid] < state.pointer; })
      .map(function (p) { return p.pid; });
    secBtn.appendChild(el('div', 'app-label cpu-done',
      'Langkah ' + state.pointer + '/' + state.gantt.length + ' · Selesai: ' + (selesaiList.join(', ') || '—')));
    container.appendChild(secBtn);

    // --- Hasil Compare All ---
    if (state.compare) {
      var secC = el('div', 'app-section');
      secC.appendChild(el('div', 'app-label', 'Compare All (data yang sama):'));
      var tc = el('table', 'app-table');
      var hr = el('tr');
      ['Algoritma', 'Avg Waiting', 'Avg Turnaround', ''].forEach(function (h) { hr.appendChild(el('th', null, h)); });
      var th = el('thead');
      th.appendChild(hr);
      tc.appendChild(th);
      var tb = el('tbody');
      var terbaik = Infinity;
      state.compare.forEach(function (r) { if (r.ok && r.avgWaiting < terbaik) terbaik = r.avgWaiting; });
      state.compare.forEach(function (r) {
        var tr = el('tr');
        if (!r.ok) {
          tr.appendChild(el('td', null, r.algo));
          var tdE = el('td', 'cpu-error', r.message);
          tdE.colSpan = 3;
          tr.appendChild(tdE);
        } else {
          var best = r.avgWaiting === terbaik;
          if (best) tr.className = 'cpu-best';
          tr.appendChild(el('td', null, r.algo));
          tr.appendChild(el('td', null, fmt(r.avgWaiting)));
          tr.appendChild(el('td', null, fmt(r.avgTurnaround)));
          tr.appendChild(el('td', null, best ? '✓' : ''));
        }
        tb.appendChild(tr);
      });
      tc.appendChild(tb);
      secC.appendChild(tc);
      secC.appendChild(el('div', 'cpu-note', 'RR memakai quantum = ' + state.quantumText + '. Terbaik = avgWaiting terkecil.'));
      container.appendChild(secC);
    }
  }

  // ---------- Integrasi shell ----------

  // Listener os:* didaftarkan SEKALI di sini (bukan di mount),
  // supaya tetap berjalan walaupun jendela modul sedang ditutup.
  window.addEventListener('os:reset', function () {
    try {
      resetState();
      log('reset ke state awal');
      render();
    } catch (e) {
      window.kirimLog('CPU', 'error saat reset: ' + e.message);
    }
  });

  resetState(); // muat data default sekali saat file dimuat

  window.registerApp({
    id: 'scheduler',
    title: 'Scheduler (CPU)',
    width: 560,
    height: 420,
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>',
    mount: function (el_) {
      container = el_;
      render();
    },
    unmount: function () { container = null; },
        // Ringkasan state untuk Monitor dan tes integrasi (JSON sederhana).
    getState: function () {
      var q = Number(state.quantumText);
      var st = hitungStatus();
      return {
        algorithm: state.algorithm,
        quantum: (Number.isInteger(q) && q >= 1) ? q : null,
        pointer: state.pointer,            // jumlah langkah yang sudah di-dispatch
        total: state.gantt.length,         // jumlah langkah gantt seluruhnya
        done: state.perProcess            // pid yang sudah selesai
          .filter(function (p) { return st.terakhir[p.pid] < state.pointer; })
          .map(function (p) { return p.pid; })
      };
    }
  });
})();