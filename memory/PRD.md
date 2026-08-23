# PRD — artirdim.com (Laravel 12 + Inertia.js + Vue 3 Açık Artırma Platformu)

## Orijinal problem
Mevcut Laravel Blade projesini (GitHub: jaguv/aswq) geliştirmek. Görev: tüm Blade view'larını
Inertia.js + Vue 3'e **1:1 (görsel + davranış birebir)** dönüştürmek. Tailwind eklenmeyecek;
mevcut Metronic/theme-new.css ve class isimleri korunacak. Backend'e dokunulmayacak.

## Mimari
- Backend: Laravel 12 (PHP 8.2), MariaDB, Redis. Inertia adaptörü + Ziggy.
- Frontend: Inertia + Vue 3 (Composition API), Vite build. AppLayout/AuthLayout.
- Ortam: `/app/laravel_project/project`. Laravel supervisor ile **port 3000**'de (preview URL).
  MariaDB + Redis + laravel + laravel-schedule supervisor program'ları eklendi.
- Test hesapları (şifre `password`): admin@test.com, seller@test.com, buyer@test.com.

## Bu oturumda yapılanlar (2026-06)
- Ortam sıfırdan kuruldu (klon + PHP/Composer/MariaDB/Redis + install + migrate/seed + build).
- **GRUP 7 tamamlandı (16/16):** Admin Siparişler (index/show), Admin Destek (index/show),
  Admin Ayarlar (9 sekme). Controller'lar `Inertia::render`'a çevrildi; backend mantığı korundu.
- Bug fix turu: destek mesaj balonu CSS çakışması, İlan Düzenle kategori Select2, native select
  dark-mode okunabilirliği, İlan Göster başlık ikonu. (`admin-fixes.css` eklendi.)
- Testing agent: iteration_1 (%100 — Orders/Support/Settings), iteration_2 (%100 — 3 bug fix).

## Tamamlanan gruplar
GRUP 0,1,2,4,5,6,7 TAMAM. GRUP 3 kısmen (ilan detay + profil tamam).

## Backlog / Kalan
- **P0:** GRUP 3 — Satıcı Canlı Yayın / WebRTC (`BroadcastController@show`, Reverb WebSocket).
- **P1:** Proje kök/Git yapısı temizliği (aswq/auction/laravel_project iç içe sarmalayıcılar);
  GitHub'a tek temiz repo olarak push için düzenleme.
- **P2:** Edit.vue title input'una name/data-testid (test kolaylığı); genel selectlere name.
- **P2:** AuctionSeeder'a en az 1 active + 1 draft satıcı ilanı + örnek sipariş/talep.

## Notlar
- Bakiye/ödeme demo (gerçek sağlayıcı bağlı değil). Broadcast `log` driver (Reverb yok).
- Blade dosyaları silinmedi (karma mod güvenliği); ilgili controller'lar Inertia'ya geçti.
EOF