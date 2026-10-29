const pages = new Set(['dashboard', 'plan', 'order', 'knowledge', 'profile', 'invite', 'ticket', 'traffic']);
export function noticePage(path) {
  const page = String(path || '').split('/').filter(Boolean)[0];
  return pages.has(page) ? page : null;
}

// Styles/classes are authored by the administrator and rendered in an isolated,
// script-disabled document. They are never applied to the portal's own DOM.
export function noticeClasses(value) {
  return [...new Set(String(value || '').split(/\s+/).filter(Boolean))].join(' ');
}
export function renderNoticeContent(content, renderMarkdown) {
  const source = String(content || '');
  // Styled HTML is already a complete document/fragment. Passing it through
  // Markdown turns indented blocks after blank lines into visible source code.
  const html = /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b|<(?:html|head|body|style|div|section|article|header|footer|main|details|table|blockquote|ul|ol|p|h[1-6])(?:\s|>))/i;
  return html.test(source) ? source : renderMarkdown(source);
}
export function safeNoticeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  // DOMParser moves a leading <style> into <head>; keep it with the content.
  for (const style of [...doc.head.querySelectorAll('style')].reverse()) doc.body.prepend(style);
  const allowed = new Set(['STYLE','P','BR','HR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','U','S','DEL','UL','OL','LI','BLOCKQUOTE','PRE','CODE','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','DIV','SPAN','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','FIGURE','FIGCAPTION','DETAILS','SUMMARY']);
  for (const element of [...doc.body.querySelectorAll('*')]) {
    if (!allowed.has(element.tagName)) { element.remove(); continue; }
    for (const attribute of [...element.attributes]) {
      const common = ['class','style','title'].includes(attribute.name);
      const specific = ({ A: ['href','target'], IMG: ['src','alt','width','height'], DETAILS: ['open'], TD: ['colspan','rowspan'], TH: ['colspan','rowspan'] })[element.tagName] || [];
      if (!common && !specific.includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    const classes = noticeClasses(element.getAttribute('class'));
    if (classes) element.setAttribute('class', classes); else element.removeAttribute('class');
    for (const attribute of ['href','src']) {
      if (!element.hasAttribute(attribute)) continue;
      try {
        const value = element.getAttribute(attribute);
        const target = new URL(value, location.origin);
        const imageData = attribute === 'src' && /^data:image\/(png|gif|jpeg|webp|avif|svg\+xml)[;,]/i.test(value);
        if (!imageData && !['http:', 'https:', ...(attribute === 'href' ? ['mailto:'] : [])].includes(target.protocol)) element.removeAttribute(attribute);
      } catch { element.removeAttribute(attribute); }
    }
    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noopener noreferrer');
      if (!['_blank','_top','_self'].includes(element.getAttribute('target'))) element.setAttribute('target', '_top');
    }
    if (element.tagName === 'IMG') element.setAttribute('loading', 'eager');
  }
  return doc.body.innerHTML;
}

export function noticeDocument(html, dark = false) {
  const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https:; img-src https: http: data:; font-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html lang="zh-CN"${dark ? ' class="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;padding:0;min-height:0;background:transparent}html{color:#26374f}html.dark{color:#dce6f5}body{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;font-size:14px;line-height:1.85;overflow-wrap:anywhere;display:flow-root}*,*:before,*:after{box-sizing:border-box}body>:first-child{margin-top:0}body>:last-child{margin-bottom:0}img{max-width:100%;height:auto}a{color:#0057ff}table{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${safeNoticeHtml(html)}</body></html>`;
}

export function createNotice({ h, ref, onMounted, onUnmounted, api, getPath, renderMarkdown }) {
  return {
    name: '126InlineNotice',
    setup() {
      const notice = ref(null), height = ref(1);
      let active = true, sizeObserver, themeObserver, frame;
      const disconnect = () => { sizeObserver?.disconnect(); themeObserver?.disconnect(); };
      onUnmounted(() => { active = false; disconnect(); frame = null; });
      const attach = event => {
        if (!active) return;
        disconnect(); frame = event.target;
        const doc = frame.contentDocument;
        if (!doc?.body) return;
        const measure = () => {
          if (!active) return;
          const next = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height));
          height.value = Math.max(1, next);
        };
        sizeObserver = new ResizeObserver(measure);
        sizeObserver.observe(doc.body);
        themeObserver = new MutationObserver(() => doc.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark')));
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        doc.fonts?.ready.then(measure).catch(() => {});
        measure();
      };
      onMounted(async () => {
        const page = noticePage(getPath());
        if (!page) return;
        try {
          const response = await api.get(`/user/notice/fetch?page=${encodeURIComponent(page)}`);
          if (active && Array.isArray(response.data) && response.data[0]) {
            const item = response.data[0];
            notice.value = { title: String(item.title || '站点公告'), document: noticeDocument(renderNoticeContent(item.content, renderMarkdown), document.documentElement.classList.contains('dark')) };
          }
        } catch { /* An unavailable announcement must not block the user's page. */ }
      });
      return () => notice.value ? h('section', { class: 'portal-notice', 'aria-label': '站点公告' }, [
        h('iframe', { class: 'portal-notice-frame', title: notice.value.title, srcdoc: notice.value.document,
          sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
          referrerpolicy: 'no-referrer', scrolling: 'no', style: { height: `${height.value}px` }, onLoad: attach }),
      ]) : null;
    },
  };
}
