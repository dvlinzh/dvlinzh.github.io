/* 评分口径的唯一实现：六维 → 原始分 → 匹配度调节 → 总分（v23：四个权重维度任一缺失不给数字；极化系数退役留档）。

   浏览器与后端都引用这一份：后端用它算新报告（lib/ai.js），
   前端用它重算历史档案、画分析图（public/app.js）。
   历史上两边各写一套，结果同一份数据在不同路径下算出不同的分
   （补薪资重算会把缺失维度归一化掉、补休息重算不乘极化系数），
   所以这里收成一份，谁都不许再抄第二份。

   SCORE_VERSION：改动下面任何一条算法就 +1。
   前端据此判断历史档案里的分是不是旧口径算的，需要就重算，不再靠肉眼比对。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // v2：双休假期改成梯度表（法定基准 117 天 = 9 分、超出法定 10 分），
  //     并把「休息描述 → 年均休息日」收进本模块供前后端共用。
  // v3：梯度表补全——0 到 10 每一档都有对应的「年均休息日范围」（原来 7 分和 2 分取不到，
  //     档位跨度也忽大忽小）；「完全没写休息」不再单独给分，而是按保守假设 61 天
  //     走同一张表（落 3 分），评分与图表共用这一个假设——同一条档案不会再出现两个天数。
  // v4：总分权重调成 薪资 35 / 稳定性 30 / 双休 25 / 发展 10（原来是 35 / 25 / 25 / 15）；
  //     双休梯度表按「每一档＝一种作息的质变」重排，单休落到 3 分。
  // v5：发展潜力改成 36 格组合表（行业周期 × 公司阶段 × 晋升路径），模型只给带证据的标签，
  //     衰退行业硬封顶 4 分；双休假期的「加班」口径升级成「劳动强度」，最多降 2 档，
  //     且通用套话（抗压能力强这类）不计分；两个维度的标签都落库，历史档案可按标签重算。
  // v6：总分权重调成 薪资 35 / 稳定性 20 / 双休 25 / 发展 20（原来是 35 / 30 / 25 / 10）——
  //     稳定性与发展同权：稳定但没上升空间同样是坑。
  // v7：发展潜力不再只看「在这家能干到哪」——那只是公司给的；补上「干完这段对下一份同类工作值多少」
  //     （履历增值：市场吃香程度 × 能力可迁移性，3×3 表），两者各占一半。
  // v8：没写休息不再按保守假设（61 天 → 3 分）。JD 里没有单休 / 大小周 / 少休息高强度这类负面字眼时，
  //     默认按「双休成立、但不把未承诺的年假与法定节假日算进去」的 104 天折算 → 7 分；
  //     负面字眼照旧各自降档（单休 65 天、大小周 91 天、强度最多 −2）。
  // v9：发展潜力换成「分布法」——按职业×城市的薪资分布算 b（P30）与 t（P87.5），
  //     k′ =（落差率）×（天花板率）查量表定分；旧的 36 格表 + 履历增值表整套废弃。
  // v10：发展潜力的分布采不到本地时不再留空——先借同职业其他城市的分布形状（按两地社平等比折算），
  //      连形状都没有就用当地社平工资 + 库内典型离散度中性折算；两者都会在文案与「依据」里
  //      写明参考的是什么，并在维度旁挂 ? 提示可联网重采（采到即换成本地实测）。
  // v11：发展潜力不再只认岗位名——分布算的是「这个职业在这个城市」的平均情形，同一岗位名
  //      在小卖部还是在头部大厂，分布都是同一条；现在再按这一份 JD 的实情乘一个修正系数
  //      （名实 / 业务位置 / 公司体量 / 收入结构 / 薪资定位，五项相乘、夹在 0.30–1.15）。
  //      同时取消「底薪型一律封顶 6 分」的硬门禁：低底薪高提成型改由收入结构系数按证据
  //      保守收窄（提成写明 ×0.8、只有口号 ×0.6、纯提成 ×0.5），不再一刀切钉死在 6 分。
  // v12：修正系数改成从模型里推出来的，不再是一组凭感觉定的档位——
  //      ① JD 自己的薪资并入模型：这份岗位的水平比 ρ＝它的月当量 ÷ 同类中位；
  //         岗位水平整体平移时 b、t 等比跟着走，所以 k′ 与水平的平方同比例（ρ²）。
  //         但招聘薪资只是一个噪声观测（可能只是起薪、可能写得虚高），所以把 2 次方压到
  //         1.5 次方，并夹在 0.30–1.25：C_薪资 ＝ clamp((月当量 ÷ 同类中位)^1.5, 0.30, 1.25)。
  //      ② 底薪型（b 低于私营社平 6 成）不再是收入结构里的一档系数：它的右尾那 12.5%
  //         是销冠与运气、不是普通人的台阶，所以分布本身就把天花板从 P87.5 换成 P75。
  //      ③ 四项判断（名实 / 业务位置 / 公司体量 / 收入结构）仍是 k′ 口径的乘数，含义统一成
  //         「这条梯子对这个岗位还剩多少」；判断只压不抬——抬分交给唯一可核实的薪资。
  //      ④ 合计乘在 k′ 上（不再是乘在最终分上），夹在 0.12–1.15，再查同一张量表落档。
  // v13：发展潜力退回分布法——只认「职业×城市的薪资分布」，不再把这一份 JD 折进模型：
  //     v11/v12 的整套修正层（这份 JD 的薪资水平比 ＋ 名实 / 业务位置 / 公司体量 / 收入结构
  //     四项判断）全部废弃，分布分就是最终分。v12 里唯一留下的那条是「底薪型的天花板改按
  //     P75 取」——它本来就是分布自己的形状（低底薪那个职业的分布长得矮），不是对 JD 的判断。
  //     理由：分布算的是「这个职业在这个城市」的情形；再按一份招聘文字去乘系数，乘出来的是
  //     「这家公司开的价」，不是「这个职业的空间」。同名不同岗的差别交回给读者看 JD 本身。
  // 口径变了要重算历史档案：前端看这个版本号触发。
  // v15：发展空间改成两层——客观层（职业的官方分位值）与主观层（再折进这一份 JD 的薪资），
  //     两层同构：K = 落差/c × 水平的几何平均/c，查同一张量表。分位点由 P25/P90 换成 P20/P80
  //     （P80＝「较好达到的位置」，比 P87.5 更贴普通人），c 由全市中位换成非私社平。
  // v14：发展空间的「量」和「刻度」都换成官方数据，自造的 P30/P87.5 与手挑的 9 条锚点全部废弃：
  //     ① 量：k1 = (P90−P25)/M × P90/M，分位值取该职业在该城市的**官方工资价位**
  //        （人社局年度发布），M ＝ 该城市官方工资**中位数**（原来用的是非私营在岗社平＝平均数，差 84%）。
  //     ② 刻度：不再手挑案例，改成对 ln k1 的实测分布按**等 σ 步长**切——
  //        第 i 条线 ＝ exp(μ + (i−5)×0.7σ)，μ/σ 由该城官方职业库算出，每城一张（data/city-wage-ladder.json）。
  //     ③ 保留 v13 的 growthSpaceScore 作兜底：该城还没采到官方工资价位时，仍用招聘拟合的分布。
  // v16：兜底口径也补上主观层——官方表里查不到的职业，只要这一份 JD 有报价，同样折进
  //     K₂（r₁′＝(JD高 − JD低)÷c、r₂′ 用分布的 P50/P80 与 JD 中位），查同一张 k′ 量表；
  //     读不到报价才退回 K₁。两条口径至此都读这份 JD，不再有「这一维不看这份 JD」的说法。
  // v17：主观层再加一个成色系数 C ＝ 对口度 × 用工形式 × 业务位置（夹在 0.30–1.20），
  //     K₂′ ＝ K₂ × C。三项都由模型指档位、程序查表，且**必须有 JD 原文原句才生效**：
  //     指了档位却拿不出原句的，一律退回最中立的一档（系数 1）——没证据不压分、更不抬分。
  //     系数表与档位名见 lib/ai.js 的 GROWTH_FIT / GROWTH_FORM / GROWTH_POS。
  // v21：薪资刻度换成「整分位」——1 分＝最低工资（原点），2–10 分＝本城工资分布的前 90/70/50/30/15/5/2/1/0.3%，
  //     金额由官方价位表的 262 个职业分位值算出并取两位有效数字（官方中位 8,313 → 前 49.3%、职业高位的
  //     P90 29,670 → 前 2.3%、P99 48,859 → 前 0.3%，两套口径互相印证）。口径一样是「分数＝薪水在本城的位置」，
  //     但每档的分位是整数、金额是好记的数。
  // v20：薪资刻度改成「五个官方锚点 + 段内等比」——2 分＝最低工资、4 分＝工资中位、6/8/10 分＝
  //     官方价位表里职业高位（各职业 P90）的中位 / P90 / P99；相邻锚点之间取几何中点（段内等比，
  //     即对数正态的局部等步长）。v19 的「一条 σ 走到底」上三档要 10 万–36 万，普通岗位够不着。
  // v19：薪资维度换成「本地锚点 + 对数等步长」刻度——当地工资中位数 → 4 分、当地最低工资 → 2 分，
  //     每档相差固定倍数 exp(σ)，σ ＝ ln(中位 ÷ 最低工资) ÷ 2；不再用全国通用的年薪表与城市系数。
  //     旧档案存了 payCalc.ladder 的可以照着重算，没存的（v18 及以前）保留原分、重分析一次即换新口径。
  // v22：匹配度口径整体放宽——职责命中分 partial 0.5 → 0.6；命中率 ÷ 0.8 后才封顶
  //     （七八成覆盖就按「完全能胜任」算）；门槛系数 partial 0.7 → 0.85、miss 0.3 → 0.5；
  //     匹配度调节系数随之收窄到 0.8 ~ 1.2（原来 0.6 ~ 1.15）。常量与文案见 lib/ai.js 的 MATCH_*。
  // v23：总分口径改「资料不全不给数字」——四个权重维度（薪资 / 双休 / 发展 / 稳定性）任一缺失，
  //     overall 直接为 null（界面显示「资料不全」，由缺口清单解释原因）；极化系数 λ 退役，
  //     缺失不再折算成一个偏低的分。匹配度缺省依旧不阻塞（按 ×1 计）。
  //     另预留可靠性闸门：RELIABLE_GATE_MIN 配置数值后，可靠性低于它同样不给总分。
  // v18：总分权重调成 薪资 30 / 稳定性 25 / 双休 25 / 发展 20（原来是 35 / 20 / 25 / 20）——
  //     薪资从「一维独大」的 35 降到 30，多出来的 5 分补给稳定性：「干得下去」这件事
  //     和「给多少钱」同样硬，客服销售这类岗位钱可能不少、但干不久，不该被薪资一项盖过去。
  const SCORE_VERSION = 23;

  /* 只有这四项进权重，合计 100：薪资 30 / 稳定性 25 / 双休 25 / 发展 20。
     权重的用意：钱是打工人最躲不开的一件事，仍占最大头 30；
     休息直接影响每天的生活质量，25；稳定性 25——「干得下去」和「给多少钱」一样硬，
     钱多但干不久的岗位不该被薪资一项带上去；发展 20——「有得涨」是另一条独立的路，
     稳定但没空间的岗位同样是个坑。
     可靠性与匹配度都不进——可靠性是闸门（决定这份 JD 能不能信），匹配度是调节器。 */
  const WEIGHTS = {
    pay: 30,
    rest: 25,
    growth: 20,
    aiProof: 25,
  };

  const MISSING_SCORE = 0;          // 维度没采集到：按 0 分计，分母仍是 100（不做归一化）
  // 可靠性闸门阈值（v23 预留）：配成数字后，可靠性低于它（或没给可靠性）就不给总分。
  // 待产品定值，默认 null＝关闭——不改变现行为。
  const RELIABLE_GATE_MIN = null;
  const MATCH_NEUTRAL_SCORE = 5;    // 匹配度中性分（总分 ×1.00）
  const MATCH_FLOOR_FACTOR = 0.8;   // 匹配度 0 分：总分 ×0.8（下限）
  const MATCH_CAP_BONUS = 0.2;      // 匹配度 10 分：总分 +20%（上限）

  // 匹配度系数（对总分的调节）：5 分中性；不匹配最多打 8 折，完美匹配最多加 20%，线性。
  // 依据三条：
  //   ① 不匹配是「你够不着」，不是「岗位差」——钱、休息、稳定性这些客观条件不会因为你不合适而消失，
  //      所以下限只到 0.8，不让总分被腰斩；
  //   ② 匹配度是可变项（补技能、换方向、内推都能改），压得太狠会让分数读起来像"这工作很糟"；
  //   ③ 匹配只保证「进得去」，不改变岗位好坏，而且匹配度这一维本身已经放宽（七八成覆盖就算胜任），
  //      系数就不该再把总分拉开——上下各两成（0.8 ~ 1.2）。
  function matchMultiplier(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return 1;
    const c = Math.max(0, Math.min(10, s));
    if (c <= MATCH_NEUTRAL_SCORE) {
      return MATCH_FLOOR_FACTOR + (c / MATCH_NEUTRAL_SCORE) * (1 - MATCH_FLOOR_FACTOR);
    }
    return 1 + ((c - MATCH_NEUTRAL_SCORE) / MATCH_NEUTRAL_SCORE) * MATCH_CAP_BONUS;
  }

  // 极化系数（不是损失厌恶）：λ = 1 − |−50 +（稳定性 + 可靠性 + 双休 + 发展）| / 100
  // 化简后 λ = 0.5 + 四项和/100：已知项越好，折损越轻；越差，折损越重——即"强者愈强、弱者愈弱"，
  // 与"未知/缺失"本身无关（缺失只决定要不要乘这个系数）。
  function lossAversionFactor(dims) {
    const sum = ['aiProof', 'reliable', 'rest', 'growth']
      .reduce((a, k) => a + (dims[k] != null ? dims[k] : MISSING_SCORE), 0);
    return Math.max(0, Math.min(1, 1 - Math.abs(-50 + sum) / 100));
  }

  /**
   * 六维 → 原始分 / 匹配度系数 / 总分。
   * @param {Array<{key:string, score:number|null}>} dimensions 六维，score 为 null 表示没采集到
   * @returns {{baseScore:number, matchScore:number|null, matchMultiplier:number,
   *            lossAversion:number, missingWeight:number, overall:number}}
   *   baseScore 0-100：加权基础分，不含匹配度（这份岗位本身值多少分）
   *   matchMultiplier 0.8-1.2：匹配度调节系数（没有匹配度时按 1，即不调节）
   *   overall number|null：v23 起四个权重维度任一缺失（或闸门拦截）时为 null＝不给数字；
   *                       否则 round(base × 匹配度系数)
   *   overallStatus 'ok'|'missing-core'|'gate'、missingKeys：给界面解释「为什么没给数字」用
   */
  function scoresOf(dimensions) {
    const dims = Array.isArray(dimensions) ? dimensions : [];
    const byKey = {};
    for (const d of dims) if (d && d.key) byKey[d.key] = d.score;

    const scored = dims.filter((d) => d && d.score != null && WEIGHTS[d.key]);
    // 分母固定在 100：某个维度没采集到时不归一化——但 v23 起这类情况不给总分（见下），
    // base 照常算出来，供「资料不全」面板与历史口径对照用。
    const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    const missingKeys = Object.keys(WEIGHTS).filter((k) => !scored.some((d) => d.key === k));
    const missingWeight = missingKeys.reduce((a, k) => a + WEIGHTS[k], 0);
    const weightScore = scored.reduce((a, d) => a + d.score * WEIGHTS[d.key], 0)
      + MISSING_SCORE * missingWeight;
    const base = (weightScore / weightSum) * 10;
    const lossAversion = missingWeight > 0 ? lossAversionFactor(byKey) : 1;   // v23 起退役：只为档案存档保留，不再参与总分
    const matchScore = byKey.match != null ? byKey.match : null;
    const matchMult = matchScore != null ? matchMultiplier(matchScore) : 1;

    /* v23 总分口径：四个权重维度（薪资/双休/发展/稳定性）任一缺失 → 不给数字（overall = null），
       由缺口清单解释「缺什么、为什么、怎么补」；可靠性闸门（RELIABLE_GATE_MIN）配置后同样拦截。
       缺失不再乘 λ 折出一个偏低的分——「未知」的正确表达是「不知道」，不是一个看起来精确的数字。 */
    const gated = RELIABLE_GATE_MIN != null
      && (byKey.reliable == null || byKey.reliable < RELIABLE_GATE_MIN);
    const overallStatus = missingWeight > 0 ? 'missing-core' : (gated ? 'gate' : 'ok');
    const overall = overallStatus === 'ok'
      ? Math.max(0, Math.min(100, Math.round(base * matchMult)))
      : null;

    return {
      baseScore: Math.round(base),
      matchScore,
      matchMultiplier: Number(matchMult.toFixed(3)),
      lossAversion: Number(lossAversion.toFixed(2)),
      missingWeight,
      missingKeys,
      overallStatus,
      overall,
    };
  }

  /* ---------- 双休假期：模型只给「休息线索」，分数由梯度表定 ----------

     梯度表的定法是「每一档＝一种作息的质变」，不是按天数均匀切：
     每个作息描述先折成它的年均休息日范围（可追溯），再按范围落档。
     0 到 10 每一档都取得到，边界单调相接、每跨一个边界正好降 1 分：
        10 分  ≥ 118 天       超出法定基准：上四休三（169）、寒暑假、法定之外成规模的带薪假
         9 分   115–117 天     双休 ＋ 法定节假日正常放 ＝ 法定基准（117）
         8 分   105–114 天     双休成立，但年假或法定节假日被打折
         7 分    95–104 天     双休名存实亡：每月至少一个周末要上班；或双休但带薪假明显缩水
                               （JD 完全没写休息时的默认假设 104 天也落这一档）
         6 分    88–94 天      大小周：隔周双休（91）
         5 分    79–87 天      月休 6 天左右：两周休三天（85）
         4 分    68–78 天      月休 5 天：一周休一天出头（73）
         3 分    52–67 天      单休 / 做六休一：一周休一天（65）、月休 4 天（61）
         2 分    39–51 天      月休 3 天（49）
         1 分    26–38 天      月休 2 天（37）
         0 分   ≤ 25 天        几乎没有休息日：月休 1 天及以下、全年无休（25、13）

     锚点来源（可追溯）：全年法定节假日 13 天、52 周；双休 = 104 个周末日、大小周 = 78、单休 = 52；
     月休 N 天 = 12N。每档的天数范围就是它那几种作息落在的年均休息日区间，边界取相邻作息的中间天数。 */
  const REST_STATUTORY_DAYS = 117;
  const REST_STAT = 13;   // 全年法定节假日
  const REST_WEEK = 52;

  /* 休息信息完全缺失（JD 一个字没提）时的假设：只按 52 周双休算，不把未承诺的年假与法定节假日算进去，
     104 天 = 52 × 2 —— 落梯度表的 7 分档。没有负面字眼就不往最差猜（v8）；
     真写了单休 / 大小周 / 经常加班，各按各自的规则降（天数或强度降档）。
     这是评分与图表（时薪、性价比）共用的唯一一处假设——改这里两边一起动，不会再出现
     「评分按不知道算、图表按最差算」这种同一条档案两个数的情况。 */
  const REST_UNCLEAR_DAYS = 104;

  // 梯度表：[年均休息日下限, 分]，从高到低命中第一条（零插值，不做线性折算）
  const REST_BANDS = [
    [118, 10],   // ≥ 118：超出法定基准
    [115, 9],    // 115–117：双休 ＋ 法定节假日正常放（法定基准 117）
    [105, 8],    // 105–114：双休成立，但年假/法定节假日被打折
    [95, 7],     // 95–104：双休名存实亡 / 带薪假明显缩水；没写休息的默认假设（104 天）也落这档
    [88, 6],     // 88–94：大小周（91）
    [79, 5],     // 79–87：月休 6 天左右（85）
    [68, 4],     // 68–78：月休 5 天（73）
    [52, 3],     // 52–67：单休 / 做六休一（65）、月休 4 天（61）
    [39, 2],     // 39–51：月休 3 天（49）
    [26, 1],     // 26–38：月休 2 天（37）
    [0, 0],      // ≤ 25：月休 1 天及以下（25）、全年无休（13）
  ];
  /* 劳动强度降档（按产品口径：最多 −2）：
     none 无强度线索 / hinted 有具体暗示（写明频次或场景的偶尔加班、轮值、不定期出差）/ clear 明确经常性（经常加班、长期出差、随时待命、996）。
     只有「抗压能力强」这类通用套话不加不减——强度只认具体线索，套话写进分析即可。
     加班能换休（compTime）时降档减半。 */
  const REST_INTENSITY_DEDUCT = { none: 0, hinted: 1, clear: 2 };

  // 从休息描述里读出年均休息日；读不出来（＝根本没写）返回 null。
  // 「未提及双休」里也含「双休」，所以要看关键词前面有没有 未/没/无/不。
  function restDaysOfBrief(text) {
    const t = String(text || '');
    if (!t) return null;
    const negated = (i) => /[未没无不]/.test(t.slice(Math.max(0, i - 6), i));
    const rules = [
      { re: /上四休三|做四休三/g, val: () => 3 * REST_WEEK + REST_STAT },
      { re: /月休\s*(\d+)\s*天/g, val: (m) => Math.min(8, Number(m[1])) * 12 + REST_STAT },
      { re: /每周(?:到岗|工作|实习)\s*(\d+)\s*天/g, val: (m) => Math.max(0, 7 - Number(m[1])) * REST_WEEK + REST_STAT },
      { re: /做六休一|单休|每周休(息)?\s*1\s*天|一周休一天|周休一天/g, val: () => REST_WEEK + REST_STAT },
      { re: /大小周/g, val: () => Math.round(1.5 * REST_WEEK) + REST_STAT },
      { re: /做五休二|双休|周末双休|每周休(息)?\s*2\s*天|一周休两天/g, val: () => 2 * REST_WEEK + REST_STAT },
      // 「无休」放最后：任何明确作息都能先命中；另外避开「无休止的加班」这类措辞
      { re: /无休(?!止)|全年无休|没有休息日|上七休零|一周无休/g, val: () => REST_STAT },
    ];
    for (const r of rules) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(t))) { if (!negated(m.index)) return r.val(m); }
    }
    return null;
  }

  /* 一条档案实际采用的年均休息日：有线索就按线索折，完全没写就按默认假设（104 天）。
     评分、时薪、性价比全部走这一个函数——同一条档案在任何地方都是同一个天数。 */
  function restDaysOf(brief) {
    const d = restDaysOfBrief(brief);
    return d == null ? REST_UNCLEAR_DAYS : d;
  }

  /**
   * 按年均休息日直接定分——梯度表的唯一入口，0-10 整数。
   * 单独抽出来是为了能被穷举验证：0-10 每一档都取得到、天数越少分越低、边界上没有跳档。
   * @param {number} days 年均休息日
   * @param {{beyond?:boolean, intensity?:string, compTime?:boolean}} [meta] 模型给的休息线索
   * @returns {number}
   */
  function restScoreOfDays(days, meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    const d = Number.isFinite(Number(days)) ? Number(days) : REST_UNCLEAR_DAYS;
    const band = REST_BANDS.find((b) => d >= b[0]) || REST_BANDS[REST_BANDS.length - 1];
    let score = band[1];
    // 超出法定的额外带薪假只在法定基准及以上才作数（单休 ＋ 20 天年假仍然是单休）
    if (m.beyond === true && d >= REST_STATUTORY_DAYS) score = Math.min(10, score + 1);
    // 劳动强度降档（最多 −2）：「没写休息」不等于没有任何信号——JD 明写了经常加班/996，一样要往下走
    // 强度级别 v5 是 none/hinted/clear；模型偶尔会沿用早期的 none/occasional/frequent/severe，
    // 这里做一次兼容映射，别让一个旧标签名把降档悄悄变成 0
    const ALIAS = { occasional: 'hinted', frequent: 'clear', severe: 'clear' };
    const raw = m.intensity != null ? m.intensity : m.overtime;
    const deduct = REST_INTENSITY_DEDUCT[ALIAS[raw] || raw] || 0;
    score -= m.compTime === true ? Math.floor(deduct / 2) : deduct;
    return Math.max(0, Math.min(10, Math.round(score)));
  }

  /**
   * 双休假期维度的分数：0-10 整数。
   * 完全没写休息时不往最差猜：按默认假设的 104 天（双休成立、不含未承诺的年假与法定节假日）
   * 走同一张梯度表（落 7 分），保证「分越低＝休息越少」这条单调关系在任何情况下都成立；
   * 单休 / 大小周 / 强度线索照旧各自降档。
   * @param {{beyond?:boolean, intensity?:string, compTime?:boolean}} meta 模型给的休息线索
   * @param {string} brief 休息情况摘要——休息天数从它折出来，跟图表用的是同一个数
   * @returns {number}
   */
  function restScore(meta, brief) {
    return restScoreOfDays(restDaysOf(brief), meta);
  }

  /* ---------- 每日工作时长（小时）：时薪、性价比共用的第二个人工假设（第一个是休息天数） ----------

     时薪 = 年薪 ÷（年工作天数 × 每日工作时长），年工作天数由休息天数折出；每日时长同样要有一个
     可追溯的口径——如果所有岗位都按 8 小时算，同为 30 万的程序员和老师会算出同一个时薪，那不是事实。
     不同岗位的每日时长不一样，所以时薪的高低不完全跟年薪一致。

     三层，就近取用（越靠前越硬）：
       ① 原文明写（9:00-18:00 / 朝九晚六 / 996 / 每天工作 N 小时 / 每周 N 小时）→ 按写法折算；
       ② 未写明，但有带原句支撑的强度线索（restMeta.intensity 为 hinted / clear）→ 行业水平上加 0.75 / 1.5 小时；
       ③ 都没有 → 行业平均水平：作息稳定 8 小时、一般 8.5、离散度大 9.5。
     区间：明写的 ±0.5 小时；靠行业估的给「只会更长」的单边不确定性（下沿 −1、上沿 +1.5），
     与休息那一侧的假设同向——信息不完整时按对自己更不利的一侧留余地。
     改动这里不影响 SCORE_VERSION：它不参与六维打分，只被时薪、性价比共用。 */
  const HOURS_INDUSTRY = { stable: 8, normal: 8.5, volatile: 9.5 };
  const HOURS_INTENSITY_ADD = { none: 0, hinted: 0.75, clear: 1.5 };
  const HOURS_INDUSTRY_LABEL = {
    stable: '作息稳定行业按 8 小时',
    normal: '一般行业按 8.5 小时',
    volatile: '作息离散度大的行业按 9.5 小时',
  };
  const HOURS_MIN = 6;    // 再少就不是一份正经全职了
  const HOURS_MAX = 13;   // 再长也到顶：13 小时是「早 9 晚 10」这种极端作息的量级

  // 行业判断与休息偏离度的行业分类共用同一套关键词（app.js / archive.js 都从这里取，不再各抄一份）
  const INDUSTRY_STABLE_RE = /国企|事业单位|公务员|银行|教师|医院|学校|研究院|研究所/;
  const INDUSTRY_VOLATILE_RE = /互联网|电商|客服|销售|中介|房产|直播|运营|外卖|物流|餐饮|教培|游戏/;

  function industryKindOf(text) {
    const t = String(text || '');
    if (INDUSTRY_STABLE_RE.test(t)) return 'stable';
    if (INDUSTRY_VOLATILE_RE.test(t)) return 'volatile';
    return 'normal';
  }

  // 中文数字只到十二：作息写法不会超过它
  const CN_NUM = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
  };
  const cnHour = (s) => (CN_NUM[s] != null ? CN_NUM[s] : Number(s));

  const clampHours = (v) => Math.round(Math.max(HOURS_MIN, Math.min(HOURS_MAX, v)) * 10) / 10;
  // 时间区间 → 工作时长：扣除用餐与休息（跨度 ≥ 11 小时扣 1.5，否则扣 1）
  const hoursFromSpan = (span) => clampHours(span - (span >= 11 ? 1.5 : 1));

  /**
   * 从文本里读「每天工作几小时」，读不出来返回 null。
   * 时间区间只在作息语境里认（前后 10 个字内要有上班 / 下班 / 工作 / 作息 / 工时 / 班 / 弹性 这类词），
   * 免得把「营业时间 9:00-22:00」这种无关时段也当成工作时间。
   * @param {string} text
   * @returns {{hours:number, why:string}|null}
   */
  function workHoursFromText(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    if (!t) return null;
    // ① 直接写明「每天 N 小时」优先：这是最硬的写法
    let m = t.match(/(?:每天|每日|一天|日均)\s*(?:工作|上班|工时|时长|大约)?\s*(\d+(?:\.\d+)?)\s*个?\s*小时/);
    if (m) return { hours: clampHours(Number(m[1])), why: `原文明写「${m[0].trim()}」` };
    // ② 每周 N 小时 → 按每周工作天数摊到每天（有单休/大小周线索按 6 天，否则按 5 天）
    m = t.match(/每?周\s*(?:工作|上班|工时|时长)?\s*(\d+(?:\.\d+)?)\s*个?\s*小时/);
    if (m) {
      const days = /单休|做六休一|大小周|月休\s*[1-4]\s*天/.test(t) ? 6 : 5;
      const per = Number(m[1]) / days;
      if (per >= HOURS_MIN && per <= HOURS_MAX) {
        return { hours: clampHours(per), why: `原文明写「${m[0].trim()}」，按每周 ${days} 天摊到每天` };
      }
    }
    // ③ 代号：996 / 995 / 955 / 965 / 1075（按字面时间 → 同一套扣休规则）
    //    前后都不许再跟数字，否则一串手机号或薪资里的数字也会被当成代号
    m = t.match(/(?:^|[^\d])(996|995|955|965|1075)(?!\d)/);
    if (m) {
      const codes = {
        996: [9, 21], 995: [9, 21], 955: [9, 17], 965: [9, 18], 1075: [10, 19],
      };
      const [a, b] = codes[m[1]];
      return { hours: hoursFromSpan(b - a), why: `原文明写「${m[1]}」（${a}:00–${b}:00）` };
    }
    // ④ 朝九晚六 / 早九晚六 / 朝10晚7 这类写法（中文数字与阿拉伯数字都认）
    m = t.match(/(?:朝|早)([0-9一二两三四五六七八九十]{1,3})\s*(?:点|:|：)?\s*(?:半)?\s*(?:到|至|,|，)?\s*晚([0-9一二两三四五六七八九十]{1,3})/);
    if (m) {
      const a = cnHour(m[1]);
      let b = cnHour(m[2]);
      if (!(a >= 1 && a <= 12) || !(b >= 1 && b <= 12)) return null;
      if (b <= a) b += 12;   // 「晚六」＝ 18 点
      return { hours: hoursFromSpan(b - a), why: `原文明写「${m[0].trim()}」（${a}:00–${b}:00）` };
    }
    // ⑤ 时间区间：8:30-17:30 / 09:00~18:00 / 10点到19点……
    const range = /([0-9]{1,2})\s*(?::|：|点)?\s*([0-9]{2})?\s*(?:-|~|—|–|到|至)\s*([0-9]{1,2})\s*(?::|：|点)\s*([0-9]{2})?/g;
    let rm;
    while ((rm = range.exec(t))) {
      const ctx = t.slice(Math.max(0, rm.index - 10), rm.index + rm[0].length + 10);
      // 「营业时间 9:00-22:00」这类无关时段：只说时间、不提工作/作息的，不算
      if (!/班|工作|作息|工时|考勤|弹性|到岗|午休|双休|单休|大小周/.test(ctx)) continue;
      const a = Number(rm[1]);
      let b = Number(rm[3]);
      if (!(a >= 0 && a <= 23) || !(b >= 0 && b <= 23) || a === b) continue;
      // 收工时间比开工早，只可能是 12 小时制（「8:30-5:30」＝ 17:30）或跨零点（夜班）
      if (b <= a) b += 12;
      if (b <= a) b += 12;
      if (b <= a || b - a > 16) continue;
      return { hours: hoursFromSpan(b - a), why: `原文明写「${rm[0].trim()}」` };
    }
    return null;
  }

  /**
   * 每日工作时长：{ lo, mid, hi, source, why }。source ∈ jd / web / intensity / industry。
   * @param {{jd?:string, note?:string}} texts jd＝JD 原文与本人补充（真实字段），note＝联网参考
   * @param {{intensity?:string}} [restMeta] 强度线索来自评分那一份（有原句支撑才会是 hinted / clear）
   */
  function dailyHoursOf(texts, restMeta) {
    const t = texts && typeof texts === 'object' ? texts : { jd: String(texts || '') };
    const jd = String(t.jd || '');
    const note = String(t.note || '');
    const inJd = workHoursFromText(jd);
    const hit = inJd || workHoursFromText(note);
    if (hit) {
      const mid = clampHours(hit.hours);
      return {
        lo: clampHours(mid - 0.5), mid, hi: clampHours(mid + 0.5), source: inJd ? 'jd' : 'web', why: hit.why,
      };
    }
    const kind = industryKindOf(`${jd} ${note}`);
    const raw = restMeta && restMeta.intensity != null ? restMeta.intensity : 'none';
    const intensity = HOURS_INTENSITY_ADD[raw] == null ? 'none' : raw;
    const add = HOURS_INTENSITY_ADD[intensity];
    const mid = clampHours(HOURS_INDUSTRY[kind] + add);
    return {
      lo: clampHours(mid - 1),
      mid,
      hi: clampHours(mid + 1.5),
      source: intensity === 'none' ? 'industry' : 'intensity',
      why: intensity === 'none'
        ? `${HOURS_INDUSTRY_LABEL[kind]}`
        : `${HOURS_INDUSTRY_LABEL[kind]} ＋ 强度线索（原句可核）加 ${add} 小时`,
    };
  }

  /* ---------- 旧的发展潜力（36 格表 + 履历增值 3×3）已在 v9 整套废弃：口径换成上面的「分布法」。 ---------- */

  /* ---------- 性价比的全国基准（不参与评分，是分析图与导出的公共参照） ----------

     倍数 ＝（岗位时薪 ÷ 当地每人每天固定支出）÷（全国平均工资 ÷ 全国每人每天固定支出），换算成「全国 = 1.00」。
     写死成常量而不用档案里联网查到的那份：那些值每次采集都不一样（深圳房价见过 51,700 / 55,862 / 71,995 三个），
     拿它当基准，同一份档案隔几天打开倍数就变了。
     口径一律写在常量名和图上：全国平均工资有私营与非私营两套，差 1.8 倍，混用就会得出两个结论，
     所以两边都留着、各自标名（NATIONAL_WAGE_PRIVATE / NATIONAL_WAGE_NONPRIVATE），图上也画两条线。
     基准取私营那套：非私营口径含国企、机关、事业单位，代表不了多数打工人，而 AI 岗多在民企。
     房价值与消费值见 NATIONAL_VALUE_DATA 里的逐项说明。
     改这里不影响 SCORE_VERSION——它不参与任何维度打分，页面与导出（public/archive.js）共用。 */

  /* 全国平均工资的两个口径（国家统计局 2024 年，都是「全部劳动报酬」＝税前＋个人缴纳的社保公积金）：
     · 城镇非私营单位 124,110 元/年 → 62.6 元/时（含国企、机关、事业单位）
     · 城镇私营单位   69,476 元/年 → 35.0 元/时（民企，多数打工人在这一侧）
     时薪 ÷（248 天 × 8 小时）得到时薪，两条都画在图上，免得拿一个口径冒充「全国平均」。 */
  const NATIONAL_WAGE_NONPRIVATE = 124110;
  const NATIONAL_WAGE_PRIVATE = 69476;

  /* 人均住房建筑面积（㎡）：分母里的「居住」是一个人摊的住房，不是一整套房——一套房由整个家庭住，
     把 90㎡ 压在一个人工资上等于让单身者独自扛三居室。官方口径：全国城镇居民人均住房建筑面积超 40 平方米
     （七普城镇 38.6㎡，一线更低：上海 34.5~38.4、广州约 36）。两边用同一个面积，倍数不受取值影响；
     将来按城市细分，只需在这里加一层查表。 */
  const HOUSE_SQM_PER_PERSON = 40;

  const NATIONAL_VALUE_DATA = {
    // 逐项都写明口径与出处（2024 年国家统计局）：
    //   工资＝城镇私营单位就业人员年平均工资（非私营是 124,110，见上面的两个常量）
    //   房价值＝全国商品房平均销售价格 ＝ 销售额 96,750 亿元 ÷ 销售面积 97,385 万㎡
    //     （原来用的「百城新建住宅均价 17,084」只覆盖 100 个主要城市，跟单个城市的全市均价不对称，已换）
    //   消费值＝城镇居民人均消费支出 34,557 元/年 ÷ 12，再扣掉居住类约 23%
    //     （人口口径跟着工资走：私营单位工资、城镇人均住房面积都是「城镇」，消费也得是城镇）
    annualWage: 69476,
    housePrice: 9935,
    livingCost: Math.round((34557 / 12) * 0.77),   // ≈ 2,217 元/月（不含居住类）
  };

  // 全国每人每天的固定支出 ＋ 全国时薪 → 基准指数。分母口径与单个岗位完全一致。
  function nationalValueIndexOf(data) {
    const d = data && typeof data === 'object' ? data : NATIONAL_VALUE_DATA;
    const denom = (d.housePrice * HOUSE_SQM_PER_PERSON) / (30 * 365) + (d.livingCost * 12) / 365;
    if (!(denom > 0)) return 0;
    const workDays = 365 - REST_STATUTORY_DAYS;   // 双休 248 个工作日（法定基准 117 天休息），与图上的参考线同口径
    return (d.annualWage / (workDays * 8)) / denom;
  }
  const NATIONAL_VALUE_INDEX = nationalValueIndexOf();

  /* ---------- 「一线 / 二线」两组城市的参考工资与周工时（象限参考用） ----------

     工资＝组内各城**城镇非私营单位就业人员月平均工资**的算术平均——**非统计局分组口径**：
     统计局只发全国与分省，没有「一线 / 二线」这种分组，分组与平均都是本工具自己算的参考水平。
     一线四城取 data/city-social-wage.json 里已采的官方值，二线 15 城（新一线）逐城取各地统计局
     2024 年公告，逐城来源与 URL 见 data/city-tier.json 的 tiers[*].perCity（由 _gen_city_tier.js 生成）。
     周平均工作时间统计局不按城市发布，两组都退回全国口径（国家统计局 2024 年 48.6 小时/周）。
     这里镜像一份给浏览器端用（前端取不到 data/，浏览器端常量都是这么镜像的），
     改完生成脚本记得同步这一处。 */
  const CITY_TIERS = {
    一线: {
      cities: ['北京', '上海', '广州', '深圳'],
      avgWage: 16951,
      weeklyHours: 48.6,
      sources: {
        avgWage: 'data/city-social-wage.json（各城 2024 年官方统计口径）；全国对照见 国家统计局《2024年城镇单位就业人员年平均工资情况》（2025-05-16，全国城镇非私营单位就业人员年平均工资 124,110 元/年） https://www.stats.gov.cn/sj/zxfb/202505/t20250516_1959826.html',
        weeklyHours: '国家统计局 2024 年数据：全国企业就业人员周平均工作时间 48.6 小时/周（2025-01 发布；统计局不按城市发布周工时，两组都退回全国口径） https://data.stats.gov.cn/easyquery.htm?cn=A01',
      },
      source: '一线四城（北京、上海、广州、深圳）城镇非私营单位月平均工资的算术平均；各城取值见 data/city-social-wage.json（官方统计口径 2024 年），逐城来源见 perCity',
    },
    二线: {
      cities: ['成都', '重庆', '杭州', '武汉', '苏州', '西安', '南京', '长沙', '郑州', '天津',
        '合肥', '青岛', '东莞', '宁波', '佛山'],
      avgWage: 10875,
      weeklyHours: 48.6,
      sources: {
        avgWage: '各地统计局 2024 年城镇非私营单位就业人员年平均工资公告（逐城 URL 见 perCity）；全国对照见 国家统计局《2024年城镇单位就业人员年平均工资情况》（2025-05-16，全国城镇非私营单位就业人员年平均工资 124,110 元/年） https://www.stats.gov.cn/sj/zxfb/202505/t20250516_1959826.html',
        weeklyHours: '国家统计局 2024 年数据：全国企业就业人员周平均工作时间 48.6 小时/周（2025-01 发布；统计局不按城市发布周工时，两组都退回全国口径） https://data.stats.gov.cn/easyquery.htm?cn=A01',
      },
      source: '新一线 15 城（成都、重庆、杭州、武汉、苏州、西安、南京、长沙、郑州、天津、合肥、青岛、东莞、宁波、佛山）城镇非私营单位年平均工资 ÷ 12 后的算术平均；逐城来源见 perCity（各地统计局 2024 年公告）',
    },
  };

  /* ---------- 发展空间（分布法）：网络公开数据 → 分布 → b/t → k′ → 查表 ----------

     口径见维度面板（DIM_RULES.growth）：k′ =（t − b）÷ 非私营在岗社平 ×（t ÷ 非私营在岗社平）。
     刻度分界线 = 相邻两档定义配置的几何中点；到线取本档、零插值。
     分布来自 data/growth-dist.json（按职业×城市落库），本模块只做纯计算、不联网。

     两层：分布（职业×城市）→ 客观层 K₁；这一份 JD 有报价时折进主观层 K₂
     （r₁′ =（JD高 − JD低）÷ c、r₂′ = ∛(P50 · P80 · JD中) ÷ c，P50 / P80 由分布给出），
     两层查同一张量表。同一职业的两份 JD：K₁ 一样，K₂ 随各自的报价分岔。

     底薪型的分布（b 低于私营社平 6 成：低底薪高提成，右尾由销冠与运气撑起）：
     天花板不能按 P87.5 取——那 12.5% 普通人够不着，改按 P75 取「普通人够得着的那一层」。
     这是分布自己的形状（低底薪那个职业的分布本来长得就矮），不靠事后压分。 */
  const GROWTH_SPACE_LINES = [0.17, 0.31, 0.42, 0.61, 0.94, 1.32, 1.73, 2.31, 2.74];
  const GROWTH_SPACE_P = { p30: -0.5244, p75: 0.67449, p80: 0.84162, p875: 1.15035 };
  const GROWTH_BASE_RATIO = 0.6;

  /**
   * 空间指数 k′ → 0-10 分（阶梯函数，零插值）。
   * @param {number} k
   * @returns {number|null} 非数值返回 null
   */
  function growthSpaceBand(k) {
    const x = Number(k);
    if (!Number.isFinite(x)) return null;
    return 1 + GROWTH_SPACE_LINES.filter((t) => x >= t).length;
  }

  /**
   * 拟合口径的客观层：由一条薪资分布算 k′ 与分数。dist：{mu, sigma, nonpriv, priv?}（元/月）。
   * @returns {{b:number,t:number,r1:number,r2:number,k:number,score:number}|null}
   *   缺数据或非法 → null（调用方显示 --，不猜）。
   */
  function growthSpaceScore(dist) {
    const m = dist && typeof dist === 'object' ? dist : {};
    const mu = Number(m.mu);
    const sig = Number(m.sigma);
    const nonpriv = Number(m.nonpriv);
    const priv = Number(m.priv);
    if (!(mu > 0 && sig > 0 && nonpriv > 0)) return null;
    const b = Math.exp(mu + GROWTH_SPACE_P.p30 * sig);
    const lowBase = priv > 0 && b < priv * GROWTH_BASE_RATIO;
    const t = Math.exp(mu + (lowBase ? GROWTH_SPACE_P.p75 : GROWTH_SPACE_P.p875) * sig);
    const r1 = (t - b) / nonpriv;
    const r2 = t / nonpriv;
    const k = r1 * r2;
    return { b, t, r1, r2, k, lowBase, score: growthSpaceBand(k) };
  }

  /**
   * 拟合口径的主观层：把这一份 JD 的报价折进分布，查同一张 k′ 量表。
   * 与官方口径同构：r₁′ =（JD高 − JD低）÷ c、r₂′ = ∛(P50 · P80 · JD中) ÷ c、K₂ = r₁′r₂′；
   * 这里 P50 = e^μ、P80 = e^(μ + 0.8416σ) 由拟合分布给出，c ＝ 当地非私营在岗社平。
   * @param {object} dist 同 growthSpaceScore
   * @param {{low:number,high:number}} jd 这份 JD 的税前月当量区间（元/月）
   * @param {number} [C] 成色系数（缺省 1＝不修正），只乘在 k 上
   * @returns 原件 + {r1′,r2′,k,score,mid,usedJd}；没报价或区间非法 → 原样退回客观层
   */
  function growthSpaceScoreJd(dist, jd, C = 1) {
    const base = growthSpaceScore(dist);
    if (!base) return null;
    const low = Number(jd && jd.low);
    const high = Number(jd && jd.high);
    if (!(low > 0) || !(high > low)) return base;
    const m = dist && typeof dist === 'object' ? dist : {};
    const mu = Number(m.mu);
    const sig = Number(m.sigma);
    const nonpriv = Number(m.nonpriv);
    if (!(mu > 0) || !(sig > 0) || !(nonpriv > 0)) return base;
    const mid = (low + high) / 2;
    const kc = Number(C) > 0 ? Number(C) : 1;
    const r1 = (high - low) / nonpriv;
    const r2 = Math.cbrt(Math.exp(mu) * Math.exp(mu + GROWTH_SPACE_P.p80 * sig) * mid) / nonpriv;
    const k = r1 * r2 * kc;
    return { ...base, r1, r2, k, score: growthSpaceBand(k), mid, usedJd: true, C: kc };
  }

  /* ---------- 发展空间 v15：落差 × 高度，两层 ----------

     客观（职业层）
       r1 = (P80 − P20) / c             薪资成长空间：普通水平到较好水平能拉开多少
       r2 = √(P50 · P80) / c            工作价值高度：普通水平与较好水平的中点
       K1 = r1 · r2
     主观（这一份 JD）
       r1′ = (JD高 − JD低) / c
       r2′ = ∛(P50 · P80 · JD中) / c
       K2 = r1′ · r2′

     档位
       L_i = exp(μ + (i − 5) · 0.7σ)，i = 1…9
       分数 = 1 + |{ i : K ≥ L_i }|        （到线取本档、零插值；K 无上界）
       μ、σ ＝ 该城职业库 ln K1 的均值与标准差（每城一张，见 data/city-wage-ladder.json）

     口径
       c ＝ 当地城镇非私营单位在岗职工平均工资（元/月）
       官方只发 P10/P25/P50/P75/P90；P20、P80 由相邻分位点对数线性插值（见 lib/officialwage.js）
       两层同构：都用「落差 ÷ c」×「水平的几何平均 ÷ c」，主观层多代入一个 JD 中位 */
  /* 成色系数 C 的三个维度（v17）：档位名与中文名。系数表在 lib/ai.js（判档与查表都在服务端），
     中文名放这里是因为前端也要显示同一套叫法——两处各写一份迟早会不一致。 */
  const GROWTH_FACTOR_TEXT = {
    fit: {
      aligned: '对口', adjacent: '偏门行业', partial: '只沾一部分', mismatch: '名实不符',
    },
    form: {
      establishment: '编制', regular: '正职', outsourced: '外包 / 派遣', parttime: '兼职 / 实习',
    },
    position: {
      core: '核心主线', shared: '共享 / 中台', support: '辅助边缘',
    },
  };

  /* 据一份 Cmeta（{fit,form,position,C}）拼出「对口 · 外包 / 派遣 · 核心主线」这类中文说明 */
  function growthFactorNamesOf(meta) {
    const m = meta && typeof meta === 'object' ? meta : null;
    if (!m) return '';
    const t = (key) => ((GROWTH_FACTOR_TEXT[key] || {})[m[key]] || '');
    return [t('fit'), t('form'), t('position')].filter(Boolean).join(' · ');
  }

  const GROWTH_STEP = 0.7;
  const GROWTH_CITIES = {
    深圳: {
      c: 14755, mu: -1.204108, sigma: 0.979813, n: 262, skew: 0.2392,
      lines: [0.0193, 0.03832, 0.07609, 0.15108, 0.29996, 0.59557, 1.1825, 2.34785, 4.66165],
      // 各档的职业条数（hist[i] ＝ 落在第 i+1 档的职业数），合计 n。
      // 用来回答「这个职业在本城排在哪」——不用等参照云加载，打开页面就有数。
      hist: [0, 2, 18, 52, 58, 72, 38, 15, 5, 2],
    },
  };

  /* 城市名归一：与 growthdist.normCity 同口径（「深圳 · 南山区」→「深圳」），另先 trim 容忍前后空格 */
  function growthCityKey(city) {
    return String(city || '').trim().split(/[·・/／,，\-—\s]+/)[0].replace(/市$/, '').trim();
  }

  /** 取某城的刻度。没采到返回 null —— 调用方退回 v13 的招聘拟合口径，不猜。 */
  function growthLadderOf(city) {
    return GROWTH_CITIES[growthCityKey(city)] || null;
  }

  /** K 查该城量表；量表缺失或 K 非法 → null。 */
  function growthBandOf(city, K) {
    const L = growthLadderOf(city);
    const v = Number(K);
    if (!L || !(v > 0)) return null;
    return { K: Number(v.toFixed(6)), score: 1 + L.lines.filter((x) => v >= x).length, ladder: L };
  }

  /* ---------- 薪资维度的本地刻度（v21：整分位 + 官方价位表） ----------

     薪资分回答的是「这份薪水在这座城市算哪一档」，所以刻度必须锚在**当地**的权威数字上，
     而不是一张全国通用的年薪表——同一个 1 万块，在深圳和在长春不是一回事。

     档位＝本城工资分布的几个**整分位**，金额＝官方工资价位表算出的该分位工资（取两位有效数字）：
        0 分 ← 低于当地月最低工资
        1 分 ← 当地月最低工资（薪资的原点）
        2–10 分 ← 在本城前 90% / 70% / 50% / 30% / 15% / 5% / 2% / 1% / 0.3%
     怎么从官方表算城市分位：把每个职业的五个官方分位点（P10/P25/P50/P75/P90）连成一条对数线性的
     分布曲线，262 个职业等权平均 → 城市工资的 CDF（不做正态假设、不猜离散度），再二分求出目标分位金额。
     官方那几个锚点正好落在这几条整分位线上，两套口径互相印证：
        中位 8,313 → 在本城前 49.3%（4 分档）    职业高位的中位 16,086 → 前 14.4%（6 分档）
        职业高位的 P90 29,670 → 前 2.3%（8 分档）  职业高位的 P99 48,859 → 前 0.3%（10 分档）
     分数 = 满足 月当量 ≥ 该档金额 的最大档（0…10，到线取本档、零插值）。

     为什么不是「一条 σ 走到底」（v19）：±6σ 在对数正态里本来就在极远处，10 分要 36 万/月，上三档等于空着。
     数据来源：data/city-pay-anchor.json（由 _gen_city_pay_anchor.js 从官方价位表生成），
     这里镜像一份给浏览器端重算用——生成脚本改完记得同步这两处。
     没有官方表的城市：借深圳这套「档线 ÷ 中位」的倍数（PAY_BAND_RATIOS）乘当地中位数，
     中位数 ＝ 当地非私营社平 × 0.57（0.57 也由深圳反推）；连社平都没有就用全国非私营社平兜底。 */
  // 2–10 分对应的分位（页面上的「在本城前 x%」就是它；null＝这一档没有分位，0 分只认低于最低工资）
  const PAY_BAND_PERCENTS = [null, 100, 90, 70, 50, 30, 15, 5, 2, 1, 0.3];
  // 档线 ÷ 当地中位数 的倍数（9 个，对应 2–10 分）——由深圳官方价位表算出，缺官方表的城市照这套倍数折算
  const PAY_BAND_RATIOS = [0.5774, 0.7699, 0.9864, 1.3232, 1.9247, 2.887, 3.7291, 4.5712, 6.0147];
  const PAY_ANCHOR_CITIES = {
    深圳: {
      median: 8313,                    // 各职业 P50 的中位数（官方原值）
      minWage: 2360,                   // 现行月最低工资（官方原值）
      high: [16086, 29670, 48859],     // 各职业 P90 的中位 / P90 / P99（落位：前 14.4% / 2.3% / 0.3%）
      lines: [0, 2360, 4800, 6400, 8200, 11000, 16000, 24000, 31000, 38000, 50000],
      raw: [4828, 6442, 8236, 11153, 15772, 23608, 31041, 37720, 49709],   // 官方表算出的原始金额（未取整，留档）
      source: '深圳市人力资源和社会保障局《深圳市2025年人力资源市场工资价位及行业人工成本信息》'
        + '（2026-04-14 发布，262 个职业：P50 的中位 8,313；各职业 P90 的中位 16,086、P90 的 P90 29,670、P90 的 P99 48,859）；'
        + '最低工资 2,360 元/月为深圳市现行标准',
    },
  };
  const PAY_MEDIAN_RATIO = 0.57;     // 当地工资中位数 ≈ 当地非私营社平 × 0.57（由深圳反推）
  const PAY_MINWAGE_RATIO = 0.284;   // 最低工资 ≈ 中位数 × 0.284（深圳：2360 ÷ 8313）
  const PAY_NATIONAL_NONPRIV = 124110;   // 全国城镇非私营单位年平均工资（元/年，国家统计局 2024）

  /** 锚点 → 完整锚点集（缺哪个就按比例补哪个）；lines 有官方档线就用官方的 */
  function payAnchorsOf(median, minWage, lines) {
    const M = Number(median) > 0 ? Number(median) : 0;
    const W = Number(minWage) > 0 ? Number(minWage) : Math.round(M * PAY_MINWAGE_RATIO);
    const L = Array.isArray(lines) && lines.length === 11 && lines.every((v) => Number(v) >= 0)
      ? lines.map(Number)
      : null;
    return { median: M, minWage: W, lines: L };
  }

  /** 锚点 → 11 个档位下界：1 分＝最低工资（原点）、2–10 分＝中位数 × PAY_BAND_RATIOS，0 分只认「低于最低工资」。 */
  function payLinesOf(anchors) {
    const a = anchors && typeof anchors === 'object' ? anchors : {};
    const M = Number(a.median) > 0 ? Number(a.median) : 0;
    const W = Number(a.minWage) > 0 ? Number(a.minWage) : Math.round(M * PAY_MINWAGE_RATIO);
    if (Array.isArray(a.lines) && a.lines.length === 11) return a.lines.map(Number);
    return [0, Math.round(W), ...PAY_BAND_RATIOS.map((r) => Math.round(M * r))];
  }

  /**
   * 某城的薪资刻度：官方整分位档线 → 借深圳倍数按当地社平折算 → 全国兜底。
   * @param {string} city 城市名（「深圳 · 南山区」也行）
   * @param {number} [cityNonpriv] 该城城镇非私营单位就业人员月平均工资（联网登记的当地数据）
   * @returns {{city:string, median:number, minWage:number, high:number[], percents:(number|null)[], basis:string, source:string, lines:number[]}}
   */
  function payLadderOf(city, cityNonpriv) {
    const key = growthCityKey(city);
    const known = key ? PAY_ANCHOR_CITIES[key] : null;
    if (known) {
      const anchors = payAnchorsOf(known.median, known.minWage, known.lines);
      return {
        ...anchors,
        city: key,
        high: known.high,
        percents: PAY_BAND_PERCENTS,
        basis: 'official',
        source: known.source,
        lines: payLinesOf(anchors),
      };
    }
    const wage = Number(cityNonpriv) > 0 ? Number(cityNonpriv) : 0;
    const nonpriv = wage > 0 ? wage : PAY_NATIONAL_NONPRIV / 12;
    const anchors = payAnchorsOf(Math.round(nonpriv * PAY_MEDIAN_RATIO), null, null);
    return {
      ...anchors,
      city: key,
      high: PAY_BAND_RATIOS.slice(4).map((r) => Math.round(anchors.median * r)),
      percents: PAY_BAND_PERCENTS,
      basis: wage > 0 ? 'derived' : 'national',
      source: wage > 0
        ? `${key || '这个城市'}没有官方工资价位表：中位数按当地城镇非私营单位平均工资 ${Math.round(nonpriv)} 元/月 × ${PAY_MEDIAN_RATIO} 折算，`
          + '档位借深圳官方价位表算出的「档线 ÷ 中位」倍数折算（前 90% ~ 前 0.3% 九个整分位）'
        : `没有查到当地的社平工资：中位数按全国城镇非私营单位平均工资 ${Math.round(PAY_NATIONAL_NONPRIV / 12)} 元/月 × ${PAY_MEDIAN_RATIO} 折算，`
          + '档位借深圳官方价位表的倍数折算',
      lines: payLinesOf(anchors),
    };
  }

  /** 月当量 → 薪资分（0…10）：满足 月当量 ≥ 该档下界 的最大档；到线取本档、零插值。 */
  function payBandOf(monthly, lines) {
    const v = Number(monthly);
    const arr = Array.isArray(lines) ? lines : null;
    if (!arr || !arr.length || !(v > 0)) return null;
    let band = 0;
    for (let k = 0; k < arr.length; k++) if (v >= arr[k]) band = k;
    return Math.max(0, Math.min(10, band));
  }

  /**
   * 这个 K 在本城职业库里的位置：n 个职业里有多少排在它前面。
   * 用各档的职业条数（hist）算，不依赖参照云，打开页面就能给数。
   * @param {string} city
   * @param {number} K
   * @returns {{n:number,band:number,below:number,same:number,above:number,topPct:number}|null}
   *   below ＝ 档位比它低的职业数，same ＝ 同档（含它自己），above ＝ 档位比它高的职业数
   */
  function growthRankOf(city, K) {
    const L = growthLadderOf(city);
    const v = Number(K);
    if (!L || !Array.isArray(L.hist) || !L.hist.length || !(v > 0)) return null;
    const band = growthBandOf(city, v);
    if (!band) return null;
    const n = L.hist.reduce((a, x) => a + x, 0);
    const below = L.hist.slice(0, band.score - 1).reduce((a, x) => a + x, 0);
    const same = L.hist[band.score - 1] || 0;
    const above = n - below - same;
    return { n, band: band.score, below, same, above, topPct: n ? Math.round((above / n) * 100) : 0 };
  }

  /**
   * 客观层：职业在本城的官方分位值 → K1 与分数。
   * @param {string} city
   * @param {{p20:number,p50:number,p80:number}} q 元/月
   * @returns {{K:number,r1:number,r2:number,score:number,ladder:object}|null}
   */
  function growthScoreOf(city, q) {
    const L = growthLadderOf(city);
    const src = q && typeof q === 'object' ? q : {};
    const p20 = Number(src.p20), p50 = Number(src.p50), p80 = Number(src.p80);
    if (!L || !(L.c > 0) || !(p20 > 0) || !(p80 > p20) || !(p50 > 0)) return null;
    const r1 = (p80 - p20) / L.c;
    const r2 = Math.sqrt(p50 * p80) / L.c;
    const band = growthBandOf(city, r1 * r2);
    if (!band) return null;
    return { K: band.K, r1: Number(r1.toFixed(6)), r2: Number(r2.toFixed(6)), score: band.score, ladder: L };
  }

  /**
   * 主观层：再把这一份 JD 的薪资折进来 → K2 与分数（查同一张量表）。
   * @param {string} city
   * @param {{p20:number,p50:number,p80:number}} q 该职业在本城的官方分位值
   * @param {{low:number,high:number}} jd 这份 JD 的薪资区间（元/月，税前月当量）
   * @param {number} [C] 成色系数（对口度 × 用工形式 × 业务位置，由 lib/ai.js 查表算出）；
   *   缺省 1＝不修正。乘在 K 上，r1/r2 仍报原始因子，便于「依据」里摊开看。
   */
  function growthScoreOfJd(city, q, jd, C = 1) {
    const L = growthLadderOf(city);
    const src = q && typeof q === 'object' ? q : {};
    const p50 = Number(src.p50), p80 = Number(src.p80);
    const low = Number(jd && jd.low), high = Number(jd && jd.high);
    if (!L || !(L.c > 0) || !(p50 > 0) || !(p80 > 0)) return null;
    if (!(low > 0) || !(high > low)) return growthScoreOf(city, q);
    const mid = (low + high) / 2;
    const kc = Number(C) > 0 ? Number(C) : 1;          // 成色系数：只乘在 K 上，不改 r1/r2
    const r1 = (high - low) / L.c;
    const r2 = Math.cbrt(p50 * p80 * mid) / L.c;
    const band = growthBandOf(city, r1 * r2 * kc);
    if (!band) return null;
    return {
      K: band.K, r1: Number(r1.toFixed(6)), r2: Number(r2.toFixed(6)), score: band.score, ladder: L, mid, usedJd: true, C: kc,
    };
  }

  return {
    SCORE_VERSION,
    // 发展空间 v15：城市刻度、取刻度、两层评分（客观 K1 / 主观 K2）
    GROWTH_STEP,
    GROWTH_CITIES,
    growthCityKey,
    growthLadderOf,
    growthBandOf,
    growthRankOf,
    growthScoreOf,
    growthScoreOfJd,
    // 薪资维度的本地刻度（v21：整分位 + 官方价位表）：锚点、分位、倍数、11 个档位下界、月当量 → 分
    PAY_ANCHOR_CITIES,
    PAY_BAND_PERCENTS,
    PAY_BAND_RATIOS,
    PAY_MEDIAN_RATIO,
    PAY_MINWAGE_RATIO,
    payAnchorsOf,
    payLinesOf,
    payLadderOf,
    payBandOf,
    // 发展空间 v13（兜底）：该城还没采到官方工资价位时，用招聘拟合的分布
    GROWTH_SPACE_LINES,
    growthSpaceBand,
    growthSpaceScore,
    growthSpaceScoreJd,
    // 成色系数 C 的档位中文名（前端「依据」面板用；系数表在 lib/ai.js）
    GROWTH_FACTOR_TEXT,
    growthFactorNamesOf,
    WEIGHTS,
    MISSING_SCORE,
    MATCH_NEUTRAL_SCORE,
    matchMultiplier,
    lossAversionFactor,
    RELIABLE_GATE_MIN,
    scoresOf,
    // 双休假期的口径：梯度表、休息天数折算、缺失假设、强度降档、分数
    REST_STATUTORY_DAYS,
    REST_UNCLEAR_DAYS,
    REST_BANDS,
    REST_INTENSITY_DEDUCT,
    restDaysOfBrief,
    restDaysOf,
    restScore,
    restScoreOfDays,
    // 每日工作时长的口径（时薪、性价比共用；只做换算，不参与打分）
    HOURS_INDUSTRY,
    HOURS_INTENSITY_ADD,
    industryKindOf,
    workHoursFromText,
    dailyHoursOf,
    // 发展潜力的分布法常量（底薪型的判定阈值由 growthSpaceScore 用）
    GROWTH_BASE_RATIO,
    // （旧的发展潜力 36 格表 / 履历增值表在 v9 整套废弃；v11/v12「把这一份 JD 折进模型」的
    //   修正层在 v13 整套废弃——口径见上面的 GROWTH_SPACE_* 与 growthSpaceScore）
    // 全国平均工资的两个口径（图上各画一条线，各自标名）
    NATIONAL_WAGE_PRIVATE,
    NATIONAL_WAGE_NONPRIVATE,
    // 性价比的全国基准（分析图与导出共用的锚）
    HOUSE_SQM_PER_PERSON,
    NATIONAL_VALUE_DATA,
    NATIONAL_VALUE_INDEX,
    nationalValueIndexOf,
    // 「一线 / 二线」两组城市的参考工资（组内算术平均，非统计局分组口径）与全国口径周工时
    CITY_TIERS,
  };
}));
