// modules/analytics/app.js  (TAHAP 3: UI)
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = 'Arial, Helvetica, sans-serif';

  // Warna tetap (hex) supaya grafik terbaca di latar putih dan tetap benar saat diunduh.
  var C = { text: '#111827', muted: '#4b5563', grid: '#e5e7eb', axis: '#374151', bg: '#ffffff' };
  var BAR_COLORS = ['#2563eb', '#d97706'];    // warna dataset ke-1 dan ke-2
  var BEST_COLORS = ['#15803d', '#86efac'];   // warna batang algoritma terbaik
  var LINE_COLORS = ['#2563eb', '#dc2626', '#15803d'];
  var LINE_DASH = ['', '6 3', '2 3'];         // pola garis berbeda, bukan hanya warna

  // ------------------------------------------------------------------
  // Data bawaan (bagian 6 prompt)
  // ------------------------------------------------------------------
  var DATA_CPU = {
    processes: [
      { pid: 'P1', arrival: 0, burst: 6 },
      { pid: 'P2', arrival: 1, burst: 3 },
      { pid: 'P3', arrival: 2, burst: 8 },
      { pid: 'P4', arrival: 3, burst: 2 }
    ],
    quantum: 2
  };
  var DATA_MEM = {
    refString: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
    frames: 3
  };
  var DATA_DISK = {
    head: 53, maxCylinder: 199, direction: 'up',
    queue: [98, 183, 37, 122, 14, 124, 65, 67]
  };

  // ------------------------------------------------------------------
  // ADAPTER ke modul inti. Bentuk input .run() ditulis di SINI SAJA.
  // Sesuaikan bila kontrak CpuLogic / MemoryLogic / DiskLogic berbeda.
  // ------------------------------------------------------------------
  function cpuInput(algo) {
    return {
      algorithm: algo,
      quantum: DATA_CPU.quantum,
      processes: DATA_CPU.processes.map(function (p) {
        return { pid: p.pid, arrival: p.arrival, burst: p.burst };
      })
    };
  }
  function memInput(algo) {
    return { algorithm: algo, refString: DATA_MEM.refString.slice(), frames: DATA_MEM.frames };
  }
  function diskInput(algo) {
    return {
      algorithm: algo, head: DATA_DISK.head, maxCylinder: DATA_DISK.maxCylinder,
      direction: DATA_DISK.direction, queue: DATA_DISK.queue.slice()
    };
  }

  // Spesifikasi empat grafik
  var SPECS = [
    {
      key: 'cpu', cardTitle: 'CPU Scheduler', chartTitle: 'CPU: Rata-rata Waiting dan Turnaround',
      xLabel: 'Algoritma', yLabel: 'Waktu (satuan)',
      module: 'CpuLogic', moduleLabel: 'CPU', algos: ['FCFS', 'SJF', 'RR'],
      input: cpuInput, series: 'cpuSeries',
      pick: function (r, a) { return { algorithm: r.algorithm || a, avgWaiting: r.avgWaiting, avgTurnaround: r.avgTurnaround }; }
    },
    {
      key: 'memory', cardTitle: 'Memory Manager', chartTitle: 'Memory: Page Fault dan Hit',
      xLabel: 'Algoritma', yLabel: 'Jumlah',
      module: 'MemoryLogic', moduleLabel: 'Memory', algos: ['FIFO', 'LRU', 'OPTIMAL'],
      input: memInput, series: 'memorySeries',
      pick: function (r, a) { return { algorithm: r.algorithm || a, faults: r.faults, hits: r.hits }; }
    },
    {
      key: 'disk', cardTitle: 'Disk Scheduler', chartTitle: 'Disk: Total Seek',
      xLabel: 'Algoritma', yLabel: 'Total seek (silinder)',
      module: 'DiskLogic', moduleLabel: 'Disk', algos: ['FCFS', 'SSTF', 'SCAN'],
      input: diskInput, series: 'diskSeries',
      pick: function (r, a) { return { algorithm: r.algorithm || a, totalSeek: r.totalSeek }; }
    },
    {
      key: 'timeline', cardTitle: 'Timeline Event', chartTitle: 'Timeline Event Kumulatif',
      xLabel: 'Tick', yLabel: 'Jumlah kumulatif', timeline: true
    }
  ];

  // ------------------------------------------------------------------
  // State modul (di closure, bukan di DOM)
  // ------------------------------------------------------------------
  var container = null;   // elemen jendela saat terbuka, null saat tertutup
  var events = [];        // rekaman event untuk timeline (diisi listener di Tahap 4)

  function log(msg) {
    if (typeof window.kirimLog === 'function') window.kirimLog('Analytics', msg);
  }

  function getSpec(key) {
    for (var i = 0; i < SPECS.length; i++) if (SPECS[i].key === key) return SPECS[i];
    return null;
  }

  // ------------------------------------------------------------------
  // Pembantu SVG
  // ------------------------------------------------------------------
  function svgEl(name, attrs, text) {
    var el = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, String(attrs[k]));
      }
    }
    if (text !== undefined) el.textContent = String(text);   // textContent: aman dari injeksi
    return el;
  }

  function fmt(v) { return String(Math.round(v * 100) / 100); }

  // Skala sumbu Y yang "rapi": kembalikan { max, step, count }
  function niceScale(maxVal, integerOnly) {
    if (!(maxVal > 0)) return { max: 4, step: 1, count: 4 };
    var raw = maxVal / 4;
    var base = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / base;
    var nf = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 5 ? 5 : 10));
    var step = nf * base;
    if (integerOnly && step < 1) step = 1;
    var count = Math.ceil(maxVal / step - 1e-9);
    return { max: count * step, step: step, count: count };
  }

  // Kerangka bersama: latar putih, judul, sumbu, grid, label sumbu. Mengembalikan konteks gambar.
  function frame(d, integerOnly, maxVal) {
    var W = 520, H = 320, L = 54, R = 16, T = 62, B = 52;
    var pw = W - L - R, ph = H - T - B;
    var sc = niceScale(maxVal, integerOnly);

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
      role: 'img', 'aria-label': d.title, 'font-family': FONT
    });
    svg.appendChild(svgEl('title', null, d.title));
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: C.bg }));
    svg.appendChild(svgEl('text', {
      x: W / 2, y: 22, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold', fill: C.text
    }, d.title));

    function yOf(v) { return T + ph - (v / sc.max) * ph; }

    // Grid dan label sumbu Y
    for (var i = 0; i <= sc.count; i++) {
      var val = i * sc.step, y = yOf(val);
      svg.appendChild(svgEl('line', { x1: L, y1: y, x2: L + pw, y2: y, stroke: C.grid, 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', {
        x: L - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: C.muted
      }, fmt(val)));
    }
    // Sumbu
    svg.appendChild(svgEl('line', { x1: L, y1: T, x2: L, y2: T + ph, stroke: C.axis, 'stroke-width': 1.5 }));
    svg.appendChild(svgEl('line', { x1: L, y1: T + ph, x2: L + pw, y2: T + ph, stroke: C.axis, 'stroke-width': 1.5 }));
    // Judul sumbu
    svg.appendChild(svgEl('text', {
      x: 13, y: T + ph / 2, 'text-anchor': 'middle', 'font-size': 11, fill: C.text,
      transform: 'rotate(-90 13 ' + (T + ph / 2) + ')'
    }, d.yLabel));
    svg.appendChild(svgEl('text', {
      x: L + pw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: C.text
    }, d.xLabel));

    return { svg: svg, W: W, H: H, L: L, T: T, pw: pw, ph: ph, yOf: yOf };
  }

  // Legenda tengah di bawah judul. items: [{ text, color, dash }]
  function legend(svg, W, items, asLine) {
    var widths = items.map(function (it) { return 18 + it.text.length * 6.3 + 14; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) - 14;
    var x = (W - total) / 2, y = 44;
    items.forEach(function (it, i) {
      if (asLine) {
        var ln = { x1: x, y1: y - 4, x2: x + 14, y2: y - 4, stroke: it.color, 'stroke-width': 2.5 };
        if (it.dash) ln['stroke-dasharray'] = it.dash;
        svg.appendChild(svgEl('line', ln));
      } else {
        svg.appendChild(svgEl('rect', { x: x, y: y - 9, width: 12, height: 12, fill: it.color }));
      }
      svg.appendChild(svgEl('text', { x: x + 18, y: y, 'font-size': 11, fill: C.text }, it.text));
      x += widths[i];
    });
  }

  // ------------------------------------------------------------------
  // barChart(data): diagram batang berkelompok.
  // data = { title, xLabel, yLabel, labels[], datasets[{label,data[]}], bestIndex }
  // ------------------------------------------------------------------
  function barChart(d) {
    var maxVal = 0;
    d.datasets.forEach(function (ds) {
      ds.data.forEach(function (v) { if (v > maxVal) maxVal = v; });
    });
    var f = frame(d, false, maxVal);
    var svg = f.svg;

    var items = d.datasets.map(function (ds, i) { return { text: ds.label, color: BAR_COLORS[i % BAR_COLORS.length] }; });
    items.push({ text: 'Algoritma terbaik', color: BEST_COLORS[0] });
    legend(svg, f.W, items, false);

    var n = d.labels.length, k = d.datasets.length;
    var groupW = f.pw / n;
    var barW = Math.min(36, (groupW * 0.7) / k);

    d.labels.forEach(function (lab, gi) {
      var isBest = gi === d.bestIndex;
      var gx = f.L + gi * groupW + (groupW - barW * k) / 2;
      d.datasets.forEach(function (ds, di) {
        var v = ds.data[gi];
        var y = f.yOf(v);
        var h = Math.max(0, f.T + f.ph - y);
        var x = gx + di * barW;
        var color = isBest ? BEST_COLORS[di % BEST_COLORS.length] : BAR_COLORS[di % BAR_COLORS.length];
        var bar = svgEl('rect', { x: x, y: y, width: barW - 2, height: h, fill: color });
        bar.appendChild(svgEl('title', null, lab + ' - ' + ds.label + ': ' + fmt(v)));
        svg.appendChild(bar);
        svg.appendChild(svgEl('text', {
          x: x + (barW - 2) / 2, y: y - 4, 'text-anchor': 'middle', 'font-size': 11,
          'font-weight': isBest ? 'bold' : 'normal', fill: C.text
        }, fmt(v)));
      });
      var cx = f.L + gi * groupW + groupW / 2;
      svg.appendChild(svgEl('text', {
        x: cx, y: f.T + f.ph + 16, 'text-anchor': 'middle', 'font-size': 12, fill: C.text
      }, lab));
      if (isBest) {
        svg.appendChild(svgEl('text', {
          x: cx, y: f.T + f.ph + 29, 'text-anchor': 'middle', 'font-size': 10,
          'font-weight': 'bold', fill: BEST_COLORS[0]
        }, '\u2605 terbaik'));
      }
    });
    return svg;
  }

  // ------------------------------------------------------------------
  // lineChart(data): diagram garis untuk timeline.
  // data = { title, xLabel, yLabel, labels[], datasets[{label,data[]}], emptyNote? }
  // ------------------------------------------------------------------
  function lineChart(d) {
    var maxVal = 0;
    d.datasets.forEach(function (ds) {
      ds.data.forEach(function (v) { if (v > maxVal) maxVal = v; });
    });
    var f = frame(d, true, maxVal);
    var svg = f.svg;

    legend(svg, f.W, d.datasets.map(function (ds, i) {
      return { text: ds.label, color: LINE_COLORS[i % LINE_COLORS.length], dash: LINE_DASH[i % LINE_DASH.length] };
    }), true);

    var n = d.labels.length;
    function xOf(i) { return n === 1 ? f.L + f.pw / 2 : f.L + (i * f.pw) / (n - 1); }

    // Label sumbu X (dijarangkan bila tick banyak)
    var skip = Math.ceil(n / 12);
    d.labels.forEach(function (lab, i) {
      if (i % skip !== 0 && i !== n - 1) return;
      svg.appendChild(svgEl('line', { x1: xOf(i), y1: f.T + f.ph, x2: xOf(i), y2: f.T + f.ph + 4, stroke: C.axis, 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', {
        x: xOf(i), y: f.T + f.ph + 17, 'text-anchor': 'middle', 'font-size': 11, fill: C.muted
      }, lab));
    });

    d.datasets.forEach(function (ds, di) {
      var color = LINE_COLORS[di % LINE_COLORS.length];
      var pts = ds.data.map(function (v, i) { return xOf(i) + ',' + f.yOf(v); }).join(' ');
      var attrs = { points: pts, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' };
      if (LINE_DASH[di % LINE_DASH.length]) attrs['stroke-dasharray'] = LINE_DASH[di % LINE_DASH.length];
      svg.appendChild(svgEl('polyline', attrs));
      if (n <= 40) {
        ds.data.forEach(function (v, i) {
          var dot = svgEl('circle', { cx: xOf(i), cy: f.yOf(v), r: 3, fill: color });
          dot.appendChild(svgEl('title', null, 'tick ' + d.labels[i] + ' - ' + ds.label + ': ' + fmt(v)));
          svg.appendChild(dot);
        });
      }
    });

    if (d.emptyNote) {
      svg.appendChild(svgEl('text', {
        x: f.L + f.pw / 2, y: f.T + f.ph / 2 - 8, 'text-anchor': 'middle', 'font-size': 12, fill: C.muted
      }, d.emptyNote));
    }
    return svg;
  }

  // ------------------------------------------------------------------
  // Menghitung data grafik
  // ------------------------------------------------------------------
  function unwrap(res) {
    if (res && typeof res === 'object' && typeof res.ok === 'boolean') {
      if (res.ok) return res.result;
      throw new Error(res.error && res.error.message ? res.error.message : 'hasil modul tidak valid');
    }
    return res;
  }

  // Mengembalikan { svg } atau { message, error }
  function buildChart(spec) {
    if (!window.AnalyticsLogic) {
      return { message: 'logic.js Analytics belum dimuat.', error: true };
    }

    if (spec.timeline) {
      var t = window.AnalyticsLogic.timelineSeries(events);
      if (!t.ok) return { message: t.error.message, error: true };
      return {
        svg: lineChart({
          title: spec.chartTitle, xLabel: spec.xLabel, yLabel: spec.yLabel,
          labels: t.result.labels, datasets: t.result.datasets,
          emptyNote: events.length === 0 ? 'Belum ada event. Jalankan Dispatch di CPU.' : ''
        })
      };
    }

    var mod = window[spec.module];
    if (!mod || typeof mod.run !== 'function') {
      return { message: 'Modul ' + spec.moduleLabel + ' belum tersedia.' };
    }
    var runs = spec.algos.map(function (algo) {
      var r = unwrap(mod.run(spec.input(algo)));
      if (!r || typeof r !== 'object') throw new Error('hasil ' + spec.moduleLabel + ' ' + algo + ' kosong');
      return spec.pick(r, algo);
    });
    var out = window.AnalyticsLogic[spec.series](runs);
    if (!out.ok) return { message: out.error.message, error: true };
    return {
      svg: barChart({
        title: spec.chartTitle, xLabel: spec.xLabel, yLabel: spec.yLabel,
        labels: out.result.labels, datasets: out.result.datasets, bestIndex: out.result.best.index
      })
    };
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function cardEl(key) {
    return container ? container.querySelector('[data-anal-chart="' + key + '"]') : null;
  }

  // Gambar ulang satu grafik saja
  function renderChart(key) {
    var spec = getSpec(key);
    var card = cardEl(key);
    if (!spec || !card) return;
    var body = card.querySelector('.anal-chart-body');
    var btnDl = card.querySelector('[data-anal-action="download"]');
    body.textContent = '';

    var res;
    try {
      res = buildChart(spec);
    } catch (e) {
      res = { message: 'Gagal membuat grafik: ' + e.message, error: true };
      log('error grafik ' + spec.moduleLabel + ': ' + e.message);
    }

    if (res.svg) {
      body.appendChild(res.svg);
      btnDl.disabled = false;
    } else {
      var msg = document.createElement('div');
      msg.className = 'anal-msg empty' + (res.error ? ' anal-msg-error' : '');
      msg.textContent = res.message;
      body.appendChild(msg);
      btnDl.disabled = true;
    }
  }

  function downloadSvg(key) {
    var card = cardEl(key);
    var svg = card ? card.querySelector('.anal-chart-body svg') : null;
    if (!svg) return;
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
    var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var name = 'analytics-' + key + '.svg';
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    container.appendChild(a);
    a.click();
    container.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* abaikan */ } }, 1000);
    log('ekspor SVG: ' + name);
  }

  function buildCard(spec) {
    var card = document.createElement('div');
    card.className = 'app-section anal-card';
    card.setAttribute('data-anal-chart', spec.key);

    var head = document.createElement('div');
    head.className = 'app-row anal-card-head';
    var title = document.createElement('span');
    title.className = 'app-label anal-card-title';
    title.textContent = spec.cardTitle;
    var actions = document.createElement('span');
    actions.className = 'anal-actions';

    var btnRefresh = document.createElement('button');
    btnRefresh.type = 'button';
    btnRefresh.className = 'btn-secondary';
    btnRefresh.setAttribute('data-anal-action', 'refresh');
    btnRefresh.textContent = 'Refresh';
    btnRefresh.addEventListener('click', function () {
      try {
        renderChart(spec.key);
        log('refresh grafik ' + spec.cardTitle);
      } catch (e) { log('error refresh: ' + e.message); }
    });

    var btnDl = document.createElement('button');
    btnDl.type = 'button';
    btnDl.className = 'btn-secondary';
    btnDl.setAttribute('data-anal-action', 'download');
    btnDl.textContent = 'Unduh SVG';
    btnDl.addEventListener('click', function () {
      try { downloadSvg(spec.key); } catch (e) { log('error ekspor SVG: ' + e.message); }
    });

    actions.appendChild(btnRefresh);
    actions.appendChild(btnDl);
    head.appendChild(title);
    head.appendChild(actions);

    var body = document.createElement('div');
    body.className = 'anal-chart-body';

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  // Gambar ulang dari state modul (state disimpan di variabel modul, bukan di DOM).
  function render() {
    if (!container) return;
    container.textContent = '';
    var root = document.createElement('div');
    root.className = 'anal-root';
    SPECS.forEach(function (spec) { root.appendChild(buildCard(spec)); });
    container.appendChild(root);
    SPECS.forEach(function (spec) { renderChart(spec.key); });
  }

  // Listener event os:* didaftarkan SEKALI di sini (bukan di mount),
  // supaya tetap berjalan walaupun jendela modul sedang ditutup.
  window.addEventListener('os:reset', function () {
    try {
      events = [];
      render();
    } catch (e) {
      log('error saat reset: ' + e.message);
    }
  });

  window.registerApp({
    id: 'analytics',
    title: 'Analytics',
    width: 560,
    height: 420,
    color: '#0ea5e9',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"></line><rect x="6" y="11" width="3" height="9"></rect><rect x="11" y="5" width="3" height="15"></rect><rect x="16" y="14" width="3" height="6"></rect></svg>',
    mount: function (el) {
      container = el;
      render();
    },
    unmount: function () { container = null; },
    getState: function () { return {}; },
  });
})();
