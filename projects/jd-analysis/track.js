/* 使用记录（前端侧）：把「谁、什么时候、看了哪一页、停多久」攒成一批发给服务端（/api/usage）。
   设计口径：
     · localStorage 仍是唯一数据源——这里只发使用事件，不动任何档案数据（档案镜像见 app.js 的 mirrorHistory）；
     · 停留时长只在页面可见时计：切后台先结算，恢复可见再接着计，后台时间不算停留；
     · 攒 20 秒发一次；pagehide / 切后台用 sendBeacon 兜底（页面随时会被冻住，fetch 可能发不出去）；
     · 失败一律静默：离线、接口没部署、服务端报错都不影响页面任何行为。
   对外只暴露 window.Track = { clientId, view(name), event(type, payload) }，app.js 只调这几个。 */
(() => {
  const CLIENT_KEY = 'ai-jd-client-id-v1';
  const FLUSH_MS = 20000;      // 攒多久发一次
  const MAX_BATCH = 200;       // 一批最多 200 条（与服务端的上限对齐）
  const MAX_QUEUE = 500;       // 攒着发不出去时的上限：超了丢最旧的，别把内存撑大

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // 客户端 id：本机只生成一次，之后一直用它（换浏览器/清站点数据就是新客户端）
  let clientId = '';
  try {
    clientId = localStorage.getItem(CLIENT_KEY) || '';
    if (!clientId) {
      clientId = `c${uid()}`;
      localStorage.setItem(CLIENT_KEY, clientId);
    }
  } catch {
    clientId = `c${uid()}`;    // 隐私模式：本次会话用一个临时 id，不落盘
  }

  const sessionId = `s${uid()}`;
  const sessionStart = Date.now();
  let queue = [];
  let curView = '';            // 正在看的视图
  let viewSince = 0;           // 这一视图从哪一刻起计时（0＝没在计时，比如已切后台）
  let entered = false;         // 当前视图的 view_enter 记过没有（后台起的视图等转可见再记）

  function push(type, payload) {
    queue.push({ ...(payload || {}), type: String(type || 'event').slice(0, 40), at: Date.now(), sessionId });
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    if (queue.length >= MAX_BATCH) flush(false);
  }

  /* 结算上一个视图的停留：从 viewSince 到现在。
     切后台、切页、关页都会先结算一次；后台那段时间不计时（viewSince 清零），
     恢复可见时接着往后累，不补记 view_enter——「浏览次数」不会被切后台事件冲多。 */
  function settleView(at) {
    if (!curView || !viewSince) return;
    push('view_leave', { view: curView, ms: Math.max(0, at - viewSince) });
    viewSince = 0;
  }

  /* 切视图：Track.view(name)。name 用视图 id（home / report / analysis / history / resume / settings / self），
     与 app.js 的 nameOfView 一致；admin 看板上再翻成中文。 */
  function view(name) {
    const next = String(name || '').slice(0, 40);
    // 同一个视图被重复 show（启动还原 + 首屏补记会走到）：不重复记一条进入
    if (next === curView && viewSince) return;
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      // 后台切页（标签页是后台起的 / 页面在后台被切）：先结算上一页，这一页等转可见再记账计时
      settleView(now);
      curView = next;
      viewSince = 0;
      entered = false;
      return;
    }
    settleView(now);
    curView = next;
    viewSince = now;
    entered = true;
    push('view_enter', { view: next });
  }

  function event(type, payload) {
    push(type, payload);
  }

  /* 发送一批。useBeacon＝页面快要走了（切后台 / pagehide），走 sendBeacon：
     它由浏览器接管发送，页面被冻住也发得出去；这条路上失败就只能丢（页面已经没了）。
     普通定时发送失败则把事件放回队列，等下一轮再试（离线回来后不丢账）。 */
  function flush(useBeacon) {
    if (!queue.length) return;
    const events = queue.slice(0, MAX_BATCH);
    const body = JSON.stringify({ clientId, events });
    if (useBeacon && navigator.sendBeacon) {
      let sent = false;
      try {
        sent = navigator.sendBeacon('/api/usage', new Blob([body], { type: 'application/json' }));
      } catch {
        sent = false;
      }
      if (!sent) {
        fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
          .catch(() => { /* 静默：页面随时会走，发不出去就算了 */ });
      }
      queue = queue.slice(events.length);
      return;
    }
    queue = queue.slice(events.length);
    fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then((res) => {
        // 服务端没部署（404）或报错：当没发出去，放回队列下一轮再试
        if (!res.ok) requeue(events);
      })
      .catch(() => requeue(events));   // 离线 / 服务端没起：同上
  }

  // 发失败的事件放回队首，上限兜底（攒到 500 条就丢最旧的，别把内存撑大）
  function requeue(events) {
    queue = events.concat(queue);
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
  }

  // 切后台：先结算停留，再把攒着的事件用 beacon 发出去（页面可能马上被冻住）
  function onHidden() {
    settleView(Date.now());
    flush(true);
  }

  // 恢复可见：接着给当前视图计时（后台那段时间不算停留）；
  // 这个视图是后台期间切过来的（还没记过进入）→ 现在开始看它了，补记一条 view_enter
  function onVisible() {
    if (!curView || viewSince) return;
    viewSince = Date.now();
    if (!entered) {
      entered = true;
      push('view_enter', { view: curView });
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHidden();
    else onVisible();
  });

  window.addEventListener('pagehide', () => {
    const now = Date.now();
    settleView(now);
    push('session_end', { ms: Math.max(0, now - sessionStart) });
    // 一次 beacon 最多带 200 条：把队列分几批发完（最多 3 批，剩下的不要了）
    for (let i = 0; i < 3 && queue.length; i++) flush(true);
  });

  push('session_start', {});
  setInterval(() => flush(false), FLUSH_MS);

  window.Track = { clientId, view, event };
})();
