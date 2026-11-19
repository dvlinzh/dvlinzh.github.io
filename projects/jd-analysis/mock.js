/* 静态演示的请求层 —— 这个演示目录里唯一新增的代码。
   原工具的后端（Express）负责：读 JD 页 / 跑模型 / 六维打分 / 查工资表 / OCR / 存档案。
   演示版不连任何后端：这些请求在这里就地应答，数据全部取自项目自己的样本（见 mock-data.js）。
   界面本身（index.html / styles.css / app.js / score.js / archive.js / share.js / track.js）
   与原项目逐字一致，只多了这一层传输。 */
(function () {
  'use strict';

  const M = window.__JD_MOCK__ || {};
  const realFetch = window.fetch ? window.fetch.bind(window) : null;

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const json = (data, status) => new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const model = () => window.ScoreModel;

  /* ---------- 报告：示例数据就是项目首页「产品演示」用的那一份 ---------- */
  function report(url) {
    const r = clone(M.report);
    if (url) r.source.url = url;
    return r;
  }

  /* ---------- 六维重算：分数与总分都走前端这一份口径（score.js），与后端同一份实现 ---------- */
  function recompute(dimensions) {
    const s = model().scoresOf(dimensions);
    return { overall: s.overall, baseScore: s.baseScore, matchMultiplier: s.matchMultiplier };
  }
  function dimsOf(prev) {
    const d = (((prev || {}).analysis || {}).dimensions) || (M.report.analysis || {}).dimensions || [];
    return clone(d);
  }

  /* ---------- 各接口的应答 ---------- */
  function apiAnswer(path, body) {
    switch (path) {
      /* 分析：粘贴链接（扩展读到的 JD 原文）与上传截图（OCR）两条通道走同一个出口 */
      case '/api/analyze-text':
      case '/api/analyze-shots':
        return json(report(body && body.url ? body.url : 'demo://ai-product-manager'));

      /* 补录薪资：换掉薪资维度，按同一份口径重算总分 */
      case '/api/rescore': {
        const dims = dimsOf(body && body.prev);
        const hint = (body && body.salaryHint) || '';
        const pay = (M.report.analysis.dimensions || []).find((d) => d.key === 'pay') || {};
        const next = dims.map((d) => (d.key === 'pay'
          ? { ...d, score: pay.score, analysis: `演示数据：已按补录的「${hint}」重算薪资维度，结论与示例报告一致。` }
          : d));
        const s = recompute(next);
        return json({
          ok: true,
          dimension: next.find((d) => d.key === 'pay'),
          growth: { dimension: next.find((d) => d.key === 'growth') },
          overall: s.overall,
          baseScore: s.baseScore,
          matchMultiplier: s.matchMultiplier,
          payCalc: M.report.analysis.payCalc,
          conclusion: M.report.analysis.conclusion,
        });
      }

      /* 补录休息：把「双休 / 大小周 / 单休」折成年均休息日，再查梯度表定分 */
      case '/api/rerest': {
        const dims = dimsOf(body && body.prev);
        const brief = (body && (body.restHint || body.webSummary)) || '';
        const SM = model();
        const days = SM.restDaysOfBrief(brief);
        const score = SM.restScoreOfDays(days == null ? SM.REST_UNCLEAR_DAYS : days, {});
        const next = dims.map((d) => (d.key === 'rest'
          ? { ...d, score, analysis: `演示数据：按「${brief}」折算年均休息 ${days == null ? SM.REST_UNCLEAR_DAYS : days} 天，落 ${score} 分档。` }
          : d));
        const s = recompute(next);
        return json({
          ok: true,
          dimension: next.find((d) => d.key === 'rest'),
          overall: s.overall,
          baseScore: s.baseScore,
          matchMultiplier: s.matchMultiplier,
          restBrief: brief,
          restNote: '演示数据：手动补充',
          drops: [],
          conclusion: M.report.analysis.conclusion,
        });
      }

      /* 联网查休息制度 / 采薪资分布 / 查城市数据：演示版不联网，按「查不到」如实回 */
      case '/api/rest-lookup':
        return json({ ok: true, found: false, summary: '', source: '' });
      case '/api/growth-collect':
        return json({ ok: true, found: false });
      case '/api/growth-rescore':
        return json({ ok: true, found: false });

      /* 城市数据：本地没有联网采集，用项目自带的官方社平工资兜底 */
      case '/api/region-data': {
        const city = String((body && body.city) || '').replace(/市$/, '').trim();
        const w = ((M.wages || {}).cities || {})[city];
        const SM = model();
        return json({
          ok: true,
          city,
          version: 7,
          housePrice: null,
          avgWage: w ? Math.round(w.nonpriv * 12) : null,
          livingCost: null,
          weeklyHours: 40,
          national: { annualWage: SM.NATIONAL_WAGE_NONPRIVATE, housePrice: null },
          sources: { avgWage: w ? `官方统计口径（${city} 城镇非私营单位在岗职工月均 ${w.nonpriv} 元 × 12）` : '' },
          note: '演示数据：未联网采集房价与生活成本',
        });
      }

      /* 简历：解析与结构化都返回项目自带的示例简历 */
      case '/api/resume-parse':
        return json({ ok: true, text: M.resumeMd || '' });
      case '/api/resume-structure':
        return json({ ok: true, md: M.resumeMd || '' });

      /* 换了简历重算匹配度：示例数据里匹配度不变，总分照口径重算 */
      case '/api/reresume': {
        const dims = dimsOf(body && body.prev);
        const match = (M.report.analysis.dimensions || []).find((d) => d.key === 'match') || {};
        const next = dims.map((d) => (d.key === 'match' ? { ...d, score: match.score } : d));
        const s = recompute(next);
        return json({
          ok: true,
          dimension: next.find((d) => d.key === 'match'),
          overall: s.overall,
          baseScore: s.baseScore,
          matchMultiplier: s.matchMultiplier,
          conclusion: M.report.analysis.conclusion,
        });
      }

      /* 档案镜像 / 使用记录 / 遗忘：演示版没有服务端，安静收下即可 */
      case '/api/archive/sync':
        return json({ ok: true, count: (body && body.records && body.records.length) || 0 });
      case '/api/usage':
        return json({ ok: true });
      case '/api/forget':
        return json({ ok: true });

      /* 访问口令：本机自用，不需要 */
      case '/api/auth-state':
        return json({ ok: true, needToken: false });
      case '/api/login':
        return json({ ok: true });

      /* 模型接入：演示版不连模型，只把面板画出来 */
      case '/api/model-config':
        return json(modelConfig());
      case '/api/model-config/use':
        return json({ ok: true, ...modelConfig(), note: '演示版：模型配置不会真的保存' });
      case '/api/model-config/forget':
        return json({ ok: true, ...modelConfig(), note: '演示版：模型配置不会真的保存', stillActive: true });
      case '/api/model-test':
        return json({ ok: true, ms: 412, model: 'deepseek-chat', reply: 'pong（演示数据，没有真的调用模型）' });

      default:
        return json({ ok: false, error: `演示版没有这个接口：${path}` }, 404);
    }
  }

  /* 模型面板要的那一份（字段与后端 modelcfg.describe() 同形） */
  function modelConfig() {
    const active = {
      provider: 'deepseek',
      providerLabel: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyMasked: 'sk-demo…0000',
      maxTokens: 32000,
      temperature: 0.3,
      thinking: 'auto',
      thinkingNow: false,
    };
    return {
      ok: true,
      active,
      saved: [{
        id: 'demo-deepseek',
        label: 'DeepSeek · deepseek-chat（演示）',
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        model: 'deepseek-chat',
        apiKeyMasked: 'sk-demo…0000',
        thinking: 'auto',
        isActive: true,
      }],
      source: { provider: 'default', endpoint: 'default', model: 'default', apiKey: 'none' },
      presets: {
        deepseek: {
          label: 'DeepSeek',
          endpoint: active.endpoint,
          model: 'deepseek-chat',
          models: [
            { id: 'deepseek-flash', label: 'deepseek-flash（V4.1-Flash）', context: '1M', maxOutput: 384000, note: '思考模式默认开；支持 JSON 输出、工具调用、图片理解；价格最低' },
            { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', context: '1M', maxOutput: 384000, note: '更强也更贵；不支持图片理解' },
          ],
        },
        mimo: {
          label: '小米 MiMo',
          endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
          model: 'mimo-v2.6-flash',
          models: [
            { id: 'mimo-v2.6-flash', label: 'mimo-v2.6-flash', maxOutput: 131072, note: '13 万输出上限；思考默认开' },
            { id: 'mimo-v2.6-pro', label: 'mimo-v2.6-pro', maxOutput: 131072, note: '同上；更强' },
          ],
        },
        custom: { label: '自定义（OpenAI 兼容）', endpoint: '', model: '', models: [] },
      },
      env: { hasApiKey: false, apiKeyMasked: '' },
      store: { path: 'config.local.json', exists: false },
      fallback: null,
    };
  }

  /* ---------- 拦下前端的请求 ---------- */
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    const path = url.split('?')[0];

    if (path.indexOf('/api/') === 0) {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { /* 非 JSON 请求体忽略 */ }
      return Promise.resolve(apiAnswer(path, body));
    }
    /* 参照档案与薪资分布散点：原项目放在站点根目录，这里就地给数据 */
    if (path === '/seed-history.json') return Promise.resolve(json(M.seedHistory || []));
    if (path.indexOf('growth-scatter.json') >= 0) return Promise.resolve(json(M.growthScatter || {}));

    return realFetch ? realFetch(input, init) : Promise.reject(new Error('演示版不发起网络请求'));
  };

  /* 使用记录是 beacon 发的（不走 fetch），演示版直接吞掉，别往站点根目录打请求 */
  if (navigator.sendBeacon) {
    navigator.sendBeacon = function () { return true; };
  }

  /* ---------- 假装浏览器扩展装好了 ----------
     原项目靠扩展在后台标签页读 JD 正文。演示版用项目自带的示例 JD 顶替：
     收到 AI_JD_PING 就报「已就绪」，收到 AI_JD_FETCH 就把示例 JD 原文回给它。 */
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'AI_JD_PING') {
      window.postMessage({ type: 'AI_JD_EXTENSION_READY' }, '*');
    } else if (d.type === 'AI_JD_FETCH') {
      window.postMessage({
        type: 'AI_JD_RESULT',
        reqId: d.reqId,
        ok: true,
        text: M.jdText || '',
      }, '*');
    }
  });
})();
