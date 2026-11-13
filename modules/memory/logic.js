// modules/memory/logic.js — Tahap 2: logika page replacement (FIFO/LRU/OPTIMAL)
// Fungsi murni: tanpa DOM, tanpa OS, tanpa kirimLog, tidak mengubah input.
// Satu-satunya global: window.MemoryLogic.run(input).
(function () {
  'use strict';

  var ALGOS = ['FIFO', 'LRU', 'OPTIMAL'];
  var MIN_FRAMES = 1;
  var MAX_FRAMES = 10;
  var MAX_REFS = 50;

  // Bilangan bulat (bukan pecahan, bukan string, bukan NaN/Infinity).
  function isInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  function err(code, message) {
    return { ok: false, error: { code: code, message: message } };
  }

  // Validasi input. Tidak mengubah input. Mengembalikan {ok:true} atau {ok:false,...}.
  function validate(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return err('INVALID_INPUT', 'input harus berupa objek { algorithm, frames, refString }');
    }
    if (typeof input.algorithm !== 'string' || ALGOS.indexOf(input.algorithm) === -1) {
      return err(
        'UNKNOWN_ALGORITHM',
        'algoritma tidak dikenal: ' + String(input.algorithm) + ' (pilih FIFO, LRU, atau OPTIMAL)'
      );
    }
    if (!isInt(input.frames) || input.frames < MIN_FRAMES || input.frames > MAX_FRAMES) {
      return err('INVALID_INPUT', 'frames harus bilangan bulat antara 1 dan 10');
    }
    if (!Array.isArray(input.refString)) {
      return err('INVALID_INPUT', 'refString harus berupa array bilangan bulat');
    }
    if (input.refString.length === 0) {
      return err('EMPTY_INPUT', 'refString tidak boleh kosong');
    }
    if (input.refString.length > MAX_REFS) {
      return err('INVALID_INPUT', 'refString maksimal ' + MAX_REFS + ' elemen');
    }
    for (var i = 0; i < input.refString.length; i++) {
      var v = input.refString[i];
      if (!isInt(v) || v < 0) {
        return err('INVALID_INPUT', 'refString hanya boleh berisi bilangan bulat >= 0');
      }
    }
    return { ok: true };
  }

  // Simulasi satu algoritma. refString diasumsikan sudah valid.
  // frameList: isi frame berurutan dari yang paling dulu masuk (oldest first).
  // lastUsed: page -> indeks referensi terakhir dipakai (khusus LRU).
  function runAlgorithm(algorithm, frameCap, refString) {
    var steps = [];
    var faults = 0;
    var hits = 0;
    var frameList = [];
    var lastUsed = {};

    for (var i = 0; i < refString.length; i++) {
      var ref = refString[i];
      var hitIdx = frameList.indexOf(ref);

      if (hitIdx !== -1) {
        // HIT: isi frame tidak berubah; LRU memperbarui waktu pakai.
        hits++;
        lastUsed[ref] = i;
        steps.push({
          index: i,
          ref: ref,
          frames: frameList.slice(),
          fault: false,
          evicted: null,
        });
        continue;
      }

      // MISS
      faults++;
      var evicted = null;

      if (frameList.length >= frameCap) {
        if (algorithm === 'FIFO') {
          // Paling dulu masuk = elemen pertama frameList.
          evicted = frameList[0];
        } else if (algorithm === 'LRU') {
          // Yang terakhir dipakai paling lama = lastUsed terkecil.
          var oldestPage = frameList[0];
          var oldestTime = lastUsed[oldestPage];
          for (var k = 1; k < frameList.length; k++) {
            var p = frameList[k];
            if (lastUsed[p] < oldestTime) {
              oldestPage = p;
              oldestTime = lastUsed[p];
            }
          }
          evicted = oldestPage;
        } else {
          // OPTIMAL: pemakaian berikutnya paling jauh; tidak dipakai lagi = Infinity.
          // Iterasi mengikuti urutan frameList (oldest first), jadi saat seri
          // nilai pertama yang menang otomatis = yang paling dulu masuk.
          var farthest = -1;
          var victim = null;
          for (var m = 0; m < frameList.length; m++) {
            var page = frameList[m];
            var nextPos = -1;
            for (var n = i + 1; n < refString.length; n++) {
              if (refString[n] === page) { nextPos = n; break; }
            }
            var dist = nextPos === -1 ? Infinity : nextPos;
            if (dist > farthest) {
              farthest = dist;
              victim = page;
            }
          }
          evicted = victim;
        }

        var evIdx = frameList.indexOf(evicted);
        if (evIdx !== -1) frameList.splice(evIdx, 1);
      }

      // Page baru selalu masuk di belakang (paling baru).
      frameList.push(ref);
      lastUsed[ref] = i;

      steps.push({
        index: i,
        ref: ref,
        frames: frameList.slice(),
        fault: true,
        evicted: evicted,
      });
    }

    var total = refString.length;
    return {
      algorithm: algorithm,
      steps: steps,
      faults: faults,
      hits: hits,
      hitRatio: total === 0 ? 0 : hits / total,
    };
  }

  // API publik modul.
  window.MemoryLogic = {
    // @param {{algorithm:string, frames:number, refString:number[]}} input
    // @returns {{ok:true, result:object} | {ok:false, error:{code:string,message:string}}}
    run: function (input) {
      var check = validate(input);
      if (!check.ok) return check;
      // Salin refString agar input asli tidak pernah tersentuh.
      var refs = input.refString.slice();
      var result = runAlgorithm(input.algorithm, input.frames, refs);
      return { ok: true, result: result };
    },
  };
})();