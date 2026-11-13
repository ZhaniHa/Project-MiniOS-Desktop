// modules/monitor/logic.js
// Logika murni System Monitor: tanpa DOM, tanpa OS, tanpa kirimLog, tidak mengubah input.
(function () {
  'use strict';

  var NAMA_VALID = ['os:dispatch', 'os:page-fault', 'os:disk-served'];

  function gagal(code, message) {
    return { ok: false, error: { code: code, message: message } };
  }

  // Memeriksa satu event rekaman. Mengembalikan string pesan error, atau null bila valid.
  function periksaEvent(ev, i) {
    var label = 'event ke-' + (i + 1);
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
      return label + ' harus berupa objek';
    }
    if (NAMA_VALID.indexOf(ev.name) === -1) {
      return label + ': nama event tidak dikenal';
    }
    if (typeof ev.tick !== 'number' || !isFinite(ev.tick) ||
        Math.floor(ev.tick) !== ev.tick || ev.tick < 0) {
      return label + ': tick harus bilangan bulat >= 0';
    }
    if (ev.detail === null || typeof ev.detail !== 'object' || Array.isArray(ev.detail)) {
      return label + ': detail harus berupa objek';
    }
    if (typeof ev.detail.pid !== 'string') {
      return label + ': pid harus berupa string';
    }
    return null;
  }

  // Memeriksa seluruh daftar event. Mengembalikan objek error, atau null bila valid.
  function periksaDaftar(events) {
    if (!Array.isArray(events)) {
      return gagal('INVALID_INPUT', 'events harus berupa array');
    }
    for (var i = 0; i < events.length; i++) {
      var pesan = periksaEvent(events[i], i);
      if (pesan) return gagal('INVALID_INPUT', pesan);
    }
    return null;
  }

  // Ringkasan statistik dari daftar event rekaman.
  function summarize(events) {
    try {
      var err = periksaDaftar(events);
      if (err) return err;

      var dispatch = 0, faults = 0, diskOps = 0;
      var totalSeek = 0;
      var peta = {};          // pid -> { pid, dispatches, faults }

      function ambil(pid) {
        if (!Object.prototype.hasOwnProperty.call(peta, pid)) {
          peta[pid] = { pid: pid, dispatches: 0, faults: 0 };
        }
        return peta[pid];
      }

      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.name === 'os:dispatch') {
          dispatch++;
          ambil(ev.detail.pid).dispatches++;
        } else if (ev.name === 'os:page-fault') {
          faults++;
          ambil(ev.detail.pid).faults++;
        } else {
          diskOps++;
          totalSeek += Number(ev.detail.seek) || 0;
        }
      }

      var perPid = Object.keys(peta).sort(function (a, b) {
        return a < b ? -1 : (a > b ? 1 : 0);
      }).map(function (k) { return peta[k]; });

      return {
        ok: true,
        result: {
          counts: { dispatch: dispatch, faults: faults, diskOps: diskOps },
          faultRate: dispatch === 0 ? 0 : faults / dispatch,
          avgSeek: diskOps === 0 ? 0 : totalSeek / diskOps,
          perPid: perPid
        }
      };
    } catch (e) {
      return gagal('INVALID_INPUT', 'input tidak dapat diproses');
    }
  }

  // Mengubah daftar event menjadi teks CSV.
  function toCsv(events) {
    try {
      var err = periksaDaftar(events);
      if (err) return err;

      var baris = ['tick,event,pid,detail'];
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var d = ev.detail;
        var teksDetail;
        if (ev.name === 'os:dispatch') {
          teksDetail = d.start + '-' + d.end;
        } else if (ev.name === 'os:page-fault') {
          teksDetail = 'page=' + d.page;
        } else {
          teksDetail = 'page=' + d.page + ';target=' + d.target + ';seek=' + d.seek;
        }
        baris.push(ev.tick + ',' + ev.name + ',' + d.pid + ',' + teksDetail);
      }
      return { ok: true, result: { csv: baris.join('\n') } };
    } catch (e) {
      return gagal('INVALID_INPUT', 'input tidak dapat diproses');
    }
  }

  window.MonitorLogic = { summarize: summarize, toCsv: toCsv };
})();