<script>
import AppLayout from '@/Layouts/AppLayout.vue';
export default { layout: AppLayout };
</script>

<script setup>
import { onMounted, onUnmounted, nextTick } from 'vue';
import { Head, Link } from '@inertiajs/vue3';

const props = defineProps({
    a: Object,
    config: Object,
});

function loadScript(src) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.dataset.auctionShow = '1';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.body.appendChild(s);
    });
}

async function boot() {
    // Mobil/masaüstü: ilan detayına girince sayfa en üstten açılmalı
    try { window.scrollTo({ top: 0, left: 0 }); } catch (e) { window.scrollTo(0, 0); }
    await nextTick();
    // config.js bir IIFE — her mount'ta güvenle yeniden çalışıp window.* değerlerini tazeler
    await loadScript('/assets/js/custom/auctions-new-config.js');
    if (window.__auctionShowInit) {
        // auction-show.js zaten yüklü: yeniden enjekte etme (top-level let çakışır), init'i tekrar çağır
        window.__auctionShowInit();
    } else {
        await loadScript('/assets/js/custom/auction-show.js');
    }
}

onMounted(boot);

onUnmounted(() => {
    if (window.__auctionShowCleanup) { try { window.__auctionShowCleanup(); } catch (e) {} }
    // sadece config script'lerini temizle; auction-show.js tekrar kullanılmak üzere kalır
    document.querySelectorAll('script[data-auction-show="1"]').forEach((s) => {
        if (s.src.includes('auctions-new-config.js')) s.remove();
    });
});
</script>

<template>
    <Head :title="a.title" />

    <div class="container-fluid py-3" style="max-width:1400px;">

        <!-- Toolbar -->
        <div class="au-toolbar">
            <div>
                <div class="au-title">{{ a.title_70 }}</div>
                <div class="au-breadcrumb">
                    <Link :href="route('index')">Ana Sayfa</Link>
                    <span class="sep">/</span>
                    <a href="#">Müzayedeler</a>
                    <span class="sep">/</span>
                    <span>{{ a.title_30 }}</span>
                </div>
            </div>
            <div class="au-status-badges">
                <span class="a-badge" :class="a.status_type">{{ a.status_label }}</span>
                <span v-if="a.is_active" class="live-pill"><span class="live-dot"></span> Canlı</span>
                <span class="viewer-pill">
                    <i class="bi bi-eye" style="font-size:12px;"></i>
                    <span id="viewer-count" data-testid="viewer-count">—</span> izleyici
                </span>
            </div>
        </div>

        <!-- Main Grid -->
        <div class="auction-grid">

            <!-- SOL KOLON -->
            <div style="display:flex;flex-direction:column;gap:16px;">

                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <div class="mode-toggle">
                        <button class="mode-btn active" id="tab-gallery" onclick="switchTab('gallery')">
                            <i class="bi bi-images"></i> Fotoğraflar
                        </button>
                        <button class="mode-btn" :class="{ 'd-none': !(a.uses_promo_video || (a.is_live && !a.has_finished)) }"
                                id="tab-stream" onclick="switchTab('stream')">
                            <template v-if="a.uses_promo_video"><i class="bi bi-film"></i> Tanıtım Videosu</template>
                            <template v-else><i class="bi bi-camera-video"></i> Canlı İzle</template>
                        </button>
                    </div>
                    <div style="font-size:12px;color:var(--muted);">
                        <i class="bi bi-geo-alt" style="margin-right:4px;"></i>{{ a.location ?? '—' }}
                        &nbsp;·&nbsp;
                        <i class="bi bi-tag" style="margin-right:4px;"></i>{{ a.category_name ?? '—' }}
                    </div>
                </div>

                <!-- GALLERY PANEL -->
                <div id="panel-gallery" class="section-panel active au-card" style="overflow:hidden;">
                    <div style="padding:14px 18px;">
                        <img id="mainImg" :src="a.cover_url" class="gallery-main" onclick="openLightbox(this.src)" :alt="a.title">
                    </div>
                    <div v-if="a.images.length > 1" class="gallery-thumbs">
                        <img v-for="(img, i) in a.images" :key="i" :src="img.url"
                             :onclick="`switchImg(this,'${img.url}')`"
                             class="gallery-thumb" :class="{ active: img.is_cover }" :alt="`Görsel ${i+1}`">
                    </div>
                </div>

                <!-- STREAM PANEL -->
                <div id="panel-stream" class="section-panel">
                    <template v-if="a.uses_promo_video">
                        <div class="camera-section" data-testid="promo-video-section">
                            <video v-if="a.is_direct_video" :src="a.promo_video_url" class="camera-video" controls style="display:block;object-fit:contain;background:#000;"></video>
                            <iframe v-else :src="a.embed_video_url" style="width:100%;height:100%;border:0;display:block;" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
                        </div>
                    </template>
                    <template v-else>
                        <div class="camera-section">
                            <div class="cam-off-banner" id="cam-off-state">
                                <i class="bi bi-camera-video-off"></i>
                                <p>Satıcı henüz yayın başlatmadı</p>
                            </div>
                            <video id="liveVideo" class="camera-video" autoplay playsinline style="display:none;" muted></video>

                            <div id="viewer-sell-bar" style="display:none;position:absolute;bottom:0;left:0;right:0;z-index:15;background:rgba(220,38,38,.88);backdrop-filter:blur(6px);padding:10px 18px;align-items:center;justify-content:center;gap:10px;font-size:14px;font-weight:700;color:#fff;">
                                <i class="bi bi-hourglass-split"></i>
                                <span id="viewer-sell-bar-text">3 saniye sonra satış tamamlanacak…</span>
                            </div>

                            <div id="viewer-sold-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.82);z-index:20;border-radius:16px;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
                                <div style="font-size:56px;">🎉</div>
                                <div style="font-size:26px;font-weight:800;color:#10b981;">Satış Tamamlandı!</div>
                                <div id="viewer-sold-sub" style="font-size:14px;color:rgba(255,255,255,.65);">—</div>
                            </div>
                            <div class="camera-overlay">
                                <div class="camera-top-bar">
                                    <div>
                                        <span class="live-pill" id="stream-live-pill" style="display:none;">
                                            <span class="live-dot"></span> CANLI
                                        </span>
                                    </div>
                                    <div style="display:flex;gap:6px;">
                                        <button class="cam-btn-icon" id="vol-btn" onclick="toggleStreamVolume()" title="Ses aç/kapat" style="display:none;">
                                            <i class="bi bi-volume-mute" id="vol-icon"></i>
                                        </button>
                                        <button class="cam-btn-icon" onclick="toggleFullscreen()" id="fs-btn" style="display:none;">
                                            <i class="bi bi-fullscreen" id="fs-icon"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="camera-bottom-bar">
                                    <span class="viewer-pill">
                                        <i class="bi bi-people" style="font-size:12px;"></i>
                                        <span id="viewer-count-stream">—</span> izleyici
                                    </span>
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- CANLI SOHBET -->
                    <div class="au-card mt-3" data-testid="viewer-chat-card" style="margin-top:16px;">
                        <div class="au-card-head">
                            <div class="au-card-title"><i class="bi bi-chat-dots"></i> Canlı Sohbet · Satıcıya Sor</div>
                        </div>
                        <div id="chatMessages" data-testid="viewer-chat-messages"
                             style="height:240px;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;">
                            <div id="chatEmpty" style="margin:auto;text-align:center;color:var(--muted);font-size:12px;">
                                <i class="bi bi-chat" style="font-size:24px;display:block;margin-bottom:6px;opacity:.3;"></i>
                                İlk mesajı sen yaz
                            </div>
                        </div>
                        <template v-if="config.is_auth === '1'">
                            <div v-if="a.has_finished" style="padding:12px 16px;border-top:1px solid var(--border);color:var(--muted);font-size:12px;">
                                <i class="bi bi-lock"></i> Yayın sona erdi, sohbet kapalı.
                            </div>
                            <template v-else>
                                <form id="chatForm" style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);">
                                    <input id="chatInput" type="text" maxlength="300" autocomplete="off"
                                           data-testid="viewer-chat-input" placeholder="Satıcıya bir soru sor..."
                                           style="flex:1;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;">
                                    <button type="submit" data-testid="viewer-chat-send"
                                            style="padding:9px 16px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">
                                        <i class="bi bi-send"></i>
                                    </button>
                                </form>
                                <div id="chatError" style="display:none;padding:0 16px 10px;color:#ef4444;font-size:12px;"></div>
                            </template>
                        </template>
                        <div v-else style="padding:12px 16px;border-top:1px solid var(--border);font-size:12px;">
                            Sohbete katılmak için <Link :href="config.login_url" style="color:var(--primary);">giriş yap</Link>.
                        </div>
                    </div>
                </div>

                <!-- Açıklama -->
                <div class="au-card">
                    <div class="au-card-head">
                        <div class="au-card-title"><i class="bi bi-file-text"></i> Açıklama</div>
                    </div>
                    <div class="au-desc-body">{{ a.description }}</div>
                </div>

                <!-- Detaylar -->
                <div class="au-card">
                    <div class="au-card-head">
                        <div class="au-card-title"><i class="bi bi-info-circle"></i> Ürün Özellikleri</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-tag"></i></div>
                        <div><div class="detail-lbl">Kategori</div><div class="detail-val">{{ a.category_name ?? '—' }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-arrow-up-circle"></i></div>
                        <div><div class="detail-lbl">Min. Artış</div><div class="detail-val">{{ a.min_increment_fmt }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-star"></i></div>
                        <div><div class="detail-lbl">Durum</div><div class="detail-val">{{ a.condition_label }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-geo-alt"></i></div>
                        <div><div class="detail-lbl">Konum</div><div class="detail-val">{{ a.location ?? '—' }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-calendar3"></i></div>
                        <div><div class="detail-lbl">Başlangıç</div><div class="detail-val">{{ a.starts_at_fmt }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-calendar-x"></i></div>
                        <div><div class="detail-lbl">Bitiş</div><div class="detail-val">{{ a.ends_at_fmt }}</div></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-icon"><i class="bi bi-eye"></i></div>
                        <div><div class="detail-lbl">Görüntülenme</div><div class="detail-val">{{ a.view_count_fmt }}</div></div>
                    </div>
                </div>
            </div>

            <!-- SAĞ KOLON — Teklif Paneli -->
            <div class="bid-column">

                <div class="au-card" style="overflow:hidden;">
                    <div class="price-hero">
                        <div class="price-lbl">Güncel En Yüksek Teklif</div>
                        <div class="price-value" id="live-price">{{ a.display_price }}</div>
                        <div class="price-start">Başlangıç: {{ a.starting_price_fmt }}</div>
                        <div v-if="a.buy_now_price_fmt" class="buy-now-box">
                            <div>
                                <div class="buy-now-lbl">⚡ Hemen Satın Al</div>
                                <div class="buy-now-val">{{ a.buy_now_price_fmt }}</div>
                            </div>
                            <button class="cam-btn" style="background:rgba(251,191,36,.15);border-color:rgba(251,191,36,.4);color:#fbbf24;">Hemen Al</button>
                        </div>
                    </div>
                    <div class="stats-row">
                        <div class="stat-cell"><div class="stat-lbl">Teklif</div><div class="stat-val" id="live-bid-count">{{ a.bid_count }}</div></div>
                        <div class="stat-cell"><div class="stat-lbl">Kalan</div><div class="stat-val" id="live-timer">—</div></div>
                        <div class="stat-cell"><div class="stat-lbl">İzleyici</div><div class="stat-val" id="live-viewer-stat">—</div></div>
                    </div>
                    <div class="bid-form-area">
                        <template v-if="config.is_auth === '1'">
                            <template v-if="a.is_active && !a.is_owner">
                                <div class="quick-grid" id="quick-btns">
                                    <button v-for="(q, qi) in a.quick" :key="qi" class="quick-btn" :onclick="`setQuick(${q.val})`">
                                        +{{ q.inc_fmt }}
                                        <span>{{ q.val_fmt }}</span>
                                    </button>
                                </div>
                                <div class="bid-input-wrap">
                                    <input type="number" id="bid-input" name="amount" data-testid="bid-amount-input"
                                           :min="a.min_bid" :step="config.min_increment" :placeholder="`Min: ${a.min_bid_fmt}`">
                                    <div class="currency">₺</div>
                                </div>
                                <div class="bid-error" id="bid-error"></div>
                                <button class="bid-submit" id="bid-btn" onclick="submitBid()" data-testid="bid-submit-btn">
                                    <i class="bi bi-lightning-charge-fill"></i>
                                    <span id="bid-btn-text">Teklif Ver</span>
                                </button>
                            </template>
                            <div v-else-if="a.is_owner" class="alert alert-warning mb-0" style="font-size:13px;border-radius:10px;">
                                <i class="bi bi-info-circle me-1"></i> Kendi ilanınıza teklif veremezsiniz.
                            </div>
                            <div v-else class="alert alert-danger mb-0" style="font-size:13px;border-radius:10px;">
                                <i class="bi bi-clock me-1"></i> Bu müzayede sona erdi.
                            </div>
                        </template>
                        <Link v-else :href="config.login_url" class="bid-submit" style="text-decoration:none;">
                            <i class="bi bi-box-arrow-in-right"></i> Teklif vermek için giriş yap
                        </Link>
                    </div>
                </div>

                <!-- Satıcı Kartı -->
                <div class="au-card seller-card" data-testid="seller-card">
                    <div class="au-card-head">
                        <div class="au-card-title"><i class="bi bi-shop"></i> Satıcı</div>
                    </div>
                    <div class="seller-card-body">
                        <Link :href="a.seller.profile_url" class="seller-ava-link">
                            <img class="seller-ava" :src="a.seller.profile_img" :alt="a.seller.name">
                        </Link>
                        <div class="seller-meta">
                            <Link :href="a.seller.profile_url" class="seller-name" data-testid="seller-name">{{ a.seller.name }}</Link>
                            <div class="seller-handle">&#64;{{ a.seller.username }}</div>
                            <div class="seller-rating" data-testid="seller-rating">
                                <span class="stars">
                                    <i v-for="(st, si) in a.seller.stars" :key="si" class="bi"
                                       :class="st === 'full' ? 'bi-star-fill' : (st === 'half' ? 'bi-star-half' : 'bi-star')"></i>
                                </span>
                                <span class="seller-rating-num">{{ a.seller.rating_fmt }}</span>
                                <span class="seller-rating-cnt">({{ a.seller.review_count }} değerlendirme)</span>
                            </div>
                        </div>
                    </div>
                    <div class="seller-actions">
                        <template v-if="config.is_auth === '1'">
                            <form v-if="config.current_user_id !== a.seller.id" :action="config.messages_start_url" method="POST" class="seller-msg-form">
                                <input type="hidden" name="_token" :value="config.csrf">
                                <input type="hidden" name="user_id" :value="a.seller.id">
                                <button type="submit" class="seller-btn-primary" data-testid="message-seller-btn">
                                    <i class="bi bi-chat-dots"></i> Satıcıya Mesaj Gönder
                                </button>
                            </form>
                        </template>
                        <Link v-else :href="config.login_url" class="seller-btn-primary" data-testid="message-seller-btn">
                            <i class="bi bi-chat-dots"></i> Satıcıya Mesaj Gönder
                        </Link>
                        <Link :href="a.seller.profile_url" class="seller-btn-ghost">
                            <i class="bi bi-person"></i> Profili Gör
                        </Link>
                    </div>
                </div>

                <!-- Teklif Feed -->
                <div class="au-card">
                    <div class="au-card-head">
                        <div class="au-card-title"><i class="bi bi-activity"></i> Teklif Akışı</div>
                        <span class="a-badge info" id="bid-count-badge">{{ a.bid_count }} teklif</span>
                    </div>
                    <div class="feed-scroll">
                        <div id="bid-feed">
                            <template v-if="a.bids.length">
                                <div v-for="(bid, bi) in a.bids" :key="bi" class="bid-item" :class="{ 'bid-top': bid.is_top }">
                                    <span v-if="bid.is_top" class="top-label">En Yüksek</span>
                                    <span class="bid-rank" :class="bid.rank_class">{{ bid.rank }}</span>
                                    <img class="bid-avatar" :src="bid.avatar" :alt="bid.name">
                                    <div style="flex:1;min-width:0;">
                                        <div class="bid-name">{{ bid.name }}</div>
                                        <div class="bid-time">{{ bid.time }}</div>
                                    </div>
                                    <div class="bid-amount">{{ bid.amount_fmt }}</div>
                                </div>
                            </template>
                            <div v-else class="feed-empty" id="feed-empty">
                                <i class="bi bi-inbox"></i>
                                <p>Henüz teklif yok. İlk teklifi sen ver!</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- MOBİL STICKY BAR -->
        <div v-if="config.is_auth === '1' && a.is_active && !a.is_owner" class="bid-sticky-bar">
            <div class="sticky-price-row">
                <div>
                    <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">Güncel Teklif</div>
                    <div class="sticky-price" id="live-price-mobile">{{ a.display_price }}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">Kalan Süre</div>
                    <div class="sticky-timer" id="live-timer-mobile">—</div>
                </div>
            </div>
            <div class="sticky-input-row">
                <input type="number" id="bid-input-mobile" :min="a.min_bid" :step="config.min_increment" :placeholder="`Min: ${a.min_bid_fmt}`">
                <button class="sticky-submit" onclick="submitBidMobile()">
                    <i class="bi bi-lightning-charge-fill"></i> Teklif Ver
                </button>
            </div>
            <div class="bid-error" id="bid-error-mobile" style="margin-top:8px;margin-bottom:0;"></div>
        </div>

        <!-- Lightbox -->
        <div id="lightbox" onclick="closeLightbox()"
             style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);align-items:center;justify-content:center;cursor:zoom-out;">
            <img id="lightbox-img" style="max-width:92vw;max-height:92vh;object-fit:contain;border-radius:12px;">
        </div>

        <!-- Config root — harici JS bu data-* değerlerini okur -->
        <div id="auctionNewConfigRoot"
             :data-auction-id="config.auction_id"
             :data-min-increment="config.min_increment"
             :data-bid-url="config.bid_url"
             :data-csrf="config.csrf"
             :data-seller-id="config.seller_id"
             :data-remaining-secs="config.remaining_secs"
             :data-live-state-url="config.live_state_url"
             :data-chat-poll-url="config.chat_poll_url"
             :data-chat-store-url="config.chat_store_url"
             :data-is-finished="config.is_finished"
             :data-uses-video="config.uses_video"
             :data-last-bid-id="config.last_bid_id"
             :data-sold-handled="config.sold_handled"
             :data-is-auth="config.is_auth"
             :data-current-user-id="config.current_user_id"
             :data-current-min="config.current_min"></div>
    </div>
</template>
