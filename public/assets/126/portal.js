const root = document.documentElement;
const authRoutes = new Set(['/login', '/register', '/forgetpassword']);
let portalStarted = false;

export function currentSurface(hash) {
  const route = hash.split('?')[0].slice(1);
  if (!hash.startsWith('#/') || route === '/' || route === '/home') return 'home';
  return authRoutes.has(route) ? 'auth' : 'portal';
}

async function syncSurface() {
  const surface = currentSurface(location.hash);
  if (surface === 'home' && portalStarted) {
    // Reload the document so the original SPA guard cannot redirect the homepage.
    location.replace(location.pathname + location.search);
    return;
  }
  root.dataset.surface = surface;
  const route = location.hash.split('?')[0];
  const heading = document.getElementById('auth-welcome');
  const subtitle = document.getElementById('auth-subtitle');
  if (heading && subtitle) {
    heading.textContent = route === '#/register' ? '开启你的连接' : route === '#/forgetpassword' ? '找回你的账户' : '欢迎回来';
    subtitle.textContent = route === '#/register' ? `创建你的 ${window.settings.title} 账号` : route === '#/forgetpassword' ? '验证邮箱，重新设置登录密码' : `登录你的 ${window.settings.title} 账号`;
  }
  if (surface === 'home' || portalStarted) return;
  portalStarted = true;
  try {
    // Independent style sheet comes after runtime-injected component styles too.
    try {
      const catalog = await import(`/assets/126/plan-catalog.js?v=${window.settings.catalog_version}`);
      window.Xboard126 = { createPlansPage: catalog.createPlansPage };
    } catch (error) {
      console.warn('The plan catalog enhancement is unavailable; using the original page.', error);
    }
    await import(`${window.settings.assets_path}/umi.js?v=${window.settings.bundle_version}&release=${encodeURIComponent(window.settings.version)}`);
    document.head.appendChild(document.querySelector('link[href*="/assets/126/theme.css"]'));
  } catch (error) {
    console.error('Unable to load the user portal', error);
    document.getElementById('portal-load-error').hidden = false;
  }
}

window.addEventListener('hashchange', syncSurface);
window.addEventListener('popstate', syncSurface);
// Vue Router also changes hashes through pushState, which emits no hashchange.
// Observe rendered route changes without patching history or the compiled bundle.
let observedHash = location.hash;
new MutationObserver(() => {
  if (location.hash === observedHash) return;
  observedHash = location.hash;
  syncSurface();
}).observe(document.getElementById('app'), { childList: true, subtree: true });
syncSurface();
