// modules/memory/app.js — Tahap 4: UI + integrasi event.
// Dengar os:dispatch (maju 1 langkah), kirim os:page-fault saat FAULT,
// dengar os:reset, sediakan getState(). logic.js tetap murni.
(function () {
  'use strict';

  var ALGOS = ['FIFO', 'LRU', 'OPTIMAL'];
  var DEFAULTS = {
    algorithm: 'FIFO',
    frameCap: 4,
    refsText: '7,0,1,2,0,3,0,4,2,3,0,3,2'
  };

  // Elemen jendela saat terbuka; null saat ditutup.
  var container = null;

  // State modul (closure, bukan DOM).
  var state = {
    algorithm: DEFAULTS.algorithm,
    frameCap: DEFAULTS.frameCap,
    refsText: DEFAULTS.refsText,
    refs: [],
    steps: [],
    pointer: 0,
    faults: 0,
    hits: 0,
    error: null,
    exhausted: false,
    compareOpen: false,
    compareResult: null
  };

  // ---------- util ----------
  // Parse "7, 0, 1, ..." → [7,0,1,...]; null bila tidak valid. Trailing comma diizinkan.
  function parseRefsText(text) {
    if (typeof text !== 'string') return null;
    var parts = text.split(',');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t === '') {
        if (i === parts.length - 1) continue;
        return null;
      }
      if (!/^\d+$/.test(t)) return null;
      out.push(parseInt(t, 10));
    }
    if (out.length === 0) return null;
    return out;
  }

  function formatRatio(r) {
    return String(Number(r.toFixed(3)));
  }

  // ---------- state ops ----------
  function clearDisplay() {
    state.refs = [];
    state.steps = [];
    state.pointer = 0;
    state.faults = 0;
    state.hits = 0;
    state.exhausted = false;
    state.compareOpen = false;
    state.compareResult = null;
  }

  // Jalankan ulang simulasi dari input saat ini. true bila sukses.
  function rebuild() {
    state.error = null;
    state.compareOpen = false;
    state.compareResult = null;

    if (!window.MemoryLogic) {
      state.error = 'MemoryLogic belum dimuat';
      clearDisplay();
      return false;
    }

    var refs = parseRefsText(state.refsText);
    if (!refs) {
      state.error = 'refString tidak valid: hanya angka >= 0, dipisah koma.';
      clearDisplay();
      return false;
    }

    var res = window.MemoryLogic.run({
      algorithm: state.algorithm,
      frames: state.frameCap,
      refString: refs
    });

    if (!res.ok) {
      state.error = res.error.message;
      clearDisplay();
      return false;
    }

    state.refs = refs;
    state.steps = res.result.steps;
    state.pointer = 0;
    state.faults = 0;
    state.hits = 0;
    state.exhausted = false;
    return true;
  }

  function resetState() {
    state.algorithm = DEFAULTS.algorithm;
    state.frameCap = DEFAULTS.frameCap;
    state.refsText = DEFAULTS.refsText;
    rebuild();
  }

  // Maju satu referensi.
  // pid: '-' untuk mode mandiri; string PID untuk mode terintegrasi (os:dispatch).
  // Mengembalikan step yang diproses, atau null bila tidak ada / sudah habis.
  function advance(pid) {
    if (state.steps.length === 0) return null;

    if (state.pointer >= state.steps.length) {
      // Sudah habis: abaikan tanpa log ulang (log "habis" sudah dikirim sekali).
      return null;
    }

    var step = state.steps[state.pointer];
    state.pointer++;
    if (step.fault) state.faults++;
    else state.hits++;

    // Urutan wajib: kirim event dulu, baru kirimLog untuk langkah yang sama.
    if (step.fault) {
      window.dispatchEvent(new CustomEvent('os:page-fault', {
        detail: { pid: pid === '-' ? '-' : pid, page: step.ref }
      }));
    }

    // Bangun pesan log.
    var msg = 'ref ' + step.ref;
    if (pid && pid !== '-') msg += ' (' + pid + ')';
    msg += ' → ' + (step.fault ? 'FAULT' : 'HIT');
    if (step.fault && step.evicted !== null && step.evicted !== undefined) {
      msg += ', evict ' + step.evicted;
    }
    window.kirimLog('Memory', msg);

    // Tepat setelah langkah terakhir: tandai habis + log sekali.
    if (state.pointer >= state.steps.length && !state.exhausted) {
      state.exhausted = true;
      window.kirimLog('Memory', 'referensi habis');
    }

    return step;
  }

  // ---------- Compare All ----------
  function runCompare() {
    if (state.refs.length === 0) return null;
    var rows = [];
    var minFaults = Infinity;
    for (var i = 0; i < ALGOS.length; i++) {
      var a = ALGOS[i];
      var res = window.MemoryLogic.run({
        algorithm: a,
        frames: state.frameCap,
        refString: state.refs
      });
      if (!res.ok) continue;
      rows.push({
        algo: a,
        faults: res.result.faults,
        hits: res.result.hits,
        hitRatio: res.result.hitRatio,
        best: false
      });
      if (res.result.faults < minFaults) minFaults = res.result.faults;
    }
    rows.forEach(function (r) { r.best = r.faults === minFaults; });
    return { rows: rows };
  }

  // ---------- render ----------
  function buildCompareBox(cmp) {
    var box = document.createElement('div');
    box.className = 'app-section mem-compare-box';

    var title = document.createElement('div');
    title.className = 'app-label';
    title.textContent = 'Perbandingan algoritma (refString & frames saat ini):';
    box.appendChild(title);

    var table = document.createElement('table');
    table.className = 'app-table';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    ['Algoritma', 'Faults', 'Hits', 'Hit ratio'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    cmp.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.best) tr.className = 'mem-best';

      var tdA = document.createElement('td');
      tdA.textContent = r.algo + (r.best ? ' ✓' : '');
      var tdF = document.createElement('td');
      tdF.textContent = String(r.faults);
      var tdH = document.createElement('td');
      tdH.textContent = String(r.hits);
      var tdR = document.createElement('td');
      tdR.textContent = formatRatio(r.hitRatio);

      tr.appendChild(tdA);
      tr.appendChild(tdF);
      tr.appendChild(tdH);
      tr.appendChild(tdR);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);

    var note = document.createElement('div');
    note.className = 'app-label mem-compare-note';
    note.textContent =
      'Dihitung dari simulasi bersih pada refString dan frames saat ini ' +
      '(tidak mengubah state).';
    box.appendChild(note);

    return box;
  }

  function render() {
    if (!container) return;
    container.textContent = '';

    // ----- Pilihan algoritma -----
    var algoSection = document.createElement('div');
    algoSection.className = 'app-section';

    var algoLabel = document.createElement('div');
    algoLabel.className = 'app-label';
    algoLabel.textContent = 'Algoritma:';
    algoSection.appendChild(algoLabel);

    var algoRow = document.createElement('div');
    algoRow.className = 'app-row';
    ALGOS.forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-algo' + (state.algorithm === a ? ' active' : '');
      btn.textContent = a;
      btn.addEventListener('click', function () {
        if (state.algorithm !== a) {
          state.algorithm = a;
          window.kirimLog('Memory', 'algoritma → ' + a);
        }
        rebuild();
        render();
      });
      algoRow.appendChild(btn);
    });
    algoSection.appendChild(algoRow);
    container.appendChild(algoSection);

    // ----- Input frames & refString -----
    var inputSection = document.createElement('div');
    inputSection.className = 'app-section';

    var inputRow = document.createElement('div');
    inputRow.className = 'app-row mem-input-row';

    var frameLbl = document.createElement('label');
    frameLbl.className = 'app-label mem-label';
    frameLbl.appendChild(document.createTextNode('Frame: '));
    var frameInput = document.createElement('input');
    frameInput.type = 'number';
    frameInput.min = '1';
    frameInput.max = '10';
    frameInput.value = String(state.frameCap);
    frameInput.className = 'mem-input mem-input-frame';
    frameInput.addEventListener('change', function () {
      var n = parseInt(frameInput.value, 10);
      if (isNaN(n) || n < 1 || n > 10) {
        state.error = 'frames harus bilangan bulat antara 1 dan 10';
        clearDisplay();
        render();
        return;
      }
      state.frameCap = n;
      rebuild();
      render();
    });
    frameLbl.appendChild(frameInput);
    inputRow.appendChild(frameLbl);

    var refsLbl = document.createElement('label');
    refsLbl.className = 'app-label mem-label mem-label-refs';
    refsLbl.appendChild(document.createTextNode('RefString: '));
    var refsInput = document.createElement('input');
    refsInput.type = 'text';
    refsInput.value = state.refsText;
    refsInput.className = 'mem-input mem-input-refs';
    refsInput.addEventListener('change', function () {
      state.refsText = refsInput.value;
      rebuild();
      render();
    });
    refsLbl.appendChild(refsInput);
    inputRow.appendChild(refsLbl);

    inputSection.appendChild(inputRow);

    if (state.error) {
      var errEl = document.createElement('div');
      errEl.className = 'mem-error';
      errEl.textContent = state.error;
      inputSection.appendChild(errEl);
    }

    container.appendChild(inputSection);

    // ----- Tampilan frame + info langkah -----
    var frameSection = document.createElement('div');
    frameSection.className = 'app-section';

    var frameTitle = document.createElement('div');
    frameTitle.className = 'app-label';
    frameTitle.textContent = 'Frame (' + state.frameCap + ' slot):';
    frameSection.appendChild(frameTitle);

    var framesEl = document.createElement('div');
    framesEl.className = 'frames';
    var currentFrames = state.pointer > 0 ? state.steps[state.pointer - 1].frames : [];
    for (var i = 0; i < state.frameCap; i++) {
      var slot = document.createElement('div');
      slot.className = 'frame';
      if (i < currentFrames.length) {
        slot.classList.add('filled');
        slot.textContent = 'pg ' + currentFrames[i];
      } else {
        slot.textContent = '—';
      }
      framesEl.appendChild(slot);
    }
    frameSection.appendChild(framesEl);

    var infoEl = document.createElement('div');
    infoEl.className = 'mem-step-info';
    if (state.pointer > 0) {
      var cur = state.steps[state.pointer - 1];
      if (cur.fault) infoEl.classList.add('mem-fault');
      else infoEl.classList.add('mem-hit');
      var bits = [];
      bits.push('langkah ' + state.pointer + '/' + state.steps.length);
      bits.push('ref = ' + cur.ref);
      bits.push(cur.fault ? 'FAULT' : 'HIT');
      if (cur.evicted !== null && cur.evicted !== undefined) {
        bits.push('evict = ' + cur.evicted);
      }
      infoEl.textContent = bits.join(' · ');
    } else {
      infoEl.textContent = 'belum ada langkah — klik Next Reference';
    }
    frameSection.appendChild(infoEl);

    container.appendChild(frameSection);

    // ----- Counter + tombol -----
    var ctrl = document.createElement('div');
    ctrl.className = 'app-section mem-controls';

    var counters = document.createElement('div');
    counters.className = 'app-label mem-counters';
    counters.innerHTML =
      'Page fault: <strong>' + state.faults + '</strong> · ' +
      'Hit: <strong>' + state.hits + '</strong> · ' +
      'Langkah: <strong>' + state.pointer + '</strong>/' + state.steps.length;
    ctrl.appendChild(counters);

    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    ctrl.appendChild(spacer);

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', function () {
      if (window.OS && typeof window.OS.reset === 'function') {
        window.OS.reset();
      } else {
        resetState();
        render();
      }
    });
    ctrl.appendChild(resetBtn);

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-primary';
    nextBtn.textContent = 'Next Reference';
    if (state.error || state.steps.length === 0) {
      nextBtn.disabled = true;
    }
    nextBtn.addEventListener('click', function () {
      advance('-');
      render();
    });
    ctrl.appendChild(nextBtn);

    var compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'btn-secondary';
    compareBtn.textContent = 'Compare All';
    if (state.refs.length === 0) compareBtn.disabled = true;
    compareBtn.addEventListener('click', function () {
      state.compareOpen = !state.compareOpen;
      state.compareResult = state.compareOpen ? runCompare() : null;
      render();
    });
    ctrl.appendChild(compareBtn);

    container.appendChild(ctrl);

    // ----- Kotak Compare All -----
    if (state.compareOpen && state.compareResult) {
      container.appendChild(buildCompareBox(state.compareResult));
    }
  }

  // ---------- event terintegrasi ----------
  // Didaftarkan SEKALI saat file dimuat (bukan di mount), sesuai bagian 4.1.

  // Reset global: kembali ke langkah 0 + data default.
  window.addEventListener('os:reset', function () {
    try {
      resetState();
      render();
    } catch (e) {
      try {
        window.kirimLog('Memory', 'error saat reset: ' + e.message);
      } catch (_) { /* tidak bisa berbuat apa-apa */ }
    }
  });

  // Satu langkah Dispatch dari CPU → maju satu referensi.
  window.addEventListener('os:dispatch', function (ev) {
    try {
      var detail = (ev && ev.detail) || {};
      var pid = detail.pid;
      if (typeof pid !== 'string' || pid === '') pid = '-';
      advance(pid);
      render();
    } catch (e) {
      try {
        window.kirimLog('Memory', 'error saat dispatch: ' + e.message);
      } catch (_) { /* tidak bisa berbuat apa-apa */ }
    }
  });

  // ---------- inisialisasi awal ----------
  // Bagian 7: "saat data dimuat, panggil MemoryLogic.run satu kali".
  // Dibungkus try/catch: kalau logic belum siap, mount() akan mencoba lagi.
  try {
    rebuild();
  } catch (e) {
    state.error = 'gagal inisialisasi: ' + e.message;
  }

  window.registerApp({
    id: 'memory',
    title: 'Memory (Page Replacement)',
    width: 560,
    height: 420,
    icon:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" ' +
      'rx="2"></rect></svg>',
    mount: function (el) {
      container = el;
      // Rebuild hanya bila init awal belum berhasil (mis. MemoryLogic dimuat
      // belakangan). State yang sudah ada tidak disentuh.
      if (state.steps.length === 0) {
        rebuild();
      }
      render();
    },
    unmount: function () {
      container = null;   // state tetap hidup di closure
    },
    getState: function () {
      var currentFrames =
        state.pointer > 0 ? state.steps[state.pointer - 1].frames.slice() : [];
      return {
        algorithm: state.algorithm,
        frames: currentFrames,
        pointer: state.pointer,
        total: state.steps.length,
        faults: state.faults,
        hits: state.hits
      };
    }
  });
})();