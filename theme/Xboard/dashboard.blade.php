<!doctype html>
<html lang="zh-CN" data-surface="home">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="{{ $description }}" />
  <meta name="theme-color" content="#0057ff" />
  <title>{{ $title }}</title>
  <script>
    window.routerBase = "/";
    window.settings = {
      title: @json($title),
      assets_path: @json('/theme/' . $theme . '/assets'),
      theme: { color: @json($theme_config['theme_color'] ?? 'default') },
      version: @json($version),
      background_url: @json($theme_config['background_url'] ?? ''),
      description: @json($description),
      i18n: ['zh-CN', 'en-US', 'ja-JP', 'vi-VN', 'ko-KR', 'zh-TW', 'fa-IR'],
      logo: @json($logo)
    };
    // Decide before first paint. Existing hash routes and invitation links stay intact.
    (function () {
      var route = location.hash.split('?')[0];
      if (route.indexOf('#/') === 0 && route !== '#/' && route !== '#/home') {
        document.documentElement.dataset.surface = /^#\/(login|register|forgetpassword)$/.test(route) ? 'auth' : 'portal';
      }
    })();
  </script>
  <link rel="stylesheet" href="/assets/126/theme.css?v={{ filemtime(public_path('assets/126/theme.css')) }}" />
  <script type="module" src="/assets/126/portal.js?v={{ filemtime(public_path('assets/126/portal.js')) }}"></script>
</head>
<body>
  <div id="site-home">
    @include('theme::Xboard.home')
  </div>
  <div id="portal-chrome">
    <a class="portal-brand" href="/" aria-label="返回首页"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M13 34C21.5 34 26.5 14 35 14" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/><circle cx="13" cy="34" r="4.6" fill="currentColor"/><circle cx="35" cy="14" r="5" fill="#ffd60a"/></svg></span>{{ $title }}</a>
    <span class="portal-chrome-label">用户中心</span>
    <a class="portal-back" href="/">返回首页 <span aria-hidden="true">↗</span></a>
  </div>
  <div id="portal-stage">
    <aside id="auth-story" aria-labelledby="auth-story-title">
      <p class="eyebrow">01 / 126 NETWORK</p>
      <div><h2 id="auth-story-title">跨境 AI<br>专用网络</h2><p class="auth-story-copy">为 AI 会话与持续运行的工作流，<br>提供更从容的连接体验。</p></div>
      <div class="auth-network" aria-hidden="true"><svg viewBox="0 0 400 180" fill="none"><path d="M35 119Q115 20 200 70T365 101M35 119Q185 170 365 101" stroke="#ffd60a" stroke-width="2" stroke-dasharray="7 8"/><circle cx="35" cy="119" r="6" fill="#ffd60a"/><circle cx="200" cy="70" r="6" fill="#ffd60a"/><circle cx="365" cy="101" r="6" fill="#ffd60a"/></svg><span>AI NETWORK · 126</span></div>
    </aside>
    <div id="portal-content">
      <div id="auth-account-heading"><p class="eyebrow">02 / ACCOUNT</p><h1 id="auth-welcome">欢迎回来</h1><p id="auth-subtitle">登录你的 {{ $title }} 账号</p></div>
      <div id="app"></div>
    </div>
  </div>
  <div id="portal-load-error" hidden role="alert">
    <h1>页面暂时没有加载完成</h1>
    <p>请检查网络后重试，你的账户数据不会受到影响。</p>
    <button type="button" onclick="location.reload()">重新加载</button>
    <a href="/">返回首页</a>
  </div>
  <noscript><p class="noscript-note">首页可以直接浏览。登录和用户中心需要启用 JavaScript。</p></noscript>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>
</html>
