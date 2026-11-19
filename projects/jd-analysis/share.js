/* JD 分析长图：只画「看得下去」的部分——岗位信息、总分、点评、六维雷达、当前那张数据分析图。
   图上的两张图直接复用页面上真实的 SVG 节点：先把每个元素的计算样式写成行内样式，
   再序列化成 SVG 图片，画进 canvas，这样图上不会有 CSS 类样式丢失的问题。

   window.buildShareImage(payload) -> Promise<Blob>
   payload = { job, overall, overallMax, note, meta,
               chartTitle, chartEmpty, chartSvg, radarSvg } */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const W = 750;                       // 逻辑宽度
  const PAD = 48;                      // 左右留白
  const CW = W - PAD * 2;              // 正文可用宽度
  const SCALE = 2;                     // 导出像素密度
  const INK = '#191919';
  const INK2 = '#6f6e69';
  const INK3 = '#9b9a97';
  const LINE = '#e9e9e7';
  const FAMILY = 'ui-sans-serif, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  // 栅格化时要从计算样式里搬过来的属性（transform 不搬：图上的 transform 都是属性，克隆时已带走）
  const COPY_PROPS = [
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray',
    'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family',
    'font-weight', 'font-style', 'text-anchor', 'letter-spacing',
  ];

  function inlineStyles(src, dst) {
    const cs = window.getComputedStyle(src);
    let css = '';
    for (const p of COPY_PROPS) css += `${p}:${cs.getPropertyValue(p)};`;
    dst.setAttribute('style', css);
    const sKids = src.children;
    const dKids = dst.children;
    for (let i = 0; i < sKids.length && i < dKids.length; i++) inlineStyles(sKids[i], dKids[i]);
  }

  function svgToImage(svg) {
    if (!svg) return Promise.resolve(null);
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = (vb && vb.width) || svg.clientWidth || 720;
    const h = (vb && vb.height) || svg.clientHeight || 500;
    const clone = svg.cloneNode(true);
    clone.removeAttribute('class');
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    // 克隆体在页面之外没有样式表，逐元素把当前生效的样式写死在行内
    inlineStyles(svg, clone);
    clone.setAttribute('style', `opacity:1;${clone.getAttribute('style') || ''}`);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ img, w, h });
      img.onerror = () => reject(new Error('图表渲染失败'));
      img.src = url;
    });
  }

  // 图名、口径说明里带 markdown 的粗体标记，图上没法渲染，直接去掉
  const plainText = (s) => String(s == null ? '' : s).replace(/\*\*/g, '').replace(/`/g, '');

  // 换行：中文逐字断，英文与数字整段不拆
  function wrapText(ctx, text, maxW) {
    const out = [];
    for (const para of plainText(text).split('\n')) {
      const tokens = para.match(/[A-Za-z0-9@._%+\-/'’]+|\s+|[^\s]/g) || [];
      let line = '';
      for (const tk of tokens) {
        const test = line + tk;
        if (line && ctx.measureText(test).width > maxW) {
          out.push(line.replace(/\s+$/, ''));
          line = /^\s+$/.test(tk) ? '' : tk;
        } else {
          line = test;
        }
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out.length ? out : [''];
  }

  function buildOps(payload, images) {
    const probe = document.createElement('canvas').getContext('2d');
    const ops = [];
    const fontOf = (size, weight) => `${weight || 400} ${size}px ${FAMILY}`;

    const add = (h, draw) => ops.push({ h, draw });

    // 一段文字：自动换行，可指定颜色 / 字号 / 粗细 / 行高 / 上间距
    const para = (str, o = {}) => {
      if (str == null || str === '') return;
      const size = o.size || 13;
      const lh = o.lh || Math.round(size * 1.8);
      probe.font = fontOf(size, o.weight);
      const lines = wrapText(probe, str, o.width || CW);
      add((o.mt || 0) + lines.length * lh + (o.mb || 0), (y, ctx) => {
        ctx.font = fontOf(size, o.weight);
        ctx.fillStyle = o.color || INK2;
        let yy = y + (o.mt || 0) + lh * 0.78;
        for (const ln of lines) {
          ctx.fillText(ln, PAD, yy);
          yy += lh;
        }
      });
    };

    const sectionTitle = (str) => {
      add(56, (y, ctx) => {
        ctx.fillStyle = INK;
        ctx.font = fontOf(14.5, 600);
        ctx.fillText(str, PAD, y + 40);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, y + 54.5);
        ctx.lineTo(W - PAD, y + 54.5);
        ctx.stroke();
      });
    };

    // 图片：按可用宽度等比缩放，居中
    const picture = (img, maxW, o = {}) => {
      if (!img) return;
      const w = Math.min(maxW, CW);
      const h = (img.h / img.w) * w;
      add(h + (o.mt || 0) + (o.mb || 0), (y, ctx) => {
        ctx.drawImage(img.img, (W - w) / 2, y + (o.mt || 0), w, h);
      });
    };

    const job = payload.job || {};

    // ---- 头部 ----
    add(74, (y, ctx) => {
      ctx.fillStyle = INK3;
      ctx.font = fontOf(12.5, 400);
      ctx.fillText('AI 简历分析 · 岗位分析报告', PAD, y + 16);
      ctx.fillStyle = INK;
      ctx.font = fontOf(26, 600);
      ctx.fillText(job.title || '未命名岗位', PAD, y + 56);
    });
    para(payload.meta || '', { size: 13, color: INK2, mt: 2, mb: 4 });

    // 总分
    add(88, (y, ctx) => {
      ctx.fillStyle = INK3;
      ctx.font = fontOf(12.5, 400);
      ctx.fillText('总分', PAD, y + 16);
      ctx.fillStyle = INK;
      ctx.font = fontOf(42, 600);
      const score = String(payload.overall == null ? '—' : payload.overall);
      ctx.fillText(score, PAD, y + 66);
      const sw = ctx.measureText(score).width;
      ctx.fillStyle = INK3;
      ctx.font = fontOf(14, 400);
      ctx.fillText(`/ ${payload.overallMax || 100}`, PAD + sw + 12, y + 66);
    });

    // 点评：客观结论 + 对你的结论，已经拼成一段
    para(payload.note || '', { size: 15.5, color: INK, lh: 30, mt: 14, mb: 6 });

    // ---- 六维雷达（图本身带维度名与分数，不再另列文字） ----
    if (images.radar) {
      sectionTitle('六维评分');
      picture(images.radar, 430, { mt: 10, mb: 6 });
    }

    // ---- 职位对比图（标题照页面：大标题「职位对比」+ 图名；图下只放一行口径注释） ----
    if (images.chart || payload.chartEmpty) {
      sectionTitle('职位对比');
      if (payload.chartTitle) para(payload.chartTitle, { size: 14, color: INK, weight: 600, lh: 30, mt: 6, mb: 2 });
      if (images.chart) {
        picture(images.chart, CW, { mt: 10, mb: 4 });
      } else {
        para('样本还太少，这张图暂时画不出来（多分析几个岗位后再看）。', { size: 13, color: INK2, mt: 16, mb: 8 });
      }
      if (payload.chartNote) para(payload.chartNote, { size: 12, color: INK3, lh: 21, mt: 6, mb: 4 });
    }

    // ---- 页脚：一行免责 + 时间，够用就好 ----
    add(40, (y, ctx) => {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 22.5);
      ctx.lineTo(W - PAD, y + 22.5);
      ctx.stroke();
    });
    para(`数据由 JD 描述推测，不代表岗位实际情况，仅供参考 · 生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      { size: 12, color: INK3, lh: 22, mb: 4 });

    return ops;
  }

  async function render(payload) {
    const [radar, chart] = await Promise.all([svgToImage(payload.radarSvg), svgToImage(payload.chartSvg)]);
    const images = { radar, chart };

    // 第一遍：只量高度（draw 为空跑时就当测量）
    const ops = buildOps(payload, images);
    const height = Math.round(ops.reduce((a, o) => a + o.h, 0) + PAD);

    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, height);

    let y = PAD;
    for (const op of ops) {
      op.draw(y, ctx);
      y += op.h;
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('长图导出失败'))), 'image/png');
    });
  }

  window.buildShareImage = render;
})();
