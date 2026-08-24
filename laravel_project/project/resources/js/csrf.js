/*
 | SPA-güvenli CSRF başlıkları.
 | Inertia SPA'da <meta name="csrf-token"> login/oturum yenilenince BAYATLAR ve
 | fetch POST'ları 419 verir. XSRF-TOKEN cookie'si her yanıtta tazelendiği için
 | onu X-XSRF-TOKEN olarak göndermek en güvenilir yöntemdir (Laravel decrypt eder).
*/
export function csrfHeaders(extra = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...extra };
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (m) {
        headers['X-XSRF-TOKEN'] = decodeURIComponent(m[1]);
    } else {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) headers['X-CSRF-TOKEN'] = meta.content;
    }
    return headers;
}
