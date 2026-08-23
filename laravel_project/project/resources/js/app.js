import { createApp, h } from 'vue';
import { createInertiaApp, router } from '@inertiajs/vue3';
import { ZiggyVue } from 'ziggy-js';

const appName = import.meta.env.VITE_APP_NAME || 'artirdim';

// Metronic (KeenThemes) bileşenlerini Inertia gezinmesinden sonra yeniden başlat
function initKT() {
    try { window.KTComponents && window.KTComponents.init(); } catch (e) {}
    try { window.KTMenu && window.KTMenu.createInstances(); } catch (e) {}
    try { window.KTDrawer && window.KTDrawer.createInstances(); } catch (e) {}
    try { window.KTSticky && window.KTSticky.createInstances(); } catch (e) {}
    try { window.KTScroll && window.KTScroll.createInstances(); } catch (e) {}
}
window.initKT = initKT;

createInertiaApp({
    title: (title) => (title ? `${appName} | ${title}` : appName),
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.vue', { eager: true });
        const page = pages[`./Pages/${name}.vue`];
        if (!page) throw new Error(`Inertia sayfa bulunamadı: ${name}`);
        return page;
    },
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .use(ZiggyVue)
            .mount(el);
    },
    progress: { color: '#155eef' },
}).then(() => setTimeout(initKT, 30));

router.on('navigate', () => setTimeout(initKT, 60));
