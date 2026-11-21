/* ==========================================================================
   markdown.js — 一个够用的 Markdown 渲染器（零依赖、约 300 行）
   支持：标题、段落、粗体、斜体、删除线、行内代码、围栏代码块、引用、
         GitHub 风格提示块、有序/无序/嵌套列表、任务列表、表格、分割线、
         链接、图片、自动链接、[[wiki 内链]]
   不支持（有意为之）：原始 HTML（会被转义）、引用式链接、脚注。
   ========================================================================== */
(function (global) {
  'use strict';

  var PH_OPEN = '\u0001';   // 占位符边界，正文里不会出现
  var PH_CLOSE = '\u0002';

  /* ---------------------------------------------------------- 工具 */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  function sanitizeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u) return '';
    if (/^(javascript|vbscript|file):/i.test(u)) return '';
    if (/^data:/i.test(u) && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/.test(u)) return '';
    return u;
  }

  function leadingSpaces(line) {
    var m = /^[ \t]*/.exec(line)[0];
    return m.indexOf('\t') >= 0 ? m.replace(/\t/g, '    ').length : m.length;
  }

  function stripIndent(line, count) {
    var i = 0;
    var removed = 0;
    while (i < line.length && removed < count) {
      if (line[i] === ' ') { removed += 1; i += 1; }
      else if (line[i] === '\t') { removed += 4; i += 1; }
      else break;
    }
    return line.slice(i);
  }

  function plainText(src) {
    return String(src == null ? '' : src)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~]/g, '')
      .trim();
  }

  function slugify(text) {
    var slug = plainText(text)
      .toLowerCase()
      .replace(/[`*_~[\]()（）{}]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'section';
  }

  /* ---------------------------------------------------------- 行内 */

  function renderInline(src, ctx) {
    var stash = [];
    function put(html) {
      stash.push(html);
      return PH_OPEN + (stash.length - 1) + PH_CLOSE;
    }

    var s = String(src == null ? '' : src);

    // 行内代码最先抽走，避免其中的符号被当成语法
    s = s.replace(/(`+)([\s\S]*?)\1/g, function (m, ticks, code) {
      var inner = code;
      if (inner.length > 2 && inner.charAt(0) === ' ' && inner.charAt(inner.length - 1) === ' ' && inner.trim()) {
        inner = inner.slice(1, -1);
      }
      return put('<code>' + escapeHtml(inner) + '</code>');
    });

    // 图片
    s = s.replace(/!\[([^\]]*)\]\(\s*<?((?:[^()\s<>]|\([^()\s<>]*\))+)>?(?:\s+["']([^"']*)["'])?\s*\)/g,
      function (m, alt, url, title) {
        var clean = sanitizeUrl(url);
        if (!clean) return put(escapeHtml(alt));
        var src2 = ctx.resolveUrl(clean);
        var html = '<img src="' + escapeHtml(src2) + '" alt="' + escapeHtml(alt) +
          '" loading="lazy" decoding="async"';
        if (title) html += ' title="' + escapeHtml(title) + '"';
        return put(html + '>');
      });

    // [[wiki 内链]]、[[wiki 内链|显示文字]]、[[wiki 内链#某节|显示文字]]
    s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, function (m, target, label) {
      var raw = String(target).trim();
      var hashAt = raw.indexOf('#');
      var pageId = hashAt >= 0 ? raw.slice(0, hashAt).trim() : raw;
      var anchor = hashAt >= 0 ? raw.slice(hashAt + 1).trim() : '';
      var text = label == null
        ? (ctx.pageTitle(pageId) || raw)
        : String(label).trim();
      var exists = ctx.hasPage(pageId);
      var href = '#/page/' + escapeHtml(encodeURIComponent(pageId)) +
        (anchor ? '#' + escapeHtml(encodeURIComponent(anchor)) : '');
      return put('<a class="wikilink' + (exists ? '' : ' is-missing') +
        '" href="' + href + '"' +
        (exists ? '' : ' title="这一页还不存在"') + '>' +
        renderInline(text, ctx) + '</a>');
    });

    // 普通链接
    s = s.replace(/\[([^\]]*)\]\(\s*<?((?:[^()\s<>]|\([^()\s<>]*\))+)>?(?:\s+["']([^"']*)["'])?\s*\)/g,
      function (m, text, url, title) {
        var clean = sanitizeUrl(url);
        if (!clean) return put(renderInline(text, ctx));   // 不安全协议：只留文字
        var external = /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.indexOf('//') === 0;
        var href = external ? clean : ctx.resolveUrl(clean);
        var html = '<a href="' + escapeHtml(href) + '"';
        if (external) html += ' target="_blank" rel="noopener noreferrer"';
        if (title) html += ' title="' + escapeHtml(title) + '"';
        return put(html + '>' + renderInline(text, ctx) + '</a>');
      });

    // 粗体
    s = s.replace(/\*\*(?!\*)(?=\S)([\s\S]*?\S)\*\*/g, function (m, inner) {
      return put('<strong>' + renderInline(inner, ctx) + '</strong>');
    });

    // 删除线
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, function (m, inner) {
      return put('<del>' + renderInline(inner, ctx) + '</del>');
    });

    // 斜体（要求 * 前不是字母数字，避免 2*3*4 这类误伤）
    s = s.replace(/(^|[^*\w])\*(?![\s*])([^*\n]*?[^\s*])\*(?!\*)/g, function (m, before, inner) {
      return before + put('<em>' + renderInline(inner, ctx) + '</em>');
    });

    // 裸链接
    s = s.replace(/(^|[\s(（「"'【])(https?:\/\/[^\s<>"'）)】]+)/g, function (m, before, url) {
      var trimmed = url.replace(/[.,;:!?，。；：！？]+$/, '');
      var tail = url.slice(trimmed.length);
      return before + put('<a href="' + escapeHtml(trimmed) +
        '" target="_blank" rel="noopener noreferrer">' + escapeHtml(trimmed) + '</a>') + tail;
    });

    // 统一转义，再还原生成的标签
    s = escapeHtml(s);
    return s.replace(/\u0001(\d+)\u0002/g, function (m, index) {
      return stash[Number(index)];
    });
  }

  /* ---------------------------------------------------------- 块级 */

  var RE_HEADING = /^ {0,3}(#{1,6})[ \t]*(.*?)(?:[ \t]+#+)?[ \t]*$/;
  var RE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/;
  var RE_HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
  var RE_QUOTE = /^ {0,3}>/;
  var RE_LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
  var RE_CALLOUT = /^\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION|DANGER)\][ \t]*(.*)$/i;
  // 独占一行的 {{模板名}} 或 {{模板名|自定义文字}}
  var RE_DIRECTIVE = /^\{\{\s*([^{}|]{1,40}?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}$/;

  var CALLOUT_KIND = {
    NOTE: 'note', INFO: 'note', IMPORTANT: 'note',
    TIP: 'tip', WARNING: 'warning', CAUTION: 'warning', DANGER: 'danger'
  };
  var CALLOUT_LABEL = {
    note: '说明', tip: '技巧', warning: '注意', danger: '危险'
  };

  function listItem(line) {
    var m = RE_LIST.exec(line);
    if (!m) return null;
    var indent = m[1].indexOf('\t') >= 0 ? m[1].replace(/\t/g, '    ').length : m[1].length;
    return {
      indent: indent,
      ordered: /^\d/.test(m[2]),
      start: /^\d/.test(m[2]) ? parseInt(m[2], 10) : 1,
      content: m[4]
    };
  }

  function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
    var cells = [];
    var current = '';
    for (var i = 0; i < s.length; i += 1) {
      var ch = s.charAt(i);
      if (ch === '\\' && s.charAt(i + 1) === '|') { current += '|'; i += 1; continue; }
      if (ch === '|') { cells.push(current); current = ''; continue; }
      current += ch;
    }
    cells.push(current);
    return cells.map(function (c) { return c.trim(); });
  }

  function isTableDelimiter(line) {
    if (line.indexOf('-') < 0) return false;
    var cells = splitRow(line);
    if (!cells.length) return false;
    return cells.every(function (c) { return /^:?-{2,}:?$/.test(c.replace(/[ \t]/g, '')); });
  }

  function startsBlock(line, next) {
    return RE_HEADING.test(line) && line.trim() !== '' ? true
      : RE_FENCE.test(line) ? true
        : RE_HR.test(line) ? true
          : RE_QUOTE.test(line) ? true
            : RE_LIST.test(line) ? true
              : RE_DIRECTIVE.test(line) ? true
                : next ? line.indexOf('|') >= 0 && isTableDelimiter(next) : false;
  }

  function renderBlocks(lines, ctx) {
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) { i += 1; continue; }

      /* 围栏代码块 */
      var fence = RE_FENCE.exec(line);
      if (fence) {
        var marker = fence[1];
        var lang = fence[2];
        var body = [];
        i += 1;
        while (i < lines.length) {
          var close = new RegExp('^ {0,3}' + (marker.charAt(0) === '`' ? '`' : '~') +
            '{' + marker.length + ',}[ \\t]*$');
          if (close.test(lines[i])) { i += 1; break; }
          body.push(lines[i]);
          i += 1;
        }
        out.push('<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' +
          escapeHtml(body.join('\n')) + '</code></pre>');
        continue;
      }

      /* 标题 */
      var heading = RE_HEADING.exec(line);
      if (heading) {
        var level = heading[1].length;
        var raw = heading[2];
        var id = ctx.uniqueId(slugify(raw));
        if (level === 2 || level === 3) {
          ctx.headings.push({ level: level, text: plainText(raw), id: id });
        }
        out.push('<h' + level + ' id="' + escapeHtml(id) + '">' + renderInline(raw, ctx) +
          (level > 1
            ? '<a class="h-anchor" href="#/page/' + escapeHtml(encodeURIComponent(ctx.pageId)) +
              '#' + escapeHtml(encodeURIComponent(id)) + '" aria-label="本节永久链接">#</a>'
            : '') +
          '</h' + level + '>');
        i += 1;
        continue;
      }

      /* 分割线 */
      if (RE_HR.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      /* 引用与提示块 */
      if (RE_QUOTE.test(line)) {
        var quoted = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) {
          quoted.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
          i += 1;
        }
        var callout = RE_CALLOUT.exec(quoted[0] || '');
        if (callout) {
          var kind = CALLOUT_KIND[callout[1].toUpperCase()] || 'note';
          var custom = callout[2].trim();
          quoted.shift();
          out.push('<div class="callout callout--' + kind + '">' +
            '<p class="callout__title">' + escapeHtml(custom || CALLOUT_LABEL[kind]) + '</p>' +
            renderBlocks(quoted, ctx) + '</div>');
        } else {
          out.push('<blockquote>' + renderBlocks(quoted, ctx) + '</blockquote>');
        }
        continue;
      }

      /* 表格 */
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        var header = splitRow(line);
        var align = splitRow(lines[i + 1]).map(function (c) {
          var t = c.replace(/[ \t]/g, '');
          if (/^:-+:$/.test(t)) return 'center';
          if (/^-+:$/.test(t)) return 'right';
          if (/^:-+$/.test(t)) return 'left';
          return '';
        });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
          rows.push(splitRow(lines[i]));
          i += 1;
        }
        var head = header.map(function (cell, index) {
          var a = align[index];
          return '<th' + (a ? ' style="text-align:' + a + '"' : '') + '>' +
            renderInline(cell, ctx) + '</th>';
        }).join('');
        var bodyRows = rows.map(function (row) {
          var cells = [];
          for (var c = 0; c < header.length; c += 1) {
            var value = row[c] == null ? '' : row[c];
            var a = align[c];
            cells.push('<td' + (a ? ' style="text-align:' + a + '"' : '') + '>' +
              renderInline(value, ctx) + '</td>');
          }
          return '<tr>' + cells.join('') + '</tr>';
        }).join('');
        out.push('<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead>' +
          (bodyRows ? '<tbody>' + bodyRows + '</tbody>' : '') + '</table></div>');
        continue;
      }

      /* 列表 */
      if (RE_LIST.test(line)) {
        var parsed = parseList(lines, i, ctx);
        out.push(parsed.html);
        i = parsed.next;
        continue;
      }

      /* {{模板名}} → 提示条 */
      var directive = RE_DIRECTIVE.exec(line);
      if (directive) {
        var templateName = directive[1].trim();
        var templateArg = directive[2] == null ? '' : directive[2].trim();
        var noticeHtml = ctx.noticeHtml(templateName, templateArg);
        if (typeof noticeHtml === 'string') {
          if (noticeHtml) out.push(noticeHtml);
        } else {
          // 模板库里没有这个名字：原样显示，并在右侧给个提示
          out.push('<p><span class="unknown-template" title="模板库里没有这个模板">' +
            escapeHtml(line.trim()) + '</span></p>');
        }
        i += 1;
        continue;
      }

      /* 段落 */
      var para = [];
      while (i < lines.length) {
        var current = lines[i];
        if (!current.trim()) break;
        if (para.length && startsBlock(current, lines[i + 1])) break;
        para.push(current);
        i += 1;
      }
      if (para.length) {
        var segments = para.join('\n').split(/(?:[ \t]{2,}|\\)\n/);
        out.push('<p>' + segments.map(function (segment) {
          return renderInline(segment, ctx);
        }).join('<br>\n') + '</p>');
      } else {
        i += 1;
      }
    }

    return out.join('\n');
  }

  function parseList(lines, start, ctx) {
    var first = listItem(lines[start]);
    var base = first.indent;
    var ordered = first.ordered;
    var startNumber = first.start;
    var items = [];
    var i = start;

    while (i < lines.length) {
      var current = listItem(lines[i]);
      if (!current || current.indent !== base || current.ordered !== ordered) break;
      var buffer = [current.content];
      i += 1;

      while (i < lines.length) {
        var line = lines[i];

        if (!line.trim()) {
          var next = i + 1;
          while (next < lines.length && !lines[next].trim()) next += 1;
          if (next >= lines.length) { i = next; break; }
          if (leadingSpaces(lines[next]) <= base) break;
          buffer.push('');
          i = next;
          continue;
        }

        var indented = leadingSpaces(line);
        var nextItem = listItem(line);
        if (nextItem && nextItem.indent <= base) break;
        if (!nextItem && indented <= base) break;

        buffer.push(stripIndent(line, Math.min(indented, base + 2)));
        i += 1;
      }

      items.push(buffer);
    }

    var tag = ordered ? 'ol' : 'ul';
    var attrs = ordered && startNumber !== 1 ? ' start="' + startNumber + '"' : '';
    var html = items.map(function (itemLines) {
      var task = /^\[([ xX])\][ \t]+/.exec(itemLines[0]);
      var checked = false;
      if (task) {
        checked = task[1].toLowerCase() === 'x';
        itemLines = itemLines.slice();
        itemLines[0] = itemLines[0].slice(task[0].length);
      }

      var body = renderBlocks(itemLines, ctx).trim();

      // 紧凑列表（项内没有空行）去掉首段的 <p>，排版更紧
      var tight = itemLines.every(function (line) { return line.trim() !== ''; });
      if (tight && body.indexOf('<p>') === 0) {
        var closeAt = body.indexOf('</p>');
        if (closeAt !== -1) body = body.slice(3, closeAt) + body.slice(closeAt + 4);
      }

      if (task) {
        return '<li class="task"><input type="checkbox" disabled' + (checked ? ' checked' : '') +
          '> ' + body + '</li>';
      }
      return '<li>' + body + '</li>';
    }).join('\n');

    return { html: '<' + tag + attrs + '>\n' + html + '\n</' + tag + '>', next: i };
  }

  /* ---------------------------------------------------------- 入口 */

  function makeContext(options) {
    var opts = options || {};
    var usedIds = Object.create(null);
    return {
      pageId: opts.pageId || '',
      headings: [],
      hasPage: typeof opts.hasPage === 'function' ? opts.hasPage : function () { return true; },
      pageTitle: typeof opts.pageTitle === 'function' ? opts.pageTitle : function () { return ''; },
      noticeHtml: typeof opts.noticeHtml === 'function' ? opts.noticeHtml : function () { return null; },
      resolveUrl: typeof opts.resolveUrl === 'function' ? opts.resolveUrl : function (u) { return u; },
      uniqueId: function (slug) {
        if (!usedIds[slug]) { usedIds[slug] = 1; return slug; }
        usedIds[slug] += 1;
        return slug + '-' + usedIds[slug];
      }
    };
  }

  function render(markdown, options) {
    var ctx = makeContext(options);
    var parsed = parseFrontMatter(markdown);

    var html = renderBlocks(parsed.body.split('\n'), ctx);

    return { html: html, headings: ctx.headings, data: parsed.data };
  }

  /** 单独渲染一段行内文字（页首提示之类用得到） */
  function renderInlineOnly(text, options) {
    return renderInline(String(text == null ? '' : text), makeContext(options));
  }

  /* ---------------------------------------------------------- front matter */

  function scalar(raw) {
    var value = String(raw).trim();
    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      return value.slice(1, -1);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  /**
   * 只认这几种写法，够用就好：
   *   key: 值
   *   key:
   *     - 值
   *     - 子键: 值
   *   key:
   *     子键: 值
   */
  function parseSimpleYaml(lines) {
    var out = {};
    var key = null;
    var collection = null;   // 列表或映射，等第一行缩进出现才知道是哪种
    var item = null;

    function commit() {
      if (key !== null && collection !== null) out[key] = collection;
      key = null;
      collection = null;
      item = null;
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;

      var indent = leadingSpaces(line);
      var trimmed = line.trim();

      if (indent === 0) {
        var top = /^([\p{L}\p{N}_-]+)\s*:\s*(.*)$/u.exec(trimmed);
        if (!top) continue;
        commit();
        key = top[1];
        var rest = top[2].trim();
        if (rest) {
          out[key] = scalar(rest);
          key = null;
        }
        continue;
      }

      if (key === null) continue;

      if (collection === null) {
        collection = /^-\s+/.test(trimmed) ? [] : {};
      }

      if (Array.isArray(collection)) {
        if (/^-\s+/.test(trimmed)) {
          var content = trimmed.replace(/^-\s+/, '');
          var pair = /^([\p{L}\p{N}_-]+)\s*:\s*(.*)$/u.exec(content);
          if (pair) {
            item = {};
            item[pair[1]] = scalar(pair[2]);
            collection.push(item);
          } else {
            item = null;
            collection.push(scalar(content));
          }
        } else if (item) {
          var kv = /^([\p{L}\p{N}_-]+)\s*:\s*(.*)$/u.exec(trimmed);
          if (kv) item[kv[1]] = scalar(kv[2]);
        }
        continue;
      }

      var field = /^([\p{L}\p{N}_-]+)\s*:\s*(.*)$/u.exec(trimmed);
      if (field) collection[field[1]] = scalar(field[2]);
    }

    commit();
    return out;
  }

  /**
   * 拆出文件顶部的 --- 元数据块，返回 { data, body }。
   * 没有元数据时 data 是空对象，body 原样返回。
   */
  function parseFrontMatter(source) {
    var text = String(source == null ? '' : source)
      .replace(/\r\n?/g, '\n')
      .replace(/\u0001/g, '')
      .replace(/\u0002/g, '');

    if (text.slice(0, 3) !== '---') return { data: {}, body: text };

    var lines = text.split('\n');
    var close = -1;
    for (var i = 1; i < lines.length; i += 1) {
      if (/^---[ \t]*$/.test(lines[i])) { close = i; break; }
    }
    if (close === -1) return { data: {}, body: text };

    return {
      data: parseSimpleYaml(lines.slice(1, close)),
      body: lines.slice(close + 1).join('\n').replace(/^\n+/, '')
    };
  }

  /** 去掉围栏代码块（反引号数量可变，必须自己扫一遍） */
  function stripFences(text) {
    var lines = String(text).split('\n');
    var out = [];
    var open = null;
    for (var i = 0; i < lines.length; i += 1) {
      var match = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
      if (open === null) {
        if (match) { open = match[1]; continue; }
        out.push(lines[i]);
        continue;
      }
      if (match && match[1].charAt(0) === open.charAt(0) && match[1].length >= open.length) open = null;
    }
    return out.join('\n');
  }

  /** 去掉 Markdown 语法，用于搜索摘要 */
  function toPlainText(markdown) {
    return stripFences(parseFrontMatter(markdown).body)
      .replace(/^ {0,3}\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[!(?:NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION|DANGER)\]/gi, '')
      .replace(/^ {0,3}#{1,6}[ \t]*/gm, '')
      .replace(/^ {0,3}>[ \t]?/gm, '')
      .replace(/^[ \t]*[-*+][ \t]+/gm, '')
      .replace(/^[ \t]*\d{1,9}[.)][ \t]+/gm, '')
      .replace(/[*_~]/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  global.WikiMarkdown = {
    render: render,
    renderInline: renderInlineOnly,
    parseFrontMatter: parseFrontMatter,
    escapeHtml: escapeHtml,
    toPlainText: toPlainText,
    slugify: slugify
  };
}(typeof window !== 'undefined' ? window : this));
