// modules/disk/logic.js
// Logika murni Disk Scheduling: FCFS, SSTF, SCAN (versi buku teks, ke ujung disk).
// Tanpa DOM, tanpa window.OS, tanpa kirimLog, dan tidak mengubah input.
(function () {
  'use strict';

  var ALGOS = ['FCFS', 'SSTF', 'SCAN'];
  var MAX_QUEUE = 30;

  // Amplop galat seragam (tidak pernah melempar exception).
  function fail(code, message) {
    return { ok: false, error: { code: code, message: message } };
  }

  function isEmpty(v) {
    return v === undefined || v === null || v === '';
  }

  function flip(dir) {
    return dir === 'up' ? 'down' : 'up';
  }

  // Validasi input. Mengembalikan { ok:true, value } berisi salinan bersih,
  // atau amplop galat. needNonEmpty = true untuk run().
  function validate(input, needNonEmpty) {
    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      return fail('INVALID_INPUT', 'input harus berupa objek');
    }
    var algo = input.algorithm;
    if (typeof algo !== 'string') {
      return fail('INVALID_INPUT', 'algorithm harus berupa teks: FCFS, SSTF, atau SCAN');
    }
    if (ALGOS.indexOf(algo) === -1) {
      return fail('UNKNOWN_ALGORITHM', 'algoritma "' + algo + '" tidak dikenal (pilih FCFS, SSTF, atau SCAN)');
    }

    var max = input.maxCylinder;
    if (!Number.isInteger(max) || max < 1) {
      return fail('INVALID_INPUT', 'maxCylinder harus bilangan bulat >= 1');
    }

    var head = input.head;
    if (!Number.isInteger(head) || head < 0 || head > max) {
      return fail('INVALID_INPUT', 'head harus bilangan bulat 0 sampai ' + max);
    }

    // direction hanya dipakai dan divalidasi untuk SCAN.
    var dir = 'up';
    if (algo === 'SCAN' && !isEmpty(input.direction)) {
      if (input.direction !== 'up' && input.direction !== 'down') {
        return fail('INVALID_INPUT', 'direction harus "up" atau "down"');
      }
      dir = input.direction;
    }

    var queue = input.queue;
    if (!Array.isArray(queue)) {
      return fail('INVALID_INPUT', 'queue harus berupa array bilangan bulat');
    }
    if (queue.length > MAX_QUEUE) {
      return fail('INVALID_INPUT', 'queue maksimal ' + MAX_QUEUE + ' request');
    }
    if (needNonEmpty && queue.length < 1) {
      return fail('EMPTY_INPUT', 'queue tidak boleh kosong');
    }
    for (var i = 0; i < queue.length; i++) {
      var c = queue[i];
      if (!Number.isInteger(c) || c < 0 || c > max) {
        return fail('INVALID_INPUT', 'setiap silinder harus bilangan bulat 0 sampai ' + max);
      }
    }

    return {
      ok: true,
      value: { algorithm: algo, head: head, maxCylinder: max, direction: dir, queue: queue.slice() }
    };
  }

  // Indeks request SCAN searah dari head, atau -1 bila tidak ada.
  // up: silinder terkecil >= head; down: silinder terbesar <= head.
  function findScan(queue, head, dir) {
    var best = -1;
    for (var i = 0; i < queue.length; i++) {
      var c = queue[i];
      if (dir === 'up') {
        if (c >= head && (best === -1 || c < queue[best])) best = i;
      } else {
        if (c <= head && (best === -1 || c > queue[best])) best = i;
      }
    }
    return best;
  }

  // Satu langkah (input sudah tervalidasi).
  function step(v) {
    var q = v.queue;
    var head = v.head;
    var dir = v.direction;
    var idx = 0;
    var i;

    if (q.length === 0) return { done: true };

    if (v.algorithm === 'FCFS') {
      idx = 0;
    } else if (v.algorithm === 'SSTF') {
      // Terdekat dari head; seri: silinder lebih kecil.
      for (i = 1; i < q.length; i++) {
        var d = Math.abs(q[i] - head);
        var bd = Math.abs(q[idx] - head);
        if (d < bd || (d === bd && q[i] < q[idx])) idx = i;
      }
    } else { // SCAN
      idx = findScan(q, head, dir);
      if (idx === -1) {
        var edge = dir === 'up' ? v.maxCylinder : 0;
        if (head !== edge) {
          // Tidak ada request searah: head ke ujung, arah berbalik.
          return {
            done: false, target: edge, isRequest: false,
            seek: Math.abs(edge - head), newHead: edge,
            newDirection: flip(dir), remaining: q.slice()
          };
        }
        // Head sudah di ujung: cukup berbalik arah, lalu layani.
        dir = flip(dir);
        idx = findScan(q, head, dir);
      }
    }

    var target = q[idx];
    var remaining = q.slice();
    remaining.splice(idx, 1);
    return {
      done: false, target: target, isRequest: true,
      seek: Math.abs(target - head), newHead: target,
      newDirection: dir, remaining: remaining
    };
  }

  function next(input) {
    var v = validate(input, false);
    if (!v.ok) return v;
    return { ok: true, result: step(v.value) };
  }

  function run(input) {
    var v = validate(input, true);
    if (!v.ok) return v;
    var cur = v.value;
    var order = [];
    var movements = [];
    var total = 0;

    while (true) {
      var s = step(cur);
      if (s.done) break;
      order.push(s.target);
      movements.push({ from: cur.head, to: s.target, seek: s.seek });
      total += s.seek;
      cur = {
        algorithm: cur.algorithm, head: s.newHead, maxCylinder: cur.maxCylinder,
        direction: s.newDirection, queue: s.remaining
      };
    }

    return {
      ok: true,
      result: { algorithm: cur.algorithm, order: order, movements: movements, totalSeek: total }
    };
  }

  window.DiskLogic = { run: run, next: next };
})();
