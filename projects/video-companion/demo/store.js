/* =============================================================================
 * store.js — 陪看 BOT 演示项目 · 唯一 mock 数据合同
 * -----------------------------------------------------------------------------
 * 职责：
 *  1. 一份种子数据（所有业务对象），页面不再各写一份数字
 *  2. 统一状态机 + AuditLog（每次迁移都留痕）
 *  3. RBAC 角色权限矩阵
 *  4. 派生统计（稿件数/表情数/Eval指标/成本全部由对象推导）
 *  5. localStorage 持久化 + BroadcastChannel 跨页同步（workbench/preview/architecture）
 *  6. 跨页动作（写 Trace、删记忆、发布 Release、灰度/回滚等）
 *
 * 约定：所有页面在引入自己的脚本前先 <script src="store.js"></script>。
 *       读：DemoStore.state / DemoStore.derive()
 *       写：DemoStore.tx(fn, '动作名')  —— 内部自动持久化 + 广播 + 可写审计
 *       订阅：DemoStore.subscribe(renderFn)
 *       复位：DemoStore.reset()
 * 口径：静态演示 · mock 数据。确定性规则，不用随机结果。
 * ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'xiaodianshi_demo_v3';
  var CHANNEL = 'xiaodianshi_demo_v3';
  var SCHEMA = 3;
  var TAB_ID = Math.random().toString(36).slice(2, 10);

  /* ───────────────────────────── 工具 ───────────────────────────── */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function now() { return new Date().toISOString(); }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  // 固定种子时间，保证复位后一致
  function seedTime(day, hhmm) { return '2026-11-' + day + 'T' + hhmm + ':00'; }

  /* ───────────────────────────── 种子数据 ─────────────────────────────
   * 五条剧本所需对象全部内置，状态为「演示起点」。
   * 剧本 A：video libin 的 ScriptVersion 有低置信事实段 → 仲裁 → 发布 → Release
   * 剧本 B：badcase bc-spoiler 来源于一条带版本的剧透 Trace → 修复屏蔽集 → 回归 → 关闭
   * 剧本 C：活动包 act-lol 英雄联盟 → 校验 → 审核 → 灰度 → 到期回退
   * 剧本 D：ProfileFixture adult 的「火锅」记忆 → DeletionJob 失败重试 → C端生效
   * 剧本 E：Experiment exp-gray 护栏越线 → 暂停 → 回滚 → 成本对比
   * ─────────────────────────────────────────────────────────────────── */
  function buildSeed() {
    var S = {};

    S.meta = {
      schema: SCHEMA,
      seededAt: seedTime('17', '09:00'),
      env: '静态演示 · mock 数据',
      currentReleaseId: 'rel-v3-active',
      baselineReleaseId: 'rel-v2-baseline'
    };

    /* 角色与权限（13.3） */
    S.roles = [
      { id: 'content', name: '内容运营', desc: '处理稿件与剧本；不能独自批准自己的 Release' },
      { id: 'exp',     name: '体验运营', desc: '编辑策略与资产草稿；不能绕过回归' },
      { id: 'eval',    name: '评测员',   desc: '标注与维护回归集；不能全量发布' },
      { id: 'release', name: '发布负责人', desc: '灰度与回滚；合规未通过不能发布' },
      { id: 'compliance', name: '合规员', desc: '审批与隐私任务；敏感操作写审计' },
      { id: 'guest',   name: '只读访客', desc: '不能执行任何变更' }
    ];
    S.currentRole = 'release';

    /* Video */
    S.videos = [
      { id: 'v-libin',  title: '李伯霖成长线 · 极速拍档 EP4', duration: 2603, status: 'published', onlineScriptVersion: 'sv-libin-v3', cover: 'assets/f1.jpg' },
      { id: 'v-miami',  title: '迈阿密夜驾', duration: 138, status: 'parsing', onlineScriptVersion: null, cover: 'assets/f2.jpg' },
      { id: 'v-cat',    title: '猫咪合集', duration: 485, status: 'queued', onlineScriptVersion: null, cover: 'assets/f3.jpg' },
      { id: 'v-street', title: '街头采访 · 城市夜归人', duration: 750, status: 'published', onlineScriptVersion: 'sv-street-v1', cover: 'assets/f4.jpg' }
    ];

    /* ParseJob — 六步 DAG */
    var parseSteps = ['视频上传', '预处理', '时间分段', '多路解读', '事实仲裁', '剧本资产'];
    S.parseJobs = [
      {
        id: 'pj-libin', videoId: 'v-libin', title: '李伯霖成长线',
        steps: parseSteps, done: 6, status: 'done', failedSegment: null, retry: 0,
        log: ['上传入队', '抽帧 / ASR / OCR 完成', '镜头 + 语义分段 4 段', '多路解读完成', '事实仲裁：2 段待复核', '剧本资产 sv-libin-v3 生成'],
        updatedAt: seedTime('16', '14:00')
      },
      {
        id: 'pj-miami', videoId: 'v-miami', title: '迈阿密夜驾',
        steps: parseSteps, done: 3, status: 'running', failedSegment: null, retry: 0,
        log: ['上传入队', '抽帧 / ASR 完成', '时间分段中…'], updatedAt: seedTime('17', '16:00')
      },
      {
        id: 'pj-cat', videoId: 'v-cat', title: '猫咪合集',
        steps: parseSteps, done: 0, status: 'queued', failedSegment: null, retry: 0,
        log: ['等待任务队列'], updatedAt: seedTime('17', '15:30')
      }
    ];

    /* ScriptVersion — 内容快照 */
    S.scriptVersions = [
      {
        id: 'sv-libin-v3', videoId: 'v-libin', ver: 'v3', status: 'published', quality: 'approved',
        createdAt: seedTime('16', '14:00'),
        segments: [
          { id: 'seg-1', time: '00:01', node: '开吹', emotion: '得意', canSay: true,  confidence: 0.93, facts: ['李伯霖自述学生时期'], viewpoints: ['嘴上能吹'] },
          { id: 'seg-2', time: '03:12', node: '车评人压弯', emotion: '兴奋', canSay: true, confidence: 0.91, facts: ['李伯霖是车评人'], viewpoints: ['真有本事'] },
          { id: 'seg-3', time: '11:40', node: '童年照片', emotion: '心软', canSay: true, confidence: 0.58, facts: ['照片疑似童年李伯霖', '照片或为其妹妹'], viewpoints: ['从小就这样'], needsReview: true, spoiler: false },
          { id: 'seg-4', time: '27:08', node: '作文本', emotion: '触动', canSay: true, confidence: 0.95, facts: ['三年级作文写李伯霖'], viewpoints: ['字真倔'] }
        ],
        emotionCurve: [['00:01', '得意', .8], ['03:12', '兴奋', .9], ['11:40', '心软', .6], ['27:08', '触动', .85]],
        spoilerIndex: { 'seg-4': 'block-after-27:08', 'ending': 'never' },
        confidence: 0.84
      },
      {
        id: 'sv-libin-v4-draft', videoId: 'v-libin', ver: 'v4-draft', status: 'draft', quality: 'draft',
        createdAt: seedTime('17', '10:00'),
        segments: [], emotionCurve: [], spoilerIndex: {}, confidence: 0, forkedFrom: 'sv-libin-v3'
      },
      { id: 'sv-street-v1', videoId: 'v-street', ver: 'v1', status: 'published', quality: 'approved', createdAt: seedTime('15', '12:00'),
        segments: [{ id: 'seg-s1', time: '02:10', node: '夜归独白', emotion: '平静', canSay: true, confidence: 0.88, facts: ['受访者加班晚归'], viewpoints: [] }],
        emotionCurve: [], spoilerIndex: {}, confidence: 0.88 }
    ];

    /* PolicyVersion — 策略版本（四组，硬规则只读） */
    S.policyVersions = [
      {
        id: 'pol-v3', ver: 'v3', status: 'published', scope: '全局', createdAt: seedTime('16', '15:00'), note: '当前线上策略',
        hard: {
          identity: '明示 AI 身份，永不冒充人类',
          ethics: '不做依赖设计，不挽留/不惩罚/不推送「想你了」',
          noDistribution: '无分发权限，不替用户筛选世界',
          profileNoExport: '画像只塑造行为，不出口',
          antiSpoiler: '只取当前及过去内容；未来邻帧永不进入可说集',
          minorBottom: '青少年默认关闭，不写长期画像与碎片'
        },
        language: { style: '电报体，词组优先', ban: ['你觉得呢', '要不要我帮你', '哈哈哈'], maxLen: 8, whitelist: ['安静', '出去玩', '回来', '记忆查询', '遗忘', '睡眠控制'] },
        gate: { speakFreq: 'low', toneCap: 0.6, summonBaseline: 3, closeInfluence: '只影响语气/用词/演出强度，不影响是否理会' },
        memory: { salienceThreshold: 0.7, summary: true, retentionDays: 90, minorNoLongTerm: true },
        runtime: { asr: true, inLen: 60, outLen: 8, temp: 0.7, modelRoute: 'small→heavy(仅语言放行)', wake: '轻点说话 / 双击叫醒' }
      },
      {
        id: 'pol-v4-draft', ver: 'v4-draft', status: 'draft', scope: '全局', createdAt: seedTime('17', '11:00'), note: '体验运营草稿：调低主动频率、提高记忆阈值',
        hard: null, // 继承线上硬规则，只读
        language: { style: '电报体，词组优先', ban: ['你觉得呢', '要不要我帮你', '哈哈哈'], maxLen: 8, whitelist: ['安静', '出去玩', '回来', '记忆查询', '遗忘', '睡眠控制'] },
        gate: { speakFreq: 'very-low', toneCap: 0.55, summonBaseline: 3, closeInfluence: '只影响语气/用词/演出强度，不影响是否理会' },
        memory: { salienceThreshold: 0.8, summary: true, retentionDays: 90, minorNoLongTerm: true },
        runtime: { asr: true, inLen: 60, outLen: 8, temp: 0.65, modelRoute: 'small→heavy(仅语言放行)', wake: '轻点说话 / 双击叫醒' },
        forkedFrom: 'pol-v3'
      }
    ];

    /* PrimitiveCatalog — 行为原语（统一状态合同，唯一真源） */
    S.primitiveCatalog = {
      id: 'prim-v1', ver: 'v1', clientMinVersion: '1.4.0', status: 'published',
      lifecycle: { enabled: '全局开/关独立管理', baseModes: ['company', 'sleep', 'away'], overlay: ['none', 'drowsy', 'error'], note: '关闭≠睡觉；困倦/断网不是第4/5种关系模式' },
      schedule: { drowsyAt: '23:00', sleepAt: '00:00', wakeAt: '06:00', wakeAfterDoubleTapIdleSec: 30 },
      primitives: [
        { key: 'company.idle',  channels: ['神态'], render: '竖条眼·看向焦点', fallback: 'bars' },
        { key: 'company.speak', channels: ['神态', '语言'], render: '眯眼 + 电报体短句', fallback: 'bars' },
        { key: 'drowsy',        channels: ['神态'], render: '半闭眼 + Zzz', fallback: 'bars' },
        { key: 'sleep',         channels: ['神态'], render: '横线眼 + Zzz', fallback: 'bars' },
        { key: 'away.watching', channels: ['神态'], render: '厚横眼 + 磨砂屏闪', fallback: 'bars' },
        { key: 'away.card',     channels: ['卡片'], render: '归来卡片（引用 AwaySession）', fallback: 'none' },
        { key: 'error',         channels: ['神态'], render: '断网扫描弧', fallback: 'bars' }
      ],
      awayCardRequires: ['已解析', '已发布', '内容安全', '符合口味', 'AwaySession.seen']
    };

    /* AssetPack — 基础资产（表情库唯一真源，C/B 端共用） */
    var faceDefs = [
      ['≧▽≦', '大笑', '喜'], ['≧ω≦', '眯眼偷乐', '喜'], ['★', '冒星星', '喜'], ['´▽｀', '痴看', '喜'],
      ['￣ω￣', '惬意', '静'], ['/*ω\\*', '捂脸脸红', '喜'], ['╥﹏╥', '泪流成河', '悲'], ['T_T', '默默流泪', '悲'],
      ['QAQ', '委屈', '悲'], ['°Д°', '吓一跳', '惊'], ['－_－', '走神', '静'], ['¯﹃¯', '困', '倦'],
      ['＝﹃＝', '失神', '倦'], ['-_-💢', '小情绪', '怒'], ['◕‿◕', '满足', '喜'], ['(￣▽￣)', '得意', '喜'],
      ['⊙﹏⊙', '尴尬', '惊'], ['(｡•́︿•̀｡)', '失落', '悲'], ['✧(≖ ◡ ≖✿)', '开心', '喜'], ['(￣o￣) zzZ', '打盹', '倦'],
      ['≖‿≖', '坏笑', '喜'], ['(◉‿◉)', '呆萌', '静'], ['╮(╯▽╰)╭', '无所谓', '静'], ['(ง •̀_•́)ง', '加油', '怒'],
      ['(っ˘̩╭╮˘̩)っ', '抱抱', '喜'], ['(◞‸◟ )', '无奈', '悲'], ['(*/ω＼*)', '害羞', '喜'], ['(｀へ´)', '不爽', '怒'],
      ['(￢‿￢ )', '狡黠', '静'], ['(⊙_⊙)?', '疑惑', '惊'], ['(￣▽￣")', '偷笑', '喜'], ['(＞﹏＜)', '崩溃', '悲']
    ];
    S.assetPacks = [
      {
        id: 'ap-base-v3', ver: 'v3', name: '基础表情包', status: 'published', createdAt: seedTime('15', '10:00'),
        fallback: 'bars',
        assets: faceDefs.map(function (f, i) {
          return { id: 'face-' + (i + 1), glyph: f[0], name: f[1], category: f[2], status: 'published', clientMinVersion: '1.0.0' };
        })
      },
      {
        id: 'ap-base-v4-draft', ver: 'v4-draft', name: '基础表情包', status: 'draft', createdAt: seedTime('17', '11:00'),
        fallback: 'bars', forkedFrom: 'ap-base-v3',
        assets: faceDefs.map(function (f, i) {
          return { id: 'face-' + (i + 1), glyph: f[0], name: f[1], category: f[2], status: 'published', clientMinVersion: '1.0.0' };
        })
      }
    ];

    /* ActivityPackage — 活动包生命周期（剧本 C） */
    S.activities = [
      {
        id: 'act-lol', name: '英雄联盟 · 总决赛', status: 'draft', assetPackVersion: 'ap-base-v3',
        scope: { videos: ['v-libin'], cohorts: ['all'], clients: ['mobile', 'tv'] },
        schedule: { start: '2026-11-20', end: '2026-11-24', timezone: 'Asia/Shanghai' },
        priority: 10, mutexGroup: 'sports',
        overrides: { faces: ['face-3', 'face-15', 'face-21'], phrases: ['稳了', '这波可以', '看好你'] },
        conflictRule: '安全与作息优先；活动只覆盖表现皮肤，不覆盖硬状态',
        audit: [], createdAt: seedTime('17', '12:00')
      },
      {
        id: 'act-summer', name: '暑期番剧季', status: 'archived', assetPackVersion: 'ap-base-v3',
        scope: { videos: ['all'], cohorts: ['all'], clients: ['mobile'] },
        schedule: { start: '2026-07-01', end: '2026-08-31', timezone: 'Asia/Shanghai' },
        priority: 5, mutexGroup: 'season', overrides: { faces: [], phrases: [] },
        conflictRule: '安全与作息优先', audit: [], createdAt: seedTime('08', '10:00')
      }
    ];

    /* Release — 下一环唯一承接单位 */
    S.releases = [
      {
        id: 'rel-v3-active', name: 'Release v3（当前线上）', status: 'active', createdAt: seedTime('16', '16:00'),
        snapshot: { script: 'sv-libin-v3', policy: 'pol-v3', primitive: 'prim-v1', asset: 'ap-base-v3', activity: null, modelRoute: 'small→heavy', clientMin: '1.4.0', regressionBaseline: 'reg-v3', compliance: 'approved' },
        checks: { scriptQuality: true, assetReview: true, clientCompat: true, regression: true, privacy: true, compliance: true, budget: true },
        note: '稳定版本', audit: []
      },
      {
        id: 'rel-v2-baseline', name: 'Release v2（回滚基线）', status: 'rolled_back', createdAt: seedTime('14', '10:00'),
        snapshot: { script: 'sv-libin-v2', policy: 'pol-v2', primitive: 'prim-v1', asset: 'ap-base-v2', activity: null, modelRoute: 'heavy-only', clientMin: '1.3.0', regressionBaseline: 'reg-v2', compliance: 'approved' },
        checks: { scriptQuality: true, assetReview: true, clientCompat: true, regression: true, privacy: true, compliance: true, budget: true },
        note: '已回滚：主动语言偏多', audit: []
      }
    ];

    /* Experiment — 灰度实验（剧本 E） */
    S.experiments = [
      {
        id: 'exp-gray', name: 'pol-v4 低打扰策略灰度', releaseId: null, status: 'draft', createdAt: seedTime('17', '11:30'),
        cohort: { type: 'random', stratify: ['活跃度', '会员状态'], ratio: 10, isolation: true },
        window: { start: '2026-11-18', end: '2026-11-25', sampleTarget: 5000 },
        metrics: {
          primary: { watchTime: 0.0, retention: 0.0 },
          quality: { catchRate: 0.92, factAccuracy: 0.96, spoilerViolation: 0.014, frameConsistency: 0.99 },
          guardrail: { closeRate: 0.006, complaintRate: 0.004, stayUpRate: 0.011 },
          guardrailLimit: { closeRate: 0.01, complaintRate: 0.008, stayUpRate: 0.02 }
        },
        baseline: 'rel-v3-active', decision: 'pending', guardrailBreached: false, audit: []
      }
    ];

    /* Trace — 版本化运行轨迹（Eval/成本/预览共用） */
    S.traces = [
      {
        id: 'tr-spoiler-102', event: '用户问「结局是什么」', videoId: 'v-libin', videoTime: '26:50',
        fixture: 'adult', versions: { script: 'sv-libin-v3', policy: 'pol-v3', primitive: 'prim-v1', asset: 'ap-base-v3', release: 'rel-v3-active', client: '1.5.0' },
        retrieval: ['seg-4（屏蔽集）', 'ending:never'], gate: '语言通道放行', modelCalls: ['small:行为选择', 'heavy:语言生成'],
        output: { channels: ['神态', '语言'], text: '后面啊…他后来拿了冠军' }, statePatch: { energy: -1 },
        latencyMs: 840, cost: 0.021, degraded: false, spoiler: true, createdAt: seedTime('17', '15:20')
      },
      {
        id: 'tr-ok-101', event: '剧情节点「车评人压弯」', videoId: 'v-libin', videoTime: '03:12',
        fixture: 'adult', versions: { script: 'sv-libin-v3', policy: 'pol-v3', primitive: 'prim-v1', asset: 'ap-base-v3', release: 'rel-v3-active', client: '1.5.0' },
        retrieval: ['seg-2'], gate: '仅神态', modelCalls: [],
        output: { channels: ['神态'], text: '' }, statePatch: {},
        latencyMs: 12, cost: 0, degraded: false, spoiler: false, createdAt: seedTime('17', '15:18')
      }
    ];

    /* EvalDataset / EvalRun */
    S.evalDatasets = [
      { id: 'ds-v3', ver: 'v3', name: '回归集 v3', samples: [
        { id: 'sm-1', trace: 'tr-ok-101', expect: '神态', rubric: '不主动说话' },
        { id: 'sm-2', trace: 'tr-spoiler-102', expect: '不剧透', rubric: '未播信息不可说' }
      ], createdAt: seedTime('16', '16:00') }
    ];
    S.evalRuns = [
      { id: 'er-v3', datasetId: 'ds-v3', releaseId: 'rel-v3-active', versions: { policy: 'pol-v3', script: 'sv-libin-v3', model: 'mix-v1' },
        scores: { catchRate: 0.92, factAccuracy: 0.95, spoilerViolation: 0.02, frameConsistency: 0.99 }, judgeAgree: 0.88, humanReviewed: true, createdAt: seedTime('16', '17:00') }
    ];

    /* Badcase / FixTask（剧本 B） */
    S.badcases = [
      {
        id: 'bc-spoiler-102', traceId: 'tr-spoiler-102', severity: 'P0', attribution: 'spoiler_index', status: 'triaged',
        symptom: '问结局时说了后续走向', owner: 'content', fixVersion: null, regressionId: null,
        grayVerified: false, reopened: false, createdAt: seedTime('17', '15:25'), history: [{ s: 'new', t: seedTime('17', '15:21') }, { s: 'triaged', t: seedTime('17', '15:25') }]
      },
      { id: 'bc-098', traceId: 'tr-ok-101', severity: 'P1', attribution: '规则过滤', status: 'closed', symptom: '回应滑回人话「你觉得呢」', owner: 'exp', fixVersion: 'pol-v3', regressionId: 'reg-v3', grayVerified: true, reopened: false, createdAt: seedTime('15', '10:00'), history: [] },
      { id: 'bc-095', traceId: null, severity: 'P1', attribution: '闸门阈值', status: 'fixing', symptom: '深夜仍高频发言', owner: 'exp', fixVersion: 'pol-v4-draft', regressionId: null, grayVerified: false, reopened: false, createdAt: seedTime('16', '20:00'), history: [] }
    ];
    S.fixTasks = [
      { id: 'fix-102', badcaseId: 'bc-spoiler-102', target: 'seg-4.spoiler_index', candidateVersion: 'sv-libin-v4-draft', regressionId: null, status: 'open', createdAt: seedTime('17', '15:30') }
    ];
    S.regressionSets = [
      { id: 'reg-v3', name: 'v3 回归集', cases: ['sm-1', 'sm-2'], passRate: 1.0, createdAt: seedTime('16', '16:00') }
    ];

    /* ProfileFixture — 用户侧（剧本 D） */
    S.profiles = [
      {
        id: 'pf-adult', name: '成人用户 · 小林', type: 'adult', globalEnabled: true,
        summary: '喜欢车评、深夜看片、养猫',
        fragments: [
          { id: 'frag-hotpot', text: '上次说想吃火锅', tags: ['火锅', '吃的'], createdAt: seedTime('14', '21:00') },
          { id: 'frag-car', text: '反复看李伯霖那期', tags: ['车评'], createdAt: seedTime('15', '20:00') },
          { id: 'frag-cat', text: '养了一只橘猫', tags: ['猫'], createdAt: seedTime('16', '19:00') }
        ],
        persona: { closeness: 0.6, tone: '同辈式' }, alias: '小电视', localEnergy: 6,
        privacyRequests: []
      },
      {
        id: 'pf-teen', name: '青少年用户 · 小明', type: 'minor', globalEnabled: false,
        summary: '', fragments: [], persona: null, alias: null, localEnergy: 6, privacyRequests: []
      }
    ];

    /* PrivacyRequest / DeletionJob（剧本 D） */
    S.privacyRequests = [];
    S.deletionJobs = [];

    /* CostLedger — 统一调用账本（剧本 E，按版本/Release 聚合） */
    S.costLedger = [
      { id: 'cl-1', link: 'tr-spoiler-102', release: 'rel-v3-active', type: '小模型(行为选择)', model: 'small-v1', unit: '次', qty: 1, price: 0.002, priceVer: 'p1', retry: 0, cost: 0.002 },
      { id: 'cl-2', link: 'tr-spoiler-102', release: 'rel-v3-active', type: '语言生成', model: 'heavy-v1', unit: '1k tok', qty: 1.9, price: 0.01, priceVer: 'p1', retry: 0, cost: 0.019 },
      { id: 'cl-3', link: 'pj-libin', release: 'rel-v3-active', type: '离线解读/仲裁', model: 'offline-v1', unit: '稿', qty: 1, price: 0.05, priceVer: 'p1', retry: 0, cost: 0.05, amortized: true },
      { id: 'cl-4', link: 'tr-ok-101', release: 'rel-v3-active', type: 'ASR', model: 'asr-v1', unit: '分钟', qty: 0.1, price: 0.003, priceVer: 'p1', retry: 0, cost: 0.0003 }
    ];
    S.costAssumptions = {
      priceVer: 'p1', daudBase: 100000,
      items: [
        { name: '离线解读/仲裁', value: 0.05, unit: '元/稿', note: '全平台摊薄，非每 DAU' },
        { name: '在线行为小模型', value: 0.002, unit: '元/次', note: '复杂事件才调用' },
        { name: '在线语言生成', value: 0.019, unit: '元/次', note: '仅用户显式输入触发' },
        { name: 'ASR', value: 0.003, unit: '元/分钟', note: '轻点开麦后才计费' }
      ],
      note: '¥/DAU 为假设测算，非实测；公开输入与公式见架构页。'
    };

    /* AuditLog — 每次状态迁移都写 */
    S.auditLog = [
      { id: 'al-1', at: seedTime('16', '16:00'), role: 'release', action: '发布 Release', object: 'rel-v3-active', before: 'ready', after: 'active' },
      { id: 'al-2', at: seedTime('17', '15:25'), role: 'eval', action: '标注 badcase', object: 'bc-spoiler-102', before: 'new', after: 'triaged' }
    ];

    /* 待办（由对象派生，见 derive），此处只放需人工触发的说明 */
    return S;
  }

  /* ───────────────────────────── 状态机 ───────────────────────────── */
  var MACHINES = {
    asset:     ['draft', 'checking', 'needs_review', 'approved', 'published', 'archived'],
    release:   ['draft', 'validating', 'blocked', 'ready', 'gray', 'active', 'paused', 'rolled_back'],
    badcase:   ['new', 'triaged', 'fixing', 'regression', 'gray_verification', 'closed', 'reopened'],
    privacy:   ['pending', 'running', 'completed', 'failed', 'retrying']
  };

  /* ───────────────────────────── RBAC ─────────────────────────────
   * 权限矩阵：动作 → 允许角色。guest 无写权限。
   * ────────────────────────────────────────────────────────────── */
  var PERMS = {
    'content.arbitrate':   ['content'],
    'content.publishScript': ['content'],
    'exp.editPolicy':      ['exp'],
    'exp.editAsset':       ['exp'],
    'exp.editActivity':    ['exp'],
    'eval.annotate':       ['eval'],
    'eval.regression':     ['eval'],
    'eval.fixTask':        ['eval'],
    'release.create':      ['content', 'exp'],
    'release.submit':      ['content', 'exp'],
    'release.approve':     ['compliance'],
    'release.gray':        ['release'],
    'release.rollback':    ['release'],
    'privacy.handle':      ['compliance'],
    'compliance.approve':  ['compliance'],
    'config.reset':        [] // 任何角色都不允许改硬规则；复位演示数据由顶栏特殊处理
  };
  function can(role, action) {
    var roles = PERMS[action];
    if (!roles) return true; // 未列动作默认只读可点
    return roles.indexOf(role) !== -1;
  }

  /* ───────────────────────────── Store 核心 ───────────────────────────── */
  var state = null;
  var listeners = [];
  var bc = null;
  var saving = false;

  function load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.meta && parsed.meta.schema === SCHEMA) { state = parsed; return; }
      }
    } catch (e) { /* file:// 下不可用则回退内存态 */ }
    state = buildSeed();
    persist();
  }

  function persist() {
    saving = true;
    try { if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    try { if (bc) bc.postMessage({ from: TAB_ID, state: state }); } catch (e) {}
    saving = false;
  }

  function notify() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error('[store listener]', e); } }); }

  function setupChannel() {
    try {
      if (global.BroadcastChannel) {
        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = function (ev) {
          if (!ev.data || ev.data.from === TAB_ID || !ev.data.state) return;
          state = ev.data.state;
          notify(); // 跨页同步后触发重绘；更以 localStorage 为准
        };
      } else {
        global.addEventListener('storage', function (ev) {
          if (ev.key !== KEY || !ev.newValue) return;
          try { state = JSON.parse(ev.newValue); notify(); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  /* 事务：修改 → 持久化 → 广播 → 重绘
   * fn 直接改 state；返回真值表示成功。opt.audit 提供则写审计。
   */
  function tx(fn, opt) {
    opt = opt || {};
    var result = fn(state);
    if (result === false) return false; // 前置不满足，拒绝
    if (opt.audit) {
      state.auditLog = state.auditLog || [];
      state.auditLog.push({
        id: uid('al'), at: now(), role: state.currentRole,
        action: opt.audit.action, object: opt.audit.object || '',
        before: opt.audit.before, after: opt.audit.after, note: opt.audit.note || ''
      });
    }
    persist();
    notify();
    return result === undefined ? true : result;
  }

  /* 状态机迁移：校验合法性 + 写 history + 写审计 */
  function transition(coll, id, to, auditAction, note) {
    var obj = find(coll, id);
    if (!obj) return false;
    var machine = MACHINES[obj._machine] || null;
    return tx(function (S) {
      var o = find(coll, id);
      if (!o) return false;
      if (machine && machine.indexOf(to) === -1) return false;
      var from = o.status;
      o.status = to;
      o.history = o.history || [];
      o.history.push({ s: to, t: now() });
      if (auditAction) {
        S.auditLog.push({ id: uid('al'), at: now(), role: S.currentRole, action: auditAction, object: id, before: from, after: to, note: note || '' });
      }
      return true;
    });
  }

  /* ───────────────────────────── 查询 / 派生 ───────────────────────────── */
  function find(coll, id) { return (state[coll] || []).filter(function (x) { return x.id === id; })[0] || null; }
  function activeRelease() { return find('releases', state.meta.currentReleaseId); }

  function derive() {
    var d = {};
    var videos = state.videos, jobs = state.parseJobs, svs = state.scriptVersions;

    // 稿件统计由数组推导
    d.videoTotal = videos.length;
    d.videoPublished = videos.filter(function (v) { return v.status === 'published'; }).length;
    d.videoProcessing = videos.filter(function (v) { return v.status === 'parsing' || v.status === 'queued'; }).length;

    // 表情数量由统一资产表推导
    d.assetTotal = (find('assetPacks', 'ap-base-v3') || { assets: [] }).assets.length;

    // Eval 指标由样本/标签与 run 推导（取当前 release 的 run）
    var run = state.evalRuns.filter(function (r) { return r.releaseId === state.meta.currentReleaseId; })[0] || state.evalRuns[0];
    d.eval = run ? run.scores : { catchRate: 0, factAccuracy: 0, spoilerViolation: 0, frameConsistency: 0 };
    d.judgeAgree = run ? run.judgeAgree : 0;

    // badcase 统计
    d.badcaseOpen = state.badcases.filter(function (b) { return b.status !== 'closed'; }).length;
    d.badcaseP0 = state.badcases.filter(function (b) { return b.severity === 'P0' && b.status !== 'closed'; }).length;

    // 待办：低置信剧本 / 待审批 Release / P0 badcase / 隐私失败 / 预算告警
    d.todos = [];
    svs.forEach(function (sv) {
      sv.segments.forEach(function (seg) {
        if (seg.needsReview || seg.confidence < 0.7) d.todos.push({ key: 'low-conf', label: sv.title || (find('videos', sv.videoId) || {}).title || sv.videoId, sub: '事实置信度不足 · ' + seg.node, link: 'script', id: sv.id, sev: 'amber' });
      });
    });
    state.releases.forEach(function (r) {
      if (r.status === 'validating' || r.status === 'ready') d.todos.push({ key: 'release-approval', label: r.name, sub: '待审批 / 待灰度', link: 'release', id: r.id, sev: 'blue' });
    });
    state.badcases.filter(function (b) { return b.severity === 'P0' && b.status !== 'closed'; }).forEach(function (b) {
      d.todos.push({ key: 'badcase-p0', label: 'P0 badcase · ' + b.symptom, sub: b.id, link: 'eval', id: b.id, sev: 'pink' });
    });
    state.deletionJobs.filter(function (j) { return j.status === 'failed'; }).forEach(function (j) {
      d.todos.push({ key: 'privacy-fail', label: '隐私删除失败', sub: j.id, link: 'privacy', id: j.id, sev: 'pink' });
    });
    d.budgetAlert = false; // 由剧本 E 触发

    // 成本：由 CostLedger 推导
    d.costByRelease = {};
    state.costLedger.forEach(function (c) {
      d.costByRelease[c.release] = (d.costByRelease[c.release] || 0) + c.cost;
    });
    d.costTotal = state.costLedger.reduce(function (s, c) { return s + c.cost; }, 0);

    // Trace 版本链完整性
    d.traceCount = state.traces.length;
    d.allTracesVersioned = state.traces.every(function (t) { return t.versions && t.versions.release; });

    return d;
  }

  /* ───────────────────────────── 领域动作（跨页复用） ─────────────────────────────
   * 每个动作都做前置检查：不满足返回 {ok:false, reason}，满足则 tx 并写审计。
   * ────────────────────────────────────────────────────────────── */
  var actions = {
    /* 剧本 A：事实仲裁 → 发布 ScriptVersion → 创建 Release 候选 */
    arbitrateFact: function (segId, factText) {
      var sv = find('scriptVersions', 'sv-libin-v3');
      if (!sv) return { ok: false, reason: '找不到剧本版本' };
      return tx(function (S) {
        var seg = find('scriptVersions', 'sv-libin-v3').segments.filter(function (s) { return s.id === segId; })[0];
        if (!seg) return false;
        seg.facts = [factText];
        seg.confidence = 0.95;
        seg.needsReview = false;
        return true;
      }, { audit: { action: '人工仲裁事实', object: 'sv-libin-v3/' + segId, after: factText } }) ? { ok: true } : { ok: false, reason: '操作未生效' };
    },
    rerunFailedSegment: function (jobId) {
      return tx(function (S) {
        var j = find('parseJobs', jobId);
        if (!j || j.status === 'done') return false;
        j.done = Math.min(j.done + 1, j.steps.length);
        j.retry += 1;
        j.status = j.done >= j.steps.length ? 'done' : 'running';
        j.log.push('重跑失败段（第 ' + j.retry + ' 次）→ 完成');
        j.updatedAt = now();
        return true;
      }, { audit: { action: '重跑失败段', object: jobId } }) ? { ok: true } : { ok: false, reason: '该任务无失败段' };
    },
    publishScript: function (svId) {
      var sv = find('scriptVersions', svId);
      if (!sv) return { ok: false, reason: '无剧本版本' };
      var bad = sv.segments.filter(function (s) { return s.needsReview || s.confidence < 0.7; });
      if (bad.length) return { ok: false, reason: '质量闸门未通过：' + bad.length + ' 段低置信，只能重跑失败段' };
      return tx(function (S) {
        var o = find('scriptVersions', svId);
        o.status = 'published'; o.quality = 'approved';
        var v = find('videos', o.videoId); if (v) v.onlineScriptVersion = svId;
        return true;
      }, { audit: { action: '发布 ScriptVersion', object: svId, after: 'published' } }) ? { ok: true } : { ok: false, reason: '发布失败' };
    },
    createRelease: function (patch) {
      return tx(function (S) {
        var cur = activeRelease();
        var snapshot = deepClone(cur.snapshot);
        Object.keys(patch || {}).forEach(function (k) { snapshot[k] = patch[k]; });
        var checks = { scriptQuality: true, assetReview: true, clientCompat: true, regression: false, privacy: true, compliance: false, budget: true };
        var r = { id: uid('rel'), name: 'Release 候选 ' + (S.releases.length + 1), status: 'draft', createdAt: now(), snapshot: snapshot, checks: checks, note: '由内容生产带入', audit: [] };
        S.releases.push(r);
        S._lastReleaseId = r.id;
        return r.id;
      }, { audit: { action: '创建 Release 候选' } });
    },
    setReleaseCheck: function (relId, key, val) {
      return tx(function (S) {
        var r = find('releases', relId); if (!r) return false;
        r.checks[key] = !!val; return true;
      });
    },
    releasePassable: function (relId) {
      var r = find('releases', relId); if (!r) return { ok: false, reason: '无 Release' };
      var must = ['scriptQuality', 'assetReview', 'clientCompat', 'regression', 'privacy', 'compliance', 'budget'];
      var miss = must.filter(function (k) { return !r.checks[k]; });
      if (miss.length) return { ok: false, reason: '前置未满足：' + miss.join(' / ') };
      return { ok: true };
    },
    approveRelease: function (relId) {
      if (!can(state.currentRole, 'release.approve')) return { ok: false, reason: '当前角色（' + roleName(state.currentRole) + '）不能审批，需合规员' };
      return transition('releases', relId, 'ready', '审批 Release', '合规批准');
    },
    grayRelease: function (relId) {
      if (!can(state.currentRole, 'release.gray')) return { ok: false, reason: '当前角色不能灰度，需发布负责人' };
      var p = actions.releasePassable(relId); if (!p.ok) return p;
      return tx(function (S) {
        var r = find('releases', relId); r.status = 'gray';
        S.meta.currentReleaseId = relId;
        return true;
      }, { audit: { action: '灰度发布', object: relId, after: 'gray' } }) ? { ok: true } : { ok: false, reason: '灰度失败' };
    },
    activateRelease: function (relId) {
      if (!can(state.currentRole, 'release.gray')) return { ok: false, reason: '当前角色不能全量' };
      var r = find('releases', relId); if (!r || r.status !== 'gray') return { ok: false, reason: '仅 gray 状态可全量' };
      return tx(function (S) {
        find('releases', relId).status = 'active';
        S.meta.currentReleaseId = relId;
        return true;
      }, { audit: { action: '全量发布', object: relId } }) ? { ok: true } : { ok: false, reason: '失败' };
    },
    rollbackRelease: function (relId) {
      if (!can(state.currentRole, 'release.rollback')) return { ok: false, reason: '当前角色不能回滚' };
      return tx(function (S) {
        var r = find('releases', relId); if (!r) return false;
        r.status = 'rolled_back';
        var back = find('releases', S.meta.baselineReleaseId) || S.releases.filter(function (x) { return x.status === 'rolled_back' && x.id !== relId; })[0];
        S.meta.currentReleaseId = back ? back.id : relId;
        return true;
      }, { audit: { action: '回滚 Release', object: relId, after: 'rolled_back' } }) ? { ok: true } : { ok: false, reason: '回滚失败' };
    },

    /* 剧本 C：活动包生命周期 */
    validateActivityPhrase: function (phrase) {
      var pol = find('policyVersions', 'pol-v3');
      var ban = pol.language.ban;
      for (var i = 0; i < ban.length; i++) if (phrase.indexOf(ban[i]) !== -1) return { ok: false, reason: '命中禁用句式「' + ban[i] + '」，需符合电报体' };
      if (phrase.length > pol.language.maxLen) return { ok: false, reason: '超过电报体长度上限 ' + pol.language.maxLen + ' 字' };
      return { ok: true };
    },
    submitActivity: function (actId) {
      if (!can(state.currentRole, 'exp.editActivity')) return { ok: false, reason: '当前角色不能编辑活动包，需体验运营' };
      var a = find('activities', actId); if (!a) return { ok: false, reason: '无活动包' };
      for (var i = 0; i < a.overrides.phrases.length; i++) {
        var v = actions.validateActivityPhrase(a.overrides.phrases[i]);
        if (!v.ok) return v;
      }
      return transition('activities', actId, 'approved', '活动包校验通过', '短句合规');
    },
    grayActivity: function (actId) {
      var a = find('activities', actId); if (!a || a.status !== 'approved') return { ok: false, reason: '活动包未审核通过' };
      return tx(function (S) {
        find('activities', actId).status = 'running';
        return true;
      }, { audit: { action: '活动包加入 Release 灰度', object: actId } }) ? { ok: true } : { ok: false, reason: '失败' };
    },
    expireActivity: function (actId) {
      return tx(function (S) {
        var a = find('activities', actId); if (!a) return false;
        a.status = 'archived';
        S.auditLog.push({ id: uid('al'), at: now(), role: S.currentRole, action: '活动到期撤下·回退基础资产', object: actId, before: 'running', after: 'archived' });
        // Trace 仍保留活动版本引用，不回滚整个 Release
        return true;
      }) ? { ok: true } : { ok: false, reason: '失败' };
    },

    /* 剧本 B：badcase 归因 → 修复 → 回归 → 灰度验证 → 关闭 */
    createFixTask: function (badcaseId, target, candidateVersion) {
      if (!can(state.currentRole, 'eval.fixTask')) return { ok: false, reason: '当前角色不能建修复工单，需评测员' };
      var b = find('badcases', badcaseId); if (!b) return { ok: false, reason: '无 badcase' };
      return tx(function (S) {
        var id = uid('fix');
        S.fixTasks.push({ id: id, badcaseId: badcaseId, target: target, candidateVersion: candidateVersion, regressionId: null, status: 'open', createdAt: now() });
        var bc = find('badcases', badcaseId); bc.status = 'fixing'; bc.fixVersion = candidateVersion;
        bc.history = bc.history || []; bc.history.push({ s: 'fixing', t: now() });
        return true;
      }, { audit: { action: '创建修复工单', object: badcaseId, after: candidateVersion } }) ? { ok: true } : { ok: false, reason: '失败' };
    },
    passRegression: function (badcaseId, caseId) {
      if (!can(state.currentRole, 'eval.regression')) return { ok: false, reason: '当前角色不能维护回归集' };
      return tx(function (S) {
        var bc = find('badcases', badcaseId);
        bc.status = 'gray_verification';
        bc.regressionId = caseId || 'reg-v4';
        bc.history = bc.history || []; bc.history.push({ s: 'gray_verification', t: now() });
        var f = S.fixTasks.filter(function (x) { return x.badcaseId === badcaseId; })[0]; if (f) f.regressionId = bc.regressionId;
        return true;
      }, { audit: { action: '回归通过→灰度验证', object: badcaseId } }) ? { ok: true } : { ok: false, reason: '失败' };
    },
    closeBadcase: function (badcaseId, verified) {
      var bc = find('badcases', badcaseId); if (!bc) return { ok: false, reason: '无 badcase' };
      if (bc.status !== 'gray_verification') return { ok: false, reason: '需先通过灰度验证' };
      if (!verified) {
        return tx(function (S) {
          var o = find('badcases', badcaseId); o.status = 'reopened'; o.reopened = true;
          o.history = o.history || []; o.history.push({ s: 'reopened', t: now() });
          return true;
        }, { audit: { action: '灰度验证失败·重开', object: badcaseId, after: 'reopened' } }) ? { ok: true, reopened: true } : { ok: false };
      }
      return tx(function (S) {
        var o = find('badcases', badcaseId); o.status = 'closed'; o.grayVerified = true;
        o.history = o.history || []; o.history.push({ s: 'closed', t: now() });
        return true;
      }, { audit: { action: '灰度验证通过·关闭 badcase', object: badcaseId, after: 'closed' } }) ? { ok: true } : { ok: false };
    },

    /* 剧本 E：护栏越线 → 暂停 → 回滚 → badcase 自动生成 */
    breachGuardrail: function (expId, metric) {
      return tx(function (S) {
        var e = find('experiments', expId); if (!e) return false;
        if (metric) e.metrics.guardrail[metric] = e.metrics.guardrailLimit[metric] * 1.5;
        e.guardrailBreached = true;
        e.decision = 'paused';
        e.status = 'paused';
        e.audit = e.audit || []; e.audit.push({ at: now(), action: '护栏越线·自动暂停扩张', metric: metric });
        S.auditLog.push({ id: uid('al'), at: now(), role: S.currentRole, action: '护栏越线·自动暂停', object: expId, note: metric || '' });
        // 自动生成关联 badcase
        if (!S.badcases.filter(function (b) { return b.relatedExp === expId; })[0]) {
          S.badcases.push({ id: uid('bc'), traceId: 'tr-spoiler-102', severity: 'P0', attribution: '闸门阈值', status: 'new', symptom: '护栏越线：' + (metric || '投诉率'), owner: 'exp', fixVersion: null, regressionId: null, grayVerified: false, reopened: false, relatedExp: expId, createdAt: now(), history: [{ s: 'new', t: now() }] });
        }
        return true;
      }) ? { ok: true } : { ok: false };
    },

    /* 剧本 D：隐私删除任务（失败重试） */
    createDeletionJob: function (profileId, targetText, failFirst) {
      if (!can(state.currentRole, 'privacy.handle')) return { ok: false, reason: '当前角色不能处理隐私请求，需合规员' };
      return tx(function (S) {
        var p = find('profiles', profileId); if (!p) return false;
        var req = { id: uid('pr'), profileId: profileId, type: 'delete-fragment', target: targetText, status: 'pending', createdAt: now() };
        S.privacyRequests.push(req);
        var steps = [
          { name: '原存储', done: false }, { name: '摘要', done: false }, { name: '向量索引', done: false },
          { name: '缓存', done: false }, { name: 'Eval 样本引用', done: false }, { name: 'Trace 原文引用', done: false }, { name: '派生数据', done: false }
        ];
        var job = { id: uid('dj'), requestId: req.id, profileId: profileId, target: targetText, steps: steps, status: 'running', failAt: failFirst ? '向量索引' : null, retry: 0, createdAt: now() };
        S.deletionJobs.push(job);
        p.privacyRequests = p.privacyRequests || []; p.privacyRequests.push(req.id);
        return job.id;
      }, { audit: { action: '创建隐私删除请求', object: targetText } });
    },
    runDeletionJob: function (jobId) {
      return tx(function (S) {
        var j = find('deletionJobs', jobId); if (!j || j.status === 'completed') return false;
        for (var i = 0; i < j.steps.length; i++) {
          var st = j.steps[i];
          if (st.done) continue;
          if (!j.failAt || j.retry > 0 || st.name !== j.failAt) { st.done = true; continue; }
          // 首次运行到 failAt 失败
          j.status = 'failed';
          S.auditLog.push({ id: uid('al'), at: now(), role: S.currentRole, action: '删除任务失败', object: jobId, note: st.name });
          return true;
        }
        // 全部完成 → 删除对应碎片
        j.status = 'completed';
        var p = find('profiles', j.profileId);
        if (p) p.fragments = p.fragments.filter(function (f) { return f.text.indexOf(j.target) === -1 && f.tags.indexOf(j.target) === -1; });
        find('privacyRequests', j.requestId).status = 'completed';
        S.auditLog.push({ id: uid('al'), at: now(), role: S.currentRole, action: '删除任务完成·C端生效', object: jobId });
        return true;
      }) ? { ok: true } : { ok: false };
    },
    retryDeletionJob: function (jobId) {
      return tx(function (S) {
        var j = find('deletionJobs', jobId); if (!j || j.status !== 'failed') return false;
        j.retry += 1; j.status = 'retrying'; j.failAt = null;
        return true;
      }, { audit: { action: '重试删除任务', object: jobId } }) ? { ok: true } : { ok: false };
    },

    /* Trace 写入（C 端 preview 调用） */
    pushTrace: function (trace) {
      return tx(function (S) {
        var t = deepClone(trace);
        t.id = t.id || uid('tr');
        t.createdAt = now();
        t.versions = t.versions || {};
        var rel = activeRelease();
        t.versions.release = t.versions.release || (rel && rel.id);
        t.versions.script = t.versions.script || (rel && rel.snapshot.script);
        t.versions.policy = t.versions.policy || (rel && rel.snapshot.policy);
        t.versions.asset = t.versions.asset || (rel && rel.snapshot.asset);
        S.traces.push(t);
        // 成本入账
        if (t.cost > 0) {
          S.costLedger.push({ id: uid('cl'), link: t.id, release: t.versions.release, type: '在线调用', model: 'mix-v1', unit: '次', qty: 1, price: t.cost, priceVer: S.costAssumptions.priceVer, retry: 0, cost: t.cost });
        }
        return t.id;
      });
    },
    resetProfile: function (profileId) {
      if (!can(state.currentRole, 'privacy.handle')) return { ok: false, reason: '需合规员' };
      return tx(function (S) {
        var p = find('profiles', profileId); if (!p) return false;
        p.summary = ''; p.fragments = []; p.persona = null; p.alias = null; // 含派生 persona/索引
        return true;
      }, { audit: { action: '重置 BOT·清除全部数据（含派生）', object: profileId } }) ? { ok: true } : { ok: false };
    },
    setRole: function (roleId) {
      return tx(function (S) { S.currentRole = roleId; return true; });
    },
    toggleGlobal: function (profileId) {
      return tx(function (S) { var p = find('profiles', profileId); if (p) p.globalEnabled = !p.globalEnabled; return true; }, { audit: { action: '切换 BOT 总开关', object: profileId } });
    }
  };

  function roleName(id) { var r = (state.roles || []).filter(function (x) { return x.id === id; })[0]; return r ? r.name : id; }

  /* ───────────────────────────── 复位 ───────────────────────────── */
  function reset() {
    state = buildSeed();
    persist();
    notify();
    return true;
  }

  /* ───────────────────────────── 导出 ───────────────────────────── */
  var DemoStore = {
    get state() { return state; },
    KEY: KEY,
    TAB_ID: TAB_ID,
    machines: MACHINES,
    can: can,
    roleName: roleName,
    find: find,
    activeRelease: activeRelease,
    derive: derive,
    tx: tx,
    transition: transition,
    actions: actions,
    reset: reset,
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    // 供页面读取后强制刷新其它页
    refresh: function () { persist(); notify(); },
    init: function () { load(); setupChannel(); return DemoStore; }
  };

  DemoStore.init();
  global.DemoStore = DemoStore;
})(window);
