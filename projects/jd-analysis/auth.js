/* 移动端标记：手机/平板上装不了浏览器扩展，「粘贴链接」「上传二维码」这两条路在那上面
   永远走不通，由 CSS 直接收掉（具体规则见 styles.css 的 body.is-mobile 那段）。
   这段必须尽早跑——放在 app.js 里的话按钮会先渲染再被隐藏，肉眼能看到一闪。
   判据：UA 命中移动设备，或是「有触摸且屏宽不超过平板」的触摸设备（iPad 之类）。
   只用 maxTouchPoints 会把 Windows 触屏笔记本误判成手机，所以触摸这条加了屏宽上限。 */
(function markMobile() {
  try {
    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Windows Phone|Mobile/i.test(ua);
    const touch = Number(navigator.maxTouchPoints) > 0;
    const narrow = window.innerWidth <= 1024;
    if (mobileUA || (touch && narrow)) document.body.classList.add('is-mobile');
  } catch { /* 判定失败就算了：最坏情况是多显示两个按钮，不影响使用 */ }
})();

/* 访问口令：部署到公网时用（服务端设了 ACCESS_TOKEN 才有这回事）。
   本机自用时服务端不启用，前端问一次 /api/auth-state 就直接跳过，全程无感。

   为什么要它：公网上的 /api/model-config 系列没有这层闸门的话，任何打开页面的人
   都能读走你的模型 API key、白烧你的额度。口令是最省事的一层。

   流程：启动问一次要不要口令 → 需要就弹框 → 输对口令换 Cookie（浏览器自动带上）→
   之后所有请求顺带 Cookie，不用再输。口 remembers 30 天（服务端 Cookie 的 Max-Age）。 */
(function () {
  const KEY = 'jd_access_token';
  let cached = null;          // 本次会话内的口令，省得每个请求都读 localStorage
  let asked = false;          // 只弹一次框，别因为重试连环弹

  function stored() {
    if (cached != null) return cached;
    try { cached = String(localStorage.getItem(KEY) || ''); } catch { cached = ''; }
    return cached;
  }

  function remember(v) {
    cached = v;
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* 隐私模式等 */ }
  }

  /** 带上口令的请求头。Cookie 那条由浏览器自动处理，这里补的是 x-access-token。 */
  window.authHeaders = function authHeaders() {
    const t = stored();
    return t ? { 'x-access-token': t } : {};
  };

  /** 服务端要不要口令。localhost 一律返回 false（自己电脑上不用被打扰）。 */
  window.needToken = function needToken() {
    return fetch('/api/auth-state', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { needToken: false }))
      .then((j) => !!j.needToken)
      .catch(() => false);   // 问不到就当不需要：宁可先跑起来，别把人挡在门外进不去
  };

  /**
   * 弹框问口令，返回 Promise<boolean>（拿到口令为 true）。
   * 复用页面已有的 modal 样式；页面 DOM 还没就绪时退化成 window.prompt。
   */
  window.promptToken = function promptToken() {
    if (asked) return Promise.resolve(false);
    asked = true;
    return new Promise((resolve) => {
      const finish = (ok) => {
        box.remove();
        asked = false;
        resolve(ok);
      };
      const box = document.createElement('div');
      box.className = 'model-modal';
      box.innerHTML =
        '<div class="model-backdrop"></div>'
        + '<div class="model-panel" role="dialog" aria-modal="true" aria-label="访问口令">'
        + '<div class="model-head"><span>访问口令</span>'
        + '<button class="shot-close" id="tokClose" type="button" aria-label="关闭">×</button></div>'
        + '<div class="model-body">'
        + '<p class="model-label">请输入口令</p>'
        + '<input class="model-input" id="tokInput" type="password" autocomplete="off" spellcheck="false" placeholder="口令">'
        + '<p class="model-tip" id="tokErr" hidden>口令不对，请再试一次</p>'
        + '<p class="model-privacy">口令只留在你这台设备的浏览器里，不会写进页面或链接。</p>'
        + '</div>'
        + '<div class="model-foot">'
        + '<button class="btn btn-outline" id="tokCancel" type="button">取消</button>'
        + '<button class="btn btn-solid" id="tokOk" type="button">进入</button>'
        + '</div></div>';
      document.body.appendChild(box);
      const input = box.querySelector('#tokInput');
      const err = box.querySelector('#tokErr');
      box.querySelector('#tokClose').onclick = () => finish(false);
      box.querySelector('#tokCancel').onclick = () => finish(false);
      box.querySelector('.model-backdrop').onclick = () => finish(false);
      box.querySelector('#tokOk').onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      setTimeout(() => { try { input.focus(); } catch { /* 焦点无所谓 */ } }, 30);

      async function submit() {
        const v = String(input.value || '').trim();
        if (!v) return;
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-access-token': v },
          body: JSON.stringify({ token: v }),
        }).catch(() => null);
        if (r && r.ok) {
          remember(v);          // 存本地，之后靠 Cookie 走，不必每个请求都带头
          finish(true);
        } else {
          err.hidden = false;
          input.value = '';
          try { input.focus(); } catch { /* 忽略 */ }
        }
      }
    });
  };
})();