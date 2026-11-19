/* 岗位档案（结构化 markdown）生成器。
   被 app.js 与示例/导出页共用：window.buildArchiveMd(rec) */
(function () {
  const STAT = 13;
  const WK = 52;
  const DEV = { user: 0, jd: 0, web: 0.08, '': 0.15 };
  const DEV_LABEL = { user: '本人补充', jd: 'JD 原文', web: '网络参考', '': '估算' };

  // 与 app.js 同一套偏离度模型：σ = √(σ_证据² + σ_企业² + σ_行业²)，δ = min(σ, 0.35)
  const SIG_C = { big: 0.03, mid: 0.06, small: 0.12, unknown: 0.08 };
  const SIG_I = { stable: 0.03, normal: 0.06, volatile: 0.10 };
  const SIG_C_LABEL = { big: '上市/万人以上', mid: '中大厂', small: '早期公司或小团队', unknown: '体量未知' };
  const SIG_I_LABEL = { stable: '作息稳定行业', normal: '一般行业', volatile: '作息离散度大的行业' };

  function devOf(data, src) {
    const s1 = DEV[src] == null ? DEV[''] : DEV[src];
    if (!s1) return { dev: 0, expr: '', why: '有依据，不计偏离' };
    const srcObj = (data && data.source) || {};
    let txt = '';
    try { txt = JSON.stringify((srcObj.jdBlocks || []).concat([srcObj.job || {}])); } catch { txt = ''; }
    let c = 'unknown';
    if (/已上市|1万人以上|10000人以上|万人以上/.test(txt)) c = 'big';
    else if (/不需要融资|1000-9999人/.test(txt)) c = 'mid';
    else if (/天使轮|种子轮|未融资|0-20人|20-99人/.test(txt)) c = 'small';
    let ind = 'normal';
    if (/国企|事业单位|公务员|银行|教师|医院|学校|研究院|研究所/.test(txt)) ind = 'stable';
    else if (/互联网|电商|客服|销售|中介|房产|直播|运营|外卖|物流|餐饮|教培|游戏/.test(txt)) ind = 'volatile';
    const dev = Math.min(0.35, Math.sqrt(s1 * s1 + SIG_C[c] * SIG_C[c] + SIG_I[ind] * SIG_I[ind]));
    return {
      dev,
      expr: `√(证据 ${s1.toFixed(3)}² + 企业 ${SIG_C[c].toFixed(3)}² + 行业 ${SIG_I[ind].toFixed(3)}²)`,
      why: `${SIG_C_LABEL[c]}；${SIG_I_LABEL[ind]}`,
    };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtTime(ms) {
    const d = new Date(ms || Date.now());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtWan(v) {
    const r = Math.round((v / 10000) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  // 休息描述 → 年均休息日：规则与后端评分共用一份（public/score.js 的 restDaysOfBrief），
  // 前后端不会各算各的。模块万一没加载上就返回「读不出来」，下游按估算处理。
  function restDaysFromText(text) {
    return (typeof window !== 'undefined' && window.ScoreModel)
      ? window.ScoreModel.restDaysOfBrief(text)
      : null;
  }

  function dimOf(data, key) {
    return (((data && data.analysis) || {}).dimensions || []).find((d) => d.key === key) || {};
  }

  function sourceOf(data) {
    const a = (data && data.analysis) || {};
    if (a.restSource) return a.restSource;
    const brief = String(a.restBrief || '');
    if (restDaysFromText(brief) == null) return '';
    const txt = `${brief} ${dimOf(data, 'rest').analysis || ''}`;
    if (/公开信息|员工评价|职友集|牛客|看准|爱企查|知乎/.test(txt)) return 'web';
    return 'jd';
  }

  function annualPayOf(job, restDays) {
    const t = String((job && job.salary) || '').trim();
    if (!t) return null;
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return null;
    const mid = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
    const workDays = Math.max(1, 365 - restDays);
    if (/\/\s*天|元\s*\/?\s*天|日薪|每天/.test(t)) return mid * workDays;
    if (/\/\s*时|元\s*\/?\s*时|时薪|小时/.test(t)) return mid * 8 * workDays;
    let monthly;
    if (/万/.test(t)) {
      const yuan = mid * 10000;
      monthly = /年/.test(t) ? yuan / 12 : yuan;
    } else if (/[Kk千]/.test(t)) {
      monthly = mid * 1000;
    } else {
      monthly = mid >= 1000 ? mid : mid * 1000;
    }
    const months = Number((t.match(/(\d+)\s*薪/) || [])[1]) || 12;
    return monthly * months;
  }

  function hourlyOf(annual, rest, perDay) {
    if (annual == null) return null;
    const h = perDay > 0 ? perDay : 8;
    return Math.round(annual / (Math.max(1, 365 - rest) * h));
  }

  // 每日工作时长：与页面、图表同一份口径（public/score.js 的 dailyHoursOf）。
  // 模块没加载上时退回法定 8 小时，导出文件照样能生成。
  function hoursOf(data) {
    const a = (data && data.analysis) || {};
    const src = (data && data.source) || {};
    const meta = a.restMeta || {};
    const evidence = Array.isArray(meta.evidence) ? meta.evidence.join(' ') : '';
    const jd = `${src.jdText || ''} ${evidence}`;
    const note = `${a.restBrief || ''} ${a.restNote || ''} ${(a.restSearch && a.restSearch.summary) || ''}`;
    if (typeof window !== 'undefined' && window.ScoreModel && window.ScoreModel.dailyHoursOf) {
      return window.ScoreModel.dailyHoursOf({ jd, note }, meta);
    }
    return { lo: 7, mid: 8, hi: 9.5, source: 'industry', why: '按法定每日 8 小时' };
  }

  function buildArchiveMd(rec) {
    const data = (rec && rec.data) || {};
    const srcObj = data.source || {};
    const ana = data.analysis || {};
    const job = srcObj.job || rec.job || {};
    const L = [];

    L.push(`# 岗位档案 · ${job.title || '未命名岗位'}`, '');
    L.push(`- 链接：${rec.url || srcObj.url || '—'}`);
    L.push(`- 记录时间：${fmtTime(rec.savedAt)}`);
    L.push(`- 公司：${job.company || '—'}`);
    L.push(`- 城市：${job.city || '—'}`);
    L.push(`- 薪资：${job.salary || '未读到'}`);
    L.push(`- 经验 / 学历：${job.experience || '—'} / ${job.education || '—'}`);
    // 分母用原始分（这份工作本身值多少），不是满分 100：总分 = 原始分 × 匹配度 ÷ 极化，
    // 写成「总分 / 原始分」才看得出你的简历是在加分还是打折。
    L.push(`- 总分：**${ana.overall} / ${Number.isFinite(Number(ana.baseScore)) && ana.baseScore > 0 ? Math.round(ana.baseScore) : 100}（原始分）**`);
    L.push('');
    // ---- 点评：客观评价 + 针对用户的评价，写在同一段里 ----
    const stopEnd = (s) => { const t = String(s || '').trim(); return t && !/[。！？!?…]$/.test(t) ? t + '。' : t; };
    const note = ana.personalNote ? stopEnd(ana.conclusion) + ana.personalNote : (ana.conclusion || '');
    if (note) {
      L.push('## 点评', '');
      L.push(note, '');
    }

    // ---- 六维评分 ----
    L.push('## 六维评分', '');
    L.push('| 维度 | 分数 | 说明 |', '| --- | --- | --- |');
    for (const d of ana.dimensions || []) {
      // 匹配度的分析里带程序附的逐条扣分点（多行）——表格单元格里换成 <br>，不然表格会被撑断
      const cell = String(d.analysis || '').replace(/\|/g, '／').replace(/\n+/g, '<br>');
      L.push(`| ${d.name || d.key} | ${d.score == null ? '—' : d.score} | ${cell} |`);
    }
    L.push('');

    // ---- 薪资与工时（规则计算） ----
    // 优先用档案里存好的偏离度（分析生成时就算好并写进档案），没有才现算
    const stored = ana.restRange || null;
    const src = stored ? stored.source : sourceOf(data);
    const dv = devOf(data, src);
    const dev = stored ? stored.dev : dv.dev;
    // 没有存下来的休息天数时，用与评分、图表同一个函数折算（含「完全没写」的默认假设 104 天）
    const est = stored ? stored.est : (typeof window !== 'undefined' && window.ScoreModel
      ? window.ScoreModel.restDaysOf(ana.restBrief)
      : (365 - 2 * WK - STAT));
    const lo = Math.max(0, Math.round(est * (1 - dev)));
    const hours = hoursOf(data);
    const annual = annualPayOf(job, est);
    const hourly = hourlyOf(annual, est, hours.mid);
    // 下沿同时吃两个最差：休息更少（lo 天）× 每天更长（工时上沿）
    const hourlyLo = hourlyOf(annual, lo, hours.hi);
    const cd = (data.reference || {}).cityData || null;

    L.push('## 薪资与工时（纯规则计算，不经过模型）', '');
    L.push('| 指标 | 值 | 口径 |', '| --- | --- | --- |');
    L.push(`| 年薪 | ${annual == null ? '—' : `约 ${fmtWan(annual)} 万元/年`} | 月薪中位 × 薪数（13/14/16 薪按实际月数年化） |`);
    L.push(`| 年均休息日 | ${est} 天 | 来源：**${DEV_LABEL[src] || '估算'}**；单休 65 / 大小周 91 / 双休 117 |`);
    L.push(`| **休息偏离度** | **-${(dev * 100).toFixed(1)}%**（单边，只会更差） | ${dev > 0 ? `σ = ${dv.expr} = ${dev.toFixed(3)}，δ = min(σ, 0.35)；最差可能只有 ${lo} 天；${dv.why}` : dv.why} |`);
    L.push(`| 每日工作时长 | ${hours.lo === hours.hi ? `${hours.mid} 小时` : `${hours.lo} ~ ${hours.hi} 小时（取中 ${hours.mid}）`} | ${hours.why}；不同岗位的每日时长不同，时薪的高低因此不完全跟年薪一致 |`);
    L.push(`| 年工作时长 | ${365 - est} 天 × 每日 ${hours.mid} 小时 ≈ ${Math.round((365 - est) * hours.mid)} 小时 | （365 − 年均休息日）× 每日工作时长 |`);
    L.push(`| 时薪 | ${hourly == null ? '—' : `约 ${hourly} 元/小时`} | 年薪 ÷（年工作天数 × 每日工作时长） |`);
    if (hourlyLo != null && hourlyLo < hourly) {
      L.push(`| 时薪区间 | ${hourlyLo} ~ ${hourly} 元/小时 | 下沿＝最差休息天数 ${lo} 天 × 每日工时上沿 ${hours.hi} 小时 |`);
    }
    // 性价比换算成「全国 = 1.00」的倍数：基准取 public/score.js 那份常量，页面、长图、导出的 md 三处同一个锚
    const baseIdx = (typeof window !== 'undefined' && window.ScoreModel && window.ScoreModel.NATIONAL_VALUE_INDEX) || 0;
    // 人均住房建筑面积：也取公共口径那一份（一个人要摊的住房，不是一整套房）
    const sqmPerson = (typeof window !== 'undefined' && window.ScoreModel && window.ScoreModel.HOUSE_SQM_PER_PERSON) || 40;
    // 日常开销查不到不编估算值：这一条就只按住房算，并在下面标明（与其他城市不严格可比）
    if (cd && cd.housePrice && hourly != null && baseIdx > 0) {
      const dailyHouse = (cd.housePrice * sqmPerson) / (30 * 365);
      const dailyLife = cd.livingCost ? (cd.livingCost * 12) / 365 : 0;
      const denom = dailyHouse + dailyLife;
      const toMult = (v) => Math.round((v / denom / baseIdx) * 100) / 100;
      const mHi = toMult(hourly);
      const mLo = toMult(hourlyLo == null ? hourly : hourlyLo);
      L.push(`| 性价比倍数 | ${mHi.toFixed(2)}${dev > 0 ? `（区间 ${mLo.toFixed(2)} ~ ${mHi.toFixed(2)}）` : ''} | （时薪 ÷（${cd.livingCost ? `居住 ${dailyHouse.toFixed(1)} ＋ 生活 ${dailyLife.toFixed(1)} 元/天` : `只算住房 ${dailyHouse.toFixed(1)} 元/天——没查到该城市居民人均日常开销`}））÷ 全国基准 ${baseIdx.toFixed(2)}；全国 = 1.00、越大于 1 越扛得住；居住＝均价×${sqmPerson}㎡（人均住房面积）÷(30×365) |`);
    }
    L.push('');

    // ---- 城市基础数据 ----
    if (cd) {
      L.push('## 城市基础数据（联网登记，随档案保存）', '');
      L.push('| 项目 | 值 | 来源 |', '| --- | --- | --- |');
      L.push(`| ${cd.city || job.city} 住宅均价 | ${cd.housePrice == null ? '未查到' : `${cd.housePrice} 元/㎡`} | ${(cd.sources && cd.sources.housePrice) || '—'} |`);
      L.push(`| ${cd.city || job.city} 月平均工资（城镇非私营口径） | ${cd.avgWage == null ? '未查到' : `${cd.avgWage} 元/月`} | ${(cd.sources && cd.sources.avgWage) || '—'} |`);
      L.push(`| ${cd.city || job.city} 居民人均日常开销 | ${cd.livingCost == null ? '未查到' : `${cd.livingCost} 元/月`} | ${(cd.sources && cd.sources.livingCost) || '—'}（统计局的居民人均消费支出扣掉居住类 23% 后的值） |`);
      if (cd.national && cd.national.annualWage) {
        L.push(`| 全国平均年薪 | ${cd.national.annualWage} 元/年 | ${cd.national.source || '—'}${cd.national.note ? `（${cd.national.note}）` : ''} |`);
      }
      if (cd.note) L.push(`| 备注 | ${cd.note} | |`);
      L.push('');
    }

    // ---- 维度分析 ----
    L.push('## 维度分析', '');
    for (const d of ana.dimensions || []) {
      L.push(`### ${d.name || d.key} · ${d.score == null ? '—' : `${d.score} 分`}`, '');
      L.push(String(d.analysis || '').trim(), '');
    }

    // ---- 风险标记 ----
    const marks = ana.jdMarks || [];
    if (marks.length) {
      L.push('## JD 风险标记', '');
      for (const m of marks) {
        L.push(`- **[${m.level === 'high' ? '高危' : '不利'}] ${m.cat || '其他'}** 「${m.text}」：${m.why || ''}`);
        if (m.cite) L.push(`  - 引用：${m.cite.org}，${m.cite.doc}“${m.cite.quote}”`);
      }
      L.push('');
    }

    // ---- 结构化 JD ----
    const blocks = srcObj.jdBlocks || [];
    if (blocks.length) {
      L.push('## JD 结构化原文', '');
      for (const b of blocks) {
        L.push(`### ${b.title || '正文'}`, '');
        for (const item of b.items || []) L.push(`- ${item}`);
        L.push('');
      }
    }

    L.push('---', '');
    L.push('> 数据来源标注：休息、每日工时与城市数据可能是估算或公开信息，已在对应位置标明；薪资与工时（含每日工时估计）、时薪、性价比均为纯规则计算。');
    return L.join('\n');
  }

  window.buildArchiveMd = buildArchiveMd;
})();
