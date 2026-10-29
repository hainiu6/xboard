const pages = new Set(['dashboard', 'plan', 'order', 'knowledge', 'profile', 'invite', 'ticket', 'traffic']);
export function noticePage(path) {
  const page = String(path || '').split('/').filter(Boolean)[0];
  return pages.has(page) ? page : null;
}

// Only these presentation classes can survive announcement sanitization.
const cardClasses = new Set(['notice-card', 'notice-card-header', 'notice-card-icon', 'notice-card-heading', 'notice-card-badge', 'notice-card-subtitle', 'notice-card-body', 'notice-card-row', 'notice-card-label', 'notice-card-advice', 'notice-card-alert', 'notice-card-footer']);
export function noticeClasses(value) {
  return [...new Set(String(value || '').split(/\s+/).filter(name => cardClasses.has(name)))].join(' ');
}

export function safeNoticeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const allowed = new Set(['P','BR','HR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','U','S','DEL','UL','OL','LI','BLOCKQUOTE','PRE','CODE','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','DIV','SPAN']);
  for (const element of [...doc.body.querySelectorAll('*')]) {
    if (!allowed.has(element.tagName)) { element.remove(); continue; }
    for (const attribute of [...element.attributes]) {
      if (!['href','src','alt','title','class'].includes(attribute.name) || (attribute.name === 'href' && element.tagName !== 'A') || (attribute.name === 'src' && element.tagName !== 'IMG')) element.removeAttribute(attribute.name);
    }
    const classes = noticeClasses(element.getAttribute('class'));
    if (classes) element.setAttribute('class', classes);
    else element.removeAttribute('class');
    for (const attribute of ['href','src']) {
      if (!element.hasAttribute(attribute)) continue;
      try {
        const target = new URL(element.getAttribute(attribute), location.origin);
        if (!['http:', 'https:', ...(attribute === 'href' ? ['mailto:'] : [])].includes(target.protocol)) element.removeAttribute(attribute);
      } catch { element.removeAttribute(attribute); }
    }
    if (element.tagName === 'A') element.setAttribute('rel', 'noopener noreferrer');
    if (element.tagName === 'IMG') element.setAttribute('loading', 'lazy');
  }
  return doc.body.innerHTML;
}

export function createNotice({ h, ref, onMounted, onUnmounted, api, getPath, renderMarkdown }) {
  return {
    name: '126InlineNotice',
    setup() {
      const notice = ref(null);
      let active = true;
      onUnmounted(() => { active = false; });
      onMounted(async () => {
        const page = noticePage(getPath());
        if (!page) return;
        try {
          const response = await api.get(`/user/notice/fetch?page=${encodeURIComponent(page)}`);
          if (active && Array.isArray(response.data)) notice.value = response.data[0] || null;
        } catch { /* An unavailable announcement must not block the user's page. */ }
      });
      return () => notice.value ? h('section', { class: 'portal-notice', 'aria-label': '站点公告' }, [
        h('div', { class: 'portal-notice-heading' }, [h('span', { class: 'portal-notice-icon', 'aria-hidden': 'true' }, '◉'), h('h2', {}, String(notice.value.title || '站点公告'))]),
        h('div', { class: 'portal-notice-content markdown-body', innerHTML: safeNoticeHtml(renderMarkdown(String(notice.value.content || ''))) }),
      ]) : null;
    },
  };
}
