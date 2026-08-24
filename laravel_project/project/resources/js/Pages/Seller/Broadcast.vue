<script>
import AppLayout from '@/Layouts/AppLayout.vue';
export default { layout: AppLayout };
</script>

<script setup>
import { Head, Link, router, usePage } from '@inertiajs/vue3';
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import { csrfHeaders } from '@/csrf';

const props = defineProps({ auction: Object, bids: Array, urls: Object, livekit_url: String });
const page = usePage();
const tok = () => page.props.csrf_token;

const stageRef = ref(null);
const videoRef = ref(null);
const status = ref('idle');      // idle | connecting | live | error
const errorMsg = ref('');
const viewers = ref(0);
const isFullscreen = ref(false);
const bidList = ref([...props.bids]);

let room = null;
let localTracks = [];
let statePoll = null;

/* ── Chat (LiveKit data channel) ── */
const chat = ref([]);
const chatInput = ref('');
const chatBoxRef = ref(null);
const enc = new TextEncoder();
const dec = new TextDecoder();

function pushChat(msg) {
    chat.value.push(msg);
    if (chat.value.length > 200) chat.value.shift();
    nextTick(() => { const el = chatBoxRef.value; if (el) el.scrollTop = el.scrollHeight; });
}
function sendChat() {
    const text = chatInput.value.trim();
    if (!text || !room) return;
    const payload = { name: 'Sen (Yayıncı)', text, self: true };
    pushChat(payload);
    room.localParticipant.publishData(enc.encode(JSON.stringify({ name: 'Yayıncı', text })), { reliable: true });
    chatInput.value = '';
}

/* ── İzleyici sayısı (yayıncı hariç) ── */
function recount() {
    if (!room) { viewers.value = 0; return; }
    let n = 0;
    room.remoteParticipants.forEach((p) => {
        let role = 'viewer';
        try { role = JSON.parse(p.metadata || '{}').role || 'viewer'; } catch (e) {}
        if (role !== 'broadcaster') n++;
    });
    viewers.value = n;
}

/* ── Yayını başlat ── */
async function startBroadcast() {
    if (status.value === 'connecting' || status.value === 'live') return;
    status.value = 'connecting';
    errorMsg.value = '';
    try {
        const res = await fetch(props.urls.token, { method: 'POST', headers: csrfHeaders({ 'Content-Type': 'application/json' }, tok()), credentials: 'same-origin' });
        if (!res.ok) throw new Error('Token alınamadı');
        const data = await res.json();

        room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.ParticipantConnected, recount)
            .on(RoomEvent.ParticipantDisconnected, recount)
            .on(RoomEvent.Disconnected, () => { status.value = 'idle'; })
            .on(RoomEvent.DataReceived, (payload, participant) => {
                try {
                    const d = JSON.parse(dec.decode(payload));
                    pushChat({ name: d.name || participant?.name || 'İzleyici', text: d.text, self: false });
                } catch (e) {}
            });

        await room.connect(data.url || props.livekit_url, data.token);

        localTracks = await createLocalTracks({ audio: true, video: { resolution: { width: 1280, height: 720 } } });
        for (const t of localTracks) {
            await room.localParticipant.publishTrack(t);
            if (t.kind === Track.Kind.Video && videoRef.value) t.attach(videoRef.value);
        }
        status.value = 'live';
        recount();
        // Sunucuya canlı bilgisini bildir
        fetch(props.urls.live_status, { method: 'POST', headers: csrfHeaders({ 'Content-Type': 'application/json' }, tok()), credentials: 'same-origin', body: JSON.stringify({ live: true }) }).catch(() => {});
        startStatePoll();
    } catch (e) {
        status.value = 'error';
        errorMsg.value = e.message || 'Kamera/yayın başlatılamadı. İzin verdiğinden emin ol.';
    }
}

async function stopBroadcast() {
    try { localTracks.forEach((t) => t.stop()); } catch (e) {}
    localTracks = [];
    if (room) { await room.disconnect(); room = null; }
    status.value = 'idle';
    viewers.value = 0;
    fetch(props.urls.end, { method: 'POST', headers: csrfHeaders({ 'Content-Type': 'application/json' }, tok()), credentials: 'same-origin' }).catch(() => {});
}

/* ── Teklif polling (geri sayım iptali için) ── */
function startStatePoll() {
    clearInterval(statePoll);
    statePoll = setInterval(async () => {
        try {
            const r = await fetch(props.urls.live_state, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            const d = await r.json();
            if (Array.isArray(d.bids)) {
                const top = d.bids[0];
                if (top && (!bidList.value[0] || top.id !== bidList.value[0].id)) {
                    bidList.value = d.bids.map((b) => ({ id: b.id, user: b.user_name || b.user, amount: b.amount, display: b.display_price || b.display, time: b.time || '' }));
                    // Geri sayım sırasında yeni teklif → iptal
                    if (selling.value) cancelSell('Yeni teklif geldi — satış iptal edildi.');
                }
            }
        } catch (e) {}
    }, 2500);
}

/* ── "Satılıyor" 10 sn geri sayım ── */
const selling = ref(false);
const soldTo = ref(null);
const countdown = ref(10);
const sold = ref(false);
let cdTimer = null;

function startSell(bid) {
    if (selling.value || sold.value) return;
    selling.value = true;
    soldTo.value = bid;
    countdown.value = 10;
    cdTimer = setInterval(() => {
        countdown.value--;
        if (countdown.value <= 0) finalizeSell();
    }, 1000);
}
function cancelSell(reason) {
    clearInterval(cdTimer);
    selling.value = false;
    soldTo.value = null;
    if (reason && window.ajaxToast) window.ajaxToast('warning', reason);
}
async function finalizeSell() {
    clearInterval(cdTimer);
    if (!soldTo.value) { selling.value = false; return; }
    try {
        const r = await fetch(props.urls.sell, { method: 'POST', headers: csrfHeaders({ 'Content-Type': 'application/json' }, tok()), credentials: 'same-origin', body: JSON.stringify({ bid_id: soldTo.value.id }) });
        const d = await r.json();
        if (d.success) { sold.value = true; selling.value = false; }
        else { cancelSell(d.message || 'Satış başarısız.'); }
    } catch (e) { cancelSell('Satış başarısız.'); }
}

/* ── Tam ekran ── */
function toggleFullscreen() {
    const el = stageRef.value;
    if (!document.fullscreenElement) { el?.requestFullscreen?.(); isFullscreen.value = true; }
    else { document.exitFullscreen?.(); isFullscreen.value = false; }
}
function onFsChange() { isFullscreen.value = !!document.fullscreenElement; }

onMounted(() => document.addEventListener('fullscreenchange', onFsChange));
onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFsChange);
    clearInterval(statePoll); clearInterval(cdTimer);
    try { localTracks.forEach((t) => t.stop()); } catch (e) {}
    if (room) room.disconnect();
});
</script>

<template>
    <Head :title="`Canlı Yayın — ${auction.title}`" />
    <div class="lk-wrap">
        <div class="lk-topbar">
            <Link :href="urls.show" class="lk-back"><i class="bi bi-arrow-left"></i> İlana Dön</Link>
            <div class="lk-title">{{ auction.title }}</div>
            <div class="lk-price">{{ auction.current_price }}</div>
        </div>

        <div class="lk-grid">
            <!-- Video sahnesi -->
            <div class="lk-stage" ref="stageRef" data-testid="lk-stage">
                <video ref="videoRef" autoplay playsinline muted class="lk-video"></video>

                <!-- Kamera kapalıyken -->
                <div v-if="status !== 'live'" class="lk-cover">
                    <img :src="auction.cover_url" class="lk-cover-img" alt="">
                    <div class="lk-cover-c">
                        <template v-if="status === 'connecting'">
                            <div class="lk-spinner"></div><div>Bağlanıyor…</div>
                        </template>
                        <template v-else>
                            <i class="bi bi-camera-video-fill" style="font-size:2.4rem"></i>
                            <div class="lk-cover-t">Yayın hazır</div>
                            <button class="lk-btn-go" @click="startBroadcast" data-testid="lk-start"><i class="bi bi-broadcast"></i> Yayını Başlat</button>
                            <div v-if="errorMsg" class="lk-err" data-testid="lk-error">{{ errorMsg }}</div>
                        </template>
                    </div>
                </div>

                <!-- Üst overlay: LIVE + izleyici -->
                <div v-if="status === 'live'" class="lk-badges">
                    <span class="lk-live"><span class="lk-dot"></span> CANLI</span>
                    <span class="lk-viewers" data-testid="lk-viewers"><i class="bi bi-eye"></i> {{ viewers }}</span>
                </div>

                <!-- Kontroller -->
                <div class="lk-controls">
                    <button v-if="status === 'live'" class="lk-ctl danger" @click="stopBroadcast" data-testid="lk-stop"><i class="bi bi-stop-fill"></i> Bitir</button>
                    <button class="lk-ctl" @click="toggleFullscreen" data-testid="lk-fullscreen"><i class="bi" :class="isFullscreen ? 'bi-fullscreen-exit' : 'bi-fullscreen'"></i></button>
                </div>

                <!-- Chat overlay (video üstünde, Twitch/Kick tarzı) -->
                <div class="lk-chat-overlay" data-testid="lk-chat">
                    <div class="lk-chat-list" ref="chatBoxRef">
                        <div v-for="(m, i) in chat" :key="i" class="lk-chat-msg" :class="{ me: m.self }">
                            <b>{{ m.name }}:</b> {{ m.text }}
                        </div>
                        <div v-if="!chat.length" class="lk-chat-empty">Sohbet mesajları burada görünür</div>
                    </div>
                    <form class="lk-chat-form" @submit.prevent="sendChat">
                        <input v-model="chatInput" class="lk-chat-input" placeholder="Mesaj yaz…" maxlength="300" data-testid="lk-chat-input">
                        <button type="submit" class="lk-chat-send"><i class="bi bi-send-fill"></i></button>
                    </form>
                </div>

                <!-- SATILIYOR geri sayım overlay -->
                <div v-if="selling" class="lk-sell-overlay" data-testid="lk-selling">
                    <div class="lk-sell-count">{{ countdown }}</div>
                    <div class="lk-sell-t">SATILIYOR…</div>
                    <div class="lk-sell-to">{{ soldTo?.user }} — {{ soldTo?.display }}</div>
                    <button class="lk-sell-cancel" @click="cancelSell('Satış iptal edildi.')" data-testid="lk-sell-cancel">İptal</button>
                </div>
                <!-- SATILDI -->
                <div v-if="sold" class="lk-sell-overlay sold" data-testid="lk-sold">
                    <i class="bi bi-check-circle-fill" style="font-size:3rem;color:#22c55e"></i>
                    <div class="lk-sell-t">SATILDI!</div>
                    <div class="lk-sell-to">{{ soldTo?.user }} — {{ soldTo?.display }}</div>
                </div>
            </div>

            <!-- Yan panel: teklifler -->
            <div class="lk-side">
                <div class="lk-side-head"><i class="bi bi-cash-coin"></i> Teklifler & Satış</div>
                <div class="lk-side-hint">Bir teklife "Sat" dediğinde video üzerinde 10 sn geri sayım başlar; yeni teklif gelirse otomatik iptal olur.</div>
                <div class="lk-bids">
                    <div v-for="(b, i) in bidList" :key="b.id" class="lk-bid" :class="{ top: i === 0 }">
                        <div>
                            <div class="lk-bid-u">{{ b.user }}</div>
                            <div class="lk-bid-t">{{ b.time }}</div>
                        </div>
                        <div class="lk-bid-a">{{ b.display }}</div>
                        <button class="lk-bid-sell" :disabled="selling || sold" @click="startSell(b)" :data-testid="`lk-sell-${b.id}`">Sat</button>
                    </div>
                    <div v-if="!bidList.length" class="lk-chat-empty">Henüz teklif yok</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.lk-wrap { max-width: 1500px; margin: 0 auto; padding: 16px; }
.lk-topbar { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.lk-back { color: var(--text); text-decoration: none; font-weight: 600; }
.lk-title { font-weight: 800; font-size: 1.05rem; flex: 1; color: var(--text); }
.lk-price { font-weight: 800; color: #22c55e; }
.lk-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }
@media (max-width: 900px) { .lk-grid { grid-template-columns: 1fr; } }
.lk-stage { position: relative; aspect-ratio: 16/9; background: #000; border-radius: 16px; overflow: hidden; }
.lk-stage:fullscreen { aspect-ratio: auto; width: 100%; height: 100%; border-radius: 0; }
.lk-video { width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
.lk-cover { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.lk-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(.35) blur(3px); }
.lk-cover-c { position: relative; text-align: center; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lk-cover-t { font-weight: 700; font-size: 1.1rem; }
.lk-btn-go { background: linear-gradient(135deg,#ef4444,#b91c1c); color: #fff; border: 0; border-radius: 999px; padding: 12px 26px; font-weight: 800; font-size: 1rem; cursor: pointer; box-shadow: 0 8px 22px rgba(239,68,68,.45); }
.lk-err { color: #fca5a5; font-size: .85rem; max-width: 320px; }
.lk-spinner { width: 42px; height: 42px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: lkspin .8s linear infinite; }
@keyframes lkspin { to { transform: rotate(360deg); } }
.lk-badges { position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 4; }
.lk-live { background: #ef4444; color: #fff; font-weight: 800; font-size: .72rem; padding: 5px 10px; border-radius: 6px; display: flex; align-items: center; gap: 6px; letter-spacing: .5px; }
.lk-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: lkpulse 1s infinite; }
@keyframes lkpulse { 50% { opacity: .3; } }
.lk-viewers { background: rgba(0,0,0,.6); color: #fff; font-weight: 700; font-size: .75rem; padding: 5px 10px; border-radius: 6px; display: flex; align-items: center; gap: 5px; }
.lk-controls { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 4; }
.lk-ctl { background: rgba(0,0,0,.6); color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-weight: 700; font-size: .8rem; }
.lk-ctl.danger { background: #ef4444; }
.lk-chat-overlay { position: absolute; left: 12px; bottom: 12px; width: min(320px, 62%); max-height: 46%; display: flex; flex-direction: column; background: rgba(10,10,14,.55); backdrop-filter: blur(8px); border-radius: 12px; z-index: 4; overflow: hidden; }
.lk-chat-list { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.lk-chat-msg { color: #fff; font-size: .82rem; line-height: 1.35; }
.lk-chat-msg.me b { color: #60a5fa; }
.lk-chat-msg b { color: #fbbf24; }
.lk-chat-empty { color: rgba(255,255,255,.5); font-size: .78rem; text-align: center; padding: 8px; }
.lk-chat-form { display: flex; gap: 6px; padding: 6px; border-top: 1px solid rgba(255,255,255,.1); }
.lk-chat-input { flex: 1; background: rgba(255,255,255,.12); border: 0; border-radius: 8px; padding: 7px 10px; color: #fff; font-size: .82rem; outline: none; }
.lk-chat-input::placeholder { color: rgba(255,255,255,.5); }
.lk-chat-send { background: #155eef; color: #fff; border: 0; border-radius: 8px; padding: 0 12px; cursor: pointer; }
.lk-sell-overlay { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: rgba(0,0,0,.72); color: #fff; }
.lk-sell-count { font-size: 5rem; font-weight: 900; color: #fbbf24; line-height: 1; }
.lk-sell-t { font-size: 1.6rem; font-weight: 900; letter-spacing: 2px; }
.lk-sell-to { font-size: 1rem; opacity: .9; }
.lk-sell-cancel { margin-top: 10px; background: #fff; color: #111; border: 0; border-radius: 999px; padding: 8px 22px; font-weight: 800; cursor: pointer; }
.lk-side { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; }
.lk-side-head { font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.lk-side-hint { font-size: .78rem; color: var(--muted); margin-bottom: 10px; }
.lk-bids { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 60vh; }
.lk-bid { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--bg-soft); border: 1px solid var(--border); }
.lk-bid.top { border-color: #22c55e; }
.lk-bid-u { font-weight: 700; color: var(--text); font-size: .88rem; }
.lk-bid-t { font-size: .72rem; color: var(--muted); }
.lk-bid-a { margin-left: auto; font-weight: 800; color: #22c55e; }
.lk-bid-sell { background: #ef4444; color: #fff; border: 0; border-radius: 8px; padding: 6px 14px; font-weight: 800; cursor: pointer; }
.lk-bid-sell:disabled { opacity: .5; cursor: not-allowed; }
</style>
