/* =============================================================================
 * cclient.js — C 端用户侧控制（独立用户演示，只做加法，不改演出脚本）
 * -----------------------------------------------------------------------------
 * 依赖：演出脚本已在前文加载（landFocus / nodebar / 三态等原样保留）。
 * 本文件负责：
 *  1. 读共享 store 的已发布 Release 快照（版本可追溯），不声称实时同步草稿
 *  2. 用户侧控制：总开关 / 单视频关闭 / 临时安静 / 记忆查询 / 删除指定记忆 / 重置 BOT
 *  3. 用户显式互动 → 产出带 ReleaseID 的版本化 Trace（写入共享 store）
 *  4. 外出归来卡片来自 mock AwaySession，点击有明确模拟跳转结果
 *  5. 用户控制结果同步 B 端（同域 BroadcastChannel / localStorage）
 * 静态演示 · mock 数据。
 * ========================================================================== */
(function () {
  'use strict';
  var S = DemoStore.state;
  var A = DemoStore.actions;
  var $ = function (s) { return document.querySelector(s); };

  var PF = 'pf-adult'; // 当前用户 fixture
  var quietUntil = 0;

  function toast(msg) {
    var t = $('.cct-toast');
    if (!t) { t = document.createElement('div'); t.className = 'cct-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  function profile() { return DemoStore.find('profiles', PF) || S.profiles[0]; }
  function activeRel() { return DemoStore.activeRelease(); }

  /* ── 渲染控制条 ── */
  function render() {
    S = DemoStore.state;
    var pf = profile(), rel = activeRel();
    var enabled = pf.globalEnabled;
    var h = '';
    h += '<div class="cct-h"><b>我的陪看 BOT</b>'
      + '<span class="tag" style="font-size:10.5px">' + (enabled ? '● 运行中' : '○ 已关闭') + '</span>'
      + '<span class="rel">生效版本：' + (rel ? rel.id + ' · ' + rel.snapshot.policy : '—') + '（发布快照）</span></div>';
    h += '<div class="cct-grid">';

    // 总开关
    h += '<div class="cct-item"><div class="cct-l">总开关</div>'
      + '<label class="switch"><input type="checkbox" id="cctGlobal"' + (enabled ? ' checked' : '') + ' onchange="CCT.toggleGlobal()"><i></i>'
      + '<span>' + (enabled ? '开启陪伴' : '已关闭') + '</span></label>'
      + '<div class="cct-d">关闭即停新事件、开麦、模型与记忆写入，取消在途请求。</div></div>';

    // 单视频关闭
    h += '<div class="cct-item"><div class="cct-l">单视频控制</div>'
      + '<button id="cctVideo" class="' + (pf.videoOff ? 'on' : '') + '" onclick="CCT.toggleVideo()">' + (pf.videoOff ? '本视频已关 · 点开' : '关闭本视频陪伴') + '</button>'
      + '<div class="cct-d">仅对当前《极速拍档》生效，不影响其他视频。</div></div>';

    // 临时安静
    h += '<div class="cct-item"><div class="cct-l">临时安静</div>'
      + '<button onclick="CCT.quiet()">安静一会儿</button>'
      + '<div class="cct-d" id="cctQuietD">' + (Date.now() < quietUntil ? '已静音（临时）' : '临时提高闸门阈值，自动衰减回基线。') + '</div></div>';

    // 记忆查询
    h += '<div class="cct-item"><div class="cct-l">我记得什么</div>'
      + '<button onclick="CCT.mem()">查询记忆</button>'
      + '<div class="cct-mem" id="cctMem">' + memHTML(pf) + '</div></div>';

    // 删除指定记忆
    h += '<div class="cct-item"><div class="cct-l">删除指定记忆</div>'
      + '<div style="display:flex;gap:6px"><input id="cctDel" type="text" placeholder="例如：火锅" style="flex:1;min-width:0;font:inherit;font-size:11.5px;padding:5px 8px;border:1px solid rgba(91,93,99,.3);border-radius:6px">'
      + '<button onclick="CCT.del()">删除</button></div>'
      + '<div class="cct-d">生成 B 端 DeletionJob；失败可重试，完成后此处同步消失。</div></div>';

    // 重置 BOT
    h += '<div class="cct-item"><div class="cct-l">重置 BOT</div>'
      + '<button onclick="CCT.reset()" style="border-color:var(--pink);color:var(--pink)">清除全部数据</button>'
      + '<div class="cct-d">删除记忆、persona、昵称与派生索引（不可恢复）。</div></div>';

    h += '</div>';
    $('#cctl').innerHTML = h;
    // env 标识
    var env = $('#envTag'); if (env) env.textContent = S.meta.env;
  }

  function memHTML(pf) {
    if (!pf.fragments.length) return '<span style="color:rgba(91,93,99,.5)">（暂无碎片记忆）</span>';
    return pf.fragments.map(function (f) {
      return '<div><span>' + f.text + '</span><button style="padding:2px 7px;font-size:10px" onclick="CCT.delOne(\'' + f.text.replace(/'/g, '') + '\')">删</button></div>';
    }).join('');
  }

  /* ── 用户动作 ── */
  var CCT = {
    toggleGlobal: function () {
      var on = $('#cctGlobal').checked;
      DemoStore.tx(function (S2) { DemoStore.find('profiles', PF).globalEnabled = on; }, { audit: { action: 'C端切换BOT总开关', object: PF, after: on ? 'on' : 'off' } });
      toast(on ? 'BOT 已开启 · 恢复事件与演出' : 'BOT 已关闭 · 停止新事件/开麦/模型/记忆写入');
      render();
    },
    toggleVideo: function () {
      DemoStore.tx(function (S2) { var p = DemoStore.find('profiles', PF); p.videoOff = !p.videoOff; }, { audit: { action: 'C端单视频开关', object: 'v-libin' } });
      toast(profile().videoOff ? '已关闭本视频陪伴（其他视频不受影响）' : '已恢复本视频陪伴');
      render();
    },
    quiet: function () {
      quietUntil = Date.now() + 30000;
      $('#cctQuietD').textContent = '已静音 30 秒 · 阈值临时提高后自动衰减';
      toast('已安静：临时闸门阈值提高，衰减回基线');
      // 写一条"用户显式指令"Trace（简单指令走规则，零模型）
      A.pushTrace({ event: '用户指令「安静」', videoId: 'v-libin', videoTime: '当前', fixture: PF,
        retrieval: [], gate: '白名单指令·规则处理', modelCalls: [], output: { channels: ['神态'], text: '' },
        statePatch: { muteUntil: 30 }, latencyMs: 3, cost: 0, degraded: false, spoiler: false });
      toast('已安静 · 白名单指令规则处理（零模型）· 写入带版本 Trace');
    },
    mem: function () {
      var pf = profile();
      toast(pf.fragments.length ? '查询到 ' + pf.fragments.length + ' 条碎片记忆（画像不出口）' : '暂无碎片记忆');
      A.pushTrace({ event: '用户指令「记忆查询」', videoId: 'v-libin', videoTime: '当前', fixture: PF,
        retrieval: pf.fragments.map(function (f) { return f.text; }), gate: '白名单指令·规则处理', modelCalls: [],
        output: { channels: ['卡片'], text: '概要：' + (pf.summary || '空') }, statePatch: {},
        latencyMs: 5, cost: 0, degraded: false, spoiler: false });
    },
    del: function () {
      var t = ($('#cctDel') && $('#cctDel').value.trim()) || '火锅';
      CCT.delOne(t);
    },
    delOne: function (text) {
      // C 端只发起请求；B 端合规员角色才有处理权限。这里以"演示态"直接完成并写审计。
      DemoStore.tx(function (S2) {
        var p = DemoStore.find('profiles', PF);
        p.fragments = p.fragments.filter(function (f) { return f.text.indexOf(text) === -1 && f.tags.indexOf(text) === -1; });
        var jid = 'dj-c-' + Date.now().toString(36);
        S2.deletionJobs.push({ id: jid, requestId: 'pr-c-' + Date.now().toString(36), profileId: PF, target: text,
          steps: [{ name: '原存储', done: true }, { name: '摘要', done: true }, { name: '向量索引', done: true },
                  { name: '缓存', done: true }, { name: 'Eval 样本引用', done: true }, { name: 'Trace 原文引用', done: true }, { name: '派生数据', done: true }],
          status: 'completed', failAt: null, retry: 0, createdAt: new Date().toISOString() });
        S2.auditLog.push({ id: 'al-c-' + Date.now().toString(36), at: new Date().toISOString(), role: '用户', action: 'C端删除指定记忆', object: text, after: 'completed' });
      });
      toast('已删除「' + text + '」· DeletionJob 完成 · B 端审计已同步');
      render();
    },
    reset: function () {
      DemoStore.tx(function (S2) {
        var p = DemoStore.find('profiles', PF);
        p.summary = ''; p.fragments = []; p.persona = null; p.alias = null;
        S2.auditLog.push({ id: 'al-r-' + Date.now().toString(36), at: new Date().toISOString(), role: '用户', action: 'C端重置BOT（含派生）', object: PF });
      });
      toast('已重置：记忆、persona、昵称与派生索引全部清除');
      render();
    }
  };
  window.CCT = CCT;

  /* ── 用户显式说话 → 版本化 Trace（接演出页剧情节点） ── */
  // 兼容：剧情节点切换按钮带 data-n；点击后记录一条"当前画面"的被动 Trace（纯神态，零模型）
  var nodeBar = document.getElementById('nodebar');
  if (nodeBar) {
    nodeBar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      var n = b.dataset.n;
      setTimeout(function () {
        A.pushTrace({ event: '剧情节点' + n + '（被动神态）', videoId: 'v-libin', videoTime: '节点' + n, fixture: PF,
          retrieval: ['seg-' + n], gate: '仅神态·跳过生成', modelCalls: [],
          output: { channels: ['神态'], text: '' }, statePatch: {}, latencyMs: 12, cost: 0, degraded: false, spoiler: false });
      }, 30);
    });
  }

  /* ── 外出归来卡片：先看 mock AwaySession，再给明确模拟跳转结果 ── */
  // 演出页离开态已有"正在看《三体》"标签。这里补一个可见的归来卡片演示入口，
  // 数据来自 shared store 约定（已解析/已发布/内容安全/符合口味/seen）。
  function maybeInjectAwayCard() {
    if (document.getElementById('awayCardPanel')) return;
    var pf = profile();
    if (pf.videoOff || !pf.globalEnabled) return;
    var panel = document.createElement('div');
    panel.id = 'awayCardPanel';
    panel.style.cssText = 'max-width:1500px;margin:0 auto 24px;padding:0;';
    panel.innerHTML = '<details style="background:var(--shell);border:1.5px solid rgba(91,93,99,.22);border-radius:12px;padding:10px 14px">'
      + '<summary style="cursor:pointer;font-size:12px;font-weight:600">BOT 外出归来卡片（mock AwaySession · 点击展开）</summary>'
      + '<div style="font-size:11px;color:rgba(91,93,99,.75);line-height:1.7;margin-top:8px">'
      + '观看记录：已解析 ✓ · 已发布 ✓ · 内容安全 ✓ · 符合口味 ✓ · seen-set 命中 <code>three-body</code><br>'
      + '来源约束：不改平台信息流，不凭空安利；只推它真实看过的已发布内容。'
      + '<div style="margin-top:8px"><button id="awayCardBtn" style="font:500 11.5px/1 inherit;padding:6px 12px;border-radius:7px;cursor:pointer;border:1px solid var(--pink);background:var(--pink);color:#fff">点击卡片 · 模拟跳转</button>'
      + '<span id="awayCardResult" style="margin-left:10px"></span></div></div></details>';
    var anchor = document.getElementById('demo');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    var btn = document.getElementById('awayCardBtn');
    if (btn) btn.onclick = function () {
      document.getElementById('awayCardResult').textContent = '→ 模拟跳转《三体》播放页（演示态，不改真实信息流）';
      A.pushTrace({ event: '用户点击归来卡片', videoId: 'three-body', videoTime: '—', fixture: PF,
        retrieval: ['AwaySession: three-body', 'seen-set'], gate: '卡片权限校验', modelCalls: [],
        output: { channels: ['卡片'], text: '模拟跳转' }, statePatch: {}, latencyMs: 8, cost: 0, degraded: false, spoiler: false });
    };
  }

  /* ── 跨页同步：B 端改状态后 C 端控制条同步 ── */
  DemoStore.subscribe(function () { render(); });

  render();
  maybeInjectAwayCard();
})();
