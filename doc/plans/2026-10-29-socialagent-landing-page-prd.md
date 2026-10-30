# PRD: Landing page SocialAgent

**Status:** Draft untuk ditinjau  
**Tanggal:** 2026-10-29  
**Sumber desain:** [DESIGN.md](../../DESIGN.md), khususnya SocialAgent daily overview  
**Sumber produk:** [README](../../README.md)

## Tujuan dan konteks

SocialAgent adalah workspace agensi kreatif untuk mengelola klien, brand, kampanye, dan konten bersama tim agen AI. Pengguna dapat meninjau hasil, memberikan persetujuan, serta memantau tugas dan biaya. Landing page publik menjelaskan nilai produk dan mengarahkan calon pengguna ke aplikasi.

Halaman harus membantu pengunjung memahami produk, mengenali alur kerja bersama tim AI, dan menemukan cara masuk atau memulai. Sasaran utamanya adalah pemilik agensi, tim pemasaran, pemilik brand, kreator, dan pekerja lepas.

## Pesan produk

**Positioning:** Workspace untuk mengelola pekerjaan agensi kreatif bersama tim AI.

Manfaat yang ditampilkan: kelola klien dan pekerjaan dalam satu tempat; bekerja bersama agen dengan berbagai peran; tinjau hasil dan berikan persetujuan; pantau aktivitas dan biaya. Deskripsi, peran agen, integrasi, dan alur onboarding harus sesuai dengan kemampuan dan konfigurasi yang benar-benar tersedia. Jangan mengarang testimoni, statistik, harga, atau hasil pelanggan.

## Arah visual: selaras dengan DESIGN.md

Gunakan bahasa visual SocialAgent yang telah diterapkan pada aplikasi: **bingkai periwinkle, permukaan hangat dan terang, panel putih beroutline, aksen biru/kuning/teal, tombol utama coral berbentuk pill, serta bayangan offset kecil**. Tata letak pemasaran boleh lebih lapang daripada dashboard, tetapi hierarki harus jelas dan setiap dekorasi punya tujuan. Pertahankan karakter dan geometri yang sama saat mendukung tema gelap.

- Sumber nilai visual adalah `ui/src/index.css`. Gunakan token semantik dan token SocialAgent yang ada; jika perlu nilai baru, tambahkan melalui layer token tersebut. Jangan menulis warna, ukuran, jarak, radius, bayangan, atau durasi mentah di komponen.
- Gunakan komponen bersama yang sudah ada jika sesuai; variasi dibuat melalui props, bukan komponen duplikat. Ikuti terminologi UI: gunakan **task** untuk konsep task di UI produk; dalam copy Bahasa Indonesia publik, gunakan **tugas** secara konsisten.
- Bentuk hierarki dengan posisi, ukuran, dan ketebalan teks. Jangan menambahkan border atau latar pada setiap elemen tanpa alasan.
- Gunakan token fokus dan status semantik yang ada; pastikan informasi status tidak bergantung pada warna saja. Hormati preferensi reduced motion.
- Gunakan font dan nilai tipografi dari token yang tersedia. Identitas font atau palet baru tidak ditetapkan oleh PRD ini.
- Visual utama adalah preview workspace dengan data sintetis: kartu agen, tugas kampanye, dan tinjauan. Jangan menampilkan data nyata atau menggambarkan fitur yang belum terverifikasi.

## Struktur halaman dan copy awal

1. **Navigasi:** logo SocialAgent, tautan Fitur, Cara kerja, FAQ, serta tombol Masuk dan Mulai sekarang. Di layar kecil tampilkan navigasi yang dapat dioperasikan dengan keyboard.
2. **Hero:** “Tim kreatif AI untuk menjalankan ide besar Anda.” Subjudul: “Kelola klien, kampanye, dan konten bersama tim AI dalam satu workspace. Pantau pekerjaan dan berikan persetujuan saat dibutuhkan.” Tampilkan CTA Mulai sekarang dan Lihat cara kerja, bersama preview workspace.
3. **Manfaat:** empat blok singkat untuk pengelolaan pekerjaan, tim AI, tinjauan hasil, serta pemantauan aktivitas dan biaya. Gunakan panel dan aksen sistem yang relevan.
4. **Tim AI:** contoh Agency Director, Strategist, Copywriter, Designer, Researcher, dan SEO Specialist; periksa nama dan ketersediaannya sebelum publikasi. Setiap kartu menjelaskan peran dan contoh tugas tanpa menjanjikan hasil otomatis tertentu.
5. **Cara kerja:** siapkan agensi; tambahkan pekerjaan; bekerja bersama tim AI; tinjau dan lanjutkan. Sajikan sebagai alur horizontal pada ruang yang cukup dan vertikal pada layar sempit.
6. **Preview produk:** tunjukkan dashboard, agen, tugas, serta tinjauan menggunakan screenshot yang telah dibersihkan atau mockup sintetis. Jelaskan jika gambar bersifat ilustratif.
7. **FAQ:** jelaskan produk, pengguna yang cocok, tinjauan manusia, opsi konfigurasi AI, dan pengelolaan klien. Validasi jawaban terhadap perilaku produk.
8. **CTA penutup dan footer:** ajak pengguna memulai; tampilkan tautan yang benar-benar tersedia. Jangan membuat tautan kosong atau mengarang kebijakan.

## Perilaku dan aksesibilitas

- Halaman dapat dibuka tanpa login; akses ke aplikasi dan data perusahaan tetap mengikuti aturan otorisasi yang ada.
- Masuk menuju alur login yang tersedia. Mulai sekarang menuju alur pendaftaran/onboarding yang sudah didukung; tujuan konkret harus dipastikan sebelum implementasi. Lihat cara kerja menuju bagian terkait.
- Navigasi, tombol, dan FAQ berfungsi dengan keyboard, memiliki label dan indikator fokus, serta mengikuti urutan heading yang logis. Berikan alternatif teks yang sesuai untuk gambar dan pastikan kontras memadai.
- Desktop, tablet, dan ponsel harus dapat digunakan tanpa konten terpotong atau scroll horizontal; periksa kedua tema jika kontrol tema disediakan.
- Halaman memiliki judul, deskripsi, dan metadata berbagi yang sesuai. Jangan menambahkan pelacakan atau pengumpulan data tanpa keputusan produk.

## Kriteria penerimaan

- Pengunjung memahami produk dan tindakan berikutnya dari hero.
- Semua bagian dan CTA berfungsi; tujuan login/onboarding telah diverifikasi pada aplikasi yang berjalan.
- Tampilan selaras dengan SocialAgent di `DESIGN.md` dan menggunakan token serta komponen bersama yang sesuai.
- Konten dan preview mencerminkan kemampuan nyata, tanpa data pribadi atau kredensial.
- Review visual desktop dan mobile mencakup navigasi, kontras, fokus, reduced motion, serta tema yang didukung.
- Implementasi UI lulus `bun run check:token-gates` dan pemeriksaan relevan lainnya; hasil review visual dicatat secara terpisah dari pengujian struktural.

## Di luar lingkup

Harga dan pembayaran, CMS/blog, testimoni yang belum tersedia, perubahan dashboard atau model data, integrasi analytics, dan penyelesaian masalah Storage S3.

## Keputusan yang masih terbuka

- Bahasa halaman: Bahasa Indonesia diusulkan; konfirmasi kebutuhan bahasa lain.
- CTA Mulai sekarang: pendaftaran mandiri, onboarding, atau permintaan akses; pastikan alur yang tersedia.
- Domain publik dan lokasi rute landing page relatif terhadap aplikasi.
- Screenshot asli yang aman dipublikasikan atau mockup sintetis.
- Identitas brand tambahan dan aset logo, jika nilai yang ada belum mencukupi.
