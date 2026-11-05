// modules/cpu/logic.js (Tahap 2: logika CPU Scheduler, fungsi murni)
(function () {
  'use strict';

  var MAX_PROCESSES = 20;
  var ALGORITHMS = ['FCFS', 'SJF', 'RR'];

  // Pembuat amplop balasan
  function fail(code, message) {
    return { ok: false, error: { code: code, message: message } };
  }

  // Perbandingan PID secara leksikografis (urutan string, bukan locale)
  function cmpPid(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  // Validasi input. Mengembalikan { error } bila salah, atau { procs, quantum } bila benar.
  // procs adalah salinan baru, input asli tidak disentuh.
  function validate(input) {
    if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
      return { error: fail('INVALID_INPUT', 'input harus berupa objek') };
    }
    if (typeof input.algorithm !== 'string' || ALGORITHMS.indexOf(input.algorithm) === -1) {
      return { error: fail('UNKNOWN_ALGORITHM', 'algoritma tidak dikenal, pilih FCFS, SJF, atau RR') };
    }
    if (!Array.isArray(input.processes)) {
      return { error: fail('INVALID_INPUT', 'processes harus berupa array') };
    }
    if (input.processes.length === 0) {
      return { error: fail('EMPTY_INPUT', 'daftar proses tidak boleh kosong') };
    }
    if (input.processes.length > MAX_PROCESSES) {
      return { error: fail('INVALID_INPUT', 'maksimal ' + MAX_PROCESSES + ' proses') };
    }

    var quantum = null;
    if (input.algorithm === 'RR') {
      if (!Number.isInteger(input.quantum) || input.quantum < 1) {
        return { error: fail('INVALID_INPUT', 'quantum harus bilangan bulat >= 1 untuk RR') };
      }
      quantum = input.quantum;
    }

    var seen = {};
    var procs = [];
    for (var i = 0; i < input.processes.length; i++) {
      var p = input.processes[i];
      if (p === null || typeof p !== 'object' || Array.isArray(p)) {
        return { error: fail('INVALID_INPUT', 'proses ke-' + (i + 1) + ' harus berupa objek') };
      }
      if (typeof p.pid !== 'string' || p.pid.trim() === '') {
        return { error: fail('INVALID_INPUT', 'pid harus string tidak kosong') };
      }
      if (Object.prototype.hasOwnProperty.call(seen, p.pid)) {
        return { error: fail('INVALID_INPUT', 'pid harus unik, ditemukan ganda: ' + p.pid) };
      }
      seen[p.pid] = true;

      var arrival = (p.arrival === undefined) ? 0 : p.arrival;   // arrival opsional, default 0
      if (!Number.isInteger(arrival) || arrival < 0) {
        return { error: fail('INVALID_INPUT', 'arrival harus bilangan bulat >= 0') };
      }
      if (!Number.isInteger(p.burst) || p.burst < 1) {
        return { error: fail('INVALID_INPUT', 'burst harus bilangan bulat >= 1') };
      }
      procs.push({ pid: p.pid, arrival: arrival, burst: p.burst });
    }
    return { procs: procs, quantum: quantum };
  }

  // FCFS: urut arrival, seri dipecah PID terkecil. Waktu melompat bila CPU menganggur.
  function simulateFCFS(procs) {
    var order = procs.slice().sort(function (a, b) {
      return (a.arrival - b.arrival) || cmpPid(a.pid, b.pid);
    });
    var gantt = [];
    var time = 0;
    order.forEach(function (p) {
      if (time < p.arrival) time = p.arrival;
      gantt.push({ pid: p.pid, start: time, end: time + p.burst });
      time += p.burst;
    });
    return gantt;
  }

  // SJF non-preemptive: pilih burst terkecil di antara yang sudah datang.
  // Seri: arrival lebih awal, lalu PID.
  function simulateSJF(procs) {
    var remaining = procs.slice();
    var gantt = [];
    var time = 0;
    while (remaining.length) {
      var ready = remaining.filter(function (p) { return p.arrival <= time; });
      if (!ready.length) {
        // Tidak ada proses siap: lompat ke arrival berikutnya
        time = Math.min.apply(null, remaining.map(function (p) { return p.arrival; }));
        continue;
      }
      ready.sort(function (a, b) {
        return (a.burst - b.burst) || (a.arrival - b.arrival) || cmpPid(a.pid, b.pid);
      });
      var pick = ready[0];
      gantt.push({ pid: pick.pid, start: time, end: time + pick.burst });
      time += pick.burst;
      remaining.splice(remaining.indexOf(pick), 1);
    }
    return gantt;
  }

  // RR: antrean FIFO. Proses yang tiba pada waktu t masuk antrean SEBELUM
  // proses yang baru habis kuantum pada waktu t dimasukkan kembali.
  function simulateRR(procs, quantum) {
    var arrivals = procs.slice().sort(function (a, b) {
      return (a.arrival - b.arrival) || cmpPid(a.pid, b.pid);
    });
    var rem = {};
    arrivals.forEach(function (p) { rem[p.pid] = p.burst; });

    var queue = [];
    var next = 0;       // indeks proses berikutnya yang belum tiba
    var finished = 0;
    var time = 0;
    var gantt = [];

    function admit(t) {
      while (next < arrivals.length && arrivals[next].arrival <= t) {
        queue.push(arrivals[next]);
        next++;
      }
    }

    admit(time);
    while (finished < arrivals.length) {
      if (!queue.length) {
        // Antrean kosong: lompat ke arrival berikutnya
        time = arrivals[next].arrival;
        admit(time);
        continue;
      }
      var p = queue.shift();
      var run = Math.min(quantum, rem[p.pid]);
      gantt.push({ pid: p.pid, start: time, end: time + run });
      time += run;
      rem[p.pid] -= run;
      admit(time);                 // yang baru tiba masuk dulu
      if (rem[p.pid] > 0) {
        queue.push(p);             // baru kemudian proses yang habis kuantum
      } else {
        finished++;
      }
    }
    return gantt;
  }

  // Hitung metrik per proses (urutan mengikuti input) dan rata-rata dari gantt
  function buildResult(algorithm, procs, gantt) {
    var firstStart = {};
    var lastEnd = {};
    gantt.forEach(function (g) {
      if (!Object.prototype.hasOwnProperty.call(firstStart, g.pid)) firstStart[g.pid] = g.start;
      lastEnd[g.pid] = g.end;
    });

    var totalWait = 0;
    var totalTat = 0;
    var perProcess = procs.map(function (p) {
      var completion = lastEnd[p.pid];
      var turnaround = completion - p.arrival;
      var waiting = turnaround - p.burst;
      var response = firstStart[p.pid] - p.arrival;
      totalWait += waiting;
      totalTat += turnaround;
      return {
        pid: p.pid,
        arrival: p.arrival,
        burst: p.burst,
        completion: completion,
        waiting: waiting,
        turnaround: turnaround,
        response: response
      };
    });

    return {
      algorithm: algorithm,
      gantt: gantt,
      perProcess: perProcess,
      avgWaiting: totalWait / procs.length,       // tidak dibulatkan
      avgTurnaround: totalTat / procs.length
    };
  }

  // API utama
  function run(input) {
    try {
      var v = validate(input);
      if (v.error) return v.error;

      var gantt;
      if (input.algorithm === 'FCFS') gantt = simulateFCFS(v.procs);
      else if (input.algorithm === 'SJF') gantt = simulateSJF(v.procs);
      else gantt = simulateRR(v.procs, v.quantum);

      return { ok: true, result: buildResult(input.algorithm, v.procs, gantt) };
    } catch (e) {
      // Jaring pengaman terakhir: tidak pernah melempar exception
      return fail('INVALID_INPUT', 'input tidak dapat diproses');
    }
  }

  window.CpuLogic = { run: run };
})();