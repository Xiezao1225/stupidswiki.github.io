/* ==========================================================================
   app.js — 站点逻辑：清单加载、哈希路由、导航、目录、搜索、主题
   ========================================================================== */
(function () {
  'use strict';

  var THEME_KEY = 'stupidswiki:theme';
  var MD = window.WikiMarkdown;
  var el = {};
  var themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

  var state = {
    site: {},
    categories: [],
    pages: [],
    byId: new Map(),
    noticePresets: new Map(),
    current: null,
    renderedOnce: false,
    results: [],
    activeResult: 0,
    lastFocus: null
  };

  /* ---------------------------------------------------------- 小工具 */

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) { return MD.escapeHtml(value); }

  function decode(value) {
    try { return decodeURIComponent(value); } catch (err) { return value; }
  }

  function headerOffset() {
    var topbar = document.querySelector('.topbar');
    return (topbar ? topbar.offsetHeight : 58) + 20;
  }

  function throttleRaf(fn) {
    var scheduled = false;
    return function () {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        fn();
      });
    };
  }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
      return value;
    } catch (err) {
      return null;
    }
  }

  /* ---------------------------------------------------------- 主题 */

  function effectiveTheme() {
    var value = document.documentElement.getAttribute('data-theme') || 'auto';
    if (value !== 'auto') return value;
    return themeMedia.matches ? 'dark' : 'light';
  }

  function applyTheme(value) {
    document.documentElement.setAttribute('data-theme', value);
    updateThemeButton();
  }

  function updateThemeButton() {
    if (!el.themeBtn) return;
    var next = effectiveTheme() === 'dark' ? '浅色' : '深色';
    el.themeBtn.setAttribute('aria-label', '切换到' + next + '模式');
    el.themeBtn.setAttribute('title', '切换到' + next + '模式');
  }

  function initTheme() {
    var saved = store(THEME_KEY);
    applyTheme(saved === 'light' || saved === 'dark' ? saved : 'auto');
    el.themeBtn.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      store(THEME_KEY, next);
      applyTheme(next);
    });
    var onChange = function () { updateThemeButton(); };
    if (themeMedia.addEventListener) themeMedia.addEventListener('change', onChange);
    else if (themeMedia.addListener) themeMedia.addListener(onChange);
  }

  /* ---------------------------------------------------------- 加载 */

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
      return res.json();
    });
  }

  function loadText(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
      return res.text();
    });
  }

  function normalizeManifest(manifest) {
    state.site = manifest.site || {};
    state.categories = [];
    state.pages = [];
    state.byId = new Map();

    (manifest.categories || []).forEach(function (category) {
      var group = { title: category.title || '未分类', pages: [] };
      (category.pages || []).forEach(function (entry) {
        if (!entry || !entry.id || !entry.file) return;
        var page = {
          id: String(entry.id),
          title: entry.title || entry.id,
          file: String(entry.file),
          description: entry.description || '',
          category: group.title,
          markdown: '',
          plain: '',
          error: null
        };
        if (state.byId.has(page.id)) {
          console.warn('[wiki] 页面 id 重复，已跳过：' + page.id);
          return;
        }
        state.byId.set(page.id, page);
        state.pages.push(page);
        group.pages.push(page);
      });
      if (group.pages.length) state.categories.push(group);
    });
  }

  function renderBrand() {
    if (state.site.title) {
      el.brandName.textContent = state.site.title;
      document.title = state.site.title;
    }
    if (state.site.tagline) {
      el.brandTagline.textContent = state.site.tagline;
      el.brand.setAttribute('title', state.site.title + ' — ' + state.site.tagline);
    } else {
      el.brandTagline.hidden = true;
    }
    if (state.site.description) {
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', state.site.description);
    }
    if (state.site.repo) {
      el.repoLink.href = state.site.repo;
      el.repoLink.hidden = false;
    }
    if (state.site.footer) el.siteFooter.textContent = state.site.footer;
  }

  /* ---------------------------------------------------------- 侧栏 */

  function renderSidebar() {
    var frag = document.createDocumentFragment();

    state.categories.forEach(function (group) {
      var wrap = document.createElement('div');
      wrap.className = 'nav-group';

      var title = document.createElement('div');
      title.className = 'nav-group__title';
      title.textContent = group.title;
      wrap.appendChild(title);

      var list = document.createElement('ul');
      list.className = 'nav-list';

      group.pages.forEach(function (page) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.className = 'nav-link';
        link.href = '#/page/' + encodeURIComponent(page.id);
        link.dataset.pageId = page.id;
        link.textContent = page.title;
        if (page.error) link.title = '这一页加载失败';
        item.appendChild(link);
        list.appendChild(item);
      });

      wrap.appendChild(list);
      frag.appendChild(wrap);
    });

    el.sidebarNav.innerHTML = '';
    el.sidebarNav.appendChild(frag);
  }

  function setActiveNav(pageId) {
    var links = el.sidebarNav.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i += 1) {
      var isActive = links[i].dataset.pageId === pageId;
      links[i].classList.toggle('is-active', isActive);
      if (isActive) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  /* ---------------------------------------------------------- 路由 */

  function parseHash() {
    var raw = window.location.hash.replace(/^#/, '');
    var split = raw.indexOf('#');
    var route = split >= 0 ? raw.slice(0, split) : raw;
    var anchor = split >= 0 ? decode(raw.slice(split + 1)) : '';
    var match = /^\/page\/([^/?#]+)\/?$/.exec(route);
    return { id: match ? decode(match[1]) : '', anchor: anchor };
  }

  function goToPage(page, replace) {
    var hash = '#/page/' + encodeURIComponent(page.id);
    if (window.location.hash === hash) {
      renderPage(page, '');
      return;
    }
    if (replace) window.history.replaceState(null, '', hash);
    else window.location.hash = hash;
  }

  function route() {
    var parsed = parseHash();
    var page = parsed.id ? state.byId.get(parsed.id) : state.pages[0];

    if (!page) {
      renderNotFound(parsed.id);
      return;
    }

    if (!parsed.id) {
      window.history.replaceState(null, '', '#/page/' + encodeURIComponent(page.id));
    }

    if (state.current && state.current.id === page.id && !page.error) {
      scrollToAnchor(parsed.anchor);
      return;
    }

    renderPage(page, parsed.anchor);
  }

  function scrollToAnchor(anchor) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(function () {
      if (!anchor) {
        window.scrollTo(0, 0);
        updateActiveHeading();
        return;
      }
      var target = byId(anchor);
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        updateActiveHeading();
      } else {
        window.scrollTo(0, 0);
      }
    });
  }

  /* ---------------------------------------------------------- 页首提示 */

  var NOTICE_TYPES = {
    note: 'note', info: 'note', default: 'note',
    tip: 'tip', success: 'tip',
    warning: 'warning', warn: 'warning', caution: 'warning', important: 'warning',
    danger: 'danger', error: 'danger', stop: 'danger'
  };

  var NOTICE_LABEL = { note: '说明', tip: '技巧', warning: '注意', danger: '危险' };

  var NOTICE_ICONS = {
    note: '<circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M10 9.2v4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="10" cy="6.4" r="1" fill="currentColor"/>',
    tip: '<path d="M10 2.8a4.6 4.6 0 0 0-2.7 8.3c.4.3.7.8.7 1.3v.5h4v-.5c0-.5.3-1 .7-1.3A4.6 4.6 0 0 0 10 2.8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M8.3 15.2h3.4M8.9 17.1h2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    warning: '<path d="M10 3.1 2.7 16.3h14.6L10 3.1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M10 8.1v3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="10" cy="13.6" r=".95" fill="currentColor"/>',
    danger: '<path d="M7.4 2.9h5.2l4.5 4.5v5.2l-4.5 4.5H7.4L2.9 12.6V7.4l4.5-4.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M10 6.6v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="10" cy="13.2" r=".95" fill="currentColor"/>',
    wrench: '<path d="M12.4 3.6a3.5 3.5 0 0 0-4.6 4.6l-4 4a1.8 1.8 0 0 0 2.5 2.5l4-4a3.5 3.5 0 0 0 4.6-4.6l-2.3 2.3-1.5-1.5 2.3-2.3Z" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    plus: '<path d="M10 4.4v11.2M4.4 10h11.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    question: '<circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M8.1 7.9a2 2 0 0 1 3.8.7c0 1.3-1.9 1.6-1.9 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="10" cy="14.2" r=".95" fill="currentColor"/>',
    clock: '<circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M10 6.1v4.3l2.9 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    user: '<circle cx="10" cy="7.1" r="2.9" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M4.6 16.2c.5-2.9 2.7-4.4 5.4-4.4s4.9 1.5 5.4 4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    calendar: '<rect x="3.6" y="5.2" width="12.8" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M3.6 8.7h12.8M7.2 3.4v3.2M12.8 3.4v3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    quote: '<path d="M7.7 6.3c-2 .7-3.2 2.3-3.2 4.4 0 1.5.8 2.4 2 2.4 1 0 1.7-.7 1.7-1.6 0-.9-.6-1.5-1.4-1.5h-.3c.2-.8.9-1.5 1.7-1.9l-.5-1.8Zm5.9 0c-2 .7-3.2 2.3-3.2 4.4 0 1.5.8 2.4 2 2.4 1 0 1.7-.7 1.7-1.6 0-.9-.6-1.5-1.4-1.5h-.3c.2-.8.9-1.5 1.7-1.9l-.5-1.8Z" fill="currentColor"/>',
    refresh: '<path d="M16.3 10a6.3 6.3 0 1 1-1.9-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M16.5 3.6v3.3h-3.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'eye-off': '<path d="M3.5 10s2.6-4.3 6.5-4.3c.9 0 1.8.2 2.6.6M16.5 10s-2.6 4.3-6.5 4.3c-.9 0-1.8-.2-2.6-.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M8.4 8.4a2.1 2.1 0 0 0 2.9 2.9M4.3 4.3l11.4 11.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    alert: '<circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M10 6.2v4.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="10" cy="13.9" r=".95" fill="currentColor"/>',
    star: '<path d="M10 2.9l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7L2.2 7.9l4.7-.7L10 2.9Z" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    shield: '<path d="M10 2.9 4.3 5v4.6c0 3 2.3 5.6 5.7 6.5 3.4-.9 5.7-3.5 5.7-6.5V5L10 2.9Z" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M10 8.2v2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="10" cy="12.8" r=".85" fill="currentColor"/>',
    bolt: '<path d="M11.2 2.8 4.9 11h3.9l-1 6.2 6.3-8.2h-3.9l1-6.2Z" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    ghost: '<path d="M5.1 16.6V9.5a4.9 4.9 0 0 1 9.8 0v7.1l-2-1.6-1.9 1.6-2-1.6-1.9 1.6-2-1.6Z" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="8.2" cy="9.1" r=".9" fill="currentColor"/>' +
      '<circle cx="11.8" cy="9.1" r=".9" fill="currentColor"/>'
  };

  var DISMISS_KEY = 'stupidswiki:dismissed';

  function readDismissed() {
    try {
      var list = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function rememberDismissed(key) {
    var ids = readDismissed();
    if (ids.indexOf(key) === -1) ids.push(key);
    try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(ids)); } catch (err) { /* 隐身模式 */ }
  }

  function hashText(text) {
    var hash = 5381;
    for (var i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
  }

  function noticeContext(page) {
    return {
      pageId: page.id,
      hasPage: function (id) { return state.byId.has(id); },
      pageTitle: function (id) {
        var target = state.byId.get(id);
        return target ? target.title : '';
      },
      resolveUrl: makeResolver(page)
    };
  }

  function findPreset(name) {
    return state.noticePresets.get(String(name).trim()) || null;
  }

  function specFromPreset(preset, overrideText, seed) {
    return {
      kind: preset.kind,
      icon: preset.icon,
      variant: preset.variant,
      title: preset.title,
      text: overrideText === '' || overrideText == null ? preset.text : String(overrideText),
      dismissible: preset.dismissible === true,
      seed: seed
    };
  }

  function normalizeNotices(page) {
    var raw = page.frontMatter && page.frontMatter.notice;
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : [raw];
    var specs = [];

    list.forEach(function (entry, index) {
      var seed = 'fm:' + index;

      // 1. 只写名字（查模板库），或者一段自定义文字
      if (typeof entry === 'string') {
        var name = entry.trim();
        if (!name) return;
        var preset = findPreset(name);
        specs.push(preset
          ? specFromPreset(preset, '', seed)
          : { kind: 'note', icon: '', title: '', text: name, dismissible: false, seed: seed });
        return;
      }

      if (!entry || typeof entry !== 'object') return;

      // 2. 手写字段
      if (entry.type || entry.title || entry.text) {
        if (!entry.title && !entry.text) return;
        specs.push({
          kind: String(entry.type || 'note'),
          icon: entry.icon ? String(entry.icon) : '',
          variant: entry.variant ? String(entry.variant) : '',
          title: entry.title == null ? '' : String(entry.title),
          text: entry.text == null ? '' : String(entry.text),
          dismissible: entry.dismissible === true || entry.dismissible === 'true',
          seed: entry.id ? 'id:' + entry.id : seed
        });
        return;
      }

      // 3. { 模板名: 自定义文字 }
      var keys = Object.keys(entry);
      if (keys.length !== 1) return;
      var byName = findPreset(keys[0]);
      if (byName) specs.push(specFromPreset(byName, entry[keys[0]], seed));
    });

    return specs;
  }

  function buildNotice(ctx, spec) {
    var kind = NOTICE_TYPES[String(spec.kind || 'note').toLowerCase()] || 'note';
    var iconName = NOTICE_ICONS[spec.icon] ? spec.icon : kind;
    var variant = String(spec.variant || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    var dismissible = spec.dismissible === true;
    var key = ctx.pageId + ':' + (spec.seed || '') + ':' + hashText((spec.title || '') + (spec.text || ''));

    if (dismissible && readDismissed().indexOf(key) !== -1) return '';

    var title = spec.title ? MD.renderInline(spec.title, ctx) : escapeHtml(NOTICE_LABEL[kind]);
    var text = spec.text ? MD.renderInline(spec.text, ctx) : '';

    return '<div class="notice notice--' + kind + (variant ? ' notice--' + variant : '') + '"' +
      (dismissible ? ' data-notice="' + escapeHtml(key) + '"' : '') + '>' +
      '<div class="notice__icon-box">' +
      '<svg class="notice__icon" viewBox="0 0 20 20" aria-hidden="true">' + NOTICE_ICONS[iconName] + '</svg>' +
      '</div>' +
      '<div class="notice__body">' +
      '<p class="notice__title">' + title + '</p>' +
      (text ? '<p class="notice__text">' + text + '</p>' : '') +
      '</div>' +
      (dismissible
        ? '<button class="notice__close" type="button" aria-label="关闭这条提示">' +
          '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.2 6.2l7.6 7.6M13.8 6.2l-7.6 7.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
          '</button>'
        : '') +
      '</div>';
  }

  function renderNotices(page) {
    var specs = normalizeNotices(page);
    if (!specs.length) return '';
    var ctx = noticeContext(page);
    var html = specs.map(function (spec) { return buildNotice(ctx, spec); }).join('');
    if (!html) return '';
    return '<div class="page-notices" role="note" aria-label="页面提示">' + html + '</div>';
  }

  /** 给 markdown 里的 {{模板名}} 用：找不到就返回 null，让渲染器原样显示 */
  function makeTemplateResolver(page) {
    var ctx = noticeContext(page);
    return function (name, arg) {
      var preset = findPreset(name);
      if (!preset) return null;
      return buildNotice(ctx, specFromPreset(preset, arg, 'tpl:' + name));
    };
  }

  function wireNotices() {
    var buttons = el.article.querySelectorAll('.notice__close');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function (event) {
        var box = event.currentTarget.closest('.notice');
        if (!box) return;
        var key = box.getAttribute('data-notice');
        box.classList.add('is-closing');
        window.setTimeout(function () {
          box.remove();
          var wrap = el.article.querySelector('.page-notices');
          if (wrap && !wrap.querySelector('.notice')) wrap.remove();
        }, 160);
        rememberDismissed(key);
        el.article.setAttribute('tabindex', '-1');
        el.article.focus({ preventScroll: true });
      });
    }
  }

  /* ---------------------------------------------------------- 渲染 */

  function makeResolver(page) {
    var dir = page.file.indexOf('/') >= 0 ? page.file.slice(0, page.file.lastIndexOf('/') + 1) : '';
    var base;
    try {
      base = new URL('wiki/' + dir, document.baseURI);
    } catch (err) {
      base = null;
    }
    return function (url) {
      if (!url) return url;
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.charAt(0) === '#' || url.charAt(0) === '/') return url;
      if (!base) return 'wiki/' + dir + url;
      try {
        return new URL(url, base).href;
      } catch (err) {
        return 'wiki/' + dir + url;
      }
    };
  }

  function renderPage(page, anchor) {
    state.current = page;
    setActiveNav(page.id);
    closeSidebar();

    document.title = page.title + ' · ' + (state.site.title || 'wiki');
    renderPageMeta(page);

    if (page.error) {
      el.article.innerHTML =
        '<h1>这一页没能加载出来</h1>' +
        '<p>读取 <code>wiki/' + escapeHtml(page.file) + '</code> 时出错：</p>' +
        '<pre><code>' + escapeHtml(page.error.message || String(page.error)) + '</code></pre>' +
        '<p>如果是本地直接双击打开的 <code>index.html</code>，浏览器会拦截文件读取。' +
        '请用一个本地服务器打开，例如在本目录运行 <code>python -m http.server 8000</code>。</p>';
      el.tocList.innerHTML = '';
      el.toc.classList.add('is-empty');
      el.pager.hidden = true;
      updateActiveHeading();
      scrollToAnchor('');
      return;
    }

    var result = MD.render(page.markdown, {
      pageId: page.id,
      hasPage: function (id) { return state.byId.has(id); },
      pageTitle: function (id) {
        var target = state.byId.get(id);
        return target ? target.title : '';
      },
      noticeHtml: makeTemplateResolver(page),
      resolveUrl: makeResolver(page)
    });

    var needsTitle = !/^<h1[\s>]/.test(result.html);
    el.article.innerHTML = renderNotices(page) +
      (needsTitle ? '<h1 id="top">' + escapeHtml(page.title) + '</h1>\n' : '') + result.html;
    wireNotices();

    renderToc(result.headings);
    decorateCodeBlocks();
    renderPager(page);

    // 换页后把焦点交给正文，读屏会从新内容开始
    if (state.renderedOnce) {
      el.article.setAttribute('tabindex', '-1');
      el.article.focus({ preventScroll: true });
    }
    state.renderedOnce = true;

    scrollToAnchor(anchor);
  }

  function renderPageMeta(page) {
    if (!page.category) { el.pageMeta.hidden = true; return; }
    var html = '<span class="page-meta__crumb">' + escapeHtml(page.category) + '</span>';
    if (state.site.repo) {
      var base = state.site.repo.replace(/\/+$/, '');
      html += '<a class="page-meta__edit" href="' + escapeHtml(base + '/edit/main/wiki/' + page.file) +
        '" target="_blank" rel="noopener noreferrer">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.6 1.4a1.9 1.9 0 0 1 2.7 2.7l-8.2 8.2-3.4.7.7-3.4 8.2-8.2Zm1.3 1.3-1.6-1.6-7.8 7.8-.4 1.7 1.7-.4 8.1-7.5Z"/></svg>' +
        '编辑本页</a>';
    }
    el.pageMeta.innerHTML = html;
    el.pageMeta.hidden = false;
  }

  function renderToc(headings) {
    el.tocList.innerHTML = '';
    if (!headings.length) {
      el.toc.classList.add('is-empty');
      return;
    }
    el.toc.classList.remove('is-empty');

    var frag = document.createDocumentFragment();
    headings.forEach(function (heading) {
      var item = document.createElement('li');
      item.className = 'toc__item' + (heading.level === 3 ? ' toc__item--h3' : '');
      item.dataset.anchor = heading.id;
      var link = document.createElement('a');
      link.href = '#/page/' + encodeURIComponent(state.current.id) + '#' + encodeURIComponent(heading.id);
      link.textContent = heading.text;
      link.dataset.anchor = heading.id;
      item.appendChild(link);
      frag.appendChild(item);
    });
    el.tocList.appendChild(frag);
    updateActiveHeading();
  }

  function updateActiveHeading() {
    if (!state.current || el.toc.classList.contains('is-empty')) return;
    var headings = el.article.querySelectorAll('h2[id], h3[id]');
    if (!headings.length) return;

    var offset = headerOffset();
    var activeId = headings[0].id;
    for (var i = 0; i < headings.length; i += 1) {
      if (headings[i].getBoundingClientRect().top <= offset) activeId = headings[i].id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6) {
      activeId = headings[headings.length - 1].id;
    }

    var items = el.tocList.querySelectorAll('.toc__item');
    for (var j = 0; j < items.length; j += 1) {
      items[j].classList.toggle('is-active', items[j].dataset.anchor === activeId);
    }
  }

  function decorateCodeBlocks() {
    var blocks = el.article.querySelectorAll('pre');
    for (var i = 0; i < blocks.length; i += 1) {
      (function (pre) {
        if (pre.querySelector('.copy-btn')) return;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-btn';
        button.textContent = '复制';
        button.addEventListener('click', function () {
          var code = pre.querySelector('code');
          var text = code ? code.textContent : pre.textContent;
          var done = function (label) {
            button.textContent = label;
            button.classList.add('is-copied');
            window.setTimeout(function () {
              button.textContent = '复制';
              button.classList.remove('is-copied');
            }, 1500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done('已复制'); },
              function () { done('复制失败'); });
          } else {
            done('复制失败');
          }
        });
        pre.appendChild(button);
      }(blocks[i]));
    }
  }

  function renderPager(page) {
    var index = state.pages.indexOf(page);
    var prev = index > 0 ? state.pages[index - 1] : null;
    var next = index >= 0 && index < state.pages.length - 1 ? state.pages[index + 1] : null;

    if (!prev && !next) { el.pager.hidden = true; return; }

    var html = '';
    if (prev) {
      html += '<a class="pager__link" href="#/page/' + encodeURIComponent(prev.id) + '">' +
        '<span class="pager__label">← 上一页</span>' +
        '<span class="pager__title">' + escapeHtml(prev.title) + '</span></a>';
    }
    if (next) {
      html += '<a class="pager__link pager__link--next" href="#/page/' + encodeURIComponent(next.id) + '">' +
        '<span class="pager__label">下一页 →</span>' +
        '<span class="pager__title">' + escapeHtml(next.title) + '</span></a>';
    }
    el.pager.innerHTML = html;
    el.pager.hidden = false;
  }

  function renderNotFound(id) {
    state.current = null;
    setActiveNav('');
    document.title = '页面不存在 · ' + (state.site.title || 'wiki');
    el.pageMeta.hidden = true;
    el.tocList.innerHTML = '';
    el.toc.classList.add('is-empty');
    el.pager.hidden = true;

    var links = state.pages.slice(0, 6).map(function (page) {
      return '<li><a href="#/page/' + encodeURIComponent(page.id) + '">' +
        escapeHtml(page.title) + '</a></li>';
    }).join('');

    el.article.innerHTML =
      '<div class="empty-state">' +
      '<h1>没有这一页</h1>' +
      (id ? '<p><code>' + escapeHtml(id) + '</code> 还没有被写进 wiki。</p>' : '') +
      '<p>可能是链接写错了，或者这页还没建。可以先看看这些：</p>' +
      '<ul>' + links + '</ul>' +
      '<button class="btn" type="button" id="notFoundSearch">搜索全部页面</button>' +
      '</div>';

    var button = byId('notFoundSearch');
    if (button) button.addEventListener('click', openSearch);
    window.scrollTo(0, 0);
  }

  function showSetupHelp(reason) {
    document.body.classList.add('is-fatal');
    el.article.innerHTML =
      '<div class="empty-state">' +
      '<h1>站点没能启动</h1>' +
      (reason ? '<p>' + reason + '</p>' : '') +
      '<p>这个 wiki 需要从本地服务器或 GitHub Pages 打开——浏览器的安全策略不允许页面直接读取本地文件。</p>' +
      '<p>在项目根目录运行：</p>' +
      '<pre><code>python -m http.server 8000</code></pre>' +
      '<p>然后访问 <code>http://127.0.0.1:8000</code>。没有 Python 的话，<code>npx serve .</code> 也行。</p>' +
      '<p>如果已经是通过服务器打开的，那多半是 <code>wiki/pages.json</code> 有 JSON 语法问题（多余的逗号、缺引号）。</p>' +
      '</div>';
  }

  /* ---------------------------------------------------------- 搜索 */

  function buildResults(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      return state.pages.slice(0, 8).map(function (page) {
        return { page: page, snippet: page.description || page.plain.slice(0, 60), titleHit: false };
      });
    }

    var results = [];
    state.pages.forEach(function (page) {
      var title = page.title.toLowerCase();
      var description = page.description.toLowerCase();
      var body = page.plain.toLowerCase();

      var inTitle = title.indexOf(q) >= 0;
      var inDesc = description.indexOf(q) >= 0;
      var inBody = body.indexOf(q) >= 0;
      if (!inTitle && !inDesc && !inBody) return;

      var snippet;
      if (inBody) {
        var index = body.indexOf(q);
        var start = Math.max(0, index - 34);
        var end = Math.min(page.plain.length, index + q.length + 70);
        snippet = (start > 0 ? '…' : '') + page.plain.slice(start, end) + (end < page.plain.length ? '…' : '');
      } else {
        snippet = page.description || page.plain.slice(0, 80);
      }

      results.push({
        page: page,
        snippet: snippet,
        titleHit: inTitle,
        score: (inTitle ? 100 : 0) + (inDesc ? 20 : 0) + (inBody ? 10 : 0)
      });
    });

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return state.pages.indexOf(a.page) - state.pages.indexOf(b.page);
    });

    return results.slice(0, 12);
  }

  function highlightSnippet(text, query) {
    var q = (query || '').trim();
    if (!q) return escapeHtml(text);
    var lower = text.toLowerCase();
    var target = q.toLowerCase();
    var out = '';
    var pos = 0;
    var index = lower.indexOf(target, pos);
    while (index !== -1) {
      out += escapeHtml(text.slice(pos, index));
      out += '<mark>' + escapeHtml(text.slice(index, index + target.length)) + '</mark>';
      pos = index + target.length;
      index = lower.indexOf(target, pos);
    }
    out += escapeHtml(text.slice(pos));
    return out;
  }

  function renderResults(query) {
    state.results = buildResults(query);
    state.activeResult = 0;
    el.searchResults.innerHTML = '';

    if (!state.results.length) {
      var empty = document.createElement('li');
      empty.className = 'search__empty';
      empty.textContent = '没有找到「' + query.trim() + '」，换个词试试？';
      el.searchResults.appendChild(empty);
      return;
    }

    var frag = document.createDocumentFragment();
    state.results.forEach(function (result, index) {
      var item = document.createElement('li');
      item.className = 'search__result';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      item.dataset.index = String(index);

      var title = document.createElement('div');
      title.className = 'search__result-title';
      title.innerHTML = highlightSnippet(result.page.title, query) +
        '<span class="search__result-cat">' + escapeHtml(result.page.category) + '</span>';

      var body = document.createElement('div');
      body.className = 'search__result-body';
      body.innerHTML = highlightSnippet(result.snippet, query);

      item.appendChild(title);
      item.appendChild(body);
      frag.appendChild(item);
    });
    el.searchResults.appendChild(frag);
  }

  function setActiveResult(index) {
    if (!state.results.length) return;
    var max = state.results.length - 1;
    state.activeResult = Math.max(0, Math.min(index, max));

    var items = el.searchResults.querySelectorAll('.search__result');
    for (var i = 0; i < items.length; i += 1) {
      items[i].setAttribute('aria-selected', i === state.activeResult ? 'true' : 'false');
    }
    var active = items[state.activeResult];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function openResult(index) {
    var result = state.results[index];
    if (!result) return;
    closeSearch();
    goToPage(result.page, false);
  }

  function openSearch() {
    state.lastFocus = document.activeElement;
    el.search.hidden = false;
    document.body.classList.add('search-open');
    el.searchInput.value = '';
    renderResults('');
    el.searchInput.focus();
  }

  function closeSearch() {
    if (el.search.hidden) return;
    el.search.hidden = true;
    document.body.classList.remove('search-open');
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function initSearch() {
    el.searchTrigger.addEventListener('click', openSearch);

    var closers = el.search.querySelectorAll('[data-close-search]');
    for (var i = 0; i < closers.length; i += 1) closers[i].addEventListener('click', closeSearch);

    el.searchInput.addEventListener('input', function () {
      renderResults(el.searchInput.value);
    });

    el.searchResults.addEventListener('click', function (event) {
      var item = event.target.closest('.search__result');
      if (item) openResult(Number(item.dataset.index));
    });

    el.searchResults.addEventListener('mousemove', function (event) {
      var item = event.target.closest('.search__result');
      if (item) setActiveResult(Number(item.dataset.index));
    });

    document.addEventListener('keydown', function (event) {
      var mod = event.ctrlKey || event.metaKey;

      if (mod && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        if (el.search.hidden) openSearch(); else closeSearch();
        return;
      }

      if (!el.search.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); closeSearch(); return; }
        if (event.key === 'ArrowDown') { event.preventDefault(); setActiveResult(state.activeResult + 1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActiveResult(state.activeResult - 1); return; }
        if (event.key === 'Enter') { event.preventDefault(); openResult(state.activeResult); return; }
        return;
      }

      if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault();
        openSearch();
        return;
      }

      if (event.key === 'Escape') closeSidebar();
    });
  }

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  /* ---------------------------------------------------------- 移动端 */

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    el.menuBtn.setAttribute('aria-expanded', 'true');
    el.scrim.hidden = false;
  }

  function closeSidebar() {
    if (!document.body.classList.contains('sidebar-open')) return;
    document.body.classList.remove('sidebar-open');
    el.menuBtn.setAttribute('aria-expanded', 'false');
    el.scrim.hidden = true;
  }

  function initSidebar() {
    el.menuBtn.addEventListener('click', function () {
      if (document.body.classList.contains('sidebar-open')) closeSidebar(); else openSidebar();
    });
    el.scrim.addEventListener('click', closeSidebar);
    el.sidebarNav.addEventListener('click', function (event) {
      if (event.target.closest('.nav-link')) closeSidebar();
    });
  }

  /* ---------------------------------------------------------- 启动 */

  function cacheElements() {
    el.brand = byId('brand');
    el.brandName = byId('brandName');
    el.brandTagline = byId('brandTagline');
    el.menuBtn = byId('menuBtn');
    el.themeBtn = byId('themeBtn');
    el.searchTrigger = byId('searchTrigger');
    el.searchKbd = byId('searchKbd');
    el.sidebar = byId('sidebar');
    el.sidebarNav = byId('sidebarNav');
    el.scrim = byId('scrim');
    el.pageMeta = byId('pageMeta');
    el.article = byId('article');
    el.pager = byId('pager');
    el.toc = byId('toc');
    el.tocList = byId('tocList');
    el.search = byId('search');
    el.searchInput = byId('searchInput');
    el.searchResults = byId('searchResults');
    el.repoLink = byId('repoLink');
    el.siteFooter = byId('siteFooter');
    el.homeLink = byId('homeLink');
  }

  function showSkeleton() {
    el.article.innerHTML = '<div class="skeleton">' +
      '<div class="skeleton__line skeleton__line--title"></div>' +
      '<div class="skeleton__line"></div>' +
      '<div class="skeleton__line"></div>' +
      '<div class="skeleton__line"></div>' +
      '<div class="skeleton__line" style="width:58%"></div>' +
      '</div>';
  }

  function boot() {
    cacheElements();
    initTheme();
    initSidebar();
    initSearch();
    showSkeleton();

    if (window.location.protocol === 'file:') {
      showSetupHelp('现在是直接双击打开的 <code>index.html</code>。');
      return;
    }

    if (el.searchKbd) {
      el.searchKbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K';
    }

    // 模板库是可选件：没有它，手写 type/title/text 的提示照样能用
    Promise.resolve(fetchJson('wiki/notices.json').then(function (library) {
      (library.categories || []).forEach(function (group) {
        (group.items || []).forEach(function (item) {
          if (!item || !item.name) return;
          state.noticePresets.set(String(item.name), {
            name: String(item.name),
            kind: String(item.kind || 'note'),
            icon: item.icon ? String(item.icon) : '',
            variant: item.variant ? String(item.variant) : '',
            title: item.title == null ? String(item.name) : String(item.title),
            text: item.text == null ? '' : String(item.text),
            dismissible: item.dismissible === true
          });
        });
      });
    }).catch(function (err) {
      console.warn('[wiki] 没读到 wiki/notices.json，模板库为空：' + (err && err.message));
    })).then(function () {
      return fetchJson('wiki/pages.json');
    }).then(function (manifest) {
      normalizeManifest(manifest);
      if (!state.pages.length) throw new Error('pages.json 里没有任何页面');
      renderBrand();
      renderSidebar();

      return Promise.all(state.pages.map(function (page) {
        return loadText('wiki/' + page.file).then(function (text) {
          var parsed = MD.parseFrontMatter(text);
          page.frontMatter = parsed.data || {};
          page.markdown = parsed.body;
          page.plain = MD.toPlainText(parsed.body);
        }).catch(function (err) {
          page.error = err;
        });
      }));
    }).then(function () {
      window.addEventListener('hashchange', route);
      window.addEventListener('scroll', throttleRaf(updateActiveHeading), { passive: true });
      window.addEventListener('resize', throttleRaf(updateActiveHeading));
      route();
    }).catch(function (err) {
      showSetupHelp(err && err.message ? '加载失败：' + escapeHtml(err.message) : '');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
