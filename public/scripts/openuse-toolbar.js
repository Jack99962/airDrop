// Use the product's existing translation and theme implementations.
(() => {
    let toolbar;
    function theme() { return localStorage.getItem('theme') || 'system'; }
    function sync() {
        toolbar?.updateState({ language: Localization.getLocale(), theme: theme() });
    }
    function start() {
        if (toolbar || !window.OpenUse || !Localization.getLocale()) return;
        const names = new Intl.DisplayNames([Localization.getLocale()], { type: 'language' });
        toolbar = OpenUse.mount({
      defaultPosition: 'right-center',
            languages: ['zh-CN', ...Localization.supportedLocales.filter(value => value !== 'zh-CN')]
                .map(value => ({ value, label: value === 'zh-CN' ? '简体中文' : names.of(value) || value })),
            language: Localization.getLocale(),
            theme: theme(),

            async onLanguageChange(value) {
                await Localization.setTranslation(value);
                if (Localization.getLocale() !== value) throw new Error('Translation could not be loaded');
                localStorage.setItem('language_code', value);
            },
            onThemeChange(value) {
                const methods = { light: 'setModeToLight', dark: 'setModeToDark', system: 'setModeToAuto' };
                pairDrop.themeUI[methods[value]]();
            },
            onError(error) { console.error('[OpenUse]', error); },
        });
    }
    function translated() { start(); sync(); }
    window.addEventListener('translation-loaded', translated);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('storage', sync);
    start();
    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        toolbar?.destroy();
        observer.disconnect();
        window.removeEventListener('translation-loaded', translated);
        window.removeEventListener('storage', sync);
    });
})();
