// modules/analytics/logic.js  (TAHAP 2: logika murni)
// Fungsi murni: tanpa DOM, tanpa OS, tanpa kirimLog, tidak mengubah input.
// Semua fungsi mengembalikan { ok: true, result } atau { ok: false, error: { code, message } }.
(function () {
  'use strict';

  // Nama event yang boleh masuk timeline -> urutan dataset
  var EVENT_INDEX = { 'os:dispatch': 0, 'os:page-fault': 1, 'os:disk-served': 2 };
  var TIMELINE_LABELS = ['Dispatch', 'Page Fault', 'Disk Served'];

  // Spesifikasi tiap seri batang: field wajib, label dataset (urut), dan field penentu "terbaik"
  var SPEC = {
    cpu: {
      fields: [
        { key: 'avgWaiting', label: 'Avg Waiting' },
        { key: 'avgTurnaround', label: 'Avg Turnaround' }
      ],
      bestKey: 'avgWaiting'
    },
    memory: {
      fields: [
        { key: 'faults', label: 'Faults' },
        { key: 'hits', label: 'Hits' }
      ],
      bestKey: 'faults'
    },
    disk: {
      fields: [{ key: 'totalSeek', label: 'Total Seek' }],
      bestKey: 'totalSeek'
    }
  };

  function ok(result) { return { ok: true, result: result }; }
  function fail(code, message) { return { ok: false, error: { code: code, message: message } }; }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

  // Pembungkus pengaman: fungsi publik tidak boleh melempar exception.
  function safe(fn) {
    return function (input) {
      try {
        return fn(input);
      } catch (e) {
        return fail('INVALID_INPUT', 'input tidak dapat dibaca: ' + e.message);
      }
    };
  }

  // Membangun seri batang dari array runs.
  function buildSeries(runs, spec) {
    if (!Array.isArray(runs)) {
      return fail('INVALID_INPUT', 'runs harus berupa array');
    }
    if (runs.length === 0) {
      return fail('EMPTY_INPUT', 'runs tidak boleh kosong');
    }

    var i, j;
    for (i = 0; i < runs.length; i++) {
      var r = runs[i];
      var no = i + 1;
      if (!isObject(r)) {
        return fail('INVALID_INPUT', 'entri ke-' + no + ' harus berupa objek');
      }
      if (typeof r.algorithm !== 'string' || r.algorithm.trim() === '') {
        return fail('INVALID_INPUT', 'algorithm pada entri ke-' + no + ' harus berupa teks tidak kosong');
      }
      for (j = 0; j < spec.fields.length; j++) {
        var key = spec.fields[j].key;
        if (!isFiniteNumber(r[key])) {
          return fail('INVALID_INPUT', key + ' pada entri ke-' + no + ' harus berupa angka terhingga');
        }
      }
    }

    var labels = [];
    var datasets = [];
    for (j = 0; j < spec.fields.length; j++) {
      datasets.push({ label: spec.fields[j].label, data: [] });
    }

    var bestIndex = 0;
    for (i = 0; i < runs.length; i++) {
      labels.push(runs[i].algorithm);
      for (j = 0; j < spec.fields.length; j++) {
        datasets[j].data.push(runs[i][spec.fields[j].key]);
      }
      // Nilai terkecil menang; bila seri, yang pertama tetap menang (pakai < bukan <=)
      if (runs[i][spec.bestKey] < runs[bestIndex][spec.bestKey]) bestIndex = i;
    }

    return ok({
      labels: labels,
      datasets: datasets,
      best: { index: bestIndex, algorithm: labels[bestIndex] }
    });
  }

  // Timeline kumulatif per tick dari event rekaman { name, tick, detail }.
  function timelineSeries(events) {
    if (!Array.isArray(events)) {
      return fail('INVALID_INPUT', 'events harus berupa array');
    }

    var maxTick = 0;
    var i;
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      var no = i + 1;
      if (!isObject(ev)) {
        return fail('INVALID_INPUT', 'event ke-' + no + ' harus berupa objek');
      }
      if (typeof ev.name !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_INDEX, ev.name)) {
        return fail('INVALID_INPUT', 'nama event ke-' + no + ' tidak dikenal (harus os:dispatch, os:page-fault, atau os:disk-served)');
      }
      if (!isFiniteNumber(ev.tick) || Math.floor(ev.tick) !== ev.tick || ev.tick < 0) {
        return fail('INVALID_INPUT', 'tick event ke-' + no + ' harus bilangan bulat >= 0');
      }
      if (ev.tick > maxTick) maxTick = ev.tick;
    }

    // Hitung jumlah event per tick, lalu jadikan kumulatif
    var labels = [];
    var perTick = [[], [], []];
    var t, d;
    for (t = 0; t <= maxTick; t++) {
      labels.push(t);
      for (d = 0; d < 3; d++) perTick[d].push(0);
    }
    for (i = 0; i < events.length; i++) {
      perTick[EVENT_INDEX[events[i].name]][events[i].tick] += 1;
    }

    var datasets = [];
    for (d = 0; d < 3; d++) {
      var data = [];
      var running = 0;
      for (t = 0; t <= maxTick; t++) {
        running += perTick[d][t];
        data.push(running);
      }
      datasets.push({ label: TIMELINE_LABELS[d], data: data });
    }

    return ok({ labels: labels, datasets: datasets });
  }

  window.AnalyticsLogic = {
    cpuSeries: safe(function (runs) { return buildSeries(runs, SPEC.cpu); }),
    memorySeries: safe(function (runs) { return buildSeries(runs, SPEC.memory); }),
    diskSeries: safe(function (runs) { return buildSeries(runs, SPEC.disk); }),
    timelineSeries: safe(timelineSeries)
  };
})();
