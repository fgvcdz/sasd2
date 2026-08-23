<script setup>
/*
 | Hikaye görüntüleyici — public/assets/js/custom/story-viewer.js'in SPA-güvenli Vue portu.
 | Aynı DOM class/id'leri korunur (CSS theme-new.css). Teleport ile body altına render edilir
 | (eski Blade davranışı: viewer body altındaydı). window.openStoryViewer/... global fonksiyonları
 | kaydeder; StoryBar.vue ve Profile/Show.vue bunları çağırır. window.STORY_DATA veri kaynağıdır.
*/
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const open = ref(false);
const curUser = ref(null);
const curIndex = ref(0);
let timer = null;

const u = computed(() => (curUser.value != null && window.STORY_DATA) ? window.STORY_DATA[curUser.value] : null);
const item = computed(() => (u.value && u.value.items) ? u.value.items[curIndex.value] : null);

/* ── Instagram mantığı: görülen hikaye halkası soluk/gri ── */
const SEEN_KEY = 'artirdim_seen_stories';
function getSeen() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
function saveSeen(set) { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); }
function paintRing(el, seen) {
    const ring = el.querySelector('.story-ring');
    if (seen) { el.classList.add('seen'); if (ring && el.dataset.ringSeen) ring.setAttribute('style', el.dataset.ringSeen); }
    else { el.classList.remove('seen'); if (ring && el.dataset.ringUnseen) ring.setAttribute('style', el.dataset.ringUnseen); }
}
function applySeenStates() {
    const seen = getSeen();
    document.querySelectorAll('.story-item[data-story-ids]').forEach((el) => {
        if (el.classList.contains('story-add')) return;
        let ids = [];
        try { ids = JSON.parse(el.dataset.storyIds || '[]'); } catch (e) {}
        const allSeen = ids.length > 0 && ids.every((id) => seen.has(id));
        paintRing(el, allSeen);
    });
}
function markUserSeen(uid) {
    const usr = window.STORY_DATA?.[uid];
    if (!usr || !usr.items) return;
    const seen = getSeen();
    usr.items.forEach((it) => seen.add(it.id));
    saveSeen(seen);
    const el = document.querySelector('.story-item[data-story-uid="' + uid + '"]');
    if (el) paintRing(el, true);
}

function scheduleAdvance() {
    clearTimeout(timer);
    if (item.value && item.value.type !== 'video') timer = setTimeout(() => next(), 5000);
}

function openViewer(uid) {
    const usr = window.STORY_DATA?.[uid];
    if (!usr || !usr.items || !usr.items.length) return;
    curUser.value = uid; curIndex.value = 0; open.value = true;
    document.body.style.overflow = 'hidden';
    markUserSeen(uid);
}
function close() {
    open.value = false;
    document.body.style.overflow = '';
    clearTimeout(timer);
}
function next() {
    const usr = u.value; if (!usr) return;
    if (curIndex.value < usr.items.length - 1) curIndex.value++;
    else close();
}
function prev() { if (curIndex.value > 0) curIndex.value--; }

function deleteCurrent() {
    const usr = u.value; if (!usr) return;
    const it = usr.items[curIndex.value];
    if (!it || !it.id) return;

    const doDelete = () => {
        const token = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
        const fd = new FormData();
        fd.append('_method', 'DELETE');
        return fetch('/stories/' + it.id, {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'X-CSRF-TOKEN': token },
            credentials: 'same-origin',
        }).then((res) => {
            if (!res.ok) return res.json().then((e) => { throw new Error(e.message || 'Silme başarısız'); });
            return res.json().catch(() => ({}));
        }).then(() => {
            usr.items.splice(curIndex.value, 1);
            if (usr.items.length === 0) {
                const bar = document.querySelector('.story-item[data-story-uid="' + curUser.value + '"]');
                if (bar) bar.remove();
                if (window.STORY_DATA) delete window.STORY_DATA[curUser.value];
                close();
            } else if (curIndex.value >= usr.items.length) {
                curIndex.value = usr.items.length - 1;
            }
            if (window.ajaxToast) window.ajaxToast('success', 'Hikaye silindi');
        }).catch((err) => {
            if (window.ajaxToast) window.ajaxToast('error', err.message); else alert(err.message);
        });
    };

    if (window.Swal) {
        window.Swal.fire({
            title: 'Hikayeyi silmek istediğine emin misin?',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Evet, sil', cancelButtonText: 'Vazgeç',
            reverseButtons: true, confirmButtonColor: '#ef4444', heightAuto: false,
            didOpen: () => document.body.classList.remove('swal2-height-auto'),
        }).then((r) => { if (r.isConfirmed) doDelete(); });
    } else {
        if (confirm('Bu hikayeyi silmek istediğine emin misin?')) doDelete();
    }
}

function onKey(e) {
    if (!open.value) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Escape') close();
}

watch(item, () => scheduleAdvance());

onMounted(() => {
    window.openStoryViewer = openViewer;
    window.closeStoryViewer = close;
    window.storyNext = next;
    window.storyPrev = prev;
    window.deleteCurrentStory = deleteCurrent;
    window.addEventListener('keydown', onKey);
    window.addEventListener('pageshow', applySeenStates);
    applySeenStates();
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pageshow', applySeenStates);
    clearTimeout(timer);
    document.body.style.overflow = '';
});

defineExpose({ applySeenStates });
</script>

<template>
    <Teleport to="body">
        <div class="story-viewer" :class="{ open }" id="storyViewer" data-testid="story-viewer">
            <div class="story-viewer-backdrop" @click="close"></div>
            <div class="story-viewer-stage">
                <div class="story-progress" id="storyProgress">
                    <span v-for="(it, i) in (u ? u.items : [])" :key="i"
                          :class="i < curIndex ? 'done' : (i === curIndex ? 'active' : '')"></span>
                </div>
                <div class="story-viewer-head">
                    <div class="story-viewer-user">
                        <img :src="u ? u.avatar : ''" alt="">
                        <span>{{ u ? u.name : '' }}</span>
                    </div>
                    <div class="story-viewer-actions">
                        <button v-if="u && u.isOwner" class="story-viewer-del" @click="deleteCurrent"
                                data-testid="story-delete" title="Hikayeyi sil"><i class="bi bi-trash"></i></button>
                        <button class="story-viewer-close" @click="close" data-testid="story-close"><i class="bi bi-x-lg"></i></button>
                    </div>
                </div>
                <div class="story-viewer-media" id="svMedia">
                    <template v-if="item">
                        <video v-if="item.type === 'video'" :src="item.url" autoplay playsinline controls></video>
                        <img v-else :src="item.url" alt="">
                    </template>
                </div>
                <div class="story-viewer-caption">{{ item ? (item.caption || '') : '' }}</div>
                <button class="story-nav story-prev" @click="prev"><i class="bi bi-chevron-left"></i></button>
                <button class="story-nav story-next" @click="next"><i class="bi bi-chevron-right"></i></button>
            </div>
        </div>
    </Teleport>
</template>
