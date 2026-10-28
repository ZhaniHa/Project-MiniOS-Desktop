# MiniOS Desktop (kerangka shell)

Simulator sistem operasi berbasis web: desktop environment dengan tiga aplikasi (CPU Scheduler, Memory, Disk Scheduling) yang saling terhubung lewat event.

## Menjalankan di komputer

Buka folder ini lewat server lokal (jangan klik dua kali `index.html`, karena `fetch` dan pemuatan script bisa diblokir browser):

Lalu buka alamat yang ditampilkan. Untuk GitHub Pages, cukup aktifkan Pages dari branch `main`.

## Struktur

```
index.html            halaman desktop
styles/desktop.css    gaya shell dan class bersama
shell/os.js           API: registerApp, kirimLog, OS
shell/windows.js      jendela, taskbar, start menu, tray
shell/terminal.js     aplikasi Terminal
shell/loader.js       memuat semua folder modul otomatis (file yang belum ada dilewati)
modules/_template/    template Hello World (salin, jangan diubah)
modules/cpu/          logic.js, app.js, style.css (opsional)
modules/memory/       logic.js, app.js, style.css (opsional)
modules/disk/         logic.js, app.js, style.css (opsional)
modules/monitor/      System Monitor (Ketua)
modules/analytics/    Analytics (Dev Data/QA)
tests/test.html       gerbang uji logika (semua modul)
tests/integration.html  uji alur CPU → Memory → Disk lewat event
```

## Aturan tim

1. Dilarang push ke `main`. Buat branch (`feat/cpu`, `feat/memory`, `feat/disk`) lalu ajukan Pull Request.
2. Hanya mengubah folder modul sendiri. Jangan mengubah `index.html`, `shell/*`, atau `tests/*`.
3. Mulai dari Hello World (salin `modules/_template/app.js`), pastikan muncul di desktop, baru menulis logika.
4. Sebelum PR: buka `tests/test.html`, semua kasus modulmu harus PASS. Modul lain yang belum ada tampil SKIP (bukan error).
   `tests/integration.html` dijalankan System Architect setelah semua modul digabung.
5. Detail kontrak data dan event: lihat `MiniOS_Spesifikasi_Teknis.md`.