(function () {
  'use strict';

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  const saved = localStorage.getItem('resume-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));

  document.getElementById('themeToggle').addEventListener('click', function () {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('resume-theme', next);
  });

  /* ---------- Mobile menu ---------- */
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('nav');
  menuBtn.addEventListener('click', function () { nav.classList.toggle('open'); });
  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); });
  });

  /* ---------- Header + scroll progress ---------- */
  const header = document.getElementById('siteHeader');
  const progress = document.getElementById('progressBar');
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 12);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Reveal ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 80 + 'ms';
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---------- Active nav ---------- */
  const sections = ['work', 'experience', 'about', 'contact'];
  const links = nav.querySelectorAll('a');
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { threshold: 0.25, rootMargin: '-90px 0px -55% 0px' });
    sections.forEach(function (id) {
      const s = document.getElementById(id);
      if (s) so.observe(s);
    });
  }
  /* ---------- Work card locator ---------- */
  const workDots = document.getElementById('workDots');
  const cardIds = ['work-cs', 'work-ecom', 'work-jd', 'work-video'];
  const cards = cardIds.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  const dotLinks = workDots ? Array.prototype.slice.call(workDots.querySelectorAll('a')) : [];

  function setActiveCard(id) {
    dotLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-target') === id); });
  }
  dotLinks.forEach(function (a) {
    a.addEventListener('click', function () { setActiveCard(a.getAttribute('data-target')); });
  });

  if ('IntersectionObserver' in window && workDots && cards.length) {
    const visibility = new IntersectionObserver(function (entries) {
      const inMiddle = entries.some(function (e) { return e.isIntersecting; });
      workDots.classList.toggle('show', inMiddle);
    }, { rootMargin: '-20% 0px -20% 0px', threshold: 0 });
    cards.forEach(function (c) { visibility.observe(c); });

    const active = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActiveCard(e.target.id); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    cards.forEach(function (c) { active.observe(c); });
  }

  /* ---------- Customer chat refund demo ---------- */
  const csChatLog = document.getElementById('csChatLog');
  const csChatForm = document.getElementById('csChatForm');
  if (csChatLog && csChatForm) {
    const csChatInput = document.getElementById('csChatInput');
    const csSendBtn = csChatForm.querySelector('[type="submit"]');
    const csNewChat = document.getElementById('csNewChat');
    const csDemoRun = document.getElementById('csDemoRun');
    const csAttachBtn = document.getElementById('csAttachBtn');
    const csImageInput = document.getElementById('csImageInput');
    const csVoiceBtn = document.getElementById('csVoiceBtn');
    const csVoiceHint = document.getElementById('csVoiceHint');
    const csSuggests = document.querySelectorAll('[data-cs-suggest]');
    const csTraceStatus = document.getElementById('csTraceStatus');
    const csTraceNodes = document.querySelectorAll('[data-cs-node]');
    const csNodeDone = document.getElementById('csNodeDone');
    const csToolCount = document.getElementById('csToolCount');
    const csHandoffCount = document.getElementById('csHandoffCount');
    const csElapsed = document.getElementById('csElapsed');
    const csTaskStatus = document.getElementById('csTaskStatus');
    const csGreeting = '您好，在的。需要查单、办理退款，还是找景点推荐？';
    const csImageUrls = [];
    let csRunning = false;
    let csDemoRunning = false;
    let csRunToken = 0;
    let csRecognition = null;
    let csListening = false;
    let csChatState = 'idle';

    function csScrollChat() {
      csChatLog.scrollTop = csChatLog.scrollHeight;
    }

    function csAddMessage(role, text) {
      const row = document.createElement('div');
      row.className = 'cs-msg ' + role;
      row.textContent = text;
      csChatLog.appendChild(row);
      csScrollChat();
      return row;
    }

    function csAddImage(file) {
      if (csRunning || !file || !file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      csImageUrls.push(url);
      const row = document.createElement('div');
      row.className = 'cs-msg user has-image';
      const image = document.createElement('img');
      image.className = 'cs-msg-image';
      image.src = url;
      image.alt = '顾客上传的图片：' + file.name;
      row.appendChild(image);
      csChatLog.appendChild(row);
      csScrollChat();
      csRunning = true;
      csSyncControls();
      const token = ++csRunToken;
      setTimeout(function () {
        if (token !== csRunToken) return;
        csRunning = false;
        if (csChatState === 'refund_wait_materials') {
          csSetNode('handoff', 'active', '上下文已交接客服', '0.20s', '材料图片已上传；退款申请 T-1042 与对话上下文交给客服确认。');
          csHandoffCount.textContent = '1';
          csSetTracePending('待人工确认');
          csTaskStatus.textContent = 'T-1042 · 待人工确认';
          csElapsed.textContent = '1.1s';
          csChatState = 'refund_submitted';
          csAddMessage('agent', '材料图片已收到，我会把退款申请 T-1042 提交客服确认。这是静态演示，图片只在本机预览，没有上传服务器。');
        } else {
          csAddMessage('agent', '图片已收到，仅在本机预览。这是静态演示，不会上传到服务器。');
        }
        csSyncControls();
      }, 520);
    }

    function csAddTyping() {
      const row = document.createElement('div');
      row.className = 'cs-msg agent is-typing';
      row.textContent = '正在输入…';
      csChatLog.appendChild(row);
      csScrollChat();
      return row;
    }

    function csWait(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function csSyncControls() {
      csChatInput.disabled = csRunning;
      csAttachBtn.disabled = csRunning;
      csVoiceBtn.disabled = csRunning;
      csDemoRun.disabled = csRunning;
      csDemoRun.textContent = csDemoRunning ? '演示中' : '演示';
      csSuggests.forEach(function (button) { button.disabled = csRunning; });
      csSendBtn.disabled = csRunning || !csChatInput.value.trim();
    }

    function csNodeElement(key) {
      return Array.from(csTraceNodes).find(function (node) { return node.dataset.csNode === key; });
    }

    function csUpdateNodeCount() {
      const done = Array.from(csTraceNodes).filter(function (node) { return node.classList.contains('is-done'); }).length;
      csNodeDone.textContent = String(done);
    }

    function csSetNode(key, state, result, ms, record) {
      const node = csNodeElement(key);
      if (!node) return;
      node.classList.toggle('is-active', state === 'active');
      node.classList.toggle('is-done', state === 'done');
      node.classList.toggle('is-skip', state === 'skip');
      const stateLabel = node.querySelector('.cs-node-state');
      stateLabel.textContent = state === 'done' ? '完成' : state === 'active' ? '运行中' : state === 'skip' ? '未触发' : '待运行';
      if (result) node.querySelector('.cs-node-result').textContent = result;
      if (ms) node.querySelector('.cs-node-ms').textContent = ms;
      else if (state === 'active') node.querySelector('.cs-node-ms').textContent = '—';
      if (record) node.querySelector('.cs-node-output b').textContent = record;
      csUpdateNodeCount();
    }

    function csResetSteps(status) {
      csTraceNodes.forEach(function (node) {
        node.classList.remove('is-active', 'is-done', 'is-skip');
        node.querySelector('.cs-node-state').textContent = '待运行';
        node.querySelector('.cs-node-ms').textContent = '—';
        node.querySelector('.cs-node-result').textContent = node.dataset.idleResult;
        node.querySelector('.cs-node-output b').textContent = '尚无执行记录';
        node.querySelector('.cs-node-panel').hidden = true;
        node.querySelector('.cs-node-row').setAttribute('aria-expanded', 'false');
      });
      csTraceStatus.className = 'cs-trace-status';
      csTraceStatus.textContent = status || '待运行';
      csNodeDone.textContent = '0';
      csToolCount.textContent = '0';
      csHandoffCount.textContent = '0';
      csElapsed.textContent = '—';
      csTaskStatus.textContent = '任务未创建';
    }

    function csResetChat() {
      csRunToken += 1;
      csRunning = false;
      csDemoRunning = false;
      csChatState = 'idle';
      csStopVoice();
      csImageUrls.forEach(function (url) { URL.revokeObjectURL(url); });
      csImageUrls.length = 0;
      csChatLog.replaceChildren();
      csAddMessage('agent', csGreeting);
      csChatInput.value = '';
      csVoiceHint.hidden = true;
      csResetSteps('待运行');
      csSyncControls();
    }

    function csSetTracePending(status) {
      csTraceStatus.className = 'cs-trace-status is-pending';
      csTraceStatus.textContent = status;
    }

    async function csRunRefundDemo() {
      if (csRunning) return;
      const token = ++csRunToken;
      csRunning = true;
      csDemoRunning = true;
      csChatState = 'demo_running';
      csSyncControls();
      csResetSteps('准备中');
      csStopVoice();
      csImageUrls.forEach(function (url) { URL.revokeObjectURL(url); });
      csImageUrls.length = 0;
      csChatLog.replaceChildren();
      csChatInput.value = '';
      csVoiceHint.hidden = true;
      csAddMessage('agent', csGreeting);

      csTraceStatus.className = 'cs-trace-status is-running';
      csTraceStatus.textContent = '处理中';
      csSetNode('safety', 'active', '检查风险与越权');
      await csWait(160);
      if (token !== csRunToken) return;
      csSetNode('safety', 'done', '放行 · 未命中风险规则', '0.12s', '输入含退款诉求，未命中风险或越权规则，放行。');
      csSetNode('route', 'active', '判断处理路径');
      await csWait(130);
      if (token !== csRunToken) return;
      csSetNode('route', 'done', '退款申请 · 完整处理', '0.13s', '意图：退款申请 · 病假例外；进入完整处理。');
      csSetNode('think', 'active', '理解意图与缺失信息');
      await csWait(320);
      if (token !== csRunToken) return;
      csAddMessage('user', '孩子发烧了，明天的温泉一日游去不了，能退吗？');
      csSetNode('think', 'done', '缺手机号和订单号，先追问', '0.36s', '计划：先补齐订单信息，再查订单与退款规则。');

      const typing1 = csAddTyping();
      await csWait(620);
      if (token !== csRunToken) return;
      typing1.remove();
      csAddMessage('agent', '先别着急。麻烦把手机号和订单号发我一下，我帮您查这笔订单。');

      await csWait(700);
      if (token !== csRunToken) return;
      csAddMessage('user', '13800008821，订单 8821');
      csSetNode('act', 'active', '查询订单 8821');
      await csWait(420);
      if (token !== csRunToken) return;
      csSetNode('act', 'done', '3 次工具调用', '0.42s', 'get_order(8821) → 温泉一日游；get_policy → 规则 #3；create_ticket → T-1042。');
      csSetNode('verify', 'active', '核对订单与规则');
      await csWait(180);
      if (token !== csRunToken) return;
      csSetNode('verify', 'done', '订单、金额、规则一致', '0.08s', '订单 8821、出行 12-01 与规则 #3 比对通过。');
      csSetNode('respond', 'active', '组织对客回复');
      csToolCount.textContent = '3';

      const typing2 = csAddTyping();
      await csWait(520);
      if (token !== csRunToken) return;
      typing2.remove();
      csAddMessage('agent', '查到了，是温泉一日游（¥70 起），1 张，出行 12-01。出行前 48 小时内不可退；孩子生病属于例外情况，需要补就诊记录和就医付款凭证。');
      csSetNode('respond', 'done', '已生成退款说明', '0.24s', '说明订单、例外规则与所需材料；生成申请 T-1042。');
      csTaskStatus.textContent = 'T-1042 · 待材料补充';
      csSetTracePending('待材料补充');

      await csWait(700);
      if (token !== csRunToken) return;
      csAddMessage('user', '就诊记录我晚点拍给你，周末还能带孩子玩点什么吗？');
      csSetNode('act', 'active', '查询周末亲子产品');
      const typing3 = csAddTyping();
      await csWait(650);
      if (token !== csRunToken) return;
      typing3.remove();
      csSetNode('act', 'done', '4 次工具调用', '0.46s', '追加 list_products(周末 · 亲子)，返回动物园与海洋馆 2 个候选。');
      csSetNode('respond', 'done', '已生成 4 条回复 · 2 个推荐', '0.31s', '退款说明与两个产品文字链接；未弹卡片。');
      csAddMessage('agent', '好的，退款申请我先帮您整理好，材料补齐后交给客服确认，审核通过后 1-3 个工作日原路退回。周末要是孩子好些，可以看市动物园成人票（¥40 起），不用预约；海洋馆亲子票（¥85 起）是一大一小，室内不怕下雨。');

      await csWait(700);
      if (token !== csRunToken) return;
      csAddMessage('user', '好的，谢谢，我拍好材料就发你。');
      const typing4 = csAddTyping();
      await csWait(520);
      if (token !== csRunToken) return;
      typing4.remove();
      csAddMessage('agent', '收到，材料齐了我就提交客服确认，有进展再跟您说。');
      csSetNode('handoff', 'skip', '未触发 · 待材料补齐', '—', '退款申请 T-1042 等待材料，补齐后交客服确认。');
      csToolCount.textContent = '4';
      csHandoffCount.textContent = '0';
      csElapsed.textContent = '1.4s';
      csTraceStatus.className = 'cs-trace-status is-pending';
      csTraceStatus.textContent = '待材料补充';
      csRunning = false;
      csDemoRunning = false;
      csChatState = 'refund_wait_materials';
      csSyncControls();
    }

    async function csBeginRefund(text) {
      if (csRunning) return;
      const token = ++csRunToken;
      csRunning = true;
      csChatState = 'refund_await_order';
      csSyncControls();
      csResetSteps('运行中');
      csTraceStatus.className = 'cs-trace-status is-running';
      csTraceStatus.textContent = '处理中';
      csAddMessage('user', text || '我想退款');
      csSetNode('safety', 'active', '检查风险与越权');
      await csWait(160);
      if (token !== csRunToken) return;
      csSetNode('safety', 'done', '放行 · 未命中风险规则', '0.12s', '退款诉求，放行。');
      csSetNode('route', 'active', '判断处理路径');
      await csWait(130);
      if (token !== csRunToken) return;
      csSetNode('route', 'done', '退款申请 · 完整处理', '0.13s', '进入完整处理。');
      csSetNode('think', 'active', '等待手机号与订单号');
      const typing = csAddTyping();
      await csWait(520);
      if (token !== csRunToken) return;
      typing.remove();
      csAddMessage('agent', '可以，我来帮您处理。请把下单手机号和订单号发我，我先核对订单和退改规则。');
      csSetNode('think', 'done', '缺口：手机号、订单号', '0.36s', '识别到退款目标，先追问订单信息。');
      csSetTracePending('等待顾客补充');
      csRunning = false;
      csSyncControls();
    }

    async function csHandleRefundOrder(text) {
      if (csRunning) return;
      if (!/\d{4,}/.test(text)) {
        csQuickReply(text, '还需要订单号或下单手机号才能继续查询，请把两项信息一起发我。');
        return;
      }
      const token = ++csRunToken;
      csRunning = true;
      csSyncControls();
      csAddMessage('user', text);
      csSetNode('think', 'active', '核对订单与退款规则');
      csSetNode('act', 'active', '查询订单 8821');
      csTraceStatus.className = 'cs-trace-status is-running';
      csTraceStatus.textContent = '查询中';
      const typing = csAddTyping();
      await csWait(620);
      if (token !== csRunToken) return;
      typing.remove();
      csSetNode('think', 'done', '订单与规则已定位', '0.34s', '识别到订单 8821 与病假例外场景。');
      csSetNode('act', 'done', '3 次工具调用', '0.38s', 'get_order(8821)、get_policy、create_ticket(T-1042)。');
      csSetNode('verify', 'active', '核对订单、金额与规则');
      await csWait(160);
      if (token !== csRunToken) return;
      csSetNode('verify', 'done', '订单、金额、规则一致', '0.08s', '核对通过，可组织回复。');
      csSetNode('respond', 'active', '组织退款说明');
      await csWait(220);
      if (token !== csRunToken) return;
      csAddMessage('agent', '查到了，是温泉一日游（¥70 起），1 张，出行 12-01。出行前 48 小时内不可退；孩子生病属于例外情况，需要补就诊记录和就医付款凭证。');
      csSetNode('respond', 'done', '已生成退款说明', '0.24s', '说明例外材料要求与处理路径。');
      csSetNode('handoff', 'skip', '未触发 · 待材料补齐', '—', 'T-1042 等待材料，补齐后交客服确认。');
      csToolCount.textContent = '3';
      csHandoffCount.textContent = '0';
      csElapsed.textContent = '1.3s';
      csTaskStatus.textContent = 'T-1042 · 待材料补充';
      csSetTracePending('待材料补充');
      csChatState = 'refund_wait_materials';
      csRunning = false;
      csSyncControls();
    }

    async function csQuickReply(text, reply) {
      if (csRunning) return;
      csRunning = true;
      csSyncControls();
      csAddMessage('user', text);
      const typing = csAddTyping();
      await csWait(420);
      typing.remove();
      csAddMessage('agent', reply);
      csRunning = false;
      csSyncControls();
    }

    csSuggests.forEach(function (button) {
      button.addEventListener('click', function () {
        const kind = button.dataset.csSuggest;
        if (kind === 'refund') {
          csBeginRefund('我想退款');
        } else {
          csQuickReply(
            button.textContent.trim(),
            '周末带孩子可以看：市动物园成人票（¥40 起），不用预约；海洋馆亲子票（¥85 起）是一大一小，室内不怕下雨。两大一小合计约 ¥165。'
          );
        }
      });
    });

    csDemoRun.addEventListener('click', csRunRefundDemo);

    csChatForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (csRunning) return;
      const text = csChatInput.value.trim();
      if (!text) return;
      csChatInput.value = '';
      csSyncControls();

      if (csChatState === 'refund_await_order') {
        csHandleRefundOrder(text);
        return;
      }
      if (csChatState === 'refund_wait_materials') {
        if (/推荐|孩子|亲子|周末/.test(text)) {
          csQuickReply(text, '孩子好些的话，可以看市动物园成人票（¥40 起），不用预约；海洋馆亲子票（¥85 起）是一大一小，室内不怕下雨。退款申请仍会保留在待材料状态。');
        } else if (/材料|就诊|拍|上传|凭证/.test(text)) {
          csQuickReply(text, '好的，材料拍好后直接发我即可。材料齐全后我会把退款申请 T-1042 交给客服确认。');
        } else {
          csQuickReply(text, '退款申请 T-1042 目前仍待补充就诊记录和付款凭证，补齐后我会继续处理。');
        }
        return;
      }

      if (/退|退票|退款/.test(text)) {
        csBeginRefund(text);
        return;
      }
      if (/单|查单|订单/.test(text)) {
        csQuickReply(text, '请提供订单号或下单手机号，我来帮您核对订单状态。');
        return;
      }
      if (/推荐|孩子|亲子|周末|行程/.test(text)) {
        csQuickReply(text, '周末带孩子可以看：市动物园成人票（¥40 起），不用预约；海洋馆亲子票（¥85 起）是一大一小，室内不怕下雨。两大一小合计约 ¥165。');
        return;
      }
      csQuickReply(text, '可以告诉我具体要办的事，例如办理退款，或找周末行程推荐。');
    });

    csChatInput.addEventListener('input', function () {
      csChatInput.style.height = 'auto';
      csChatInput.style.height = Math.min(csChatInput.scrollHeight, 88) + 'px';
      csSyncControls();
    });
    csChatInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!csSendBtn.disabled) csChatForm.requestSubmit();
      }
    });

    csNewChat.addEventListener('click', csResetChat);

    csAttachBtn.addEventListener('click', function () { csImageInput.click(); });
    csImageInput.addEventListener('change', function () {
      const file = csImageInput.files && csImageInput.files[0];
      csImageInput.value = '';
      if (file) csAddImage(file);
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    function csStopVoice() {
      if (csRecognition && csListening) {
        try { csRecognition.stop(); } catch { /* already stopped */ }
      }
      csListening = false;
      csVoiceBtn.classList.remove('is-listening');
      csVoiceBtn.setAttribute('aria-pressed', 'false');
      csVoiceBtn.setAttribute('aria-label', '语音输入');
    }

    csVoiceBtn.addEventListener('click', function () {
      if (csRunning) return;
      if (csListening) {
        csStopVoice();
        csVoiceHint.hidden = true;
        return;
      }
      if (!SpeechRecognition) {
        csVoiceHint.textContent = '当前浏览器不支持语音识别，请使用最新版 Chrome 或 Edge。';
        csVoiceHint.hidden = false;
        return;
      }
      csRecognition = new SpeechRecognition();
      csRecognition.lang = 'zh-CN';
      csRecognition.interimResults = true;
      csRecognition.continuous = false;
      csRecognition.onstart = function () {
        csListening = true;
        csVoiceBtn.classList.add('is-listening');
        csVoiceBtn.setAttribute('aria-pressed', 'true');
        csVoiceBtn.setAttribute('aria-label', '停止语音输入');
        csVoiceHint.textContent = '正在听，请说话…';
        csVoiceHint.hidden = false;
      };
      csRecognition.onresult = function (event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }
        csChatInput.value = transcript.trim();
        csChatInput.style.height = 'auto';
        csChatInput.style.height = Math.min(csChatInput.scrollHeight, 88) + 'px';
        csSyncControls();
        csVoiceHint.textContent = '已转写，可编辑后发送。';
      };
      csRecognition.onerror = function (event) {
        csVoiceHint.textContent = event.error === 'not-allowed' ? '麦克风未授权，请在浏览器设置中允许访问。' : '语音识别失败，请重试。';
        csVoiceHint.hidden = false;
      };
      csRecognition.onend = function () {
        csListening = false;
        csVoiceBtn.classList.remove('is-listening');
        csVoiceBtn.setAttribute('aria-pressed', 'false');
        csVoiceBtn.setAttribute('aria-label', '语音输入');
      };
      try {
        csRecognition.start();
      } catch {
        csVoiceHint.textContent = '语音识别暂时不可用，请稍后重试。';
        csVoiceHint.hidden = false;
      }
    });

    csTraceNodes.forEach(function (node) {
      const row = node.querySelector('.cs-node-row');
      const panel = node.querySelector('.cs-node-panel');
      row.addEventListener('click', function () {
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        row.setAttribute('aria-expanded', String(willOpen));
      });
    });

    csSyncControls();
  }

  /* ---------- JD live product animation ---------- */
  const jdDemoFrame = document.getElementById('jdDemoFrame');
  if (jdDemoFrame) {
    window.addEventListener('message', function (event) {
      if (event.source !== jdDemoFrame.contentWindow) return;
      if (!event.data || event.data.type !== 'jd-demo-height') return;
      const height = Number(event.data.height);
      if (!Number.isFinite(height)) return;
      jdDemoFrame.style.height = Math.max(420, Math.min(1400, Math.round(height))) + 'px';
    });
  }

  /* ---------- Video companion landscape demo ---------- */
  const videoDemoFrame = document.getElementById('videoDemoFrame');
  if (videoDemoFrame) {
    window.addEventListener('message', function (event) {
      if (event.source !== videoDemoFrame.contentWindow) return;
      if (!event.data || event.data.type !== 'video-demo-height') return;
      const height = Number(event.data.height);
      if (!Number.isFinite(height)) return;
      videoDemoFrame.style.height = Math.max(180, Math.min(1000, Math.round(height) + 4)) + 'px';
    });
  }

  /* ---------- Copy phone / WeChat ---------- */
  const copyPhone = document.getElementById('copyPhone');
  const copyPhoneHint = document.getElementById('copyPhoneHint');
  if (copyPhone && copyPhoneHint) {
    const original = copyPhoneHint.textContent;
    let resetTimer = null;

    function legacyCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function flash(msg) {
      copyPhoneHint.textContent = msg;
      copyPhoneHint.classList.add('is-done');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        copyPhoneHint.textContent = original;
        copyPhoneHint.classList.remove('is-done');
      }, 1800);
    }

    copyPhone.addEventListener('click', function () {
      const text = copyPhone.getAttribute('data-copy');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () {
          flash('已复制 · 微信同号');
        }).catch(function () {
          flash(legacyCopy(text) ? '已复制 · 微信同号' : '复制失败，请手动选择');
        });
      } else {
        flash(legacyCopy(text) ? '已复制 · 微信同号' : '复制失败，请手动选择');
      }
    });
  }
})();
