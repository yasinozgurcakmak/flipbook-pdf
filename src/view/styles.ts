/**
 * Default stylesheet. Theme it with CSS custom properties on the container:
 *   --pfb-background, --pfb-page-bg, --pfb-page-shadow, --pfb-control-bg,
 *   --pfb-control-color, --pfb-accent, --pfb-counter-space
 *
 * Performance notes: during a page turn only `transform` and `opacity` change, so the
 * browser can animate on the compositor without layout or paint.
 */
export const flipbookCss = `
.pfb-root{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box;
  background:var(--pfb-background,transparent);user-select:none;-webkit-user-select:none;
  -webkit-tap-highlight-color:transparent;touch-action:pan-y pinch-zoom;outline:none;contain:layout paint style}
.pfb-root *,.pfb-root *::before,.pfb-root *::after{box-sizing:border-box}
.pfb-root:focus-visible{box-shadow:inset 0 0 0 2px var(--pfb-accent,#3b82f6)}
.pfb-root.pfb-dragging{cursor:grabbing}
.pfb-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
/* With controls on, the counter gets its own strip below the book instead of covering the page. */
.pfb-root:not(.pfb-no-controls) .pfb-stage{bottom:var(--pfb-counter-space,36px)}
.pfb-book{position:relative}
.pfb-root:not(.pfb-ready) .pfb-book{visibility:hidden}
.pfb-page,.pfb-face{position:absolute;top:0;height:100%;overflow:hidden;background:var(--pfb-page-bg,#fff)}
.pfb-page{box-shadow:var(--pfb-page-shadow,0 4px 18px rgba(0,0,0,.18))}
.pfb-slot-left{left:0;width:50%}
.pfb-slot-right{right:0;width:50%}
.pfb-single .pfb-slot-left,.pfb-single .pfb-spine{display:none}
.pfb-single .pfb-slot-right{width:100%}
.pfb-blank{visibility:hidden}
.pfb-content{position:absolute;inset:0}
.pfb-content canvas{display:block;width:100%;height:100%;object-fit:contain}
.pfb-content:empty::after{content:"";position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;
  border-radius:50%;border:3px solid rgba(0,0,0,.12);border-top-color:var(--pfb-accent,#3b82f6);animation:pfb-spin .8s linear infinite}
.pfb-paper .pfb-content::after{display:none}
.pfb-spine{position:absolute;top:0;bottom:0;left:50%;width:7%;transform:translateX(-50%);pointer-events:none;z-index:1;
  background:linear-gradient(to right,rgba(0,0,0,0),rgba(0,0,0,.08) 40%,rgba(0,0,0,.22) 50%,rgba(0,0,0,.08) 60%,rgba(0,0,0,0))}
.pfb-no-spine .pfb-spine{display:none}
.pfb-face,.pfb-cast{left:0;width:var(--pfb-page-w);transform-origin:0 0;visibility:hidden;pointer-events:none;will-change:transform}
.pfb-cast{position:absolute;top:0;height:100%;z-index:2;overflow:hidden}
.pfb-turning .pfb-face:not(.pfb-blank),.pfb-turning .pfb-cast{visibility:visible}
.pfb-peel{z-index:3}
.pfb-flap{z-index:4}
.pfb-fold-shade{position:absolute;left:0;top:0;width:100px;height:var(--pfb-bar-h,3000px);margin-top:calc(var(--pfb-bar-h,3000px) / -2);
  transform-origin:0 50%;pointer-events:none;opacity:0}
.pfb-cast .pfb-fold-shade{background:linear-gradient(to right,rgba(0,0,0,.42),rgba(0,0,0,.12) 45%,rgba(0,0,0,0))}
.pfb-peel .pfb-fold-shade{background:linear-gradient(to right,rgba(0,0,0,.2),rgba(0,0,0,0))}
.pfb-flap .pfb-fold-shade{background:linear-gradient(to right,rgba(0,0,0,.28),rgba(255,255,255,.22) 22%,rgba(0,0,0,.05) 60%,rgba(0,0,0,.12))}
.pfb-corner{position:absolute;z-index:5;width:min(calc(var(--pfb-page-w) * .22),120px);aspect-ratio:1;touch-action:none;cursor:grab}
.pfb-corner[data-side="left"]{left:0}.pfb-corner[data-side="right"]{right:0}
.pfb-corner[data-corner="top"]{top:0}.pfb-corner[data-corner="bottom"]{bottom:0}
.pfb-nav{position:absolute;top:50%;z-index:3;width:44px;height:44px;margin-top:-22px;padding:0;border:0;border-radius:50%;
  display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--pfb-control-color,#fff);
  background:var(--pfb-control-bg,rgba(17,24,39,.55));transition:opacity .2s,background-color .2s}
.pfb-nav:hover{background:var(--pfb-control-bg-hover,rgba(17,24,39,.75))}
.pfb-nav:focus-visible{outline:2px solid var(--pfb-accent,#3b82f6);outline-offset:2px}
.pfb-nav:disabled{opacity:0;pointer-events:none}
.pfb-nav svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.pfb-nav-prev{left:8px}
.pfb-nav-next{right:8px}
.pfb-counter{position:absolute;left:50%;bottom:6px;z-index:3;transform:translateX(-50%);padding:3px 12px;border-radius:999px;
  font:500 13px/1.5 system-ui,sans-serif;color:var(--pfb-control-color,#fff);background:var(--pfb-control-bg,rgba(17,24,39,.55));
  pointer-events:none;font-variant-numeric:tabular-nums}
.pfb-no-controls .pfb-nav,.pfb-no-controls .pfb-counter,.pfb-root:not(.pfb-ready) .pfb-nav,.pfb-root:not(.pfb-ready) .pfb-counter{display:none}
.pfb-message{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;text-align:center;
  font:14px/1.5 system-ui,sans-serif;color:var(--pfb-message-color,#6b7280)}
.pfb-loading .pfb-message,.pfb-error .pfb-message{display:flex}
.pfb-sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@keyframes pfb-spin{to{transform:rotate(360deg)}}
`;

const STYLE_ID = 'pdf-flipbook-styles';
const styledRoots = new WeakSet<Document | ShadowRoot>();

export function injectStyles(root: Document | ShadowRoot): void {
  if (styledRoots.has(root)) return;
  styledRoots.add(root);

  if (root instanceof ShadowRoot && 'adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(flipbookCss);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
    }
  }
  const doc = root instanceof ShadowRoot ? root.ownerDocument : root;
  if (root instanceof Document && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = flipbookCss;
  (root instanceof ShadowRoot ? root : doc.head).appendChild(style);
}
