/*
 * 液态玻璃顶栏 —— SVG 置换贴图 + backdrop-filter 的折射效果。
 *
 * 原理与实现移植自 Archis Vaze 的 liquid-glass 演示（MIT）：
 * https://github.com/archisvaze/liquid-glass
 * 做法：按元素尺寸画一张「法线贴图」（圆角矩形的折射剖面）和一张「镜面贴图」，
 * 再拼成 feGaussianBlur → feDisplacementMap → 镜面叠加 的 SVG 滤镜，
 * 最后用 backdrop-filter: url(#id) 作用在元素背后的内容上。
 *
 * 只有 Chromium 支持 backdrop-filter 接 url() 滤镜；其它浏览器直接跳过，
 * 由 CSS 提供一层普通模糊作为兜底。
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // 玻璃参数：按顶栏这种「细长条」调到不糊字、又能看出折射
  var CONFIG = {
    thickness: 28,        // 玻璃厚度，越大折射越强
    bezel: 12,            // 边缘斜面的宽度（会被圆角和高度夹住）
    ior: 2.6,             // 折射率，1 是空气，2 以上像玻璃
    scaleRatio: 0.8,      // 位移强度和剖面的比例
    blur: 6,              // 背景模糊（feGaussianBlur 的 stdDeviation）
    specOpacity: 0.3,     // 镜面高光强度
    specSaturation: 1.7,  // 折射后背景的饱和度
    angle: Math.PI / 3,   // 光源方向
    maxPixels: 4000000    // 贴图尺寸上限，超过就不做
  };

  var TARGETS = ['.md-header'];

  function supportsGlass() {
    var probe = document.createElement('div');
    probe.style.backdropFilter = 'url(#lg-probe)';
    if (probe.style.backdropFilter) return true;
    probe.style.webkitBackdropFilter = 'url(#lg-probe)';
    return !!probe.style.webkitBackdropFilter;
  }

  // 圆角矩形的剖面：1 - (1-x)^4 再开四次方，接近 iOS 的连续圆角
  function surface(x) {
    return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  }

  function refractionProfile(glassThickness, bezelWidth, heightFn, ior, samples) {
    samples = samples || 128;
    var eta = 1 / ior;

    function refract(nx, ny) {
      var dot = ny;
      var k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      var sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }

    var profile = new Float64Array(samples);
    for (var i = 0; i < samples; i += 1) {
      var x = i / samples;
      var y = heightFn(x);
      var dx = x < 1 ? 0.0001 : -0.0001;
      var y2 = heightFn(x + dx);
      var deriv = (y2 - y) / dx;
      var mag = Math.sqrt(deriv * deriv + 1);
      var ref = refract(-deriv / mag, -1 / mag);
      if (!ref) {
        profile[i] = 0;
        continue;
      }
      profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
    }
    return profile;
  }

  function displacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;

    for (var i = 0; i < d.length; i += 4) {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }

    var r = radius;
    var rSq = r * r;
    var r1Sq = (r + 1) * (r + 1);
    var inner = Math.max(r - bezelWidth, 0);
    var rBSq = inner * inner;
    var wB = w - r * 2;
    var hB = h - r * 2;
    var S = profile.length;

    for (var y1 = 0; y1 < h; y1 += 1) {
      for (var x1 = 0; x1 < w; x1 += 1) {
        var x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        var y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        var dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;

        var dist = Math.sqrt(dSq);
        var fromSide = r - dist;
        var edge = Math.sqrt(rSq);
        var outer = Math.sqrt(r1Sq);
        var op = dSq < rSq ? 1 : 1 - (dist - edge) / (outer - edge);
        if (op <= 0 || dist === 0) continue;

        var cos = x / dist;
        var sin = y / dist;
        var bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
        var disp = profile[bi] || 0;
        var dX = (-cos * disp) / maxDisp;
        var dY = (-sin * disp) / maxDisp;
        var idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * op + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function specularMap(w, h, radius, bezelWidth, angle) {
    angle = angle == null ? Math.PI / 3 : angle;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    d.fill(0);

    var r = radius;
    var rSq = r * r;
    var r1Sq = (r + 1) * (r + 1);
    var inner = Math.max(r - bezelWidth, 0);
    var rBSq = inner * inner;
    var wB = w - r * 2;
    var hB = h - r * 2;
    var sv = [Math.cos(angle), Math.sin(angle)];

    for (var y1 = 0; y1 < h; y1 += 1) {
      for (var x1 = 0; x1 < w; x1 += 1) {
        var x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        var y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        var dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;

        var dist = Math.sqrt(dSq);
        var fromSide = r - dist;
        var edge = Math.sqrt(rSq);
        var outer = Math.sqrt(r1Sq);
        var op = dSq < rSq ? 1 : 1 - (dist - edge) / (outer - edge);
        if (op <= 0 || dist === 0) continue;

        var cos = x / dist;
        var sin = -y / dist;
        var dot = Math.abs(cos * sv[0] + sin * sv[1]);
        var rim = Math.sqrt(Math.max(0, 1 - Math.pow(1 - fromSide, 2)));
        var coeff = dot * rim;
        var col = (255 * coeff) | 0;
        var alpha = (col * coeff * op) | 0;
        var idx = (y1 * w + x1) * 4;
        d[idx] = col;
        d[idx + 1] = col;
        d[idx + 2] = col;
        d[idx + 3] = alpha;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function getDefs() {
    var svg = document.getElementById('lg-defs');
    if (svg) return svg.querySelector('defs');

    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'lg-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('color-interpolation-filters', 'sRGB');
    svg.style.cssText = 'position:absolute;overflow:hidden;width:0;height:0;pointer-events:none';

    var defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  function build(el, index) {
    var w = Math.round(el.offsetWidth);
    var h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8 || w * h > CONFIG.maxPixels) return false;

    var style = window.getComputedStyle(el);
    var radius = parseFloat(style.borderBottomLeftRadius) || 0;
    // 没有圆角就没有斜面可算，置换贴图会整片空掉
    radius = Math.max(6, Math.min(Math.floor(radius), Math.floor(Math.min(w, h) / 2)));
    var bezel = Math.max(1, Math.min(CONFIG.bezel, radius - 1, Math.floor(Math.min(w, h) / 2) - 1));

    var profile = refractionProfile(CONFIG.thickness, bezel, surface, CONFIG.ior, 128);
    var maxDisp = 0;
    for (var i = 0; i < profile.length; i += 1) {
      maxDisp = Math.max(maxDisp, Math.abs(profile[i]));
    }
    if (!maxDisp) return false;

    var filterId = 'lg-filter-' + index;
    var markup =
      '<filter id="' + filterId + '" x="0%" y="0%" width="100%" height="100%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="' + CONFIG.blur + '" result="blur"/>' +
      '<feImage href="' + displacementMap(w, h, radius, bezel, profile, maxDisp) + '"' +
      ' x="0" y="0" width="' + w + '" height="' + h + '" result="map"/>' +
      '<feDisplacementMap in="blur" in2="map" scale="' + (maxDisp * CONFIG.scaleRatio) + '"' +
      ' xChannelSelector="R" yChannelSelector="G" result="warped"/>' +
      '<feColorMatrix in="warped" type="saturate" values="' + CONFIG.specSaturation + '" result="tinted"/>' +
      '<feImage href="' + specularMap(w, h, radius, bezel * 2.5, CONFIG.angle) + '"' +
      ' x="0" y="0" width="' + w + '" height="' + h + '" result="spec"/>' +
      '<feComposite in="tinted" in2="spec" operator="in" result="specMasked"/>' +
      '<feComponentTransfer in="spec" result="specFaded">' +
      '<feFuncA type="linear" slope="' + CONFIG.specOpacity + '"/></feComponentTransfer>' +
      '<feBlend in="specMasked" in2="tinted" mode="normal" result="withSpec"/>' +
      '<feBlend in="specFaded" in2="withSpec" mode="normal"/>' +
      '</filter>';

    var defs = getDefs();
    var old = defs.querySelector('#' + filterId);
    if (old) old.remove();

    var holder = document.createElementNS(SVG_NS, 'g');
    holder.innerHTML = markup;
    var filter = holder.firstChild;
    defs.appendChild(filter);

    el.style.webkitBackdropFilter = 'url(#' + filterId + ')';
    el.style.backdropFilter = 'url(#' + filterId + ')';
    el.classList.add('lg-glass');
    return true;
  }

  function run() {
    if (!supportsGlass()) return;

    var elements = [];
    TARGETS.forEach(function (selector) {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
        if (elements.indexOf(el) === -1) elements.push(el);
      });
    });

    elements.forEach(function (el, index) {
      try {
        build(el, index);
      } catch (err) {
        el.classList.remove('lg-glass');
        el.style.backdropFilter = '';
      }
    });
  }

  var timer = null;
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 200);
  }

  function start() {
    run();

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });

    if (window.ResizeObserver) {
      var observer = new ResizeObserver(schedule);
      TARGETS.forEach(function (selector) {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
          observer.observe(el);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
