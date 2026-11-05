window.__ModuleLoader__.load({
  id: 'dsh-fairy-compat-bg-eye',
  factory: () => {
    const MODE_ATTR = 'data-dsh-fairy-eye-bg';
    const CSS = [
      /* The stage overlay never intercepts input. */
      'html[data-dsh-fairy-visual] .dsh-fairy-stage{pointer-events:none !important}',
      /* Watermark: keep the eye on the normal layer but faint enough to read through. */
      'html[data-dsh-fairy-visual][data-dsh-fairy-eye-bg="watermark"] .dsh-fairy-stage{opacity:.28 !important}',
      /* Behind: push the whole overlay under the content layer (may hide behind opaque panels). */
      'html[data-dsh-fairy-visual][data-dsh-fairy-eye-bg="behind"] .dsh-fairy-stage{z-index:-1 !important;opacity:.55 !important}',
      /* The plugin fades message text around the eye; that fade is what makes paragraphs unreadable. */
      'html[data-dsh-fairy-visual] .dsh-fairy-content-mask{-webkit-mask-image:none !important;mask-image:none !important;--dsh-fairy-mask:0 !important}',
      'html[data-dsh-fairy-visual] .dsh-fairy-content-fade{--dsh-fairy-mask:0 !important}',
    ].join('\n');
    function readMode() {
      try {
        const v = globalThis.localStorage && globalThis.localStorage.getItem('dsh.fairy.eyeBg');
        return v === 'behind' ? 'behind' : 'watermark';
      } catch { return 'watermark'; }
    }
    function apply(ctx) {
      try {
        const root = globalThis.document && globalThis.document.documentElement;
        if (!root) return undefined;
        root.setAttribute(MODE_ATTR, readMode());
        let style = globalThis.document.querySelector('style[data-plugin="dsh-fairy-compat-bg-eye"]');
        if (!style) {
          style = globalThis.document.createElement('style');
          style.setAttribute('data-plugin', 'dsh-fairy-compat-bg-eye');
          style.textContent = CSS;
          globalThis.document.head.appendChild(style);
        }
        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(() => () => { try { style.remove(); } catch {} }, 'dsh-fairy-compat-bg-eye style');
        }
        return undefined;
      } catch (error) {
        try { globalThis.console && globalThis.console.warn('dsh-fairy-compat-bg-eye:', error); } catch {}
        return undefined;
      }
    }
    return { name: 'dsh-fairy-compat-bg-eye', inject: [], apply };
  },
});
