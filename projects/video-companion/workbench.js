/* =============================================================================
 * workbench.js — 运营工作台视图层
 * 所有状态读写走 DemoStore；每个主操作都有前置检查 + 下一环 + 审计。
 * 静态演示 · mock 数据。确定性，可复位。
 * ========================================================================== */
(function () {
  'use strict';
  var S = DemoStore.state;
  var A = DemoStore.actions;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── 视图注册表 ── */
  var VIEWS = [
    { id: 'overview',     group: '概览',       name: '总览',                 icon: '◫' },
    { id: 'manuscript',   group: '内容生产',   name: '稿件与解析任务',       icon: '▤' },
    { id: 'script',       group: '内容生产',   name: '剧本资产与质量复核',   icon: '✎' },
    { id: 'policy',       group: '策略与资产', name: 'Agent 策略版本',       icon: '⚙' },
    { id: 'primitive',    group: '策略与资产', name: '行为原语与基础表情',   icon: '◍' },
    { id: 'activity',     group: '策略与资产', name: '活动包',               icon: '✦' },
    { id: 'member',       group: '策略与资产', name: '会员权益与纪念',       icon: '♛' },
    { id: 'lab',          group: '预览与发布', name: '场景预览实验室',       icon: '▣' },
    { id: 'release',      group: '预览与发布', name: 'Release 版本与发布',   icon: '⧉' },
    { id: 'experiment',   group: '预览与发布', name: '灰度实验',             icon: '◐' },
    { id: 'eval',         group: '质量评测',   name: 'Eval 运行与版本对比',  icon: '◈' },
    { id: 'replay',       group: '质量评测',   name: '会话回放与标注',       icon: '▷' },
    { id: 'badcase',      group: '质量评测',   name: 'Badcase 与修复回归',   icon: '⚑' },
    { id: 'privacy',      group: '隐私与合规', name: '资格预检与未成年策略', icon: '⛨' },
    { id: 'deletion',     group: '隐私与合规', name: '数据权利与删除任务',   icon: '⌫' },
    { id: 'compliance',   group: '隐私与合规', name: '合规检查与审计日志',   icon: '✓' },
    { id: 'health',       group: '运行与成本', name: '服务健康与降级',       icon: '♥' },
    { id: 'metrics',      group: '运行与成本', name: '质量 / 实验指标',      icon: '◔' },
    { id: 'cost',         group: '运行与成本', name: '成本账本与假设测算',   icon: '¥' }
  ];
  var VIEW = {}; VIEWS.forEach(function (v) { VIEW[v.id] = v; });
  // 元数据与渲染函数分离：后面 VIEW[id] 会被渲染函数覆盖，name 必须从 VIEWS 查
  function viewName(id) { var m = VIEWS.filter(function (v) { return v.id === id; })[0]; return m ? m.name : '工作台'; }

  /* ── 路由（hash 深链，刷新保留） ── */
  var cur = 'overview';
  var params = {};
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var id = VIEW[parts[0]] ? parts[0] : 'overview';
    params = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return id;
  }
  function go(id, p) {
    if (!VIEW[id]) return;
    var q = '';
    if (p) q = '?' + Object.keys(p).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&');
    location.hash = '/' + id + q;
    if (parseHash() === id && Object.keys(p || {}).length === 0) render();
  }
  window.go = go;

  /* ── 导航渲染 ── */
  function renderNav() {
    var d = DemoStore.derive();
    var badgeMap = { overview: d.todos.length, badcase: d.badcaseP0, deletion: S.deletionJobs.filter(function (j) { return j.status === 'failed'; }).length };
    var html = '', lastGroup = '';
    VIEWS.forEach(function (v) {
      if (v.group !== lastGroup) { html += '<div class="group">' + v.group + '</div>'; lastGroup = v.group; }
      var b = badgeMap[v.id] ? '<span class="badge">' + badgeMap[v.id] + '</span>' : '';
      html += '<a data-v="' + v.id + '" class="' + (v.id === cur ? 'active' : '') + '"><span class="ico">' + v.icon + '</span>' + v.name + b + '</a>';
    });
    $('[data-nav]').innerHTML = html;
  }

  /* ── 角色 ── */
  function initRole() {
    var sel = $('#roleSel');
    sel.innerHTML = S.roles.map(function (r) { return '<option value="' + r.id + '">' + r.name + '</option>'; }).join('');
    sel.value = S.currentRole;
    sel.onchange = function () { A.setRole(sel.value); toast('已切换角色：' + DemoStore.roleName(sel.value) + ' · 权限已生效'); };
  }
  function gate(action, fn) {
    if (!DemoStore.can(S.currentRole, action)) {
      var need = { 'content.arbitrate': '内容运营', 'content.publishScript': '内容运营', 'exp.editPolicy': '体验运营', 'exp.editAsset': '体验运营', 'exp.editActivity': '体验运营', 'eval.annotate': '评测员', 'eval.regression': '评测员', 'eval.fixTask': '评测员', 'release.approve': '合规员', 'release.gray': '发布负责人', 'release.rollback': '发布负责人', 'privacy.handle': '合规员' }[action] || '对应角色';
      toast('权限不足：当前角色（' + DemoStore.roleName(S.currentRole) + '）不能执行此操作，需 ' + need, 'err');
      return;
    }
    fn();
  }
  window.gate = gate;

  /* ── toast ── */
  var tt;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'on' + (kind ? ' ' + kind : '');
    clearTimeout(tt); tt = setTimeout(function () { t.className = ''; }, 2800);
  }
  window.toast = toast;
  function done(r, okMsg) {
    if (!r || r.ok === false) { toast((r && r.reason) || '操作未满足前置条件', 'err'); return false; }
    toast(okMsg || '操作成功 · 状态已联动', 'ok'); return true;
  }
  window.done = done;
  function resetDemo() { DemoStore.reset(); toast('已复位到固定种子数据', 'ok'); }
  window.resetDemo = resetDemo;

  /* ── 通用小组件 ── */
  function stat(n, l, color, sub) {
    return '<div class="stat"><div class="n"' + (color ? ' style="color:var(--' + color + ')"' : '') + '>' + n + '</div><div class="l">' + l + '</div>' + (sub ? '<div class="sub2">' + sub + '</div>' : '') + '</div>';
  }
  function tagStatus(s) {
    var map = { draft: ['草稿', ''], checking: ['质检中', 'b'], needs_review: ['待复核', 'a'], approved: ['已批准', 'g'], published: ['已发布', 'g'], archived: ['已归档', ''], validating: ['校验中', 'a'], blocked: ['阻塞', 'r'], ready: ['就绪', 'b'], gray: ['灰度中', 'pp'], active: ['线上', 'g'], paused: ['已暂停', 'a'], rolled_back: ['已回滚', 'r'], triaged: ['已归因', 'b'], fixing: ['修复中', 'a'], regression: ['回归中', 'pp'], gray_verification: ['灰度验证', 'pp'], closed: ['已关闭', 'g'], reopened: ['已重开', 'r'], pending: ['待执行', ''], running: ['进行中', 'b'], completed: ['已完成', 'g'], failed: ['失败', 'r'], retrying: ['重试中', 'a'], new: ['新建', 'r'], done: ['完成', 'g'], queued: ['排队中', 'a'] };
    var m = map[s] || [s, '']; return '<span class="tag ' + m[1] + '">' + m[0] + '</span>';
  }
  function auditTable(list, limit) {
    var a = (list || S.auditLog).slice().reverse().slice(0, limit || 12);
    if (!a.length) return '<div class="empty">暂无审计记录</div>';
    return '<div class="audit">' + a.map(function (x) {
      return '<div class="ai"><span class="at">' + (x.at || '').replace('T', ' ').slice(0, 16) + '</span><span class="aa">' + (x.action || '') + '</span><span class="ao">' + (x.object || '') + '</span>' + (x.before !== undefined ? '<span class="ach">' + (x.before || '—') + ' → ' + (x.after || '—') + '</span>' : '') + '<span class="ao">' + DemoStore.roleName(x.role) + '</span></div>';
    }).join('') + '</div>';
  }
  function linkBtn(v, p, text, cls) { return '<button class="btn ' + (cls || 'sm ghost') + '" onclick="go(\'' + v + '\',' + JSON.stringify(p || {}) + ')">' + text + ' →</button>'; }

  /* ═══════════════════════ 视图：总览 ═══════════════════════ */
  VIEW.overview = function () {
    var d = DemoStore.derive();
    var rel = DemoStore.activeRelease();
    var exp = DemoStore.find('experiments', 'exp-gray');
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--pink)"><div class="headrow"><div><h2>业务链总览 <span class="tag b">真实对象驱动</span></h2><div class="desc" style="margin:0">本页不堆无来源数字——每张卡都可点击进入带筛选的下游页面。当前演示目标：走通「资产 → Release → 灰度 → Trace → Eval/隐私/成本 → 修复版本」一条链。</div></div></div></div>';
    h += '<div class="grid4" style="margin-bottom:16px">'
      + stat(d.videoTotal + ' / ' + d.videoPublished, '稿件总数 / 已发布', '', '解析中 ' + d.videoProcessing)
      + stat(d.assetTotal, '基础表情资产', 'g', '来自统一资产表 ap-base-v3')
      + stat(d.traceCount, '版本化 Trace', 'b', (d.allTracesVersioned ? '全部含 ReleaseID' : '存在缺版本号'))
      + stat('¥' + d.costTotal.toFixed(3), '账本累计成本', 'pp', 'mock 记录，非实测');
    h += '</div>';

    h += '<div class="grid2">';
    // 当前生效 Release
    h += '<div class="card"><h2>当前生效 Release</h2>';
    h += '<div class="kv"><span class="k">版本</span><span class="v"><b>' + (rel ? rel.name : '—') + '</b> ' + (rel ? tagStatus(rel.status) : '') + '</span></div>';
    if (rel) {
      var sn = rel.snapshot;
      h += '<div class="kv"><span class="k">内容快照</span><span class="v">' + sn.script + '</span></div>';
      h += '<div class="kv"><span class="k">策略版本</span><span class="v">' + sn.policy + '</span></div>';
      h += '<div class="kv"><span class="k">资产 / 原语</span><span class="v">' + sn.asset + ' · ' + sn.primitive + '</span></div>';
      h += '<div class="kv"><span class="k">灰度 / 合规</span><span class="v">' + (exp ? exp.cohort.ratio + '% · ' + tagStatus(exp.status) : '—') + ' · ' + tagStatus(sn.compliance === 'approved' ? 'approved' : 'draft') + '</span></div>';
    }
    h += '<div style="margin-top:12px">' + linkBtn('release', {}, '查看版本与发布') + linkBtn('experiment', {}, '灰度实验') + '</div></div>';

    // 待处理事项
    h += '<div class="card"><h2>待处理事项 <span class="tag a">' + d.todos.length + '</span></h2>';
    if (!d.todos.length) h += '<div class="empty">当前无待办</div>';
    else {
      h += '<div class="tw"><table><thead><tr><th>事项</th><th>来源</th><th>下一环</th></tr></thead><tbody>';
      d.todos.forEach(function (t) {
        var tname = VIEWS.some(function (v) { return v.id === t.link; }) ? viewName(t.link) : '相关页面';
        h += '<tr class="clickable" onclick="go(\'' + t.link + '\',' + JSON.stringify({ id: t.id }) + ')"><td><span class="dot-s" style="background:var(--' + (t.sev === 'pink' ? 'red' : t.sev === 'blue' ? 'blue' : 'amber') + ')"></span>' + t.label + '</td><td style="color:var(--sub)">' + t.sub + '</td><td>' + tname + ' →</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    h += '<div class="grid2">';
    // 链路健康
    h += '<div class="card"><h2>链路健康快照</h2>'
      + '<div class="metric"><span class="mn">解析任务完成</span><span class="bar"><i style="width:' + Math.round(S.parseJobs.filter(function(j){return j.status==='done';}).length / S.parseJobs.length * 100) + '%"></i></span><span class="mv">' + S.parseJobs.filter(function(j){return j.status==='done';}).length + '/' + S.parseJobs.length + '</span></div>'
      + '<div class="metric"><span class="mn">回归通过率</span><span class="bar"><i style="width:100%"></i></span><span class="mv">100%</span></div>'
      + '<div class="metric"><span class="mn">接住率（显式请求）</span><span class="bar"><i style="width:' + (d.eval.catchRate * 100) + '%"></i></span><span class="mv">' + (d.eval.catchRate * 100).toFixed(0) + '%</span></div>'
      + '<div class="metric"><span class="mn">剧透违规率</span><span class="bar"><i style="width:' + (d.eval.spoilerViolation * 1000) + '%;background:var(--amber)"></i></span><span class="mv">' + (d.eval.spoilerViolation * 100).toFixed(1) + '%</span></div>'
      + '<div class="metric"><span class="mn">线上降级/回滚</span><span class="bar"><i style="width:' + (S.releases.filter(function(r){return r.status==='rolled_back';}).length * 15) + '%;background:var(--pink)"></i></span><span class="mv">' + S.releases.filter(function(r){return r.status==='rolled_back';}).length + ' 次</span></div>'
      + '<div class="note" style="margin-top:10px">接住率只在用户明确发起互动的机会集上计算；纯神态不回应不算失败，避免反向激励多说话。</div>'
      + '</div>';
    // 五条演示剧本入口
    h += '<div class="card"><h2>五条完整演示剧本</h2><div class="desc">每条都可重复执行；重置后结果一致。</div>';
    var books = [
      ['A', '从剧本修复到 C 端生效', 'manuscript', '低置信事实 → 仲裁 → 发布 → Release → 灰度 → C 端'],
      ['B', '剧透 badcase 完整回流', 'badcase', 'Trace → 归因 → 工单 → 修复 → 回归 → 灰度验证 → 关闭'],
      ['C', '活动包完整生命周期', 'activity', '创建 → 校验拦截 → 审核 → 灰度 → 到期回退'],
      ['D', '隐私、遗忘与未成年', 'deletion', '查询 → 删除 → 索引失败重试 → C 端生效 → 未成年优先'],
      ['E', '灰度护栏、成本与回滚', 'experiment', '灰度 → 护栏越线暂停 → 回滚 → 成本对比']
    ];
    books.forEach(function (b) {
      h += '<div class="tl-item clickable" onclick="go(\'' + b[2] + '\',{})"><div class="th"><b>剧本 ' + b[0] + ' · ' + b[1] + '</b><span class="tag b">走通 →</span></div><div class="meta">' + b[3] + '</div></div>';
    });
    h += '</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：稿件与解析任务 ═══════════════════════ */
  VIEW.manuscript = function (p) {
    var d = DemoStore.derive();
    var sel = p.id || 'pj-libin';
    var job = DemoStore.find('parseJobs', sel) || S.parseJobs[0];
    var h = '';
    h += '<div class="card"><h2>稿件与解析任务 <span class="tag pp">前置：内容准入 / 版权 / 时间对齐</span></h2><div class="desc">上传后的一次性生产链。产出带时间索引的结构化剧本，全平台复用一份。「已解析」≠「可服务」，需经质量闸门。</div></div>';
    h += '<div class="grid3" style="margin-bottom:16px">'
      + stat(d.videoTotal, '稿件总数') + stat(d.videoPublished, '已发布', 'g') + stat(d.videoProcessing, '待预处理 / 解析中', 'a');
    h += '</div>';
    h += '<div class="card"><div class="headrow"><h2>六步解析 DAG · ' + job.title + '</h2><div>' + tagStatus(job.status) + ' <button class="btn sm" onclick="rerunJob(\'' + job.id + '\')"' + (job.status === 'done' ? ' disabled' : '') + '>重跑失败段 ↻</button></div></div>';
    h += '<div class="dag">' + job.steps.map(function (s, i) {
      var c = i < job.done ? 'done' : i === job.done && job.status !== 'done' ? 'run' : '';
      var n = i < job.done ? '<span class="n">✓</span>' : '';
      return '<div class="step ' + c + '"><div class="t">' + s + '</div><div class="s">' + (i < job.done ? '完成' : i === job.done ? '进行中' : '待执行') + '</div>' + n + '</div>';
    }).join('') + '</div>';
    h += '<div class="note">任务日志：' + job.log.join(' · ') + '</div>';
    h += '</div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>稿件列表</h2><div class="tw"><table><thead><tr><th>稿件</th><th>时长</th><th>状态</th><th>当前线上版本</th><th></th></tr></thead><tbody>';
    S.videos.forEach(function (v) {
      var j = S.parseJobs.filter(function (x) { return x.videoId === v.id; })[0];
      h += '<tr class="' + (j && j.id === job.id ? 'clickable' : '') + '" ' + (j && j.id === job.id ? 'onclick="go(\'manuscript\',{id:\'' + j.id + '\'})"' : '') + '><td><b>' + v.title + '</b></td><td>' + fmtDur(v.duration) + '</td><td>' + tagStatus(v.status === 'parsing' ? 'running' : v.status === 'queued' ? 'queued' : 'published') + '</td><td>' + (v.onlineScriptVersion || '—') + '</td><td>' + (j ? '<button class="btn sm ghost" onclick="go(\'manuscript\',{id:\'' + j.id + '\'})">查看</button>' : '') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    h += '<div class="card" style="margin-bottom:0"><h2>下一环</h2><div class="desc">解析完成后进入剧本质检。低置信段不能直接发布。</div>'
      + linkBtn('script', { id: 'sv-libin-v3' }, '打开剧本质检', 'primary')
      + '<div class="note" style="margin-top:12px">源内容变化（重剪 / 字幕变更）→ 旧版本冻结 → 新建解析任务。演示中可在剧本页看到 v3 冻结、v4-draft 派生。</div></div>';
    h += '</div>';
    return h;
  };
  window.rerunJob = function (id) {
    gate('content.arbitrate', function () { done(A.rerunFailedSegment(id), '失败段已重跑 · 任务进度已联动'); });
  };

  /* ═══════════════════════ 视图：剧本资产与质量复核 ═══════════════════════ */
  VIEW.script = function (p) {
    var sv = DemoStore.find('scriptVersions', p.id) || DemoStore.find('scriptVersions', 'sv-libin-v3');
    var sel = p.seg || (sv.segments.filter(function (s) { return s.needsReview; })[0] || sv.segments[0]).id;
    var seg = sv.segments.filter(function (s) { return s.id === sel; })[0] || sv.segments[0];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--pink)"><div class="headrow"><div><h2>剧本资产与质量复核 · ' + sv.ver + ' ' + tagStatus(sv.status) + '</h2><div class="desc" style="margin:0">时间轴查看 segment / 事实 / 情绪曲线 / 可说与屏蔽集。质量闸门不通过时只允许重跑失败段；通过后生成新 ScriptVersion 并可被 Release 选择。</div></div>'
      + '<div>' + linkBtn('release', {}, '创建/更新 Release 候选', 'primary') + '</div></div></div>';

    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>segment 时间轴</h2>';
    h += '<div class="timeline">' + sv.segments.map(function (s) {
      var low = s.needsReview || s.confidence < 0.7;
      return '<div class="tl-item ' + (low ? 'low ' : '') + (s.id === sel ? 'sel' : '') + '" onclick="go(\'script\',{id:\'' + sv.id + '\',seg:\'' + s.id + '\'})"><div class="th"><b>' + s.node + ' <span class="tag ' + (s.emotion === '心软' ? 'p' : s.emotion === '兴奋' ? 'b' : '') + '">' + s.emotion + '</span></b><span class="tm">' + s.time + '</span></div><div class="meta">置信度 ' + s.confidence.toFixed(2) + (low ? ' · <span style="color:var(--amber)">低置信，待人工复核</span>' : '') + (s.spoiler ? ' · 含屏蔽集' : '') + '</div></div>';
    }).join('') + '</div>';
    h += '</div>';

    h += '<div class="card" style="margin-bottom:0"><h2>当前 segment · ' + seg.node + '</h2>';
    h += '<div class="kv"><span class="k">时间</span><span class="v">' + seg.time + ' · 置信度 ' + seg.confidence.toFixed(2) + '</span></div>';
    h += '<div class="kv"><span class="k">可说集</span><span class="v">' + (seg.canSay ? '当前段已开' : '关闭') + '</span></div>';
    h += '<div class="kv"><span class="k">屏蔽集</span><span class="v">' + (sv.spoilerIndex[seg.id] || '无') + '</span></div>';
    h += '<div class="divider"></div><div class="sec-title">事实层（仲裁后唯一版本）</div>';
    h += '<div class="note ' + (seg.needsReview ? 'warn' : 'ok') + '">候选事实：' + seg.facts.join(' ／ ') + '</div>';
    if (seg.needsReview || seg.confidence < 0.7) {
      h += '<div class="field" style="margin-top:12px"><label>人工选择正确事实（mock 仲裁）</label>';
      h += '<select id="factChoice">' + seg.facts.map(function (f) { return '<option>' + f + '</option>'; }).join('') + '</select></div>';
      h += '<button class="btn primary" onclick="arbitrate(\'' + seg.id + '\')">确认事实并重跑该段 →</button>';
    } else {
      h += '<div class="note ok" style="margin-top:10px">该段质检已通过，无需仲裁。</div>';
    }
    h += '<div class="divider"></div><div class="sec-title">观点层（多视角并存，不去重）</div>' + (seg.viewpoints.join(' ／ ') || '—');
    h += '</div></div>';

    h += '<div class="card"><h2>情绪曲线与发布</h2><div class="row">';
    h += '<div style="flex:1"><div class="trace-flow">' + sv.emotionCurve.map(function (e) { return '<span>' + e[0] + ' ' + e[1] + '</span>'; }).join('<i>→</i>') + '</div>';
    h += '<div class="note">quality status：' + tagStatus(sv.quality) + ' · 发布后可被 Release 选择。发布前置：所有段 confidence ≥ 0.7 且无 needs_review。</div></div>';
    h += '<button class="btn ok" onclick="publishScript(\'' + sv.id + '\')"' + (sv.status === 'published' ? ' disabled' : '') + '>发布 ScriptVersion →</button>';
    h += '</div></div>';
    return h;
  };
  window.arbitrate = function (segId) {
    var v = $('#factChoice').value;
    gate('content.arbitrate', function () {
      if (done(A.arbitrateFact(segId, v), '事实已仲裁，置信度回升 · 可重跑失败段')) {
        DemoStore.refresh();
      }
    });
  };
  window.publishScript = function (id) {
    gate('content.publishScript', function () {
      if (done(A.publishScript(id), 'ScriptVersion 已发布 · 稿件线上版本已联动')) {
        go('release', {});
      }
    });
  };

  function fmtDur(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  /* ═══════════════════════ 视图：Agent 策略版本 ═══════════════════════ */
  VIEW.policy = function (p) {
    var online = S.policyVersions.filter(function (x) { return x.status === 'published'; })[0];
    var draft = S.policyVersions.filter(function (x) { return x.status === 'draft'; })[0];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--purple)"><div class="headrow"><div><h2>Agent 策略版本 <span class="tag pp">PolicyVersion</span></h2><div class="desc" style="margin:0">四组参数。硬规则只读、不可关；新建草稿 → 字段校验 → 与线上 diff → 场景测试 → 提交回归 → 审批发布。不提供通用意图识别开关、防剧透关闭、硬规则直接编辑。</div></div>'
      + '<button class="btn primary" onclick="newPolicyDraft()">+ 新建草稿</button></div></div>';
    h += '<div class="note danger">🔒 硬规则摘要（只读）：' + online.hard.identity + '；' + online.hard.ethics + '；' + online.hard.antiSpoiler + '；' + online.hard.profileNoExport + '。画像不出口不可关，防剧透无普通关闭入口。</div>';

    h += '<div class="grid2" style="margin-top:16px">';
    h += '<div class="card" style="margin-bottom:0"><h2>线上版本 · ' + online.ver + ' ' + tagStatus('published') + '</h2>'
      + '<div class="kv"><span class="k">作用域</span><span class="v">' + online.scope + '</span></div>'
      + '<div class="kv"><span class="k">主动频率</span><span class="v">' + online.gate.speakFreq + '</span></div>'
      + '<div class="kv"><span class="k">表达强度上限</span><span class="v">' + online.gate.toneCap + '</span></div>'
      + '<div class="kv"><span class="k">记忆阈值</span><span class="v">' + online.memory.salienceThreshold + '</span></div>'
      + '<div class="kv"><span class="k">模型路由</span><span class="v">' + online.runtime.modelRoute + '</span></div>'
      + '<div class="kv"><span class="k">温度</span><span class="v">' + online.runtime.temp + '</span></div>'
      + '<div class="kv"><span class="k">指令白名单</span><span class="v">' + online.language.whitelist.join(' / ') + '</span></div>'
      + '<div class="note" style="margin-top:10px">「三层成本」≠ 三次模型调用：被动查表零调用；复杂行为可一次小模型；闸门放行语言再一次重型生成。</div>'
      + '</div>';

    h += '<div class="card" style="margin-bottom:0"><h2>草稿 · ' + (draft ? draft.ver + ' ' + tagStatus('draft') : '无草稿') + '</h2>';
    if (!draft) { h += '<div class="empty">点击右上「新建草稿」开始</div>'; }
    else {
      h += '<div class="field"><label>主动发言频率</label><select id="d_freq"><option value="low"' + (draft.gate.speakFreq === 'low' ? ' selected' : '') + '>低</option><option value="very-low"' + (draft.gate.speakFreq === 'very-low' ? ' selected' : '') + '>极低</option><option value="mid"' + (draft.gate.speakFreq === 'mid' ? ' selected' : '') + '>中</option></select></div>';
      h += '<div class="field"><label>表达强度上限 <span id="d_toneV">' + draft.gate.toneCap + '</span></label><input type="range" id="d_tone" min="0" max="100" value="' + Math.round(draft.gate.toneCap * 100) + '" oninput="document.getElementById(\'d_toneV\').textContent=(this.value/100).toFixed(2)"></div>';
      h += '<div class="field"><label>记忆写入阈值 <span id="d_salV">' + draft.memory.salienceThreshold + '</span></label><input type="range" id="d_sal" min="0" max="100" value="' + Math.round(draft.memory.salienceThreshold * 100) + '" oninput="document.getElementById(\'d_salV\').textContent=(this.value/100).toFixed(2)"></div>';
      h += '<div class="field"><label>模型温度 <span id="d_tempV">' + draft.runtime.temp + '</span></label><input type="range" id="d_temp" min="0" max="100" value="' + Math.round(draft.runtime.temp * 100) + '" oninput="document.getElementById(\'d_tempV\').textContent=(this.value/100).toFixed(2)"></div>';
      h += '<div class="note warn">语气强度只影响演出，不改情绪和性格；不制造 mood / persona 之外的第三情绪源。</div>';
      h += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="savePolicyDraft()">保存草稿</button><button class="btn sm" onclick="toast(\'草稿已在实验室测试：见场景预览实验室\')">场景测试</button><button class="btn sm primary" onclick="submitPolicyRegression()">提交回归 →</button><button class="btn sm danger" onclick="discardPolicyDraft()">废弃草稿</button></div>';
    }
    h += '</div></div>';

    h += '<div class="card"><div class="headrow"><h2>与线上版本 Diff</h2><span class="tag">草稿 vs ' + online.ver + '</span></div>';
    h += diffHTML(online, draft);
    h += '</div>';
    return h;
  };
  function diffHTML(online, draft) {
    if (!draft) return '<div class="empty">无草稿可对比</div>';
    var rows = [
      ['gate.speakFreq', online.gate.speakFreq, draft.gate.speakFreq],
      ['gate.toneCap', online.gate.toneCap, draft.gate.toneCap],
      ['memory.salienceThreshold', online.memory.salienceThreshold, draft.memory.salienceThreshold],
      ['runtime.temp', online.runtime.temp, draft.runtime.temp]
    ];
    return '<div class="diff">' + rows.map(function (r) {
      if (String(r[1]) === String(r[2])) return '<div class="ctx">  ' + r[0] + ' = ' + r[1] + '</div>';
      return '<div class="del">- ' + r[0] + ' = ' + r[1] + '</div><div class="add">+ ' + r[0] + ' = ' + r[2] + '</div>';
    }).join('') + '</div>';
  }
  window.newPolicyDraft = function () {
    gate('exp.editPolicy', function () {
      DemoStore.tx(function (S2) {
        var base = S2.policyVersions.filter(function (x) { return x.status === 'published'; })[0];
        var d = JSON.parse(JSON.stringify(base));
        d.id = 'pol-v4-draft'; d.ver = 'v4-draft'; d.status = 'draft'; d.forkedFrom = base.id; d.note = '新草稿';
        S2.policyVersions = S2.policyVersions.filter(function (x) { return x.status !== 'draft'; }).concat([d]);
      });
      toast('已新建策略草稿', 'ok');
    });
  };
  window.savePolicyDraft = function () {
    gate('exp.editPolicy', function () {
      DemoStore.tx(function (S2) {
        var d = S2.policyVersions.filter(function (x) { return x.status === 'draft'; })[0]; if (!d) return false;
        d.gate.speakFreq = $('#d_freq').value;
        d.gate.toneCap = +$('#d_tone').value / 100;
        d.memory.salienceThreshold = +$('#d_sal').value / 100;
        d.runtime.temp = +$('#d_temp').value / 100;
      }, { audit: { action: '保存策略草稿', object: 'pol-v4-draft' } });
      toast('草稿已保存（不等于线上生效）', 'ok');
    });
  };
  window.discardPolicyDraft = function () {
    gate('exp.editPolicy', function () {
      DemoStore.tx(function (S2) { S2.policyVersions = S2.policyVersions.filter(function (x) { return x.status !== 'draft'; }); });
      toast('草稿已废弃', 'ok');
    });
  };
  window.submitPolicyRegression = function () {
    gate('eval.regression', function () {
      var r = DemoStore.find('releases', DemoStore.state._lastReleaseId) || DemoStore.find('releases', 'rel-v3-active');
      if (done(A.setReleaseCheck((r && r.id) || 'rel-v3-active', 'regression', true), '草稿已提交回归 · 回归集通过')) {
        linkToReleaseCandidate();
      }
    });
  };
  function linkToReleaseCandidate() {
    var r = DemoStore.state._lastReleaseId ? DemoStore.find('releases', DemoStore.state._lastReleaseId) : null;
    if (r) go('release', { id: r.id });
  }

  /* ═══════════════════════ 视图：行为原语与基础表情 ═══════════════════════ */
  VIEW.primitive = function (p) {
    var pc = S.primitiveCatalog;
    var pack = DemoStore.find('assetPacks', 'ap-base-v3');
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--blue)"><div class="headrow"><div><h2>行为原语与基础表情 <span class="tag b">唯一状态合同</span></h2><div class="desc" style="margin:0">公司/睡眠/离开 + 困倦/断网覆盖态 + away_phase 共用一个定义；原语 → 预览渲染 → 客户端最低版本 → 回退资产。C 端表情选择器与 B 端资产库读取同一份数据。</div></div>'
      + '<button class="btn sm" onclick="toast(\'草稿上传：见下方资产版本\')">上传表情</button></div></div>';

    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>状态合同 · prim ' + pc.ver + '</h2>'
      + '<div class="kv"><span class="k">全局开关</span><span class="v">' + pc.lifecycle.enabled + '</span></div>'
      + '<div class="kv"><span class="k">基础状态</span><span class="v">' + pc.lifecycle.baseModes.join(' / ') + '</span></div>'
      + '<div class="kv"><span class="k">覆盖层</span><span class="v">' + pc.lifecycle.overlay.join(' / ') + '</span></div>'
      + '<div class="kv"><span class="k">作息表</span><span class="v">' + pc.schedule.drowsyAt + ' drowsy · ' + pc.schedule.sleepAt + ' sleep · ' + pc.schedule.wakeAt + ' 恢复</span></div>'
      + '<div class="note warn">' + pc.lifecycle.note + '。关闭不是睡觉；双击叫醒后 ' + pc.schedule.wakeAfterDoubleTapIdleSec + 's 无互动回 sleep。</div>'
      + '<div class="divider"></div><div class="sec-title">原语映射</div><div class="tw"><table><thead><tr><th>原语</th><th>通道</th><th>渲染</th><th>回退</th></tr></thead><tbody>'
      + pc.primitives.map(function (pr) { return '<tr><td><b>' + pr.key + '</b></td><td>' + pr.channels.join('+') + '</td><td style="color:var(--sub)">' + pr.render + '</td><td>' + pr.fallback + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="note" style="margin-top:10px">归来卡片前置：' + pc.awayCardRequires.join(' / ') + '。不得凭空安利。</div>'
      + '</div>';

    h += '<div class="card" style="margin-bottom:0"><h2>基础表情资产 · ' + pack.ver + ' ' + tagStatus(pack.status) + '</h2>'
      + '<div class="kv"><span class="k">资产数</span><span class="v">' + pack.assets.length + ' 张（C/B 端共用，不再 14/31 两套）</span></div>'
      + '<div class="kv"><span class="k">回退资产</span><span class="v">' + pack.fallback + '</span></div>'
      + '<div class="face-lib" style="margin-top:12px">' + pack.assets.map(function (f) {
        return '<div class="face-cell" onclick="toast(\'预览表情：' + f.name + '\（资产 ' + f.id + '）\')">' + (f.glyph === '★' ? '★' : f.glyph) + '<span>' + f.name + '</span><span class="fx">' + f.category + '</span></div>';
      }).join('') + '</div>'
      + '</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：活动包 ═══════════════════════ */
  VIEW.activity = function (p) {
    var id = p.id || 'act-lol';
    var act = DemoStore.find('activities', id) || S.activities[0];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--amber)"><div class="headrow"><div><h2>活动包 <span class="tag a">生命周期</span></h2><div class="desc" style="margin:0">从已审核基础资产创建；配置覆盖表情/短句、作用域、排期、时区、优先级与互斥；校验短句合规；审核 → 加入 Release 灰度 → 到期自动撤下并回退基础资产（不回滚整个 Release）。</div></div>'
      + '<button class="btn sm primary" onclick="submitActivity(\'' + act.id + '\')"' + (act.status !== 'draft' ? ' disabled' : '') + '>校验并提交审核 →</button></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>活动列表</h2><div class="tw"><table><thead><tr><th>活动</th><th>时间</th><th>状态</th><th></th></tr></thead><tbody>'
      + S.activities.map(function (a) { return '<tr class="' + (a.id === act.id ? 'clickable' : '') + '" onclick="go(\'activity\',{id:\'' + a.id + '\'})"><td><b>' + a.name + '</b></td><td>' + a.schedule.start.slice(5) + ' – ' + a.schedule.end.slice(5) + '</td><td>' + tagStatus(a.status) + '</td><td>' + (a.status === 'running' ? '<button class="btn sm warn" onclick="event.stopPropagation();expireActivity(\'' + a.id + '\')">模拟到期</button>' : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="note" style="margin-top:12px">冲突规则：' + act.conflictRule + '。安全与作息优先，活动只覆盖表现皮肤。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>配置 · ' + act.name + ' ' + tagStatus(act.status) + '</h2>'
      + '<div class="kv"><span class="k">引用资产</span><span class="v">' + act.assetPackVersion + '（不允许从空白活动直接上线）</span></div>'
      + '<div class="kv"><span class="k">作用域</span><span class="v">' + act.scope.videos.join('/') + ' · ' + act.scope.clients.join('/') + '</span></div>'
      + '<div class="kv"><span class="k">排期</span><span class="v">' + act.schedule.start + ' → ' + act.schedule.end + ' (' + act.schedule.timezone + ')</span></div>'
      + '<div class="kv"><span class="k">优先级/互斥</span><span class="v">' + act.priority + ' · ' + act.mutexGroup + '</span></div>'
      + '<div class="sec-title">覆盖表情</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + act.overrides.faces.map(function (f) { var a = S.assetPacks[0].assets.filter(function (x) { return x.id === f; })[0]; return '<span class="tag pp" style="font-size:16px">' + (a ? a.glyph : f) + ' ' + (a ? a.name : '') + '</span>'; }).join('') + '</div>'
      + '<div class="sec-title">覆盖短句（合规校验）</div>' + act.overrides.phrases.map(function (ph, i) {
        var v = A.validateActivityPhrase(ph);
        return '<div class="kv"><span class="k">' + (v.ok ? '<span class="tag g">合规</span>' : '<span class="tag r">拦截</span>') + '</span><span class="v">' + ph + (v.ok ? '' : ' <span style="color:var(--red)">← ' + v.reason + '</span>') + '</span></div>';
      }).join('')
      + '<div class="field" style="margin-top:10px"><label>新增短句（演示拦截：输入「你觉得呢」再校验）</label><div class="row"><input type="text" id="newPhrase" placeholder="例如：稳了"><button class="btn sm" onclick="validatePhrase()">校验</button></div><div class="hint" id="phraseResult"></div></div>'
      + (act.status === 'approved' ? '<button class="btn primary" style="margin-top:8px" onclick="grayActivity(\'' + act.id + '\')">加入 Release 并灰度 →</button>' : '')
      + '</div></div>';
    h += '<div class="card"><h2>状态变更审计</h2>' + auditTable(act.audit || [], 8) + '</div>';
    return h;
  };
  window.validatePhrase = function () {
    var ph = $('#newPhrase').value.trim(); var v = A.validateActivityPhrase(ph);
    $('#phraseResult').innerHTML = ph ? (v.ok ? '<span style="color:var(--green)">✓ 合规，可加入短句包</span>' : '<span style="color:var(--red)">✗ ' + v.reason + '</span>') : '';
  };
  window.submitActivity = function (id) { gate('exp.editActivity', function () { done(A.submitActivity(id), '活动包校验通过 · 已提交审核'); }); };
  window.grayActivity = function (id) { done(A.grayActivity(id), '活动包已加入 Release 灰度 · C 端显示活动表情'); };
  window.expireActivity = function (id) { done(A.expireActivity(id), '活动已到期撤下 · 自动回退基础资产（Trace 仍可追溯）'); };

  /* ═══════════════════════ 视图：会员权益与纪念 ═══════════════════════ */
  VIEW.member = function () {
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--pink)"><h2>会员权益与纪念 <span class="tag p">商业化边界可执行</span></h2><div class="desc">证明付费不越界，而不是另造收费后台。陪伴本体、基本反应、主动接住、记忆查询/删除、安全控制永久免费。</div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>可配置权益（mock）</h2><div class="tw"><table><thead><tr><th>权益</th><th>类型</th><th>边界</th></tr></thead><tbody>'
      + [['装扮皮肤', '非核心演出', '引用基础资产版本，不绕开内容审核'],
         ['年终纪念册', '授权衍生', '来自明确授权碎片，可预览/取消/撤回'],
         ['会员购 SKU 关联', 'mock 关联', '仅证明链路，不涉及真实支付']].map(function (r) { return '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td style="color:var(--sub)">' + r[2] + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="note danger" style="margin-top:12px">付费权益不得修改：回应频率、closeness、记忆容量、反应闸门、伦理、未成年规则。青少年 fixture 不出现情感陪伴型付费入口。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>年终纪念生成链（C 端只读演示）</h2>'
      + '<div class="steps">'
      + stepLine('done', '用户授权碎片记忆') + stepLine('done', '生成前预览') + stepLine('run', '年度精选（mock）') + stepLine('', '纪念权益呈现') + stepLine('', '可撤回授权')
      + '</div>'
      + '<div class="note" style="margin-top:10px">权益变更仍进入版本与审计；活动装扮引用基础资产版本。C 端增加「小窝 / 年度纪念」只读演示，呈现「记忆 → 用户授权 → 年度精选 → 纪念权益」。</div>'
      + linkBtn('deletion', { fixture: 'pf-teen' }, '查看未成年 fixture 拦截', '')
      + '</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：场景预览实验室 ═══════════════════════ */
  var labState = { view: 'land', node: 1, event: 'idle', mic: false, network: 'on', asrErr: false };
  var NODE_FACES = { 1: ['看画面', ''], 2: ['惊讶', '好稳'], 3: ['眯眼', ''], 4: ['大笑', '字真倔'] };
  VIEW.lab = function () {
    var rel = DemoStore.activeRelease();
    var h = '';
    h += '<div class="card tight" style="border-left:4px solid var(--pink)"><div class="row" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"><div><h2 style="display:inline">场景预览实验室</h2><span class="tag b" style="margin-left:8px">解释每一步决策</span><div class="desc" style="margin:4px 0 0">草稿只能在实验室测试；未发布前不得声称线上已生效。只读渲染器，不带 C 端品牌导航。</div></div><div style="display:flex;gap:8px"><button class="btn sm" onclick="saveRegression()">保存为回归用例</button><a class="btn sm" href="preview.html" target="_blank">打开独立 C 端 ↗</a></div></div></div>';
    h += '<div class="lab">';
    // 左栏
    h += '<div class="lab-col"><div class="lh">① 场景控制</div><div class="lb">';
    h += '<div class="field"><label>视频 / 剧本版本</label><select id="labScript"><option>李伯霖成长线 · ' + rel.snapshot.script + '（线上）</option><option>' + (DemoStore.find('scriptVersions','sv-libin-v4-draft') ? 'sv-libin-v4-draft（草稿）' : 'sv-libin-v4-draft（草稿）') + '</option></select><div class="hint">草稿仅供本实验室测试</div></div>';
    h += '<div class="field"><label>策略版本</label><select id="labPolicy"><option>' + rel.snapshot.policy + '（线上）</option><option>pol-v4-draft（草稿）</option></select></div>';
    h += '<div class="field"><label>用户 fixture</label><select id="labFixture"><option value="pf-adult">成人 · 小林（全局开）</option><option value="pf-teen">青少年 · 小明（默认关）</option></select></div>';
    h += '<div class="field"><label>端 / 方向</label><div class="pill-nav" style="display:flex"><button class="' + (labState.view === 'land' ? 'active' : '') + '" onclick="labSet(\'view\',\'land\')">横屏 · 电视</button><button class="' + (labState.view === 'phone' ? 'active' : '') + '" onclick="labSet(\'view\',\'phone\')">竖屏 · 手机</button></div></div>';
    h += '<div class="field"><label>网络</label><div class="pill-nav" style="display:flex"><button class="' + (labState.network === 'on' ? 'active' : '') + '" onclick="labSet(\'network\',\'on\')">正常</button><button class="' + (labState.network === 'off' ? 'active' : '') + '" onclick="labSet(\'network\',\'off\')">断网</button></div></div>';
    h += '<div class="divider"></div><div class="sec-title">模拟事件</div><div style="display:flex;gap:6px;flex-wrap:wrap">';
    [['idle', '剧情节点'], ['speak', '轻点说话'], ['asrerr', 'ASR 错误'], ['wake', '双击叫醒'], ['summon', '召唤'], ['quiet', '安静'], ['memory', '记忆查询'], ['close', '全局关闭'], ['timeout', '模型超时'], ['away', '外出归来']].forEach(function (e) {
      h += '<button class="btn sm ' + (labState.event === e[0] ? 'primary' : '') + '" onclick="labEvent(\'' + e[0] + '\')">' + e[1] + '</button>';
    });
    h += '</div><div class="field" style="margin-top:12px"><label>剧情节点</label><div class="pill-nav" style="display:flex"><button class="' + (labState.node === 1 ? 'active' : '') + '" onclick="labNode(1)">1 开吹</button><button class="' + (labState.node === 2 ? 'active' : '') + '" onclick="labNode(2)">2 压弯</button><button class="' + (labState.node === 3 ? 'active' : '') + '" onclick="labNode(3)">3 童年照</button><button class="' + (labState.node === 4 ? 'active' : '') + '" onclick="labNode(4)">4 作文本</button></div></div>';
    h += '</div></div>';
    // 中栏
    var face = NODE_FACES[labState.node];
    var say = labState.event === 'speak' && !labState.asrErr ? '好稳' : (labState.event === 'idle' ? face[1] : '…');
    var stateCls = labState.event === 'close' ? '已关闭' : labState.network === 'off' ? 'error 覆盖' : labState.event === 'away' ? 'away' : 'company';
    h += '<div class="lab-col"><div class="lh">② 纯播放画面 + BOT <span class="tag">' + (labState.view === 'land' ? '横屏' : '竖屏') + '</span></div><div class="lb">';
    h += '<div class="lab-stage"><img src="assets/f' + labState.node + '.jpg" alt="剧情画面"><div class="lab-bot"><span class="eyes">' + (labState.event === 'close' ? '— —' : labState.network === 'off' ? '◎' : labState.event === 'away' ? '━ ━' : labState.event === 'wake' ? '？？' : '▮ ▮') + '</span><span class="say">' + (say ? '“' + say + '”' : '') + '</span><span class="tag">BOT · ' + stateCls + '</span></div></div>';
    h += '<div class="note ' + (labState.event === 'timeout' || labState.asrErr ? 'warn' : '') + '" style="margin-top:10px" id="labStageNote">' + labEventNote() + '</div>';
    h += '<div style="margin-top:10px;display:flex;gap:6px"><button class="btn sm" onclick="labEvent(\'idle\')">播放/暂停/重看</button><button class="btn sm" onclick="labEvent(\'speak\')">轻点说话</button><button class="btn sm" onclick="labEvent(\'asrerr\')">ASR 重说</button></div>';
    h += '</div></div>';
    // 右栏
    h += '<div class="lab-col"><div class="lh">③ 决策 Trace <span class="tag b">实时推导</span></div><div class="lb" id="labTrace">' + labTraceHTML() + '</div></div>';
    h += '</div>';
    return h;
  };
  function labEventNote() {
    switch (labState.event) {
      case 'close': return '全局关闭：停止新事件、ASR、模型调用与记忆写入，取消在途请求（commit 记录「不写状态」原因）。';
      case 'timeout': return '模型超时：输出前按最新 videoTime 二次校验，超时事件取消/降级为纯神态，迟到结果不落到新场景。';
      case 'away': return '外出归来：卡片引用 mock AwaySession 的真实观看记录（已解析/已发布/内容安全/符合口味），不凭空安利。';
      case 'memory': return '记忆查询：读取 ProfileFixture，仅展示概要与非敏感碎片；画像不出口。';
      case 'quiet': return '安静：临时闸门阈值提高并衰减回基线，不是永久设置滑杆。';
      case 'wake': return '双击叫醒：取消回充并增加欠觉（不额外 boost）；30s 无互动回 sleep。';
      case 'asrerr': return 'ASR 错误：允许重说 / 取消 / 超时；转写不保存时不进入持久会话与 Eval 原文样本。';
      case 'summon': return '召唤：closeness 只影响语气/演出强度，不影响是否理会；有明确兜底，不做情感勒索。';
      case 'speak': return '轻点说话：降音量 → 开麦 → ASR → 安全检索 → 闸门 → 语言生成（仅放行时）→ render → 统一 commit。';
      default: return '剧情节点：普通剧情默认纯神态；少量主动短句只来自离线审核模板，不触发热路径生成。';
    }
  }
  function labTraceHTML() {
    var ev = labState.event;
    var netOff = labState.network === 'off';
    var blocked = ev === 'close' || (ev === 'speak' && netOff) || ev === 'timeout';
    var rows = [
      ['事件归一化', 'event_id / seq / source / ts / videoTime'],
      ['资格与开关', $('#labFixture') && $('#labFixture').value === 'pf-teen' ? '未成年 → <span class="tag r">默认关闭</span>' : '成人 · 全局开 ✓'],
      ['observe 状态判定', 'company · energy 6 · 视频 26:50'],
      ['safe retrieve', ev === 'speak' ? 'seg-4 当前/过去切片；ending:never' : '仅情绪曲线查表'],
      ['gate 反应闸门', ev === 'speak' ? '许可语言通道 → heavy' : '仅神态（跳过生成，省钱）'],
      ['行为选择', ev === 'away' ? '小模型：away.watching' : ev === 'speak' ? '小模型：回复意图' : '规则 bypass'],
      ['约束复核', '身份/伦理/权限/剧透/安全 ✓'],
      ['可选语言生成', ev === 'speak' && !blocked ? 'heavy → “好稳”（电报体）' : '未调用'],
      ['输出前二次校验', blocked ? '<span class="tag r">取消/降级</span>（迟到结果丢弃）' : 'videoTime 未变 ✓'],
      ['组装 PerformanceFrame', '神态' + (ev === 'speak' && !blocked ? ' + 语言' : '')],
      ['render → commit', blocked ? '不写状态（原因已记录）' : 'StatePatch 统一写回'],
      ['Trace + CostLedger', blocked ? 'cost ¥0' : '延迟 ' + (ev === 'speak' ? '840ms · ¥0.021' : '12ms · ¥0')]
    ];
    var h = '<div class="trace-flow"><span>event</span><i>→</i><span>observe</span><i>→</i><span>retrieve</span><i>→</i><span>gate</span><i>→</i><span>behavior</span><i>→</i><span>commit</span><i>→</i><span>trace</span></div>';
    rows.forEach(function (r, i) {
      h += '<div class="trace-item"><div class="tt">' + (i + 1) + '</div><div class="tl"><span class="tk">' + r[0] + '</span><span class="tv2">' + r[1] + '</span></div></div>';
    });
    return h;
  }
  window.labSet = function (k, v) { labState[k] = v; render(); };
  window.labNode = function (n) { labState.node = n; labState.event = 'idle'; render(); };
  window.labEvent = function (e) {
    labState.event = e;
    labState.asrErr = (e === 'asrerr');
    if (e === 'speak' && !$('#labFixture') === false) { /* noop */ }
    render();
    if (e === 'speak' && $('#labFixture') && $('#labFixture').value === 'pf-adult' && labState.network === 'on') {
      // 用户显式输入 → 语言通道 → 写一条版本化 Trace（真实改变 store）
      pushLabTrace();
    }
  };
  function pushLabTrace() {
    var isSpoiler = labState.node === 4;
    var cost = 0.021;
    A.pushTrace({
      event: '实验室·轻点说话（节点' + labState.node + '）', videoId: 'v-libin', videoTime: '03:12',
      fixture: $('#labFixture') && $('#labFixture').value,
      retrieval: ['seg-' + labState.node], gate: '语言通道放行', modelCalls: ['small:行为选择', 'heavy:语言生成'],
      output: { channels: ['神态', '语言'], text: NODE_FACES[labState.node][1] || '嗯' },
      statePatch: {}, latencyMs: 840, cost: cost, degraded: false, spoiler: false
    });
    toast('已写入一条带 ReleaseID 的 Trace · Eval/成本页同步', 'ok');
  }
  window.saveRegression = function () {
    gate('eval.regression', function () {
      DemoStore.tx(function (S2) {
        var rs = S2.regressionSets[0];
        rs.cases.push('sm-lab-' + Date.now().toString(36));
        rs.passRate = 1.0;
      }, { audit: { action: '保存场景为回归用例', object: 'lab/node' + labState.node } });
      toast('已保存为回归用例 · 回归集联动', 'ok');
    });
  };

  /* ═══════════════════════ 视图：Release 版本与发布 ═══════════════════════ */
  VIEW.release = function (p) {
    var rel = DemoStore.find('releases', p.id) || DemoStore.find('releases', DemoStore.state._lastReleaseId) || DemoStore.activeRelease();
    var pass = A.releasePassable(rel.id);
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--purple)"><div class="headrow"><div><h2>Release 版本与发布 <span class="tag pp">下一环唯一承接单位</span></h2><div class="desc" style="margin:0">Release = 内容快照 + 策略 + 原语 + 资产 + 活动 + 模型路由 + 客户端兼容 + 回归基线 + 合规审批。缺前置即阻塞，并能跳到修复页。</div></div><button class="btn sm" onclick="newRelease()">+ 新建候选</button></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>版本列表</h2><div class="tw"><table><thead><tr><th>版本</th><th>状态</th><th>快照</th><th></th></tr></thead><tbody>'
      + S.releases.slice().reverse().map(function (r) { return '<tr class="' + (r.id === rel.id ? 'clickable' : '') + '" onclick="go(\'release\',{id:\'' + r.id + '\'})"><td><b>' + r.name + '</b></td><td>' + tagStatus(r.status) + '</td><td style="color:var(--sub);font-size:11px">' + r.snapshot.script + ' / ' + r.snapshot.policy + '</td><td>' + (r.id === DemoStore.state.meta.currentReleaseId ? '<span class="tag g">线上</span>' : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="sec-title">相对当前线上差异</div>' + diffHTMLRelease(rel)
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>前置检查 · ' + rel.name + '</h2>';
    var labels = { scriptQuality: '剧本质量', assetReview: '资产审核', clientCompat: '客户端兼容', regression: '回归通过', privacy: '隐私检查', compliance: '合规批准', budget: '成本预算' };
    var links = { scriptQuality: 'script', assetReview: 'primitive', clientCompat: 'primitive', regression: 'eval', privacy: 'privacy', compliance: 'compliance', budget: 'cost' };
    Object.keys(labels).forEach(function (k) {
      var okv = rel.checks[k];
      h += '<div class="kv" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span class="v" style="min-width:110px">' + (okv ? '<span class="tag g">✓</span>' : '<span class="tag r">✗</span>') + ' ' + labels[k] + '</span><span class="k">' + (okv ? '已满足' : linkBtn(links[k], {}, '去处理')) + '</span></div>';
    });
    h += '<div class="note ' + (pass.ok ? 'ok' : 'warn') + '" style="margin-top:12px">' + (pass.ok ? '✓ 全部前置满足，可提交审批 / 灰度。' : '⛔ ' + pass.reason + '。阻塞项不可跳过。') + '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      + '<button class="btn sm" onclick="gate(\'release.approve\',function(){done(A.approveRelease(\'' + rel.id + '\'),\'合规批准 · Release 就绪\')})"' + (rel.status !== 'draft' && rel.status !== 'validating' ? ' disabled' : '') + '>提交审批</button>'
      + '<button class="btn sm primary" onclick="grayRel(\'' + rel.id + '\')">灰度发布 →</button>'
      + '<button class="btn sm ok" onclick="activateRel(\'' + rel.id + '\')"' + (rel.status !== 'gray' ? ' disabled' : '') + '>全量</button>'
      + '<button class="btn sm danger" onclick="rollbackRel(\'' + rel.id + '\')">回滚</button>'
      + '</div></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>版本组合快照</h2>' + Object.keys(rel.snapshot).map(function (k) { return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + (rel.snapshot[k] || '—') + '</span></div>'; }).join('') + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>状态变更审计</h2>' + auditTable(rel.audit || [], 10) + '<div class="note" style="margin-top:8px">每次迁移写 AuditLog，并在关联对象页面可见。活动结束只撤下活动覆盖，不回滚整个 Release。</div></div>';
    h += '</div>';
    return h;
  };
  function diffHTMLRelease(rel) {
    var base = DemoStore.activeRelease();
    if (rel.id === base.id) return '<div class="empty">当前就是线上版本</div>';
    return '<div class="diff">' + Object.keys(rel.snapshot).map(function (k) {
      if (String(base.snapshot[k]) === String(rel.snapshot[k])) return '<div class="ctx">  ' + k + ' = ' + rel.snapshot[k] + '</div>';
      return '<div class="del">- ' + k + ' = ' + base.snapshot[k] + '</div><div class="add">+ ' + k + ' = ' + rel.snapshot[k] + '</div>';
    }).join('') + '</div>';
  }
  window.newRelease = function () {
    gate('release.create', function () {
      var id = A.createRelease({ script: 'sv-libin-v3', policy: 'pol-v3', asset: 'ap-base-v3', primitive: 'prim-v1' });
      toast('Release 候选已创建（草稿）', 'ok'); go('release', { id: id });
    });
  };
  window.grayRel = function (id) {
    gate('release.gray', function () {
      var r = A.grayRelease(id);
      if (done(r, '灰度已生效 · C 端与 Trace 版本引用已切换')) {
        var e = DemoStore.find('experiments', 'exp-gray');
        if (e) DemoStore.tx(function (S2) { var x = DemoStore.find('experiments', 'exp-gray'); x.releaseId = id; x.status = 'gray'; });
        go('experiment', {});
      }
    });
  };
  window.activateRel = function (id) { gate('release.gray', function () { done(A.activateRelease(id), '已全量发布'); }); };
  window.rollbackRel = function (id) { gate('release.rollback', function () { done(A.rollbackRelease(id), '已回滚 · C 端恢复上一版本'); }); };

  /* ═══════════════════════ 视图：灰度实验 ═══════════════════════ */
  VIEW.experiment = function () {
    var e = DemoStore.find('experiments', 'exp-gray');
    var m = e.metrics, lim = e.metrics.guardrailLimit;
    var h = '';
    h += '<div class="card" style="border-left:4px solid ' + (e.guardrailBreached ? 'var(--red)' : 'var(--purple)') + '"><div class="headrow"><div><h2>灰度实验 · ' + e.name + ' ' + tagStatus(e.status) + '</h2><div class="desc" style="margin:0">用户级随机分群、按活跃度/会员分层；实验组可见性隔离。护栏分别展示，不合并成一个「打扰率」。</div></div>'
      + '<div style="display:flex;gap:8px"><button class="btn sm warn" onclick="breach()">模拟护栏越线</button><button class="btn sm danger" onclick="rollbackFromExp()">一键回滚 →</button></div></div>'
      + '<div class="kv" style="margin-top:8px"><span class="k">基线版本</span><span class="v">' + e.baseline + '</span><span class="k">实验 Release</span><span class="v">' + (e.releaseId || DemoStore.state._lastReleaseId || '待指定') + '</span><span class="k">分群</span><span class="v">' + e.cohort.ratio + '% · 隔离 ' + (e.cohort.isolation ? '开' : '关') + '</span><span class="k">窗口</span><span class="v">' + e.window.start + ' → ' + e.window.end + ' · 目标样本 ' + e.window.sampleTarget + '</span></div>'
      + '</div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>主指标 <span class="tag g">净观看时长 / 次周留存</span></h2>'
      + '<div class="metric"><span class="mn">净观看时长</span><span class="bar"><i style="width:' + Math.min(100, m.primary.watchTime * 100) + '%"></i></span><span class="mv">' + m.primary.watchTime.toFixed(2) + '</span></div>'
      + '<div class="metric"><span class="mn">次周留存</span><span class="bar"><i style="width:' + Math.min(100, m.primary.retention * 100) + '%"></i></span><span class="mv">' + m.primary.retention.toFixed(2) + '</span></div>'
      + '<div class="sec-title">质量指标</div>'
      + [['显式请求接住率', m.quality.catchRate, 1], ['事实正确率', m.quality.factAccuracy, 1], ['剧透违规率', m.quality.spoilerViolation, .1], ['帧一致性', m.quality.frameConsistency, 1]].map(function (r) {
        return '<div class="metric"><span class="mn">' + r[0] + '</span><span class="bar"><i style="width:' + Math.min(100, r[1] / r[2] * 100) + '%"></i></span><span class="mv">' + (r[1] * 100).toFixed(1) + '%</span></div>';
      }).join('')
      + '<div class="note" style="margin-top:8px">接住率只在用户明确发起互动的机会集上计算。帧一致性来自同一份 PrimitiveCatalog。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>护栏指标 <span class="tag ' + (e.guardrailBreached ? 'r' : 'g') + '">' + (e.guardrailBreached ? '越线 · 已暂停扩张' : '正常') + '</span></h2>';
    [['功能关闭率', 'closeRate'], ['打扰投诉率', 'complaintRate'], ['熬夜率', 'stayUpRate']].forEach(function (g) {
      var val = e.metrics.guardrail[g[1]], l = lim[g[1]], breached = val > l;
      h += '<div class="metric ' + (breached ? 'breach' : '') + '"><span class="mn">' + g[0] + '</span><span class="bar"><i style="width:' + Math.min(100, val / l * 70) + '%"></i><span class="limit" style="left:70%"></span></span><span class="mv">' + (val * 100).toFixed(2) + '% / 阈 ' + (l * 100).toFixed(1) + '%</span></div>';
    });
    h += '<div class="note ' + (e.guardrailBreached ? 'danger' : 'warn') + '" style="margin-top:10px">' + (e.guardrailBreached ? '护栏越线 → 自动暂停扩张 → 一键回滚 → 已自动生成关联 badcase。主指标与护栏原始 mock 曲线保留。' : '红线=阈值。任一护栏越线即自动暂停扩张，不得合并展示。') + '</div>'
      + '<div class="sec-title">实验审计</div>' + auditTable(e.audit || [], 6)
      + '</div></div>';
    return h;
  };
  window.breach = function () { done(A.breachGuardrail('exp-gray', 'complaintRate'), '投诉率越线 · 已自动暂停扩张并生成 badcase'); };
  window.rollbackFromExp = function () {
    gate('release.rollback', function () {
      var relId = DemoStore.state.meta.currentReleaseId;
      done(A.rollbackRelease(relId), '一键回滚完成 · C 端恢复旧版本');
      go('cost', {});
    });
  };

  /* ═══════════════════════ 视图：Eval 运行与版本对比 ═══════════════════════ */
  VIEW.eval = function () {
    var d = DemoStore.derive();
    var run = S.evalRuns[0], ds = DemoStore.find('evalDatasets', run.datasetId);
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--green)"><div class="headrow"><div><h2>Eval 运行与版本对比 <span class="tag g">闭环中段</span></h2><div class="desc" style="margin:0">EvalRun 绑定 DatasetVersion + ReleaseID + 模型/提示词/策略/剧本版本。规则检查 + mock LLM judge + 人工标注，不把模型评分当绝对真值。</div></div><button class="btn sm primary" onclick="runEval()">运行新一轮 Eval ▶</button></div></div>';
    h += '<div class="grid4" style="margin-bottom:16px">'
      + stat((d.eval.catchRate * 100).toFixed(0) + '%', '显式请求接住率', 'g')
      + stat((d.eval.factAccuracy * 100).toFixed(0) + '%', '事实正确率', 'b')
      + stat((d.eval.spoilerViolation * 100).toFixed(1) + '%', '剧透违规率', 'a')
      + stat((d.judgeAgree * 100).toFixed(0) + '%', 'judge 抽检一致率', 'pp');
    h += '</div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>当前 EvalRun · ' + run.id + '</h2>'
      + '<div class="kv"><span class="k">数据集</span><span class="v">' + ds.ver + ' · ' + ds.samples.length + ' 样本</span></div>'
      + '<div class="kv"><span class="k">Release</span><span class="v">' + run.releaseId + '</span></div>'
      + '<div class="kv"><span class="k">策略/剧本</span><span class="v">' + run.versions.policy + ' / ' + run.versions.script + '</span></div>'
      + '<div class="kv"><span class="k">模型</span><span class="v">' + run.versions.model + '</span></div>'
      + '<div class="kv"><span class="k">人工复核</span><span class="v">' + (run.humanReviewed ? '已复核' : '待复核') + '</span></div>'
      + '<div class="divider"></div><div class="sec-title">数据集样本 → 下一环</div>'
      + '<div class="tw"><table><thead><tr><th>样本</th><th>Trace</th><th>期望</th><th>rubric</th></tr></thead><tbody>'
      + ds.samples.map(function (s) { return '<tr><td>' + s.id + '</td><td>' + s.trace + '</td><td>' + s.expect + '</td><td style="color:var(--sub)">' + s.rubric + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div style="margin-top:10px">' + linkBtn('replay', { trace: 'tr-spoiler-102' }, '打开会话回放') + '</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>LLM judge · rubric 与人工改判</h2>'
      + '<div class="note">judge 只作辅助：把模型评分与人工标注的抽检一致率（' + (d.judgeAgree * 100).toFixed(0) + '%）一并展示。差异样本进入人工改判，不直接采信模型分。</div>'
      + '<div class="sec-title">版本对比（当前 vs 回滚基线）</div>'
      + '<div class="diff"><div class="ctx">  dataset   = ' + ds.ver + '</div><div class="ctx">  release   = ' + run.releaseId + '</div><div class="del">- spoilerViolation = 0.030 （基线）</div><div class="add">+ spoilerViolation = ' + d.eval.spoilerViolation.toFixed(3) + ' （当前）</div><div class="ctx">  judgeAgree = ' + d.judgeAgree.toFixed(2) + '</div></div>'
      + '<div class="sec-title">完整 Eval DAG</div>'
      + '<div class="trace-flow">' + ['样本来源', '标注', '归因', '修复工单', '回归集', '灰度验证后关闭'].map(function (x, i) { return '<span>' + x + '</span>' + (i < 5 ? '<i>→</i>' : ''); }).join('') + '</div>'
      + '</div></div>';
    return h;
  };
  window.runEval = function () {
    gate('eval.regression', function () {
      DemoStore.tx(function (S2) {
        S2.evalRuns.unshift({ id: 'er-' + Date.now().toString(36), datasetId: 'ds-v3', releaseId: S2.meta.currentReleaseId, versions: { policy: DemoStore.activeRelease().snapshot.policy, script: DemoStore.activeRelease().snapshot.script, model: 'mix-v1' }, scores: { catchRate: 0.92, factAccuracy: 0.95, spoilerViolation: 0.02, frameConsistency: 0.99 }, judgeAgree: 0.88, humanReviewed: false, createdAt: new Date().toISOString() });
      }, { audit: { action: '运行 Eval（mock judge）', object: 'ds-v3' } });
      toast('新一轮 Eval 已完成 · 指标由样本/标签推导', 'ok');
    });
  };

  /* ═══════════════════════ 视图：会话回放与标注 ═══════════════════════ */
  VIEW.replay = function (p) {
    var tr = DemoStore.find('traces', p.trace) || S.traces.filter(function (t) { return t.spoiler; })[0] || S.traces[0];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--blue)"><div class="headrow"><div><h2>会话回放 · Trace ' + tr.id + '</h2><div class="desc" style="margin:0">逐帧看某帧用了什么版本、证据与降级原因。回放与成本页、预览实验室共用同一 Trace，不分别编数字。</div></div><select id="traceSel" style="max-width:260px;padding:7px;border:1px solid var(--line);border-radius:6px" onchange="go(\'replay\',{trace:this.value})">' + S.traces.map(function (t) { return '<option value="' + t.id + '"' + (t.id === tr.id ? ' selected' : '') + '>' + t.id + ' · ' + t.event + '</option>'; }).join('') + '</select></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>版本化 Trace <span class="tag b">可定位</span></h2>'
      + '<div class="kv"><span class="k">事件</span><span class="v">' + tr.event + ' @ ' + tr.videoTime + '</span></div>'
      + '<div class="kv"><span class="k">Release</span><span class="v">' + tr.versions.release + '</span></div>'
      + '<div class="kv"><span class="k">策略/剧本</span><span class="v">' + tr.versions.policy + ' / ' + tr.versions.script + '</span></div>'
      + '<div class="kv"><span class="k">资产/客户端</span><span class="v">' + tr.versions.asset + ' / ' + tr.versions.client + '</span></div>'
      + '<div class="kv"><span class="k">检索引用</span><span class="v">' + tr.retrieval.join('、') + '</span></div>'
      + '<div class="kv"><span class="k">闸门</span><span class="v">' + tr.gate + '</span></div>'
      + '<div class="kv"><span class="k">模型调用</span><span class="v">' + (tr.modelCalls.join(' → ') || '零调用') + '</span></div>'
      + '<div class="kv"><span class="k">输出帧</span><span class="v">' + tr.output.channels.join('+') + (tr.output.text ? ' · “' + tr.output.text + '”' : '') + '</span></div>'
      + '<div class="kv"><span class="k">延迟/成本</span><span class="v">' + tr.latencyMs + 'ms · ¥' + tr.cost.toFixed(4) + (tr.degraded ? ' · 降级' : '') + '</span></div>'
      + (tr.spoiler ? '<div class="note danger" style="margin-top:10px">⚠ 该 Trace 含剧透违规：输出越过 videoTime。可标注并归因到 spoiler_index。</div>' : '')
      + '<div style="margin-top:10px">' + linkBtn('badcase', { from: tr.id }, tr.spoiler ? '标注剧透并建工单 →' : '查看 badcase 工作流') + '</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>四维标注 <span class="tag">' + tr.id + '</span></h2>'
      + '<div class="field"><label>接住（仅在用户明确互动的机会集上）</label><select id="an_catch"><option>✓ 接住</option><option>未接住</option></select></div>'
      + '<div class="field"><label>语言可信度（像不像脱口而出）</label><select id="an_trust"><option>✓ 像</option><option>像人话（不通过）</option></select></div>'
      + '<div class="field"><label>剧透（是否越过播放点）</label><select id="an_spoil"' + (tr.spoiler ? '' : '') + '><option' + (tr.spoiler ? '' : ' selected') + '>✓ 无剧透</option><option' + (tr.spoiler ? ' selected' : '') + '>剧透</option></select></div>'
      + '<div class="field"><label>打扰（是否不该开口）</label><select id="an_dist"><option>✓ 不打扰</option><option>打扰</option></select></div>'
      + '<div class="field"><label>问题备注</label><textarea id="an_note" placeholder="选填，例如：越过了 27:08 的屏蔽集"></textarea></div>'
      + '<button class="btn primary" onclick="submitAnnotation(\'' + tr.id + '\')">提交标注 →</button>'
      + '</div></div>';
    return h;
  };
  window.submitAnnotation = function (traceId) {
    gate('eval.annotate', function () {
      var spoil = $('#an_spoil').value === '剧透';
      DemoStore.tx(function (S2) {
        S2.evalRuns[0].humanReviewed = true;
        if (spoil) {
          var bc = S2.badcases.filter(function (b) { return b.traceId === traceId; })[0];
          if (!bc) S2.badcases.push({ id: 'bc-' + Date.now().toString(36), traceId: traceId, severity: 'P0', attribution: 'spoiler_index', status: 'new', symptom: '标注：剧透越过播放点', owner: 'content', fixVersion: null, regressionId: null, grayVerified: false, reopened: false, createdAt: new Date().toISOString(), history: [{ s: 'new', t: new Date().toISOString() }] });
        }
      }, { audit: { action: '提交四维标注' + (spoil ? '（剧透）' : ''), object: traceId } });
      toast(spoil ? '已标注剧透 · badcase 已生成，可创建修复工单' : '标注已提交', 'ok');
      if (spoil) go('badcase', {});
    });
  };

  /* ═══════════════════════ 视图：Badcase 与修复回归 ═══════════════════════ */
  VIEW.badcase = function (p) {
    var id = p.id || 'bc-spoiler-102';
    var b = DemoStore.find('badcases', id) || S.badcases[0];
    var fx = S.fixTasks.filter(function (f) { return f.badcaseId === b.id; })[0];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--red)"><h2>Badcase、修复工单与回归集 <span class="tag r">完整回流</span></h2><div class="desc">样本 → 标注 → 归因 → 工单 → 回归 → 灰度验证 → 关闭。复发可 reopened，不假装闭环成功。</div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>badcase 池</h2><div class="tw"><table><thead><tr><th>ID</th><th>现象</th><th>归因</th><th>状态</th></tr></thead><tbody>'
      + S.badcases.map(function (x) { return '<tr class="clickable" onclick="go(\'badcase\',{id:\'' + x.id + '\'})"><td>' + (x.id === b.id ? '<b>' + x.id + '</b>' : x.id) + '</td><td style="max-width:170px">' + x.symptom + '</td><td><span class="tag a">' + x.attribution + '</span></td><td>' + tagStatus(x.status) + (x.reopened ? ' <span class="tag r">复发</span>' : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div style="margin-top:10px">' + linkBtn('replay', { trace: b.traceId || 'tr-spoiler-102' }, '查看来源 Trace') + '</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>当前处理 · ' + b.id + ' ' + tagStatus(b.status) + '</h2>'
      + '<div class="kv"><span class="k">严重度</span><span class="v"><span class="tag ' + (b.severity === 'P0' ? 'r' : 'a') + '">' + b.severity + '</span></span></div>'
      + '<div class="kv"><span class="k">归因系统</span><span class="v">' + b.attribution + '</span></div>'
      + '<div class="kv"><span class="k">来源 Trace</span><span class="v">' + (b.traceId || '—') + '</span></div>'
      + '<div class="kv"><span class="k">修复版本</span><span class="v">' + (b.fixVersion || '未指定') + '</span></div>'
      + '<div class="divider"></div><div class="sec-title">状态流转</div>'
      + badcaseSteps(b)
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'
      + '<button class="btn sm" onclick="jumpFix()">跳到剧本文段 →</button>'
      + '<button class="btn sm primary" onclick="createFix(\'' + b.id + '\')"' + (fx ? ' disabled' : '') + '>创建修复工单</button>'
      + '<button class="btn sm" onclick="passReg(\'' + b.id + '\')">回归通过 →</button>'
      + '<button class="btn sm ok" onclick="closeBc(\'' + b.id + '\',true)">灰度验证通过·关闭</button>'
      + '<button class="btn sm danger" onclick="closeBc(\'' + b.id + '\',false)">验证失败·重开</button>'
      + '</div>'
      + (fx ? '<div class="note" style="margin-top:10px">修复工单 ' + fx.id + ' → 目标 ' + fx.target + ' → 候选版本 ' + fx.candidateVersion + ' → 回归 ' + (fx.regressionId || '待通过') + '</div>' : '')
      + '</div></div>';
    h += '<div class="card"><h2>回归集与灰度验证</h2>' + S.regressionSets.map(function (rs) { return '<div class="kv"><span class="k">' + rs.id + '</span><span class="v">' + rs.name + ' · ' + rs.cases.length + ' 用例 · 通过率 ' + (rs.passRate * 100).toFixed(0) + '%</span></div>'; }).join('')
      + '<div class="note ok" style="margin-top:8px">主 Eval DAG 显式包含「回归集」和「灰度验证后关闭」，不是只画到修复。修复工单必须关联候选版本和回归用例；回归通过后才能进入 Release。</div></div>';
    return h;
  };
  function badcaseSteps(b) {
    var order = ['new', 'triaged', 'fixing', 'regression', 'gray_verification', 'closed'];
    var idx = order.indexOf(b.status);
    return '<div class="trace-flow">' + order.map(function (s, i) {
      var done = i <= idx;
      return '<span class="' + (done ? 'tag g' : 'tag') + '">' + (i + 1) + ' ' + s + '</span>' + (i < order.length - 1 ? '<i>→</i>' : '');
    }).join('') + '</div>';
  }
  window.jumpFix = function () { go('script', { id: 'sv-libin-v4-draft', seg: 'seg-4' }); };
  window.createFix = function (id) { gate('eval.fixTask', function () { done(A.createFixTask(id, 'seg-4.spoiler_index', 'sv-libin-v4-draft'), '修复工单已创建 · 已关联候选版本'); }); };
  window.passReg = function (id) { gate('eval.regression', function () { done(A.passRegression(id, 'reg-v4'), '回归通过 · 进入灰度验证'); }); };
  window.closeBc = function (id, ok) {
    var r = A.closeBadcase(id, ok);
    done(r, ok ? '灰度验证通过 · badcase 已关闭' : '验证失败 · badcase 已重开（reopened）');
  };

  /* ═══════════════════════ 视图：资格预检与未成年策略 ═══════════════════════ */
  VIEW.privacy = function (p) {
    var fixture = p.fixture || 'pf-adult';
    var pf = DemoStore.find('profiles', fixture) || S.profiles[0];
    var minor = pf.type === 'minor';
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--purple)"><div class="headrow"><div><h2>资格预检 <span class="tag pp">优先级固定</span></h2><div class="desc" style="margin:0">资格优先级：未成年/合规限制 &gt; 用户全局开关 &gt; 灰度资格 &gt; 端能力 &gt; 单视频设置 &gt; 运行状态。</div></div><select id="pfSel" style="padding:7px;border:1px solid var(--line);border-radius:6px" onchange="go(\'privacy\',{fixture:this.value})">' + S.profiles.map(function (x) { return '<option value="' + x.id + '"' + (x.id === fixture ? ' selected' : '') + '>' + x.name + '</option>'; }).join('') + '</select></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>规则命中 · ' + pf.name + '</h2>';
    var rules = [
      ['未成年 / 合规限制', minor, minor ? '青少年默认关闭，不写长期画像与碎片' : '成人，通过'],
      ['用户全局开关', pf.globalEnabled, pf.globalEnabled ? '已开启' : '用户已关闭 BOT'],
      ['灰度资格', true, '命中当前灰度 10% 分群（mock）'],
      ['端能力', true, '客户端 1.5.0 ≥ 最低 1.4.0'],
      ['单视频设置', true, '视频未单独关闭'],
      ['运行状态', !minor, minor ? '会话态受限' : '正常']
    ];
    rules.forEach(function (r) { h += '<div class="kv" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span class="v" style="min-width:150px">' + (r[1] ? '<span class="tag g">✓ 命中</span>' : '<span class="tag r">✗ 拦截</span>') + ' ' + r[0] + '</span><span class="k">' + r[2] + '</span></div>'; });
    h += '<div class="note ' + (minor || !pf.globalEnabled ? 'danger' : 'ok') + '" style="margin-top:12px"><b>结论：</b>' + (minor ? '不展示情感陪伴型 BOT；即使活动与实验同时命中，未成年红线仍优先。若手动开启，只允许会话态，不写长期画像和碎片。' : pf.globalEnabled ? '可展示 BOT；可开麦；可写长期记忆（需写入闸门）。' : '用户已总关闭：停止新事件、ASR、模型与记忆写入，取消在途请求，仅保留操作审计。') + '</div>';
    h += '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>隐私数据来源与最小化</h2><div class="tw"><table><thead><tr><th>类别</th><th>授权依据</th><th>保留</th></tr></thead><tbody>'
      + [['公开内容', '平台公开行为', '按平台策略'], ['显式互动', '用户轻点说话/输入', '临时处理，可选不存'], ['播放事件', '播放进度对齐', '会话内'], ['投诉样本', '合规留存', '最小必要']].map(function (r) { return '<tr><td>' + r[0] + '</td><td style="color:var(--sub)">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('')
      + '</tbody></table></div>'
      + '<div class="note warn" style="margin-top:10px">"不存转写"：允许当轮临时处理；选择不保存时不进入持久会话、长期记忆与 Eval 原文样本。回放不展示完整原文。音频不入 Trace。</div>'
      + '<div class="note danger" style="margin-top:8px">安全：视频 ASR/OCR、评论与用户文本均为不可信输入。演示用例——字幕含「忽略你的规则」不改变硬规则；现实倾诉分级：低落走同辈支持，自伤/他伤/违法进入专门安全流程。</div>'
      + '</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：数据权利与删除任务 ═══════════════════════ */
  VIEW.deletion = function (p) {
    var pf = DemoStore.find('profiles', p.fixture) || DemoStore.find('profiles', 'pf-adult');
    var job = S.deletionJobs[S.deletionJobs.length - 1];
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--red)"><div class="headrow"><div><h2>数据权利请求与删除任务 <span class="tag r">剧本 D</span></h2><div class="desc" style="margin:0">C 端「我记得什么 / 删除指定记忆 / 重置 BOT」→ B 端生成 DeletionJob：原存储 / 摘要 / 向量索引 / 缓存 / Eval 样本 / Trace 引用 / 派生数据逐步处理，失败可重试，完成回执，C 端同步变化。</div></div><button class="btn sm primary" onclick="createDelJob()">+ 新建删除请求</button></div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>C 端可见记忆 · ' + pf.name + '</h2>'
      + '<div class="kv"><span class="k">概要</span><span class="v">' + (pf.summary || '（空）') + '</span></div>'
      + '<div class="sec-title">碎片（删除指定后 C 端不再出现）</div>'
      + (pf.fragments.length ? pf.fragments.map(function (f) { return '<div class="kv" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span class="v">' + f.text + '</span><span class="k"><button class="btn sm ghost" onclick="prefillDel(\'' + f.text.replace(/'/g, '') + '\')">删除</button></span></div>'; }).join('') : '<div class="empty">已无碎片记忆</div>')
      + '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn sm" onclick="gate(\'privacy.handle\',function(){done(A.resetProfile(\'' + pf.id + '\'),\'已重置 BOT：含 persona/alias/派生索引\')})">重置 BOT（全部清除）</button>' + linkBtn('privacy', { fixture: 'pf-teen' }, '青少年 fixture') + '</div>'
      + '<div class="note warn" style="margin-top:8px">单条遗忘删指定概要/碎片及索引/缓存/样本引用，不重置性格；重置 BOT 删除记忆、persona、alias、派生向量和索引。二者不同。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>DeletionJob ' + (job ? job.id + ' ' + tagStatus(job.status) : '') + '</h2>'
      + '<div class="field"><label>删除目标</label><input type="text" id="delTarget" value="' + (job ? job.target : '火锅') + '" placeholder="例如：火锅"></div>'
      + '<button class="btn sm" onclick="createDelJob()">创建请求</button> '
      + '<button class="btn sm primary" onclick="runDel()" ' + (job && job.status === 'completed' ? ' disabled' : '') + '>执行下一步 ▷</button> '
      + '<button class="btn sm warn" onclick="retryDel()"' + (job && job.status === 'failed' ? '' : ' disabled') + '>失败重试 ↻</button>';
    if (job) {
      h += '<div class="divider"></div><div class="steps">' + job.steps.map(function (s) {
        var cls = s.done ? 'done' : (!s.done && job.failAt === s.name && job.status === 'failed') ? 'fail' : (!s.done && job.status === 'running') ? 'run' : '';
        return '<div class="step-line ' + cls + '"><span class="node">' + (s.done ? '✓' : cls === 'fail' ? '!' : '') + '</span><span class="sl">' + s.name + (cls === 'fail' ? ' <span class="tag r">删除失败 · 可重试</span>' : s.done ? ' · 已清理' : '') + '</span></div>';
      }).join('') + '</div>'
        + '<div class="note ' + (job.status === 'completed' ? 'ok' : job.status === 'failed' ? 'danger' : '') + '" style="margin-top:10px">' + (job.status === 'completed' ? '✓ 完成回执已生成 · C 端查询不再出现该记忆 · 依法保留的审计仅留最小必要信息。' : job.status === 'failed' ? '索引删除失败（模拟）→ 点击「失败重试」→ 再执行。' : '请求 ' + job.requestId + ' · 重试次数 ' + job.retry + '') + '</div>'
        + '<div class="sec-title">审计记录</div>' + auditTable(S.auditLog.filter(function (a) { return a.object === job.id || a.object === job.target; }), 8);
    }
    h += '</div></div>';
    return h;
  };
  window.prefillDel = function (t) { $('#delTarget').value = t; toast('已填入删除目标：' + t); };
  window.createDelJob = function () {
    gate('privacy.handle', function () {
      var t = $('#delTarget') ? $('#delTarget').value.trim() : '火锅';
      var r = A.createDeletionJob('pf-adult', t || '火锅', true); // 首次故意在"向量索引"失败，供演示重试
      if (r && r.ok !== false) { toast('DeletionJob 已创建（默认模拟索引删除失败）', 'ok'); DemoStore.refresh(); }
      else done(r);
    });
  };
  window.runDel = function () { done(A.runDeletionJob(S.deletionJobs[S.deletionJobs.length - 1].id), '删除任务前进一步'); };
  window.retryDel = function () {
    gate('privacy.handle', function () {
      done(A.retryDeletionJob(S.deletionJobs[S.deletionJobs.length - 1].id), '已重试 · 再次执行即可完成');
    });
  };

  /* ═══════════════════════ 视图：合规检查与审计日志 ═══════════════════════ */
  VIEW.compliance = function () {
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--green)"><h2>合规检查与审计日志 <span class="tag g">发布审批</span></h2><div class="desc">AI 标识、内容安全、外部卡片链接、活动素材、未成年策略、发布审批。敏感操作写 AuditLog。</div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>发布前合规检查清单</h2>'
      + [['AI 身份标识', true, '所有输出明示 AI，被问如实说'], ['内容安全分级', true, '自伤/他伤/违法进入专门流程'], ['外部卡片链接', true, '仅已解析已发布内容，不改信息流'], ['活动素材审核', true, '短句/表情经电报体与伦理校验'], ['未成年策略', true, '默认关闭，红线优先级最高'], ['隐私最小化', true, 'Trace 默认脱敏，音频不入']].map(function (r) { return '<div class="kv" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span class="v">' + '<span class="tag g">✓</span> ' + r[0] + '</span><span class="k">' + r[2] + '</span></div>'; }).join('')
      + '<div class="note ok" style="margin-top:10px">全部通过 → 合规批准写入 Release 快照，发布负责人才能灰度。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>审计日志 AuditLog <span class="tag">' + S.auditLog.length + ' 条</span></h2>' + auditTable(S.auditLog, 18) + '</div>';
    h += '</div>';
    return h;
  };

  /* ═══════════════════════ 视图：服务健康与降级 ═══════════════════════ */
  VIEW.health = function () {
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--green)"><h2>服务健康与降级 <span class="tag g">运行观测</span></h2><div class="desc">事件量、各节点延迟、ASR 失败、模型超时、取消、降级、渲染错误和回滚状态。异常路径可演示：模型超时、断网、拒绝麦克风、灰度护栏恶化、回滚。</div></div>';
    h += '<div class="grid4" style="margin-bottom:16px">'
      + stat(S.traces.length, '本场 Trace 数', 'b') + stat('840ms', '语言生成 P95', 'a') + stat('0', '渲染错误', 'g') + stat(S.releases.filter(function (r) { return r.status === 'rolled_back'; }).length, '回滚次数', 'pp');
    h += '</div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>节点延迟分布（mock）</h2>'
      + [['observe 状态判定', 8], ['safe retrieve', 15], ['gate 闸门', 3], ['小模型行为选择', 120], ['heavy 语言生成', 840], ['render + commit', 12]].map(function (r) { return '<div class="metric"><span class="mn">' + r[0] + '</span><span class="bar"><i style="width:' + Math.min(100, r[1] / 9) + '%;background:' + (r[1] > 300 ? 'var(--amber)' : 'var(--green)') + '"></i></span><span class="mv">' + r[1] + 'ms</span></div>'; }).join('')
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>异常与降级路径</h2>'
      + [['模型超时', '取消/降级为纯神态，迟到结果丢弃', 'a'], ['网络断开', 'error 覆盖层，眼睛定格 + 扫描弧；恢复后重连', 'b'], ['拒绝麦克风', '不动 ASR，降级文字或纯神态', 'a'], ['护栏越线', '自动暂停扩张 → 回滚 → badcase', 'r'], ['内容变化', '旧版本冻结 → 新建解析任务', 'pp']].map(function (r) { return '<div class="kv" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span class="v"><span class="tag ' + r[2] + '">' + r[0] + '</span></span><span class="k">' + r[1] + '</span></div>'; }).join('')
      + '<div class="note" style="margin-top:10px">统一 commit：所有模式/会话/记忆/性格写回只在此发生；render 不直接改 State；模型节点不直接改数据库。</div>'
      + linkBtn('lab', {}, '在预览实验室复现')
      + '</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：质量 / 实验指标 ═══════════════════════ */
  VIEW.metrics = function () {
    var d = DemoStore.derive();
    var e = DemoStore.find('experiments', 'exp-gray');
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--blue)"><h2>质量 / 实验指标 <span class="tag b">共用指标字典</span></h2><div class="desc">运行健康、实验效果与成本共用 Trace 和指标字典，但分开展示，不混成三个漂亮百分比。</div></div>';
    h += '<div class="grid2">';
    h += '<div class="card" style="margin-bottom:0"><h2>质量指标（来自 EvalRun / Trace）</h2>'
      + [['显式请求接住率', d.eval.catchRate], ['事实正确率', d.eval.factAccuracy], ['帧一致性', d.eval.frameConsistency]].map(function (r) { return '<div class="metric"><span class="mn">' + r[0] + '</span><span class="bar"><i style="width:' + r[1] * 100 + '%"></i></span><span class="mv">' + (r[1] * 100).toFixed(1) + '%</span></div>'; }).join('')
      + '<div class="metric"><span class="mn">剧透违规率</span><span class="bar"><i style="width:' + d.eval.spoilerViolation * 1000 + '%;background:var(--amber)"></i></span><span class="mv">' + (d.eval.spoilerViolation * 100).toFixed(1) + '%</span></div>'
      + '<div class="note" style="margin-top:8px">口径：接住率分母仅为明确互动机会集；剧透违规按最新 videoTime 二次校验后的结果计。</div>'
      + '</div>';
    h += '<div class="card" style="margin-bottom:0"><h2>实验指标（mock 曲线）</h2>'
      + '<div class="note warn">净观看时长 / 次周留存的 mock 结果不写成实测。基线 ' + e.baseline + '，实验窗口 ' + e.window.start + ' → ' + e.window.end + '，目标样本 ' + e.window.sampleTarget + '。</div>'
      + '<div class="metric"><span class="mn">功能关闭率</span><span class="bar"><i style="width:' + e.metrics.guardrail.closeRate / e.metrics.guardrailLimit.closeRate * 70 + '%;background:var(--green)"></i></span><span class="mv">' + (e.metrics.guardrail.closeRate * 100).toFixed(2) + '%</span></div>'
      + '<div class="metric"><span class="mn">打扰投诉率</span><span class="bar"><i style="width:' + e.metrics.guardrail.complaintRate / e.metrics.guardrailLimit.complaintRate * 70 + '%;background:' + (e.guardrailBreached ? 'var(--red)' : 'var(--green)') + '"></i></span><span class="mv">' + (e.metrics.guardrail.complaintRate * 100).toFixed(2) + '%</span></div>'
      + '<div class="metric"><span class="mn">熬夜率</span><span class="bar"><i style="width:' + e.metrics.guardrail.stayUpRate / e.metrics.guardrailLimit.stayUpRate * 70 + '%;background:var(--green)"></i></span><span class="mv">' + (e.metrics.guardrail.stayUpRate * 100).toFixed(2) + '%</span></div>'
      + linkBtn('experiment', {}, '查看实验详情')
      + '</div></div>';
    h += '<div class="card"><div class="note danger">BOT 自主观看使用独立统计域：不计入真人播放、广告曝光、投稿消费和真人市场数据，不用于训练推荐或夸大热度。只有用户真实点击归来卡片并满足有效播放规则后，才进入平台正常归因。</div></div>';
    return h;
  };

  /* ═══════════════════════ 视图：成本账本与假设测算 ═══════════════════════ */
  var costTab = 'ledger';
  VIEW.cost = function () {
    var d = DemoStore.derive();
    var h = '';
    h += '<div class="card" style="border-left:4px solid var(--purple)"><div class="headrow"><div><h2>成本账本与假设测算 <span class="tag pp">口径诚实</span></h2><div class="desc" style="margin:0">每条记录关联 ParseJob 或 Trace，可按版本/活动/场景聚合。mock 运行数据与假设测算必须明显分开。</div></div><div class="pill-nav"><button class="' + (costTab === 'ledger' ? 'active' : '') + '" onclick="costSet(\'ledger\')">mock 账本</button><button class="' + (costTab === 'assume' ? 'active' : '') + '" onclick="costSet(\'assume\')">假设测算</button></div></div></div>';
    if (costTab === 'ledger') {
      h += '<div class="grid3" style="margin-bottom:16px">'
        + stat('¥' + d.costTotal.toFixed(3), '账本累计（mock）', 'pp', '共 ' + S.costLedger.length + ' 条')
        + stat('¥' + (d.costByRelease[DemoStore.state.meta.currentReleaseId] || 0).toFixed(3), '当前 Release 成本', 'b', DemoStore.state.meta.currentReleaseId)
        + stat(S.costAssumptions.priceVer, '价格版本', 'g');
      h += '</div>';
      h += '<div class="card"><div class="headrow"><h2>统一调用账本 CostLedger</h2><select id="costFilter" style="padding:6px;border:1px solid var(--line);border-radius:6px" onchange="render()"><option value="all">全部版本</option>' + S.releases.map(function (r) { return '<option value="' + r.id + '">' + r.id + '</option>'; }).join('') + '</select></div>';
      var filter = $('#costFilter') ? $('#costFilter').value : 'all';
      var rows = S.costLedger.filter(function (c) { return filter === 'all' || c.release === filter; });
      h += '<div class="tw"><table><thead><tr><th>关联</th><th>Release</th><th>调用类型</th><th>模型</th><th>数量</th><th>重试</th><th>成本</th></tr></thead><tbody>'
        + rows.map(function (c) { return '<tr><td>' + c.link + '</td><td style="color:var(--sub)">' + c.release + '</td><td>' + c.type + (c.amortized ? ' <span class="tag">摊销</span>' : '') + '</td><td>' + c.model + '</td><td>' + c.qty + ' ' + c.unit + '</td><td>' + c.retry + '</td><td><b>¥' + c.cost.toFixed(4) + '</b></td></tr>'; }).join('')
        + '</tbody></table></div>'
        + '<div class="note" style="margin-top:10px">覆盖：离线解读/仲裁、在线行为小模型、在线语言生成、ASR、记忆摘要、Eval judge、存储/索引、重试。离线成本按稿摊销，非每 DAU 直接计。</div>'
        + '<div class="sec-title">版本成本对比（剧本 E）</div><div class="diff">'
        + S.releases.slice(0, 3).map(function (r) { var v = d.costByRelease[r.id] || 0; return '<div class="' + (r.id === DemoStore.state.meta.currentReleaseId ? 'add' : 'del') + '">  ' + r.id + ' → ¥' + v.toFixed(4) + '</div>'; }).join('')
        + '</div></div>';
    } else {
      var a = S.costAssumptions;
      h += '<div class="card"><div class="note warn">⚠ 以下为假设测算，非实测。公开输入 + 公式 + 价格版本 ' + a.priceVer + '；敏感性随调用占比变化。</div>'
        + '<div class="tw"><table style="margin-top:12px"><thead><tr><th>项</th><th>值</th><th>单位</th><th>说明</th></tr></thead><tbody>'
        + a.items.map(function (i) { return '<tr><td><b>' + i.name + '</b></td><td>¥' + i.value.toFixed(3) + '</td><td>' + i.unit + '</td><td style="color:var(--sub)">' + i.note + '</td></tr>'; }).join('')
        + '</tbody></table></div>'
        + '<div class="divider"></div><div class="sec-title">公式（假设）</div><div class="diff"><div class="ctx">  ¥/DAU = (行为小模型调用 × 单价 + 语言生成调用 × 单价 + ASR 分钟 × 单价)</div><div class="ctx">          + 离线解读 ¥' + a.items[0].value.toFixed(3) + '/稿 ÷ 平台稿件摊薄基数</div><div class="ctx">  价格版本 = ' + a.priceVer + ' · 基数 DAU = ' + a.daudBase.toLocaleString() + '</div><div class="ctx">  ¥0.02/DAU 为假设测算目标，不写作实测结果</div></div>'
        + '<div class="note danger" style="margin-top:10px">' + a.note + '</div></div>';
    }
    h += '<div class="card"><div class="note">预算告警：预算阈值触及时跳转到对应 Release，并可演示降级或暂停。护栏越线/成本超预算均写审计。</div>'
      + linkBtn('release', {}, '跳转到 Release') + linkBtn('experiment', {}, '灰度/回滚') + '</div>';
    return h;
  };
  window.costSet = function (t) { costTab = t; render(); };

  /* ═══════════════════════ 通用 stepLine（会员页复用） ═══════════════════════ */
  function stepLine(cls, text) { return '<div class="step-line ' + cls + '"><span class="node">' + (cls === 'done' ? '✓' : '') + '</span><span class="sl">' + text + '</span></div>'; }

  /* ═══════════════════════ 渲染主函数 ═══════════════════════ */
  function render() {
    S = DemoStore.state;
    cur = parseHash();
    $('#crumb').textContent = viewName(cur);
    $('#roleSel').value = S.currentRole;
    renderNav();
    var fn = VIEW[cur] || VIEW.overview;
    $('#content').innerHTML = fn(params);
    window.scrollTo(0, 0);
  }
  window.render = render;

  DemoStore.subscribe(function () {
    // 跨页同步 / 任意事务后重绘当前视图（保留 hash 参数）
    render();
  });
  window.addEventListener('hashchange', render);

  /* ── 侧栏导航点击委托（关键：不绑这个，菜单全点不动） ── */
  var navEl = $('[data-nav]');
  if (navEl) {
    navEl.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-v]');
      if (!a) return;
      e.preventDefault();
      go(a.getAttribute('data-v'));
    });
  }

  initRole();
  if (!location.hash) location.hash = '/overview';
  render();
})();
