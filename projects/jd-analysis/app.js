(() => {
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // 使用记录（public/track.js，index.html 在本文件之前加载）：只发使用事件，不动任何档案数据。
  // 脚本没加载上时全部动作静默跳过——track.js 挂掉绝不能影响页面。
  const T = window.Track || { clientId: '', view() {}, event() {} };
  // 评分口径：与后端共用同一份实现（public/score.js，由 index.html 在本文件之前加载）。
  // 历史档案重算与「原始分 × 匹配度」分析图都用它，不再在前端抄第二套算法。
  const ScoreModel = window.ScoreModel;

  const viewHome = $('viewHome');
  const viewReport = $('viewReport');
  const viewAnalysis = $('viewAnalysis');
  const viewHistory = $('viewHistory');
  const viewSettings = $('viewSettings');
  const ctaWrap = $('ctaWrap');
  const inputActions = $('inputActions');
  const btnPaste = $('btnPaste');
  const btnQr = $('btnQr');
  const btnShots = $('btnShots');
  const shotInput = $('shotInput');
  const btnAnalyze = $('btnAnalyze');
  const btnReupload = $('btnReupload');
  const qrInput = $('qrInput');
  const toastEl = $('toast');
  const verdictSection = $('verdictSection');
  const scoreValueEl = $('scoreValue');
  const scoreLabelEl = $('scoreLabel');
  const overallScoreEl = $('overallScore');
  const overallMaxEl = $('overallMax');
  const demoTag = $('demoTag');
  // 点评：客观评价（前半段）+ 针对用户的结论（后半段，没有简历时不出现），
  // 两段写在同一行里，中间不换行；更新中的小进度圈挂在这一行末尾
  const verdictLine = $('verdictText');
  const personalText = $('verdictPersonalText');
  // 岗位名：报告跑完之前它必须先是空的，别把上一份报告的名字留在屏幕上
  const verdictJobEl = $('verdictJob');

  // 后半段紧接在前半段后面显示：前半段没有句末标点就补一个，避免两段连读
  const stopEnd = (s) => {
    const t = String(s || '').trim();
    return t && !/[。！？!?…]$/.test(t) ? `${t}。` : t;
  };

  const progressRing = $('progressRing');
  const progressArc = $('progressArc');
  const progressDot = $('progressDot');
  const progressLabel = $('progressLabel');
  const radarSvg = $('radar');
  const jdSection = $('jdSection');
  const jdTitleEl = $('jdTitle');
  const jdBody = $('jdBody');
  const jdRingEl = $('jdRing');
  const jdArcEl = $('jdArc');
  const jdDotEl = $('jdDot');
  const jdLabelEl = $('jdLabel');
  const dimPanel = $('dimPanel');
  const dimPanelName = $('dimPanelName');
  const dimPanelScore = $('dimPanelScore');
  const dimMeter = $('dimMeter');
  const dimPanelText = $('dimPanelText');
  const radarSection = $('radarSection');
  const reportLoading = $('reportLoading');
  const loadingRingEl = $('loadingRing');
  const loadingArcEl = $('loadingArc');
  const loadingDotEl = $('loadingDot');
  const loadingLabelEl = $('loadingLabel');

  const DIM_KEYS = ['reliable', 'pay', 'rest', 'match', 'growth', 'aiProof'];
  const DIM_NAMES = {
    reliable: '岗位可靠性',
    pay: '薪资待遇',
    rest: '双休假期',
    match: '岗位匹配度',
    growth: '发展潜力',
    aiProof: '稳定性',
  };

  /* 六维评分规则：点开某一维时在面板里写清「这个分是怎么算出来的」，并给一张示例表。
     文字必须与 lib/ai.js 的 SYSTEM_PROMPT 里的评分规则保持一致——改规则时两处一起改。 */
  const DIM_RULES = {
    reliable: {
      weight: '闸门项：只做风险提示，不参与总分',
      rule: [
        '先看有没有这几类可疑内容（有一条就扣 5 分）：先收钱，比如培训费 / 押金 / 服装费 / 资料费；先培训后上岗；发展下线拉人头；无责任底薪高得离谱；匿名招聘或代招、说不清用工主体；职责与薪资严重不符。',
        '记分公式：分 = 10 − 5 × 可疑内容条数 − 信息缺口，夹在 0-10。',
        '信息缺口按公司信息能不能核实来算：有官网 / 规模 / 产品可核实 = 0；信息很少 = 3；主体匿名、说不清谁在招 = 6。',
        '这一维是闸门：只做风险提示，不参与总分。',
      ],
      head: ['得分', '原文里的情况'],
      rows: [
        ['10', '没有可疑内容 + 公司信息完整可核实'],
        ['7', '没有可疑内容 + 公司信息很少'],
        ['4', '没有可疑内容 + 主体匿名说不清谁在招'],
        ['2-5', '1 条可疑内容：先交钱 / 先培训后上岗 / 拉人头'],
        ['0', '2 条及以上可疑内容'],
      ],
    },
    pay: {
      weight: '总分权重 30%',
      rule: [
        '分数由程序按公式算，模型只判按区间哪个位置计分；定分只看税前，不看到手。',
        '刻度锚在**当地**的权威数字上，不拿全国通用的年薪表当尺子——同一个 1 万块，在深圳和在长春不是一回事。',
        '**每一档＝本城工资分布的一个整分位**：1 分＝当地月最低工资（薪资的起点，低于它记 0 分）；2–10 分依次是「在本城前 90% / 70% / 50% / 30% / 15% / 5% / 2% / 1% / 0.3%」。',
        '金额怎么来的：把官方工资价位表里每个职业的五个分位点（P10/P25/P50/P75/P90）连成一条分布曲线，262 个职业等权平均 → 本城工资的分布，再取上述整分位的金额（取两位有效数字）。不做正态假设、不猜离散度。',
        '两套口径互相印证：官方那几个锚点正好落在整分位线上——中位 8,313 在前 49%、职业高位的中位 16,086 在前 14%、职业高位的 P90 29,670 在前 2.3%、职业高位的 P99 48,859 在前 0.3%。',
        '口径链：JD 薪资 → 按位置取数 → 月当量（× 薪数 ÷ 12）→ 对本地刻度 → 落档。到线取本档、零插值，与六维其它维度同一套算法。上表「本城刻度」就是你这座城市的具体结果。',
        '其他城市没有官方价位表时：档位借深圳官方表算出的「档线 ÷ 中位」九个倍数乘当地中位数，中位数按当地非私营单位社平 × 0.57 折算（倍数与系数都由深圳官方数据反推），连社平都查不到才用全国非私社平兜底——走的是哪条口径，写在「本次计算」里。',
        '位置由结构决定：只有区间、没写底薪绩效与发放方式 → 按下沿；都写清 → 按中位；浮动能拿 8 成以上 → 按下沿加区间 8 成。薪资读不到时不评分。',
        '到手区间按现行税制实算（三险一金 + 个税，一线单身租房口径），只用于看生活画面，不参与定分。',
      ],
      head: ['分', '在本城前', '对应的收入水平'],
      rows: [
        ['0', '—', '低于当地月最低工资标准（兼职折算、残缺月薪）'],
        ['1', '起点', '＝ 当地月最低工资标准'],
        ['2-5', '前 90% / 70% / 50% / 30%', '中位数两侧的四档：4 分＝当地工资中位数'],
        ['6-8', '前 15% / 5% / 2%', '官方价位表里职业高位的 中位 / P90 一带'],
        ['9-10', '前 1% / 0.3%', '官方价位表里职业高位的 P99 一带，基本是这座城市的顶端'],
      ],
    },
    rest: {
      weight: '总分权重 25%',
      rule: [
        '第一步·把每个作息描述折成它的「年均休息日」：双休 = 104 个周末日 ＋ 13 天法定节假日 = 117 天；大小周 = 78 ＋ 13 = 91 天；单休 / 做六休一 = 52 ＋ 13 = 65 天；月休 N 天 = 12N ＋ 13；上四休三 = 156 ＋ 13 = 169 天；全年无休 = 13 天。',
        '第二步·按梯度表落档（每一档是一种作息的质变，不是把天数均匀切）：天数越少分越低，每跨一档正好降 1 分。表里的「月均休息日」= （年均 − 13）÷ 12，就是 JD 里说的那个「月休 N 天」口径（不含法定节假日）。',
        '第三步·劳动强度降档（最多 −2）：有具体暗示（写明频次或场景的偶尔加班、轮值、不定期出差）−1；明确经常性（经常加班、长期出差、随时待命、996）−2；有调休能换休的，降档减半。只有「抗压能力强」这类通用套话不加不减，写进分析即可。',
        '第四步·超出法定的额外带薪假（双休之外还有明显多于法定的年假、福利假、寒暑假、上四休三）：在 117 天及以上再升一档，封顶 10 分。单休 ＋ 20 天年假仍然是单休，不升档。',
        'JD 完全没写休息情况：没有单休、大小周、少休息高强度这类负面字眼时，按默认假设 104 天（52 周双休，不把未承诺的年假与法定节假日算进去）算，落 7 分；写了负面字眼照旧各自降档。图表里的时薪、性价比用的是同一个 104 天——评分和图表不会各按各的天数。',
        '强度只有一个判定、三处共用：这一维的降档、JD 风险标记里的「强度与文化」、稳定性里「这份工作能干几年」的说法，都引用同一批 JD 原句，不会互相打架。',
      ],
      head: ['得分', '年均休息日', '月均休息日', '对应的作息（每一档是一种作息的质变）'],
      rows: [
        ['10', '≥ 118 天', '≥ 8.8 天', '上四休三（169 天）、寒暑假，或法定之外成规模的带薪假'],
        ['9', '115–117 天', '8.5–8.7 天', '双休 ＋ 法定节假日正常放 —— 法定基准（117 天）'],
        ['8', '105–114 天', '7.7–8.4 天', '双休成立，但年假或法定节假日被打折'],
        ['7', '95–104 天', '6.8–7.6 天', '双休名存实亡：每月至少一个周末要上班；或双休但带薪假明显缩水（JD 完全没写休息时按 104 天的默认假设也落这一档）'],
        ['6', '88–94 天', '6.3–6.8 天', '大小周：隔周双休（91 天）'],
        ['5', '79–87 天', '5.5–6.2 天', '月休 6 天左右：两周休三天（85 天）'],
        ['4', '68–78 天', '4.6–5.4 天', '月休 5 天：一周休一天出头（73 天）'],
        ['3', '52–67 天', '3.3–4.5 天', '单休 / 做六休一：一周休一天（65 天）、月休 4 天（61 天）'],
        ['2', '39–51 天', '2.2–3.2 天', '月休 3 天（49 天）'],
        ['1', '26–38 天', '1.1–2.1 天', '月休 2 天（37 天）'],
        ['0', '≤ 25 天', '≤ 1.0 天', '几乎没有休息日：月休 1 天及以下（25 天）、全年无休（13 天）'],
      ],
    },
    match: {
      weight: '调节项：按匹配度把总分调到 0.8 倍 ~ 1.2 倍',
      rule: [
        '没有简历时不评分，显示 --。',
        '三类岗位三套口径，分数都由程序算，模型只逐条标证据；下面「详细分析」里的逐条扣分点也是程序按证据写的，一行一条。',
        '① 普通岗位：分 = 10 × 职责命中率 ÷ 0.8（折算后封顶 10）× 门槛系数。',
        '　职责命中率：每条要求标命中程度，直接命中 1、部分命中 0.6、没命中 0；真实门槛权重 1、加分项权重 0.5、许愿式要求不计入。',
        '　达标折算：招聘要求通常写得比实际需要高——七八成覆盖就是 HR 眼里「完全能胜任」，所以命中率 ≥ 80% 折算后即封顶（门槛满足就是 10 分）、70% 约 9 分、60% 约 7~8 分、50% 约 6 分（区间低位）。',
        '　门槛系数按木桶原则取最弱一项：学历 / 年限 / 证书 / 专业满足 1、差一点 0.85、不满足 0.5。',
        '② 报考类岗位（公务员 / 事业编 / 教师 / 医师 / 国企招考这类要先报名考试、资格审核的）：先比资格、再看内容——报考条件（学历 / 专业 / 年龄 / 户籍 / 政治面貌 / 资格证 / 年限……）逐条比对：',
        '　全部符合 → 8 分起步；工作内容也契合（职责命中率 ≥ 80% 到 10 分、≥ 50% 到 9 分）。资格是硬闸门，工作经历不够丰富不往下压。',
        '　有不符合 → 0~5 分，按「符合条数 ÷ 可判定条数」给（差一点按半条计）；简历里看不出的项（体检、政审这类）不计入分母、不扣分。',
        '　「报考类」必须有 JD 原句撑着（笔试、考试、资格审查这类写法），找不到原句按普通岗位算——宁可少一次 8 分起步，也不认一句凭印象的「要考试」。',
        '③ 资格门槛型（公职 / 编制 / 机关 / 街道办这类以任职资格为门槛、职责写得泛的岗位）：先比资格——学历 / 年限 / 证书 / 专业四项没有缺口（差一点算过）→ 8 分起步，内容契合再往上加到 10；有缺口 → 0~5 分。职责覆盖率压不动分数：这类岗位的活进来学就会，门槛在资格上。',
        '　「资格门槛型」同样要 JD 原句撑着（出现编制、机关、街道、科员这类身份文字），对不上按普通岗位算。',
        '许愿式要求＝远超该薪资职级、一人干三人活、自相矛盾、只有绝对化口号；这类不算你的短板，只在分析里点明。',
        '总分怎么被调：5 分中性不改分；10 分最多加 20%；0 分最多打 8 折。不匹配是「你够不着」，不是「岗位差」，而且匹配度能靠补技能、内推改变，所以下限只到 0.8 倍。',
      ],
      head: ['得分', '简历与岗位的关系'],
      rows: [
        ['9-10', '报考类：资格全符合 + 工作内容也契合'],
        ['10', '普通岗：职责命中 8 成以上（七八成覆盖就算完全胜任）+ 门槛全满足'],
        ['8', '报考类：资格全符合（内容对不上也保底 8 分）'],
        ['6-9', '普通岗：职责命中 5~7 成；或 8 成以上但硬门槛差一点（差一点按 0.85）'],
        ['1-5', '报考类：报考条件部分不符合，按满足条数给（0-5）'],
        ['0-5', '普通岗：硬门槛不满足，学历 / 年限 / 证书卡住（门槛系数 0.5）'],
      ],
    },
    growth: {
      weight: '总分权重 20%',
      rule: [
        '定义：K ＝ 薪资成长空间 r₁ × 工作价值高度 r₂，都以当地非私营在岗社平 c 为单位\n'
        + 'r₁ 量「能涨多少」，r₂ 量「能站多高」',
        '客观层 K₁（职业 × 城市）\n'
        + '官方：r₁ ＝ (P80 − P20) ÷ c，r₂ ＝ √(P50 · P80) ÷ c\n'
        + '拟合：r₁ ＝ (t − b) ÷ c，r₂ ＝ t ÷ c　（b ＝ P30，t ＝ P87.5；底薪型 t ＝ P75）',
        '主观层 K₂（这一份 JD）\n'
        + 'r₁′ ＝ (JD高 − JD低) ÷ c，r₂′ ＝ ∛(P50 · P80 · JD中) ÷ c，K₂ ＝ r₁′ × r₂′ × C\n'
        + 'P50 / P80 取自该职业在本城的分布（官方分位值或拟合分布）；C 是成色系数（见下表）',
        '落档\n'
        + '官方口径查本城刻度 Lᵢ ＝ exp(μ ＋ (i − 5) · 0.7σ)，i ＝ 1…9；拟合口径查下面那张 k′ 量表\n'
        + '分 ＝ 1 ＋ 满足 K ≥ 分界线 的条数（10 档、到线取本档、零插值）；读得到 JD 报价用 K₂，读不到用 K₁',
        '成色系数 C（只作用在主观层）：C ＝ 对口度 × 用工形式 × 业务位置，夹在 [0.30, 1.20]——'
        + '它回答的是「同一职业、同样报价的两份 JD，哪一份真的能往上走」。三项的档位、系数与含义见下表。',
        '数据来源\n'
        + '① 人社局工资价位表（《企业薪酬统计调查制度》——国家统计局批准、人力资源社会保障部统一部署，逐年发布，不需联网重采）\n'
        + '② 官方表里没有这个职业 → 网络公开招聘数据拟合的分布，分析里会注明',
      ],
      tables: [
        {
          caption: '① 量表：K 落在哪一档（拟合口径的 k′ 分界线；官方口径查该城刻度）',
          head: ['分', 'k′ 区间（拟合口径）', '薪资成长空间 × 工作价值高度', '定义'],
          rows: [
            ['10', '≥ 2.74', '1.15 × 2.46', '落差 ≥1.15 条社平、天花板 ≥2.5 倍：普通人的上限也远高于市场'],
            ['9', '2.31 – 2.74', '1.07 × 2.49', '落差约 1 条社平、天花板约 2.5 倍：红利与阶梯叠加，能到城市收入高位段'],
            ['8', '1.73 – 2.31', '1.00 × 2.00', '落差一整条社平、天花板两倍：既走得远、又站得高'],
            ['7', '1.32 – 1.73', '1.00 × 1.50', '落差＝一整条非私营社平：好工作的守门线'],
            ['6', '0.94 – 1.32', '0.61 × 1.91', '一般公务员：慢，但在往上走'],
            ['5', '0.61 – 0.94', '0.61 × 1.23', '落差约 0.6 条社平、天花板 1.2–1.4 倍：有真台阶、台阶不高'],
            ['4', '0.42 – 0.61', '0.50 × 1.00', '落差＝一条私营社平：能凭资历涨一截，然后封顶'],
            ['3', '0.31 – 0.42', '0.33 × 1.05', '落差约 0.33 条社平、天花板勉强越过社平：往上有一点位置，但很窄'],
            ['2', '0.17 – 0.31', '0.25 × 1.10', '只有工龄涨、没有提升空间'],
            ['1', '0.00 – 0.17', '0.10 × 1.00', '连工龄差都没有：干到顶也在社平以下'],
          ],
        },
        {
          caption: '② 成色系数 C：三项相乘，夹在 [0.30, 1.20]。三项都由模型从 JD 原文里指档位、程序查本表算系数——'
            + '每项都必须拿得出 JD 原句，指了档位却对不上原文的一律按最中立的一档算（系数 1）：没证据不压分、更不抬分。',
          head: ['看什么', '档位', '系数', '什么意思（举的都是现成的例子）'],
          rows: [
            ['对口度\nJD 描述的活，和这个职业通常干的活像不像', '对口', '×1.00', '职责就是这个职业的主流职责，招人方的行业也常用这个岗——互联网公司招 AI 产品经理'],
            ['', '偏门行业', '×0.85', '职责对得上，但招人方的行业基本用不上这个岗——工厂招 AI 产品经理'],
            ['', '只沾一部分', '×0.70', '一半是这个职业的活，另一半是别的岗——兼做行政、兼做运营'],
            ['', '名实不符', '×0.45', '岗位名和实际干的活基本是两码事——田径赛场招游泳教练'],
            ['用工形式', '编制', '×1.20', '公务员 / 事业编 / 国企正式编：上升路径是写在制度里的，最清晰'],
            ['', '正职（最中立）', '×1.00', '公司自己招的正式合同，符合期望；JD 没写雇佣形式时也按这一档'],
            ['', '外包 / 派遣', '×0.80', '人力公司代招、驻场：晋升与调薪基本由用人公司说了算，你的发展没人替你规划'],
            ['', '兼职 / 实习', '×0.60', '本身就是过渡性的，谈不上往上走'],
            ['业务位置', '核心主线（最中立）', '×1.00', '直接吃公司主业务的岗，资源与机会先给到这里'],
            ['', '共享 / 中台', '×0.90', '支撑多个业务的公共团队：离业务远一层，涨得慢一点'],
            ['', '辅助边缘', '×0.75', '行政、内勤、预算外的新业务、可有可无的配套岗：很可能达不到这个职业的一般高度'],
          ],
        },
      ],
    },
    aiProof: {
      weight: '总分权重 25%',
      rule: [
        '两条腿：① 传统稳定性——这份工作能不能长期干下去；② AI 不可替代性——职责有多少能被 AI 替掉。分数越高越稳。',
        '记分公式：分 = 基础档 + AI 调整，夹在 0-10。AI 调整：职责容易被 AI 工具化，比如重复文本、数据、检索、套模板，−1 ~ −2；依赖判断、关系、现场与责任 +1 ~ +2。',
        '基础档要同时回答四个问题：谁在雇你；雇主能不能长期养人，看盈利、融资、行业扩张还是收缩；岗位是不是核心业务的主线岗；这份岗位能干几年，客服销售这类人员一直在换的，就算 AI 不好替也很难长期干。',
        '基础档位：编制内 10，只要不离职就能干到退休；供不应求的正职 8-9，如 AI 算法工程师；行业与业务都稳的正职 7-8；行业裁员频繁或前景一般 6-7；人员流动大 3-5，如客服 / 销售 / 中介，AI 调整后最多 6；外包 / 派遣 3-4；项目制 2-4；兼职 / 实习 1-3；灰色用工 0-1。',
        '分析里要分别点明：用工形式、雇主能不能长期养人、这份工作能干几年、AI 替代风险，以及最终为什么落在这个档。',
      ],
      head: ['得分', '岗位的样子，末尾用括号注出常见叫法'],
      rows: [
        ['10', '编制内，只要不离职就能干到退休（公务员 / 事业编）'],
        ['9', '正职，技能供不应求、被开概率很低（AI 算法工程师）'],
        ['7-8', '正职，行业与业务都稳、是核心主线岗（大厂核心岗、医疗电力）'],
        ['6-7', '正职，但行业裁员频繁或公司前景一般（互联网普通岗、初创公司）'],
        ['3-5', '人员流动大，很难长期干下去（客服 / 销售 / 中介）'],
        ['3-4', '外包 / 派遣 / 劳务（人力公司代招的驻场岗）'],
        ['2-4', '项目制，项目一结束就散（按项目招的外包组）'],
        ['1-3', '兼职 / 实习：纯体力 → 技能接活（帮人用 AI 做东西）'],
        ['0-1', '先交钱、无底薪、拉人头（灰色用工）'],
      ],
    },
  };

  /* ---------- 示例报告（演示数据） ---------- */
  const DEMO_JD_BLOCKS = [
    {
      title: '岗位信息',
      type: 'kv',
      items: [
        '职位：AI 产品经理（大模型应用方向）',
        '薪资：35-55K · 16 薪',
        '城市：深圳 · 南山区',
        '要求：本科及以上，3 年以上经验',
      ],
    },
    {
      title: '岗位职责',
      type: 'list',
      items: [
        '负责大模型应用产品的需求调研、竞品分析与产品规划，输出 PRD 与原型；',
        '与算法、工程、设计团队协作推进产品从设计到上线，跟进落地效果并持续迭代；',
        '梳理行业场景，识别可被大模型重构的业务流程，设计差异化产品方案。',
      ],
    },
    {
      title: '任职要求',
      type: 'list',
      items: [
        '本科及以上学历，3 年以上产品经理经验，有大模型相关项目经验者优先；',
        '熟悉大模型应用场景（RAG、Agent、提示工程等），能与算法同学高效对话；',
        '具备较强的抗压能力，能配合项目节奏，接受弹性工作时间；',
        '可接受不定期海外出差（东南亚、中东），必要时陪同客户高层访问。',
      ],
    },
    {
      title: '加分项',
      type: 'list',
      items: ['有 To B 交付经验，熟悉企业级客户决策链路。'],
    },
    {
      title: '薪资与工时',
      type: 'list',
      items: [
        '35-55K · 16 薪，另含股票期权；薪资带宽 20K，定级弹性较大；',
        '全文未提及双休、大小周或加班安排，仅写「弹性工作」。',
      ],
    },
    {
      title: '公司信息',
      type: 'list',
      items: ['B 轮 · 500-999 人；原文自述「扁平化管理，团队年轻有活力，成长空间大」。'],
    },
  ];

  // 示例数据按真实报告的三层结构组装：source 只放 JD 客观信息，analysis 放评分与点评
  const DEMO_SOURCE = {
    job: { title: 'AI 产品经理', company: '某互联网科技有限公司 B 轮', salary: '35-55k·16薪', city: '深圳' },
    jdBlocks: DEMO_JD_BLOCKS,
  };

  const DEMO_ANALYSIS = {
    conclusion: "休息安排全文未提，只能按默认的双休基线估；不定期海外出差、陪同客户会切走整块个人时间。",
    personalNote: "值得投，只卡在没有独立做过大模型项目。",
    restBrief: "未提及双休与工时",
    hasResume: true,
    // 示例也带上运算数据，好让维度面板的「依据」块有得展示
    restMeta: { beyond: false, intensity: 'none', compTime: false },
    // 发展空间（拟合口径，两层）：深圳 AI 产品经理的分布（网络公开数据）→ K₁＝2.676 落 9 分；
    // 再把这份 JD 的 35-55K·16 薪折进主观层 → K₂＝4.608 落 10 分，落档用 K₂。
    // 前端展示依据、重算评分都靠它（「产品经理」不在深圳官方工资价位表里，所以走 fitted；basis 标这个）
    growthCalc: {
      basis: 'fitted',
      job: 'AI产品经理', city: '深圳', mu: 10.168, sigma: 0.318, nonpriv: 14755, priv: 7935,
      b: 22054, t: 37564, r1: 1.8073, r2: 2.5495, r1Base: 1.0512, r2Base: 2.5459,
      k: 4.608, K: 4.608, K1: 2.676, K2: 4.608, layer: 'jd',
      jdLow: 46667, jdHigh: 73333, jdMid: 60000, lowBase: false,
      // 成色系数（v17）：这份示例 JD 没写用工形式与业务位置，按最中立的一档算，系数正好 1
      C: 1, Cmeta: { fit: 'aligned', form: 'regular', position: 'core', C: 1, raw: 1 },
      score: 10, confidence: '中', samples: 135, source: '网络公开数据·招聘薪资标注（73.1–77% 岗位 20–50K，135 份样本）',
    },
    // 示例同样走程序算的薪资口径：35-55k · 16 薪 · 深圳 → 按下沿取数 → 9 分档
    payCalc: {"low":35000,"high":55000,"months":16,"position":"low","pick":35000,"monthly":46667,"band":9,"ladder":{"median":8313,"minWage":2360,"lines":[0,2360,4800,6400,8200,11000,16000,24000,31000,38000,50000],"city":"深圳","high":[16086,29670,48859],"percents":[null,100,90,70,50,30,15,5,2,1,0.3],"basis":"official","source":"深圳市人力资源和社会保障局《深圳市2025年人力资源市场工资价位及行业人工成本信息》（2026-04-14 发布，262 个职业：P50 的中位 8,313；各职业 P90 的中位 16,086、P90 的 P90 29,670、P90 的 P99 48,859）；最低工资 2,360 元/月为深圳市现行标准"},"takeHomeLo":34692,"takeHomeHi":53120,"takeHomePick":34692,"marginalRate":0.25},
    overall: 85,
    overallMax: 100,
    baseScore: 83,
    matchMultiplier: 1.03,
    dimensions: [
      { key: "reliable", name: "岗位可靠性", score: 7, analysis: "招聘内容里没有先收钱、押金、培训贷、拉人头这类可疑内容，职责与薪资量级也对得上，不像虚假或传销岗。但用工主体没有给出公司名称，只有融资轮次与人数规模，可核实的信息偏少。按「没有可疑内容、公司信息很少」计分，属于信息不足而非明显风险。" },
      { key: "pay", name: "薪资待遇", score: 9, analysis: "只有 35-55K · 16 薪加股票期权的笼统写法，底薪多少、绩效占比、发放方式都没有交代，带宽还拉到 20K。定级弹性大意味着同岗待遇能差出一大截，实际到手更可能贴近区间下沿。该写而没写的还有试用期薪资与期权兑现条件。" },
      { key: "rest", name: "双休假期", score: 7, analysis: "全文没有双休、大小周、上下班时间或排班说明，只有一句弹性工作——没有负面字眼，就按默认的双休基线估（52 周双休、不含未承诺的年假与法定节假日，年均 104 天），落在 7 分档。不定期海外出差、必要时陪同客户高层访问会切走整块个人时间，这两条记在 JD 风险标记里，不在这里重复扣分。" },
      { key: "match", name: "岗位匹配度", score: 6, analysis: "直接命中：商家后台订单与结算模块从需求调研到 PRD、上线跟进的完整流程，以及和算法团队协作推进推荐位优化，对应「需求调研—PRD—跨团队推进落地」这条主线；A/B 实验与数据跟进也对得上落地效果迭代。缺口：没有独立负责过大模型项目，JD 要求的 RAG、Agent 只停留在「了解基本概念」，「识别可被大模型重构的业务流程」这条职责没有对应经历。可迁移：B 端商家侧经验对应「有 To B 交付经验」加分项，与算法同学协作沟通的经验可支撑「与算法高效对话」。门槛上本科与 3 年以上经验都满足，学历年限不卡人。职责命中约六成、门槛全满足。" },
      { key: "growth", name: "发展潜力", score: 10, analysis: "AI产品经理近一年招聘池（网络公开数据）：普通人常见水平约 22.1K，能摸到的天花板约 37.6K——这份 JD 报价 46.7K–73.3K（月当量），成色：对口 · 正职 · 核心主线，折进主观层：薪资成长空间 1.81 × 工作价值高度 2.55 × 成色系数 1.00 → K₂＝4.61。该职业还不在官方工资价位表里，本分由招聘薪资标注拟合的分布算出。" },
      { key: "aiProof", name: "稳定性", score: 7, analysis: "JD 未写雇佣形式，按正式合同正职看，岗位是大模型应用的产品主线而非临时补位，所在行业在扩张，雇主短期内有能力养人。产品岗本身流动性中等，不属于客服、销售那类常年换人的岗位。AI 替代风险集中在竞品整理、文档与原型输出这类可被工具代劳的部分，跨团队推进、场景重构与客户现场仍依赖人的判断，整体落在中上档，但没到技能供不应求的程度。" },
    ],
    jdMarks: [
      { text: "有大模型相关项目经验者优先", level: "mid", cat: "门槛与要求", why: "优先项在筛简历时往往先于其他条件被使用，没有相关项目容易吃亏。" },
      { text: "具备较强的抗压能力，能配合项目节奏", level: "mid", cat: "强度与文化", why: "抗压被写进硬性要求，说明高强度是常态而非偶发，节奏由项目推着走。" },
      { text: "接受弹性工作时间", level: "mid", cat: "时间与休息", why: "只提弹性却不写双休与上下班时间，休息安排实际无从落实。", cite: {"org":"国务院","doc":"《国务院关于职工工作时间的规定》第三条","quote":"职工每日工作8小时、每周工作40小时。","url":"https://flk.npc.gov.cn/","linkLabel":"在国家法律法规数据库检索"} },
      { text: "可接受不定期海外出差（东南亚、中东）", level: "high", cat: "时间与休息", why: "不定期出差不写频次与时长，行程由业务安排，个人时间难以自主。" },
      { text: "必要时陪同客户高层访问", level: "high", cat: "强度与文化", why: "陪同客户高层属应酬型工作，时间与场合都不由自己掌控。" },
      { text: "另含股票期权", level: "mid", cat: "收入结构", why: "期权是浮动部分，兑现条件与周期都没写，实际收益并不确定。", cite: {"org":"国家统计局","doc":"国家数据 · 城镇单位就业人员平均工资","quote":"按行业与地区查询城镇单位就业人员平均工资。","url":"https://data.stats.gov.cn/","linkLabel":"前往查询"} },
    ],

  };

  const DEMO_REPORT = { ok: true, source: DEMO_SOURCE, analysis: DEMO_ANALYSIS, reference: { cityData: null } };

  /* 首页示例轮播用的一组演示岗位：三张分析图平时读「已分析岗位」，示例里换成这一组来画。
     全部落在深圳——只有深圳同时有官方档位线与 262 个职业的参照云，图才成形。
     数值按「职业×城市」分布口径手写：b＝普通人常见水平、t＝天花板（元/月），
     r1＝这份报价相对本职业的成长空间、r2＝这个职业相对本城社平的落差（K＝r1×r2）。 */
  function demoCase(spec, i) {
    const job = { title: spec.title, company: spec.company || '', salary: spec.salary, city: '深圳' };
    const K = Number((spec.r1 * spec.r2).toFixed(3));
    const growthCalc = {
      basis: 'fitted', job: spec.title, city: '深圳',
      mu: spec.mu, sigma: spec.sigma, nonpriv: spec.nonpriv, priv: spec.priv,
      b: spec.b, t: spec.t,
      r1: spec.r1, r2: spec.r2, r1Base: spec.r1, r2Base: spec.r2,
      k: K, K, K1: K, K2: K, layer: 'jd',
      jdLow: spec.jdLow, jdHigh: spec.jdHigh, jdMid: Math.round((spec.jdLow + spec.jdHigh) / 2),
      C: 1, Cmeta: { fit: 'aligned', form: 'regular', position: 'core', C: 1, raw: 1 },
      lowBase: false, score: spec.score, confidence: '中', samples: spec.samples || 120,
      source: '网络公开数据·招聘薪资标注（演示样本）',
    };
    return {
      id: `demo-${i}`,
      url: `demo:${i}`,
      savedAt: 0,
      jdRaw: '',
      job,
      overall: spec.overall,
      dims: DIM_KEYS.map((k) => ({ key: k, score: k === 'growth' ? spec.score : null })),
      data: {
        source: { job, jdText: '' },
        // 城市数据是档案的固定字段（真实档案由 recordHistory 统一补），示例里留空即可
        reference: { cityData: null },
        analysis: {
          restBrief: spec.rest,
          restMeta: {},
          hasResume: false,
          dimensions: [{ key: 'growth', name: '发展潜力', score: spec.score, analysis: '' }],
          growthCalc,
        },
      },
    };
  }

  const DEMO_CASES = [
    { title: 'AI 产品经理', salary: '35-55k·16薪', rest: '未提及双休与工时', score: 10, overall: 85,
      mu: 10.168, sigma: 0.318, nonpriv: 14755, priv: 7935, b: 22054, t: 37564,
      jdLow: 46667, jdHigh: 73333, r1: 1.807, r2: 2.55, samples: 135 },
    { title: '产品经理', salary: '25-40k·14薪', rest: '双休', score: 8, overall: 78,
      mu: 10.05, sigma: 0.36, nonpriv: 14755, priv: 7935, b: 15600, t: 28000,
      jdLow: 29167, jdHigh: 46667, r1: 1.35, r2: 1.9 },
    { title: '前端开发工程师', salary: '20-35k·13薪', rest: '大小周', score: 7, overall: 71,
      mu: 9.95, sigma: 0.34, nonpriv: 14755, priv: 7935, b: 13980, t: 26400,
      jdLow: 21667, jdHigh: 37917, r1: 1.15, r2: 1.79 },
    { title: '数据分析师', salary: '15-25k·14薪', rest: '双休', score: 6, overall: 66,
      mu: 9.85, sigma: 0.32, nonpriv: 14755, priv: 7935, b: 11200, t: 19800,
      jdLow: 17500, jdHigh: 29167, r1: 0.95, r2: 1.34 },
    { title: '运营专员', salary: '9-13k·13薪', rest: '单休', score: 4, overall: 52,
      mu: 9.4, sigma: 0.42, nonpriv: 14755, priv: 7935, b: 7400, t: 13600,
      jdLow: 9750, jdHigh: 14083, r1: 0.52, r2: 0.92 },
    { title: '视觉设计师', salary: '8-12k', rest: '月休 4 天', score: 3, overall: 45,
      mu: 9.3, sigma: 0.45, nonpriv: 14755, priv: 7935, b: 6800, t: 11800,
      jdLow: 8000, jdHigh: 12000, r1: 0.44, r2: 0.8 },
  ].map(demoCase);

  let jdUrl = null;
  let pendingShots = [];        // 选好但还没分析的截图（dataURL），与 jdUrl 二选一
  let toastTimer = null;
  let pasteArmed = false;
  let aborted = false;
  let pushedState = false;
  let dimsData = [];
  let radarApi = null;
  let activeKey = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* ---------- 基础交互 ---------- */

  // 视图切换后的钩子：首页示例轮播靠它「回到首页才继续播、离开就停」
  let onViewShown = null;

  /* 记住「刷新前在浏览哪一页」：每次切视图写进 localStorage，启动时按它还原。
     报告页要连「打开的是哪一份档案」一起记（reportMemo 在打开档案/分析完成时登记）。 */
  const VIEW_MEMO_KEY = 'ai-jd-last-view-v1';
  let reportMemo = null;
  const nameOfView = (v) => (v === viewHistory ? 'history'
    : v === viewResume ? 'resume'
      : v === viewAnalysis ? 'analysis'
        : v === viewSettings ? 'settings'
          : v === viewSelf ? 'self' : 'home');
  function rememberView(name, extra) {
    try {
      const memo = { view: name, at: Date.now(), ...(extra || {}) };
      if (name === 'self' && selfPreviewId) memo.selfId = selfPreviewId;
      localStorage.setItem(VIEW_MEMO_KEY, JSON.stringify(memo));
    } catch { /* 隐私模式：忽略 */ }
  }

  function show(view) {
    for (const v of [viewHome, viewReport, viewResume, viewAnalysis, viewHistory, viewSettings, viewSelf]) v.hidden = v !== view;
    // 记住这次浏览的页面（报告页保留 reportMemo 里登记的档案身份，等档案就绪后才有值）
    if (view !== viewReport) rememberView(nameOfView(view));
    else if (reportMemo) rememberView('report', reportMemo);
    // 使用记录：切到哪个视图（报告页 nameOfView 归到 home，这里单独认）
    T.view(view === viewReport ? 'report' : nameOfView(view));
    window.scrollTo({ top: 0 });
    if (onViewShown) onViewShown(view);
    paintNav();
  }

  // 第三个参数可选：给提示挂一个动作按钮（历史档案删除后的「撤销」用它），不传就是原来的纯文字提示
  function toast(msg, duration = 2400, action = null) {
    toastEl.textContent = msg;
    if (action && action.label && typeof action.on === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        clearTimeout(toastTimer);
        hideToast();
        action.on();
      });
      toastEl.appendChild(btn);
    }
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);
  }

  function hideToast() {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 240);
  }

  /* ---------- 输入就绪 / 重新上传：三种输入方式共用同一个状态 ---------- */

  // 打勾：三个输入按钮里同时只有一个算「已捕获」
  function markInputDone(btn) {
    for (const b of [btnPaste, btnQr, btnShots]) b.classList.toggle('done', b === btn);
  }

  // 就绪：四个输入按钮整体收起，展开「生成深度分析 + 重新上传」；收回时原路反过来。
  // 「需要浏览器扩展」那行就在 #inputActions 里面，跟着容器一起收，不用单独管
  function setInputReady(on) {
    btnAnalyze.disabled = !on;
    inputActions.classList.toggle('collapsed', on);
    ctaWrap.classList.toggle('collapsed', !on);
  }

  // 清掉已捕获的输入（链接 / 截图）与三个按钮上的勾，回到「什么都还没选」
  function clearInput() {
    jdUrl = null;
    pendingShots = [];
    pasteArmed = false;
    markInputDone(null);
  }

  function acceptUrl(url, sourceBtn) {
    jdUrl = url;
    pendingShots = [];            // 链接与截图二选一：链接进来了，之前选的截图就不算数
    pasteArmed = false;
    markInputDone(sourceBtn);
    setInputReady(true);
  }

  function isValidUrl(text) {
    if (!text) return false;
    try {
      const u = new URL(text.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /* ---------- 按钮1：粘贴链接 ---------- */

  btnPaste.addEventListener('click', async () => {
    // 先看扩展在不在：不在就别动剪贴板——用户看完教程刷新回来还得再点一次，
    // 不能停在「链接已经捕获、却分析不了」的中间态
    const ready = await extensionReady(2400);
    paintExtGuideState(ready);
    if (!ready) {
      if (extGuideFlag()) toast('还没装扩展：点旁边的「?」看安装步骤', 3600);
      else openExtGuide({ resume: 'clipboard' });
      return;
    }
    await pasteFromClipboard();
  });

  document.addEventListener('paste', (e) => {
    if (viewHome.hidden) return;
    // 光标在输入框 / 文本域里时不抢粘贴：这里原本无条件 preventDefault，
    // 结果是「模型接入」弹层里那把 API Key 根本粘不进去（只能一个字一个字敲）。
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    e.preventDefault();
    if (isValidUrl(text)) {
      // 和点「粘贴链接」同一条规矩：没扩展就先摆教程，别先把链接吃下来
      const url = text.trim();
      extensionReady(2400).then((ready) => {
        paintExtGuideState(ready);
        if (ready) { acceptUrl(url, btnPaste); return; }
        if (extGuideFlag()) { toast('还没装扩展：点旁边的「?」看安装步骤', 3600); return; }
        openExtGuide({ resume: 'paste', url });
      });
      return;
    }
    if (pasteArmed) toast('剪贴板中未找到链接');
  });

  /* ---------- 按钮2：上传二维码 ---------- */

  btnQr.addEventListener('click', () => qrInput.click());

  // 从图片里找二维码：先整图识别，再试放大、二值化和按区域裁切，尽量把码扫出来
  function decodeQrFromImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const maxSide = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, 1024 / maxSide);
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const tryDecode = () => {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(d.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    };

    let code = tryDecode();
    if (code) return code;

    // 小图容易扫不出：放大一倍再试
    if (canvas.width < 700) {
      const big = document.createElement('canvas');
      big.width = canvas.width * 2;
      big.height = canvas.height * 2;
      const bctx = big.getContext('2d', { willReadFrequently: true });
      bctx.drawImage(canvas, 0, 0, big.width, big.height);
      const d = bctx.getImageData(0, 0, big.width, big.height);
      code = window.jsQR(d.data, big.width, big.height, { inversionAttempts: 'attemptBoth' });
      if (code) return code;
    }

    // 二维码常在截图角落/中央：按九宫格逐块再扫一遍
    const regions = [
      [0, 0, 0.6, 0.6], [0.4, 0, 0.6, 0.6], [0, 0.4, 0.6, 0.6], [0.4, 0.4, 0.6, 0.6],
      [0.2, 0.2, 0.6, 0.6], [0, 0, 1, 0.5], [0, 0.5, 1, 0.5],
    ];
    for (const [rx, ry, rw, rh] of regions) {
      const w = Math.round(canvas.width * rw);
      const h = Math.round(canvas.height * rh);
      if (w < 40 || h < 40) continue;
      const part = document.createElement('canvas');
      part.width = w;
      part.height = h;
      const pctx = part.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(canvas, Math.round(canvas.width * rx), Math.round(canvas.height * ry), w, h, 0, 0, w, h);
      const d = pctx.getImageData(0, 0, w, h);
      code = window.jsQR(d.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (code) return code;
    }
    return null;
  }

  // 二维码里可能是一整段分享文案，尝试从中取出链接
  function pickUrl(text) {
    const s = String(text || '').trim();
    if (isValidUrl(s)) return s;
    const m = s.match(/https?:\/\/[^\s，。、）)】"'<>]+/i);
    if (m && isValidUrl(m[0])) return m[0];
    return null;
  }

  qrInput.addEventListener('change', async () => {
    const file = qrInput.files && qrInput.files[0];
    qrInput.value = '';
    if (!file) return;
    toast('正在识别二维码…', 1600);
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    img.src = url;
    const ok = await done;
    if (!ok) {
      URL.revokeObjectURL(url);
      toast('图片读取失败，换一张试试');
      return;
    }
    let code = null;
    try {
      code = decodeQrFromImage(img);
    } catch (e) {
      code = null;
    }
    URL.revokeObjectURL(url);

    if (!code) {
      toast('这张图里没有识别到二维码', 3200);
      return;
    }
    const link = pickUrl(code.data);
    if (!link) {
      toast('识别到二维码，但里面不是链接', 3200);
      return;
    }
    // 二维码解出来的还是链接：一样得靠扩展去读页面（很多人不知道这一点）
    const ready = await extensionReady(2400);
    paintExtGuideState(ready);
    if (!ready) {
      if (extGuideFlag()) { toast('还没装扩展：点旁边的「?」看安装步骤', 3600); return; }
      openExtGuide({ resume: 'qr', url: link });
      return;
    }
    acceptUrl(link, btnQr);
    toast('已识别二维码，接下来点「生成深度分析」');
  });


  /* ---------- 进度圆环（转满即完成，带推进动效与提示文字） ---------- */

  const RING_R = 7.5;
  const RING_C = 2 * Math.PI * RING_R;

  function makeRing(ringEl, arcEl, dotEl, labelEl) {
    function setProgress(p) {
      const v = Math.max(0, Math.min(1, p));
      arcEl.setAttribute('stroke-dashoffset', String(RING_C * (1 - v)));
      const ang = (-90 + 360 * v) * Math.PI / 180;
      dotEl.setAttribute('cx', String(10 + RING_R * Math.cos(ang)));
      dotEl.setAttribute('cy', String(10 + RING_R * Math.sin(ang)));
    }
    return {
      setProgress,
      setLabel: (text) => { labelEl.textContent = text; },
      show: () => { ringEl.style.opacity = '1'; labelEl.style.opacity = '1'; setProgress(0); },
      hide: () => { ringEl.style.opacity = '0'; labelEl.style.opacity = '0'; },
    };
  }

  const ring = makeRing(progressRing, progressArc, progressDot, progressLabel);
  const jdRing = makeRing(jdRingEl, jdArcEl, jdDotEl, jdLabelEl);
  // 解析阶段居中的那个圈：JD 还没读回来之前，页面上只有它
  const loadingRing = makeRing(loadingRingEl, loadingArcEl, loadingDotEl, loadingLabelEl);

  const setProgress = (p) => ring.setProgress(p);
  const setProgressLabel = (text) => ring.setLabel(text);

  // 行内小进度圈：挂在「总分」「点评」这类内容后面，表示这块正在被重新生成
  function bindMiniRing(el) {
    if (!el) return null;
    const R = 6;
    const C = 2 * Math.PI * R;
    el.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
      + `<circle cx="8" cy="8" r="${R}" fill="none" stroke="#f1f1ef" stroke-width="2"></circle>`
      + `<circle class="mini-arc" cx="8" cy="8" r="${R}" fill="none" stroke="#191919" stroke-width="2"`
      + ` stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 8 8)"></circle>`
      + '</svg>';
    const arc = el.querySelector('.mini-arc');
    return {
      setProgress: (p) => { arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(1, p))))); },
      show: () => { el.classList.add('on'); },
      hide: () => { el.classList.remove('on'); },
    };
  }

  const miniScore = bindMiniRing($('miniScore'));
  const miniVerdict = bindMiniRing($('miniVerdict'));

  // JD 解析是一次「读页面 → 问模型」的调用，没有真实进度可报。
  // 所以按时间轮换阶段文案，让用户看得出确实在干活、走到哪一步了。
  const JD_WAIT_STEPS = [
    '正在读取职位信息…',
    '正在读取职位描述与任职要求…',
    '正在核对薪资、工时与休息制度…',
    '正在评估六个维度的风险与含金量…',
    '正在把岗位要求与你的简历逐条比对…',
    '正在整理结论、风险标记与下一步建议…',
  ];
  const WAIT_STEP_MS = 3200;

  function waitLabelAt(ms) {
    const i = Math.floor(ms / WAIT_STEP_MS);
    if (i < JD_WAIT_STEPS.length) return JD_WAIT_STEPS[i];
    const last = JD_WAIT_STEPS[JD_WAIT_STEPS.length - 1];
    const extra = Math.floor((ms - JD_WAIT_STEPS.length * WAIT_STEP_MS) / 15000);
    // 超过预期还没回：把已等待时间写出来，避免用户以为卡死了
    return extra ? `${last.replace(/…$/, '')}…还在处理，已等待 ${Math.round(ms / 1000)} 秒` : last;
  }

  // 解析中：只显示居中的进度圈，雷达图模块整体不出现
  function showReportLoading(label) {
    reportLoading.hidden = false;
    radarSection.hidden = true;
    loadingRing.show();
    if (label) loadingRing.setLabel(label);
  }

  // 第一个维度算出来了：收起居中的圈，露出雷达图模块
  function hideReportLoading() {
    if (!reportLoading.hidden) {
      reportLoading.hidden = true;
      loadingRing.hide();
    }
    radarSection.hidden = false;
  }

  let waitRaf = null;
  function startWaitProgress() {
    stopWaitProgress();
    showReportLoading(JD_WAIT_STEPS[0]);
    const t0 = performance.now();
    let shown = JD_WAIT_STEPS[0];
    const tick = (t) => {
      const ms = t - t0;
      // 进度慢慢爬向 0.9：始终有一点可见的推进，但不假装已经完成
      loadingRing.setProgress(0.9 * (1 - Math.exp(-ms / 11000)));
      const label = waitLabelAt(ms);
      if (label !== shown) {
        shown = label;
        loadingRing.setLabel(label);
      }
      waitRaf = requestAnimationFrame(tick);
    };
    waitRaf = requestAnimationFrame(tick);
  }

  function stopWaitProgress() {
    if (waitRaf) cancelAnimationFrame(waitRaf);
    waitRaf = null;
  }

  // 数据到手：先把居中的圈转满，再交给报告序列去展开
  async function finishWaitProgress() {
    stopWaitProgress();
    loadingRing.setProgress(1);
    loadingRing.setLabel('职位描述已读取，开始逐维评估');
    await sleep(360);
  }

  function hideProgress() {
    ring.hide();
    hideReportLoading();
  }

  /* ---------- 雷达图 ---------- */

  const RADAR = { cx: 200, cy: 168, hub: 11, r0: 24, r10: 94, labelR: 132, nameFont: 15, scoreFont: 19 };

  function polar(i, r) {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return { x: RADAR.cx + Math.cos(a) * r, y: RADAR.cy + Math.sin(a) * r };
  }

  function rForScore(s) {
    const v = Math.max(0, Math.min(10, s));
    return RADAR.r0 + (v / 10) * (RADAR.r10 - RADAR.r0);
  }

  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function buildRadar(svg, names, opts = {}) {
    const interactive = !!opts.interactive;
    const onLabelTap = opts.onLabelTap;
    svg.innerHTML = '';

    // 底盘（可整体"生长"出现）
    const frame = svgEl('g', { class: 'radar-frame' });
    svg.appendChild(frame);
    for (const s of [0, 2, 4, 6, 8, 10]) {
      const pts = [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const p = polar(i, rForScore(s));
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');
      frame.appendChild(svgEl('polygon', {
        points: pts,
        fill: 'none',
        stroke: s === 0 ? '#e4e4e1' : '#f0f0ee',
        'stroke-width': 1,
      }));
    }
    frame.appendChild(svgEl('circle', {
      cx: RADAR.cx, cy: RADAR.cy, r: RADAR.hub, fill: '#fff', stroke: '#eeeeec',
    }));
    for (let i = 0; i < 6; i++) {
      const p = polar(i, RADAR.r10);
      frame.appendChild(svgEl('line', {
        x1: RADAR.cx, y1: RADAR.cy, x2: p.x, y2: p.y, stroke: '#f0f0ee', 'stroke-width': 1,
      }));
    }

    const area = svg.appendChild(svgEl('polygon', {
      points: '',
      fill: 'rgba(25,25,25,0.055)',
      stroke: '#191919',
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
    }));

    // 维度标签：分数算出后才出现；可点击展开分析。缩略图（labels:false）不生成标签
    const labels = [];
    // 标签旁的迷你进度圈：只有这一维正在被重新生成时才出现
    const rings = [];
    const RING_RAD = 6;
    const RING_LEN = 2 * Math.PI * RING_RAD;
    for (let i = 0; opts.labels !== false && i < 6; i++) {
      const p = polar(i, RADAR.labelR);
      const g = svgEl('g', { class: 'radar-label' });
      g.style.opacity = interactive ? '0' : '1';
      g.style.transition = 'opacity 0.35s ease';

      const name = svgEl('text', {
        x: p.x, y: p.y, 'text-anchor': 'middle', 'font-size': RADAR.nameFont, fill: '#9b9a97',
      });
      name.textContent = names[i];
      const score = svgEl('text', {
        x: p.x, y: p.y + 22, 'text-anchor': 'middle',
        'font-size': RADAR.scoreFont, 'font-weight': 600, fill: '#dcdcda',
      });
      score.textContent = '·';
      g.appendChild(name);
      g.appendChild(score);

      // 圈紧跟在维度名后面（维度名是居中的，按字数估个半宽即可）
      const rc = { x: p.x + String(names[i] || '').length * 7.5 + 9, y: p.y - 4 };
      const rg = svgEl('g', { class: 'radar-mini-ring' });
      rg.style.opacity = '0';
      rg.style.transition = 'opacity 0.3s ease';
      rg.appendChild(svgEl('circle', {
        cx: rc.x, cy: rc.y, r: RING_RAD, fill: 'none', stroke: '#f1f1ef', 'stroke-width': 2,
      }));
      const rarc = svgEl('circle', {
        cx: rc.x, cy: rc.y, r: RING_RAD, fill: 'none', stroke: '#191919', 'stroke-width': 2,
        'stroke-dasharray': RING_LEN.toFixed(2), 'stroke-dashoffset': RING_LEN.toFixed(2),
        transform: `rotate(-90 ${rc.x} ${rc.y})`,
      });
      rg.appendChild(rarc);
      g.appendChild(rg);
      rings.push({ g: rg, arc: rarc });

      if (interactive) {
        const halfW = 58;
        const hit = svgEl('rect', {
          x: p.x - halfW, y: p.y - 24, width: 2 * halfW, height: 46,
          fill: 'transparent',
        });
        g.appendChild(hit);
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => { if (onLabelTap) onLabelTap(i); });
      }
      svg.appendChild(g);
      labels.push({ g, name, score, x: p.x, y: p.y });
    }

    // 中心总分（老虎机）
    const centerText = svgEl('text', {
      x: RADAR.cx, y: RADAR.cy + 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 46, 'font-weight': 600, fill: '#191919', opacity: 0,
    });
    centerText.style.transition = 'opacity 0.25s ease';
    svg.appendChild(centerText);

    const values = [0, 0, 0, 0, 0, 0];

    function render() {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const p = polar(i, rForScore(values[i]));
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      area.setAttribute('points', pts.join(' '));
    }

    function setValue(i, v) { values[i] = v; render(); }

    function showLabel(i, show) { labels[i].g.style.opacity = show ? '1' : '0'; }

    function setScore(i, text, muted) {
      labels[i].score.textContent = text;
      labels[i].score.setAttribute('fill', muted ? '#b9b8b5' : '#191919');
      if (!muted) labels[i].name.setAttribute('fill', '#191919');
    }

    function setActive(i) {
      labels.forEach((l, k) => {
        l.name.setAttribute('font-weight', k === i ? '600' : '400');
      });
    }

    // 某一维正在被重新生成：圈亮起来并跟着推进，生成完再收掉
    function showRing(i) {
      if (!rings[i]) return;
      rings[i].g.style.opacity = '1';
      setRing(i, 0);
    }
    function setRing(i, p) {
      if (!rings[i]) return;
      const v = Math.max(0, Math.min(1, p));
      rings[i].arc.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - v)));
    }
    function hideRing(i) {
      if (!rings[i]) return;
      rings[i].g.style.opacity = '0';
    }

    // 六维分数算完后：依次闪动，表示"正在汇总"
    function flashLabels(step = 200) {
      return new Promise((resolve) => {
        labels.forEach((l, i) => {
          setTimeout(() => {
            l.g.style.transition = 'opacity 0.14s ease';
            l.g.style.opacity = '0.22';
            setTimeout(() => {
              l.g.style.opacity = '1';
              setTimeout(() => { l.g.style.transition = 'opacity 0.35s ease'; }, 180);
            }, 90);
          }, i * step);
        });
        setTimeout(resolve, labels.length * step + 260);
      });
    }

    render();
    return { setValue, showLabel, setScore, setActive, flashLabels, centerText, showRing, setRing, hideRing };
  }

  function growDim(api, i, target, dur) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - start) / dur);
        const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        api.setValue(i, target * eased);
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- 解析文本结构化渲染 ---------- */

  function renderAnalysis(el, text) {
    el.innerHTML = '';
    const raw = String(text || '').trim();
    // 程序附的清单（匹配度的逐条扣分点）用换行分行，必须一行一条地显示；
    // 模型写的整段文字里没有换行，仍按句号 / 分号拆行。两种情况共用下面的渲染。
    const parts = (raw.includes('\n')
      ? raw.split(/\n+/)
      : raw.replace(/\s+/g, ' ').split(/(?<=[。；])/))
      .map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      const row = document.createElement('p');
      row.className = 'analysis-line';
      row.innerHTML = escapeHtml(p).replace(/「([^」]+)」/g, '<em class="quote">「$1」</em>');
      el.appendChild(row);
    }
  }

  /* ---------- 维度分析面板（点击雷达标签展开） ---------- */

  /* ---------- 薪资未读到：不起眼的 ? → 说明 → 手动补 → 重新运算 ---------- */

  let lastReportData = null;
  let salaryRowEl = null;

  function salaryMissing(data) {
    const s = data && data.source && data.source.job && data.source.job.salary;
    return !s || !String(s).trim();
  }

  // 薪资位置的文字：payCalc.position → 「按哪里取数」
  const PAY_POS_TEXT = { low: '按下沿', mid: '按中位', high: '按区间 8 成位置' };
  // 刻度口径的文字：payCalc.ladder.basis → 「这把尺是什么」
  const PAY_BASIS_TEXT = {
    official: '当地官方工资价位表',
    derived: '当地非私营社平折算',
    national: '全国非私营社平兜底',
  };

  // 薪资维度的「本次计算」：把纯函数的口径链原样摊开
  // （区间 → 按位置取数 → 月当量 → 套当地刻度 → 落档 → 到手区间）
  function payCalcNote(c) {
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // 整数千写「20k」，其余写全数字（日薪折算出来的零头不会变成 4.4k 这种怪数字）
    const kf = (v) => (v % 1000 === 0 ? `${v / 1000}k` : money(v));
    const isRange = c.low !== c.high;
    const parts = [isRange ? `区间 ${kf(c.low)}-${kf(c.high)}` : `月薪 ${money(c.low)}`];
    if (c.months && c.months !== 12) parts[0] += ` × ${c.months}薪`;
    if (isRange) parts.push(`${PAY_POS_TEXT[c.position] || PAY_POS_TEXT.low} ${money(c.pick)}`);
    // 取位被匹配度校准过时把原因带上（旧档案没有这个字段，不渲染）
    if (isRange && c.positionNote) parts.push(c.positionNote);
    const monthly = Number.isFinite(Number(c.monthly)) ? Number(c.monthly)
      : (Number.isFinite(Number(c.effective)) ? Number(c.effective) : null);
    parts.push(c.months && c.months !== 12 ? `月当量 ${money(monthly)}` : `月当量 ${money(monthly)}`);
    const L = c.ladder && Array.isArray(c.ladder.lines) ? c.ladder : null;
    parts.push(L
      ? `对${L.city || ''}刻度（中位 ${money(L.median)}/月，${PAY_BASIS_TEXT[L.basis] || '当地口径'}）落 ${c.band} 分档`
      : `落在 ${c.band} 分档`);
    const take = c.takeHomeLo === c.takeHomeHi
      ? `到手约 ${money(c.takeHomeLo)}/月`
      : `到手约 ${money(c.takeHomeLo)}-${money(c.takeHomeHi)}/月`;
    return `本次计算：${parts.join(' → ')}；${take}`;
  }

  /* 薪资小结：三块数字（预计月薪 / 预计税后 / 年度总收入），压在维度面板的「一句话评价」上面——
     先给能记住的数，再看结论。数字全部取自后端算好的 payCalc，不新增请求、不另起模型：
     缺哪个字段就跳过哪一格，payCalc 整个没有（旧档案 / 无薪资）时连块都不渲染。 */
  function payEstBlock(pc, analysis) {
    if (!pc) return null;
    // 0 与 null 一样当「没有」：报价写 0 不是数字，是没读到
    const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const wan = (lo, hi) => (lo && hi && lo !== hi ? `${fmtWan(lo)}~${fmtWan(hi)} 万` : `${fmtWan(lo || hi)} 万`);
    // 「月」口径的数（月薪 / 月到手）走 moneyShort：低于 1 万显示千，高于 1 万还是万
    const month = (lo, hi) => (lo && hi && lo !== hi ? `${moneyShort(lo)}~${moneyShort(hi)}` : moneyShort(lo || hi));
    const cellOf = (value, label, note) => {
      const cell = document.createElement('div');
      cell.className = 'pay-est-cell';
      const v = document.createElement('p');
      v.className = 'pay-est-v';
      v.textContent = value;
      const k = document.createElement('p');
      k.className = 'pay-est-k';
      k.textContent = label;
      const n = document.createElement('p');
      n.className = 'pay-est-note';
      n.textContent = note;
      cell.appendChild(v);
      cell.appendChild(k);
      cell.appendChild(n);
      return cell;
    };
    const low = pos(pc.low);
    const high = pos(pc.high);
    const pick = pos(pc.pick);
    const cells = [];

    // ① 预计月薪：JD 报价区间原样（元 → 千/万，不足 1 万写千）。有匹配度就在区间上落一个点：
    //    落位点 = low + (high − low) × 匹配度 / 10，只做线性落位，不改动区间两端的数
    if (low || high) {
      const md = ((analysis && analysis.dimensions) || []).find((x) => x && x.key === 'match');
      const ms = md && Number.isFinite(Number(md.score)) ? Math.max(0, Math.min(10, Number(md.score))) : null;
      const note = ms != null && low && high
        ? `JD 报价区间；按你的匹配度 ${ms}/10，预计落位 ≈ ${moneyShort(low + (high - low) * (ms / 10))}`
        : 'JD 报价区间；没有匹配度就只给区间，不做落位估算';
      cells.push(cellOf(month(low, high), '预计月薪', note));
    }

    // ② 预计税后：优先用后端算好的到手区间（takeHomeLo/Hi，只有单点就用 takeHomePick）；
    //    两者都没有才用边际税率粗算下沿，并写明这是估算
    const thLo = pos(pc.takeHomeLo);
    const thHi = pos(pc.takeHomeHi);
    const thPick = pos(pc.takeHomePick);
    const rate = Number(pc.marginalRate);
    if (thLo || thHi || thPick) {
      cells.push(cellOf(thLo || thHi ? month(thLo || thHi, thHi || thLo) : moneyShort(thPick),
        '预计税后', '扣完社保与个税的大致到手'));
    } else if (Number.isFinite(rate) && rate > 0 && rate < 1 && (low || pick)) {
      cells.push(cellOf(moneyShort((low || pick) * (1 - rate)),
        '预计税后', `按边际税率 ${Math.round(rate * 100)}% 粗算，只能是估算`));
    }

    // ③ 年度总收入：报价 × 发薪月数（月数由 LLM 从 JD 读出，缺了就按 12 个月并注明）
    const m = Number(pc.months);
    const monthsKnown = Number.isFinite(m) && m > 0;
    const months = monthsKnown ? m : 12;
    if (low || high) {
      cells.push(cellOf(wan((low || high) * months, (high || low) * months), '年度总收入',
        monthsKnown ? `按 JD 发薪月数 ${months} 个月折算（LLM 从 JD 读取）`
          : 'JD 没写发薪月数，按 12 个月计（估算）'));
    }

    if (!cells.length) return null;
    const box = document.createElement('div');
    box.className = 'pay-est';
    const grid = document.createElement('div');
    grid.className = 'pay-est-grid';
    for (const c of cells) grid.appendChild(c);
    box.appendChild(grid);
    return box;
  }

  /* 薪资的本地刻度表：分 ↔ 在本城前 x% ↔ 该档的月当量区间 ↔ 相当于当地中位数的倍数。
     这一维的「有定义」就落在这张表上——每一档是一个整分位，任何城市都能查到自己那条线。 */
  function payLadderTable(c) {
    const L = c && c.ladder && Array.isArray(c.ladder.lines) ? c.ladder : null;
    if (!L || !(L.median > 0)) return null;
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const pct = (k) => {
      const p = Array.isArray(L.percents) ? L.percents[k] : null;
      if (p == null) return '—';
      if (p >= 100) return '起点';
      return `≥ 前 ${p}%`;
    };
    const rows = L.lines.map((lo, k) => {
      const hi = k < 10 ? L.lines[k + 1] : null;
      const mult = (v) => `${(v / L.median).toFixed(2)}×`;
      const band = `${k}${k === Number(c.band) ? ' ← 这一份' : ''}`;
      // 0 分没有下界：低于当地最低工资的都记 0 分
      if (k === 0 && !lo) return [band, '低于最低工资', hi ? `< ${money(hi)}` : '—', '—'];
      return [
        band,
        pct(k),
        hi ? `${money(lo)} – ${money(hi - 1)}` : `${money(lo)} 以上`,
        hi ? `${mult(lo)} – ${mult(hi)}` : `${mult(lo)} 以上`,
      ];
    });
    const H = Array.isArray(L.high) ? L.high : [];
    return {
      // 面板上只留一句：分位的定义（怎么切、金额从哪儿来）都在「评分规则」里，不在这里展开
      caption: `${L.city || '本地'}刻度（元/月，税前月当量）：1 分＝最低工资 ${money(L.minWage)}；`
        + `4 分档含工资中位 ${money(L.median)}${H.length === 3 ? `、6 / 8 / 10 分档含职业高位的 ${money(H[0])} / ${money(H[1])} / ${money(H[2])}` : ''}；`
        + '其余各档＝相邻整分位。口径见下方「评分规则」。',
      head: ['分', '在本城前', '月当量（税前）', '相当于当地中位'],
      rows,
    };
  }

  /* 薪资刻度尺：把本城的十个档位摊成一条尺子（对数刻度，因为工资分布是对数正态、等宽切会挤在一起），
     再把**这份 JD 的报价区间**摆上去——从下沿到上沿画一条深色条，计分用的那个点单独标出来。
     一眼能看出两件事：这份工作落在表上的哪一格、它的报价区间跨了几档。 */
  function payRulerChart(c) {
    const L = c && c.ladder && Array.isArray(c.ladder.lines) ? c.ladder : null;
    if (!L || !(L.median > 0) || !(c.low > 0)) return null;
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const K = (v) => (v >= 10000 ? `${(v / 10000).toFixed(v % 10000 ? 1 : 0)}万` : `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`);
    const months = c.months > 0 ? c.months : 12;
    const lo = Math.round((c.low * months) / 12);       // 报价下沿的月当量
    const hi = Math.round((c.high * months) / 12);      // 报价上沿的月当量
    const pick = Number.isFinite(Number(c.monthly)) ? Number(c.monthly) : lo;
    const vLo = L.lines[1] * 0.9;
    const vHi = Math.max(L.lines[10] * 1.12, hi * 1.04);
    const W = 720, H = 132, ML = 8, MR = 712;
    const X = (v) => ML + ((Math.log(Math.max(v, vLo)) - Math.log(vLo)) / (Math.log(vHi) - Math.log(vLo))) * (MR - ML);
    const bandOf = (v) => { let b = 0; for (let k = 0; k < L.lines.length; k++) if (v >= L.lines[k]) b = k; return b; };
    const bandLo = bandOf(lo);
    const bandHi = bandOf(hi);
    const bandPick = Number.isFinite(Number(c.band)) ? Number(c.band) : bandPickFallback(pick);
    function bandPickFallback(v) { return bandOf(v); }

    const out = [];
    // 档位带：每档一段，计分那一档加深
    for (let k = 1; k <= 10; k++) {
      const x0 = X(L.lines[k]);
      const x1 = k < 10 ? X(L.lines[k + 1]) : MR;
      const on = k === bandPick;
      const shade = on ? '#1c2330' : (k % 2 ? '#eef1f6' : '#e3e8f0');
      out.push(`<rect x="${x0.toFixed(1)}" y="52" width="${Math.max(1, x1 - x0).toFixed(1)}" height="26" fill="${shade}" rx="2"/>`);
      if (x1 - x0 > 18) {
        out.push(`<text x="${((x0 + x1) / 2).toFixed(1)}" y="69" text-anchor="middle" font-size="11" fill="${on ? '#fff' : '#6f6e69'}">${k}</text>`);
      }
    }
    // 档线刻度（挨太近的不标）
    let lastX = -99;
    for (let k = 1; k <= 10; k++) {
      const x = X(L.lines[k]);
      if (x - lastX < 26) continue;
      lastX = x;
      out.push(`<line x1="${x.toFixed(1)}" y1="78" x2="${x.toFixed(1)}" y2="82" stroke="#c9c9c6"/>`);
      out.push(`<text x="${x.toFixed(1)}" y="94" text-anchor="middle" font-size="10" fill="#9b9a97">${K(L.lines[k])}</text>`);
    }
    // 这份 JD 的报价区间（下沿 → 上沿；单值时画成一个点）
    const xr0 = X(lo);
    const xr1 = Math.max(X(hi), xr0 + 3);
    out.push(`<rect x="${xr0.toFixed(1)}" y="22" width="${(xr1 - xr0).toFixed(1)}" height="14" rx="7" fill="#1c2330"/>`);
    const xp = X(pick);
    out.push(`<circle cx="${xp.toFixed(1)}" cy="29" r="4.4" fill="#fff" stroke="#1c2330" stroke-width="1.6"/>`);
    out.push(`<text x="${(ML + MR) / 2}" y="14" text-anchor="middle" font-size="11" fill="#5b6678">`
      + `这份 JD：${money(lo)}${hi > lo ? ` – ${money(hi)}` : ''} 元/月（税前月当量）· 覆盖 ${bandLo === bandHi ? `第 ${bandLo} 档` : `第 ${bandLo}–${bandHi} 档`}`
      + ` · 计分取${PAY_POS_TEXT[c.position] || PAY_POS_TEXT.low} → ${bandPick} 分</text>`);
    out.push(`<line x1="${ML}" y1="104" x2="${MR}" y2="104" stroke="#191919" stroke-width="1"/>`);
    out.push('<defs><marker id="pay-ruler-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
      + '<path d="M 0 0 L 10 5 L 0 10 z" fill="#191919"/></marker></defs>');
    out.push(`<line x1="${MR}" y1="104" x2="${MR + 6}" y2="104" stroke="#191919" stroke-width="1" marker-end="url(#pay-ruler-arrow)"/>`);

    const box = document.createElement('div');
    box.className = 'dim-scale';
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">${out.join('')}</svg>`;
    return box;
  }

  function buildSalaryHint(host, data) {
    const q = document.createElement('button');
    q.type = 'button';
    q.className = 'salary-hint-q';
    q.textContent = '?';
    q.setAttribute('aria-label', '薪资未读到');

    const box = document.createElement('div');
    box.className = 'salary-hint-box';
    const p = document.createElement('p');
    p.className = 'salary-hint-text';
    p.textContent = '未读到薪资：可能是平台对未登录会话隐藏（BOSS 有这种情况），也可能 JD 里没写。';
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'salary-hint-act';
    act.textContent = '点此可手动输入薪资';
    const form = document.createElement('div');
    form.className = 'salary-hint-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'salary-hint-input';
    input.placeholder = '如 200-300元/天、15-25K·14薪';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'salary-hint-ok';
    ok.textContent = '重新运算';
    form.appendChild(input);
    form.appendChild(ok);
    box.appendChild(p);
    box.appendChild(act);
    box.appendChild(form);
    if (host) host.appendChild(box);

    let step = 0;
    q.addEventListener('click', () => {
      step = step === 0 ? 1 : 0;
      box.classList.toggle('open', step === 1);
    });
    act.addEventListener('click', () => {
      form.classList.add('open');
      act.classList.add('done');
      input.focus();
    });
    const submit = async () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      ok.disabled = true;
      ok.textContent = '运算中…';
      try {
        await rescoreSalary(v, data);
        box.classList.remove('open');
      } catch (err) {
        ok.disabled = false;
        ok.textContent = '重新运算';
        toast(err.message || '重新分析失败，请重试');
      }
    };
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return { q, box };
  }

  // 补薪资后只重算相关部分：薪资维度重新长出来、JD 只更新薪资行、总分与评价就地覆盖
  async function rescoreSalary(salaryHint, dataAtStart) {
    // 目标档案在发起时锁死：重算要跑一两秒，期间用户可能切走——
    // 全程只认这一份引用，切走了也写回它，绝不落到别的记录（视觉更新只在它还开着时做）。
    const target = dataAtStart || lastReportData;
    if (!target || !target.source) throw new Error('这份报告还没加载完整，刷新页面后重新打开它再试');
    const targetUrl = (target.source && target.source.url) || jdUrl;
    const stillOpen = () => lastReportData === target;
    const payIdx = DIM_KEYS.indexOf('pay');
    ring.show();
    setProgressLabel('正在根据薪资重算');
    // JD 解读这一块也要跟着更新（薪资行），同样给一个进度圈
    jdRing.show();
    jdRing.setLabel('正在根据薪资更新');
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(0.9, p + 0.06);
      ring.setProgress(p);
      jdRing.setProgress(p);
    }, 180);

    let out;
    try {
      out = await postJson('/api/rescore', { url: targetUrl, salaryHint, jdRaw: (target.source || {}).jdRaw || '', prev: target });
    } catch (e) {
      clearInterval(timer);
      ring.hide();
      jdRing.hide();
      throw e;
    }
    clearInterval(timer);
    ring.setProgress(1);
    jdRing.setProgress(1);

    // 1) 雷达图：只让薪资待遇重新长出来（切走了跳过画面，数据照样落库）
    if (stillOpen()) {
      radarApi.showLabel(payIdx, true);
      radarApi.setScore(payIdx, '·', true);
      radarApi.setValue(payIdx, 0);
      await sleep(120);
      await growDim(radarApi, payIdx, out.dimension.score, 900);
      radarApi.setScore(payIdx, String(out.dimension.score), false);

      // 2b) 后端补薪资时顺手把发展潜力按当前口径重算了一遍（主观层 K₂ 读 JD 报价，原文没报价时用补的这条），
      //     这里把它重新长出来：dimensions / growthCalc / 面板跟着换新（补的薪资可能让 K₂ 换档）
      if (out.growth && out.growth.dimension) {
        const gi = DIM_KEYS.indexOf('growth');
        radarApi.showLabel(gi, true);
        radarApi.setScore(gi, '·', true);
        radarApi.setValue(gi, 0);
        await sleep(120);
        await growDim(radarApi, gi, out.growth.dimension.score, 900);
        radarApi.setScore(gi, String(out.growth.dimension.score), false);
      }

      // 3) JD 解读：只把薪资那一行换掉
      if (salaryRowEl && salaryRowEl.isConnected) {
        const v = salaryRowEl.querySelector('.jd-v');
        if (v) v.textContent = salaryHint;
        const q = salaryRowEl.querySelector('.salary-hint-q');
        if (q) q.remove();
        const box = salaryRowEl.querySelector('.salary-hint-box');
        if (box) box.remove();
        const jdBox = jdBody.querySelector('.salary-hint-box');
        if (jdBox) jdBox.remove();
      }
    }

    // 2) 数据写回锁定的那份档案（切走了也要落库：下次打开就是新值）
    const a = target.analysis || (target.analysis = {});
    a.dimensions = (a.dimensions || []).map((d) => {
      if (d.key === 'pay' && out.dimension) return out.dimension;
      if (d.key === 'growth' && out.growth && out.growth.dimension) return out.growth.dimension;
      return d;
    });
    if (out.growth && out.growth.growthCalc) a.growthCalc = out.growth.growthCalc;
    target.source.job = { ...target.source.job, salary: salaryHint };
    a.overall = out.overall;
    // 原始分与匹配度系数也要一起换：档案里存的是这一组数，
    // 只更新总分会让分析和图上的原始分对不上（老版本就漏了这两个）
    a.baseScore = out.baseScore;
    a.matchMultiplier = out.matchMultiplier;
    a.payCalc = out.payCalc || a.payCalc;
    // 审计合并：补薪资重算的耗时与用量进同一本账（与服务端缓存保持一份）
    a.steps = [...(a.steps || []), auditStepOf('rescore', out, { salary: salaryHint })];
    // 缺口消账：薪资已补上，对应缺口改标已解决（面板不显示，审计留痕）
    a.gaps = (a.gaps || []).map((g) => (g.key === 'pay'
      ? { ...g, kind: 'filled', reason: `已按补录的薪资「${salaryHint}」重算，缺口已消`, action: 'none' }
      : g));

    // 4) 总分与点评：新的到了再流式覆盖（这份报告还开着才更新界面）
    if (stillOpen()) {
      dimsData = a.dimensions;
      if (activeKey === 'pay') renderDimPanel(payIdx);
      if (out.growth && out.growth.dimension && activeKey === 'growth') renderDimPanel(DIM_KEYS.indexOf('growth'));
      await sleep(160);
      paintScorePair({ overall: out.overall, baseScore: a.baseScore });
      if (out.conclusion) await streamText(verdictLine, a.personalNote ? stopEnd(out.conclusion) : out.conclusion, 32);
      renderVerdictHints(target);
    }
    recordHistory(targetUrl, target);
    setProgressLabel('重算完成');
    jdRing.setLabel('更新完成');
    await sleep(600);
    ring.hide();
    jdRing.hide();
  }

  /* ---------- 休息情况：手动补充 / 联网查询 → 重算休息维度 ---------- */

  // 休息情况旁的 ? → 说明 → 手动补充 或 联网查找 → 重新运算
  function buildRestHint(host, data) {
    const q = document.createElement('button');
    q.type = 'button';
    q.className = 'salary-hint-q';
    q.textContent = '?';
    q.setAttribute('aria-label', '休息情况');

    const box = document.createElement('div');
    box.className = 'salary-hint-box';
    const p = document.createElement('p');
    p.className = 'salary-hint-text';
    p.textContent = restIsMissing(data)
      ? '未读到休息情况：JD 里没写双休、大小周、排班或工时。可以手动补充，或联网查一下这家公司的公开信息。'
      : `当前按「${((data || {}).analysis || {}).restBrief || '已读到的休息信息'}」计算。与实际不符时，可以手动补充或联网核查。`;

    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'salary-hint-act';
    act.textContent = '点此手动补充';
    const webAct = document.createElement('button');
    webAct.type = 'button';
    webAct.className = 'salary-hint-act rest-web-act';
    webAct.textContent = '联网查找';

    const status = document.createElement('div');
    status.className = 'rest-hint-status';

    const form = document.createElement('div');
    form.className = 'salary-hint-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'salary-hint-input';
    input.placeholder = '如：双休、大小周、月休4天、早九晚六';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'salary-hint-ok';
    ok.textContent = '重新运算';
    form.appendChild(input);
    form.appendChild(ok);

    box.appendChild(p);
    box.appendChild(act);
    box.appendChild(webAct);
    box.appendChild(status);
    box.appendChild(form);
    if (host) host.appendChild(box);

    let open = false;
    q.addEventListener('click', () => {
      open = !open;
      box.classList.toggle('open', open);
    });
    act.addEventListener('click', () => {
      form.classList.add('open');
      act.classList.add('done');
      input.focus();
    });

    const submit = async (payload) => {
      ok.disabled = true;
      ok.textContent = '运算中…';
      webAct.disabled = true;
      try {
        await rerestRest(payload, data);
        box.classList.remove('open');
        open = false;
      } catch (err) {
        ok.disabled = false;
        ok.textContent = '重新运算';
        webAct.disabled = false;
        // 错误不能只靠 toast（4 秒就没），还要留在状态行上：用户报的「联网查找后没反应」
        // 很可能就是请求失败被 toast 一闪而过，只看见「正在按此重算…」一直挂着。
        status.textContent = `重算没成功：${err.message || '未知原因'}`;
        toast(err.message || '重新分析失败，请重试');
      }
    };
    ok.addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      submit({ restHint: v });
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });

    // 联网查找：查到明确制度就直接采纳并重算，不用再点一次确认
    webAct.addEventListener('click', async () => {
      const company = (((data || {}).source || {}).job || {}).company || '';
      if (!company) { status.textContent = '这条记录没有公司名，无法联网查找。'; return; }
      webAct.disabled = true;
      status.textContent = `正在联网查找「${company}」…（查到还要重算，整段约 30~90 秒，别急着点第二次）`;
      let r;
      try {
        r = await postJson('/api/rest-lookup', { company });
      } catch (e) {
        status.textContent = e.message || '联网查找失败，请稍后再试';
        webAct.disabled = false;
        return;
      }
      if (!r.found) {
        status.textContent = `没查到「${company}」明确的休息制度信息，可以手动补充。`;
        webAct.disabled = false;
        return;
      }
      status.textContent = `已查到：${r.summary}${r.source ? `（来源：${r.source}）` : ''}，正在按此重算…`;
      submit({ webSummary: r.summary, webSource: r.source });
    });

    return { q, box };
  }

  // 输入来源决定 restSource：用户补充 > 网络参考 > 原文；仍没实质内容就还是估算
  function restSourceAfter(brief, payload) {
    if (briefIsMissing(brief)) return '';
    if (payload && payload.restHint) return 'user';
    if (payload && payload.webSummary) return 'web';
    return 'jd';
  }

  // 补充休息情况后只重算相关部分：休息维度重新长出来，总分与 点评就地覆盖
  async function rerestRest(payload, dataAtStart) {
    // 目标档案在发起时锁死（理由同补薪资）：切走了也写回它，不落到别的记录。
    const target = dataAtStart || lastReportData;
    // 服务端重算要么命中它自己的缓存、要么靠我们回传的 prev；两份都没有时它会回 409
    // （「原文已过期」）。在这里先判掉，比让用户等一轮联网查询再失败强。
    if (!target || !target.source) {
      throw new Error('这份报告还没加载完整，刷新页面后重新打开它再试');
    }
    const targetUrl = (target.source && target.source.url) || jdUrl;
    const stillOpen = () => lastReportData === target;
    const restIdx = DIM_KEYS.indexOf('rest');
    ring.show();
    setProgressLabel('正在重算休息情况');
    jdRing.show();
    jdRing.setLabel('正在更新职位描述');
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(0.9, p + 0.06);
      ring.setProgress(p);
      jdRing.setProgress(p);
    }, 180);

    let out;
    try {
      out = await postJson('/api/rerest', {
        url: targetUrl,
        restHint: payload.restHint || '',
        webSummary: payload.webSummary || '',
        webSource: payload.webSource || '',
        jdRaw: (target.source || {}).jdRaw || '',
        prev: target,
      });
    } catch (e) {
      clearInterval(timer);
      ring.hide();
      jdRing.hide();
      throw e;
    }
    clearInterval(timer);
    ring.setProgress(1);
    jdRing.setProgress(1);

    // 画面：休息维度重新长出来（切走了跳过，数据照样落库）
    if (stillOpen()) {
      radarApi.showLabel(restIdx, true);
      radarApi.setScore(restIdx, '·', true);
      radarApi.setValue(restIdx, 0);
      await sleep(120);
      await growDim(radarApi, restIdx, out.dimension.score, 900);
      radarApi.setScore(restIdx, String(out.dimension.score), false);
    }

    // 数据写回锁定的那份档案
    const a = target.analysis || (target.analysis = {});
    a.dimensions = (a.dimensions || []).map((d) => (d.key === 'rest' ? out.dimension : d));
    a.overall = out.overall;
    // 同补薪资：原始分与匹配度系数一起换，否则档案里的三个数互相对不上
    a.baseScore = out.baseScore;
    a.matchMultiplier = out.matchMultiplier;
    a.restBrief = out.restBrief;
    a.restSource = restSourceAfter(out.restBrief, payload);
    a.restNote = out.restNote;
    // 留痕合并：这次重算里被校验丢弃的原句追加进同一本账（与服务端缓存保持一份）
    a.verifyDrops = [...(a.verifyDrops || []), ...(out.drops || [])].slice(0, 40);
    // 审计合并：休息重算的耗时与用量也进同一本账
    a.steps = [...(a.steps || []), auditStepOf('rerest', out)];
    if (out.conclusion) a.conclusion = out.conclusion;

    if (stillOpen()) {
      dimsData = a.dimensions;
      if (activeKey === 'rest') renderDimPanel(restIdx);
      await sleep(160);
      paintScorePair({ overall: out.overall, baseScore: a.baseScore });
      if (out.conclusion) await streamText(verdictLine, a.personalNote ? stopEnd(out.conclusion) : out.conclusion, 32);
      renderVerdictHints(target);
    }
    recordHistory(targetUrl, target);
    setProgressLabel('重算完成');
    jdRing.setLabel('更新完成');
    await sleep(600);
    ring.hide();
    jdRing.hide();
  }

  /* ---------- 发展潜力没采到本地分布：? → 说明 → 联网重采 → 就地重算 ---------- */

  // 这一维的数据状态：'' 本地实测 / 'shape' 借了别城形状 / 'neutral' 中性估算 / 'official' 官方工资价位 / 'missing' 没采到
  function growthStateOf(data) {
    const c = ((data || {}).analysis || {}).growthCalc;
    if (!c || typeof c !== 'object') return 'missing';
    return c.estimated || 'local';
  }

  /* 要不要挂「重新联网采集」的 ?：官方口径（basis=official）不在 growthdist 的分布库里，
     联网也采不出更权威的东西——它是人社局发布的价位表，与本地实测一样当作「已经在手」。
     借形状 / 中性估算 / 没采到才挂 ?。 */
  function growthNeedsCollect(data) {
    const c = ((data || {}).analysis || {}).growthCalc;
    if (c && typeof c === 'object' && c.basis === 'official') return false;
    return growthStateOf(data) !== 'local';
  }

  function growthHintText(state, data) {
    const job = (((data || {}).source || {}).job || {});
    const name = job.title ? `「${job.title}」` : '这个职位';
    const city = job.city ? `在 ${job.city} ` : '';
    if (state === 'missing') return `未采集到${name}${city}的薪资分布，这一维暂时空着。点击可尝试重新联网采集。`;
    const c = ((data || {}).analysis || {}).growthCalc || {};
    const ref = c.ref || {};
    const how = state === 'shape'
      ? `现在借的是 ${ref.city || ''}·${ref.job || ''} 的分布形状（离散度），按两地社平工资等比折算${ref.source ? `，来源：${ref.source}` : ''}`
      : '现在是按当地社平工资配同类岗位的典型离散度中性折算的';
    return `未采集到${name}${city}的本地分布，${how}，所以这一维是参考值。`
      + '点击可尝试重新联网采集，采到就换成本地实测。';
  }

  /* 缺哪样就报哪样：联网查薪资分布必须同时有职位名与城市（服务端按这两个词去搜） */
  function jobInfoMissing(data) {
    const job = (((data || {}).source || {}).job) || {};
    const miss = [];
    if (!String(job.title || '').trim()) miss.push('职位名');
    if (!String(job.city || '').trim()) miss.push('城市');
    return miss;
  }

  /* 职位名/城市的行内补充表单（成长提示与缺口面板共用一份）：填好落库，然后就地重采。
     只在档案确实缺这两样时才会被创建——平时的界面里不出现。 */
  function buildJobInfoForm(target) {
    const job = (target.source && target.source.job) || {};
    const form = document.createElement('div');
    form.className = 'salary-hint-form jobinfo-form';
    const tIn = document.createElement('input');
    tIn.type = 'text';
    tIn.className = 'salary-hint-input';
    tIn.placeholder = '职位名（如 产品经理）';
    tIn.value = String(job.title || '');
    const cIn = document.createElement('input');
    cIn.type = 'text';
    cIn.className = 'salary-hint-input';
    cIn.placeholder = '城市（如 深圳 · 南山区）';
    cIn.value = String(job.city || '');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'salary-hint-ok';
    ok.textContent = '保存并重采';
    const status = document.createElement('p');
    status.className = 'growth-hint-status';
    status.hidden = true;
    form.appendChild(tIn);
    form.appendChild(cIn);
    form.appendChild(ok);
    const box = document.createElement('div');
    box.appendChild(form);
    box.appendChild(status);

    const submit = async () => {
      const title = tIn.value.trim();
      const city = cIn.value.trim();
      if (!title || !city) {
        status.hidden = false;
        status.textContent = '职位名和城市都填一下——联网查分布两个都要。';
        return;
      }
      ok.disabled = true;
      ok.textContent = '重采中…';
      status.hidden = false;
      status.textContent = '正在联网采集…（要换几次查询词，整段约 1~3 分钟）';
      target.source.job = { ...job, title, city };
      const url = (target.source && target.source.url) || jdUrl || '';
      if (url) { try { recordHistory(url, target); } catch (e) { /* 落库失败不挡重采 */ } }
      try {
        await regrowthNow({ target });
        status.textContent = '完成';
      } catch (e) {
        status.textContent = e.message || '重采失败，稍后再试';
        ok.disabled = false;
        ok.textContent = '保存并重采';
      }
    };
    ok.addEventListener('click', submit);
    [tIn, cIn].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));

    return { box, open: () => { form.classList.add('open'); tIn.focus(); } };
  }

  function buildGrowthHint(host, data) {
    const state = growthStateOf(data);
    const q = document.createElement('button');
    q.type = 'button';
    q.className = 'salary-hint-q growth-hint-q';
    q.textContent = '?';
    q.setAttribute('aria-label', '发展潜力数据待采集');

    const box = document.createElement('div');
    box.className = 'salary-hint-box growth-hint-box';
    const p = document.createElement('p');
    p.className = 'salary-hint-text';
    p.textContent = growthHintText(state, data);
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'salary-hint-act';
    act.textContent = '重新联网采集';
    const status = document.createElement('p');
    status.className = 'growth-hint-status';
    status.hidden = true;
    box.appendChild(p);
    box.appendChild(act);
    box.appendChild(status);
    // 缺职位名/城市时：联网采集查不了分布——手动补充入口只在缺失时出现
    let jobInfoForm = null;
    const missing = jobInfoMissing(data);
    if (missing.length) {
      const line = document.createElement('p');
      line.className = 'salary-hint-text';
      line.appendChild(document.createTextNode(`这条档案缺少${missing.join('和')}，联网采集查不了分布 —— `));
      jobInfoForm = buildJobInfoForm(data);
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'salary-hint-act jobinfo-open';
      link.textContent = '手动补充';
      link.addEventListener('click', () => jobInfoForm.open());
      line.appendChild(link);
      box.appendChild(line);
      box.appendChild(jobInfoForm.box);
    }
    if (host) host.appendChild(box);

    q.addEventListener('click', () => box.classList.toggle('open'));
    act.addEventListener('click', async () => {
      act.disabled = true;
      status.hidden = false;
      status.textContent = '正在联网采集…（要换几次查询词，整段约 1~3 分钟，别急着点第二次）';
      try {
        const out = await regrowthNow({ target: data });
        // 采到了就把面板整个重画一遍（依据、量表都换成新的），所以这里没有可写的状态行，
        // 结果改成 toast 播报——不然用户点完只看到面板变了，不知道发生了什么。
        if (!out.found) status.textContent = `这次还是没采到${out.reason ? `（${out.reason}）` : ''}，可以稍后再试一次。`;
      } catch (e) {
        status.textContent = e.message || '联网采集失败，请稍后再试';
        // 缺职位名/城市：直接把手动补充表单摊开，用户填完就能重采
        if (e && e.needJobInfo && jobInfoForm) jobInfoForm.open();
      }
      act.disabled = false;
    });
    return { q, box };
  }

  // 重采之后只重算这一维：雷达图上把它重新长出来，总分与依据就地覆盖
  /* 发展潜力重采/采集：走 /api/growth-collect（联网）。opts.labelRing = true 时进度圈挂在
     雷达图「发展潜力」这个标签上（报告页后台采集用），否则用居中那个大圈（用户手动点 ? 重采）。
     目标档案在发起时锁死（opts.target / opts.url）：采集要跑 10~27 秒，期间用户很可能切走——
     切走了也写回它，绝不落到别的记录（视觉更新只在它还开着时做）。 */
  async function regrowthNow(opts = {}) {
    const target = opts.target || lastReportData;
    if (!target || !target.source) {
      throw new Error('这份报告还没加载完整，刷新页面后重新打开它再试');
    }
    const targetUrl = opts.url || (target.source && target.source.url) || jdUrl;
    if (!targetUrl) {
      // 老档案可能真没带上链接（截图/自述时代存下来的）：给一句能照做的提示，
      // 而不是把请求发出去换回服务端那句看不懂的「缺少职位链接」
      throw new Error('这条记录没带上 JD 链接，联网采集用不了——回到分析页重新分析一次这份 JD（或重新打开这条档案）就能修复');
    }
    // 服务端按「职位名 + 城市」去搜分布：缺一个都查不了——抛出带标记的错，
    // 界面据此摊开手动补充表单（见 buildJobInfoForm），而不是让用户对着报错干瞪眼
    if (jobInfoMissing(target).length) {
      const e = new Error('这条档案缺职位名或城市，联网采集查不了分布——先手动补充一下');
      e.needJobInfo = true;
      throw e;
    }
    const stillOpen = () => lastReportData === target;
    const idx = DIM_KEYS.indexOf('growth');
    const labelRing = opts.labelRing === true && radarApi;
    if (labelRing) radarApi.showRing(idx);
    else {
      ring.show();
      setProgressLabel('正在联网采集发展潜力数据');
    }
    let p = labelRing ? 0.08 : 0;
    const setP = (v) => { if (labelRing && stillOpen()) radarApi.setRing(idx, v); else if (!labelRing) ring.setProgress(v); };
    const hideRing = () => { if (labelRing && stillOpen()) radarApi.hideRing(idx); else if (!labelRing) ring.hide(); };
    setP(p);
    // 采集现在一次约 10~27 秒（三批搜索 + 并发解析），圈按这个量级推进：
    // 涨太快会早早卡在 0.9 不动，看着像卡死
    const timer = setInterval(() => {
      p = Math.min(0.9, p + 0.015);
      setP(p);
    }, 500);

    let out;
    try {
      out = await postJson('/api/growth-collect', {
        url: targetUrl,
        jdRaw: (target.source || {}).jdRaw || '',
        prev: target,
      });
    } catch (e) {
      clearInterval(timer);
      hideRing();
      throw e;
    }
    clearInterval(timer);
    setP(1);
    if (!out.found) {
      hideRing();
      return out;
    }

    if (stillOpen()) {
      radarApi.showLabel(idx, true);
      radarApi.setScore(idx, '·', true);
      radarApi.setValue(idx, 0);
      await sleep(120);
      await growDim(radarApi, idx, out.dimension.score, 900);
      radarApi.setScore(idx, String(out.dimension.score), false);
    }

    // 数据写回锁定的那份档案（切走了也要落库：下次打开就是新值）
    const a = target.analysis || (target.analysis = {});
    a.dimensions = (a.dimensions || []).map((d) => (d.key === 'growth' ? out.dimension : d));
    a.growthCalc = out.growthCalc;
    a.overall = out.overall;
    a.baseScore = out.baseScore;
    a.matchMultiplier = out.matchMultiplier;
    // 缺口消账：分布已采到、这一维已重算，对应缺口改标已解决（面板按 filled 过滤）
    a.gaps = (a.gaps || []).map((g) => (g.key === 'growth' && g.kind !== 'filled'
      ? { ...g, kind: 'filled', reason: '已采到薪资分布并按同一口径重算，缺口已消', action: 'none' }
      : g));

    if (stillOpen()) {
      dimsData = a.dimensions;
      if (activeKey === 'growth') renderDimPanel(idx);
      paintScorePair(a);
      renderVerdictHints(target);
    }
    recordHistory(targetUrl, target);
    if (!labelRing) setProgressLabel('重算完成');
    await sleep(500);
    hideRing();
    toast(`已采到 ${out.growthCalc.job}@${out.growthCalc.city} 的薪资分布，发展潜力重算为 ${out.dimension.score} 分`, 4500);
    return out;
  }

  /* 报告不等发展潜力的采集：分析结果一到就把采集挂上（雷达图上「发展潜力」标签挂进度圈），
     其余五维、JD 解读、点评照常先出来——采到就自动补上这一维（分数长出来、总分一起换）。
     每条档案只自动采一次：明确采不到就落一个印记（growthSearch），下次打开不再白等；失败不留印记，下次再试。 */
  const growthAutoTried = new Set();
  let growthAutoRunning = null;

  function growthAutoPending(data) {
    const a = (data && data.analysis) || {};
    if (a.growthSearch && a.growthSearch.found === false) return false;
    return growthNeedsCollect(data);
  }

  function autoCollectGrowth(url, data) {
    if (!data || !growthAutoPending(data)) return null;
    const key = url || (data.source && data.source.url) || '';
    if (key && growthAutoTried.has(key)) return growthAutoRunning;
    if (key) growthAutoTried.add(key);
    growthAutoRunning = (async () => {
      try {
        // 目标档案显式传入（不在里面改全局的 lastReportData：后台任务不许劫持「当前报告」）
        const out = await regrowthNow({ labelRing: true, target: data, url: key });
        if (out && out.found) return out;
        // 明确采不到：落印记，下次打开这条档案不再自动重采（用户可以点 ? 手动再试一次）
        if (data.analysis) data.analysis.growthSearch = { at: Date.now(), found: false };
        markRestSearched(key, data);
        return out;
      } catch (e) {
        console.log(`[growth-auto] 采集失败：${(e && e.message) || e}`);
        return null;
      } finally {
        growthAutoRunning = null;
      }
    })();
    return growthAutoRunning;
  }

  /* 「这一维的分是怎么来的」小字：程序把依据摊开，让用户能顺着它去核对（可追溯），而不是只看到一个数字。
     双休假期摊的是模型给的标签与原句（原句在 JD 里）；发展空间摊的是分布库里的 μ/σ、两条社平与 b/t
     ——它不读 JD，所以这里没有原句可摊，只有分布的出处与数字。 */
  const INTENSITY_LABEL = { none: '无强度线索', hinted: '有具体强度暗示', clear: '明确经常性强度' };

  /* 发展潜力参照图（二维）：横轴＝工作价值高度 r₂（相对本城的水平），纵轴＝薪资成长空间 r₁（相对本城的落差）。
     分档线在这个平面上是双曲线 r₁·r₂ = L；取对数后是一组等距（每档 0.7σ）的平行斜线。
     两条线之间的「带」就是一层阶层——按该层的人数铺灰阶底纹，钟形因此看得见。
     灰点＝本城职业库；黑点＝这一份工作：空心＝这个职业（K₁），实心＝这份 JD（K₂）。 */
  let growthScatter = null;          // { 城市: [[r1, r2], ...] }，懒加载一次
  let growthScatterLoading = null;
  function loadGrowthScatter() {
    if (growthScatter) return Promise.resolve(growthScatter);
    if (growthScatterLoading) return growthScatterLoading;
    growthScatterLoading = fetch('growth-scatter.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((j) => { growthScatter = j && typeof j === 'object' ? j : {}; return growthScatter; });
    return growthScatterLoading;
  }

  /* 凸多边形按半平面裁剪（Sutherland–Hodgman）：保留 f(p) ≥ 0 的部分 */
  function clipPoly(poly, f) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const fa = f(a);
      const fb = f(b);
      if (fa >= -1e-9) out.push(a);
      if ((fa > 1e-9 && fb < -1e-9) || (fa < -1e-9 && fb > 1e-9)) {
        const t = fa / (fa - fb);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }

  function growthScaleChart(data) {
    if (!ScoreModel) return null;
    const c = data && data.analysis && data.analysis.growthCalc;
    if (!c || typeof c !== 'object') return null;
    const official = c.basis === 'official';
    const ladder = official ? ScoreModel.growthLadderOf(c.city) : null;
    const lines = official ? ((ladder || {}).lines || null) : (ScoreModel.GROWTH_SPACE_LINES || null);
    if (!Array.isArray(lines) || lines.length !== 9) return null;

    const dots = [];
    const push = (r1, r2, kind, label) => {
      const a = Number(r1);
      const b = Number(r2);
      if (a > 0 && b > 0) dots.push({ r1: a, r2: b, kind, label });
    };
    // 两条口径都画两层：空心＝职业（K₁），实心＝这份 JD（K₂，没报价时不画）。
    // 旧档案（layer / K2 都没有）只画一个点，不让图画不出来。
    push(c.r1Base, c.r2Base, 'occ', '这个职业');
    if (Number(c.K2) > 0) push(c.r1, c.r2, 'jd', '这份 JD');
    if (!dots.length) push(c.r1, c.r2, official ? 'occ' : 'fit', '这份工作');
    if (!dots.length) return null;
    const bandOf = (r1, r2) => 1 + lines.filter((x) => r1 * r2 >= x).length;

    // 坐标范围：两轴同一段对数区间（对角线成 45°）；必须包住最外两条线——每条线离原点最近在 r＝√L 处
    const cloud = (official && growthScatter && growthScatter[c.city]) || [];
    const ratio = lines[1] / lines[0];
    const loVals = dots.map((d) => Math.min(d.r1, d.r2)).concat(cloud.map((q) => Math.min(q[0], q[1])));
    const hiVals = dots.map((d) => Math.max(d.r1, d.r2)).concat(cloud.map((q) => Math.max(q[0], q[1])));
    const lo0 = Math.min(...loVals, Math.sqrt(lines[0]) * 0.75);
    const hi0 = Math.max(...hiVals, Math.sqrt(lines[8]) * 1.3);
    const lo = 10 ** (Math.round((Math.log10(lo0) - 0.02) * 10) / 10);
    const hi = 10 ** (Math.round((Math.log10(hi0) + 0.02) * 10) / 10);

    const W = 720, H = 430, ML = 62, MR = 706, MT = 34, MB = 358;
    const X0 = Math.log10(lo), X1 = Math.log10(hi), Y0 = X0, Y1 = X1;
    const lx = (v) => ML + (Math.log10(v) - X0) / (X1 - X0) * (MR - ML);
    const ly = (v) => MB - (Math.log10(v) - Y0) / (Y1 - Y0) * (MB - MT);

    // 每层的人数：有参照云就用真实计数，否则用「离中间越近越厚」的理论形状兜底
    const cnt = Array(10).fill(0);
    for (const q of cloud) cnt[bandOf(q[0], q[1]) - 1]++;
    const maxCnt = Math.max(...cnt, 1);
    const shade = (i) => {
      const t = cloud.length ? cnt[i] / maxCnt : Math.max(0.08, 1 - Math.abs(i - 4.5) / 5.2);
      const g = Math.round(255 - t * 40);            // 人越多越深，最深约 #d7dbe3
      return `rgb(${g},${Math.min(255, g + 1)},${Math.min(255, g + 6)})`;
    };

    const stepTxt = official && ladder.sigma > 0
      ? `每档相隔 ${(Math.log(ratio) / ladder.sigma).toFixed(2)}σ`
      : '每档相隔固定的倍数';
    let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">`;
    out += `<text x="${ML}" y="16" font-size="11" fill="#5b6678">`
      + (official
        ? `参照分布：本城 ${Number(ladder.n) || '?'} 个官方职业（灰点）· 分档线＝K₁ 的双曲线，${stepTxt}——底纹越深＝这一层人越多`
        : `参照量表：k′ 的 10 档 · ${stepTxt}——底纹越深＝这一层人越多`)
      + '</text>';
    out += `<defs><clipPath id="gs-clip"><rect x="${ML}" y="${MT}" width="${MR - ML}" height="${MB - MT}"/></clipPath></defs>`;
    out += `<rect x="${ML}" y="${MT}" width="${MR - ML}" height="${MB - MT}" fill="#ffffff" stroke="#e3e8f0"/>`;

    // 阶层底纹：把「两条斜线之间的带」用矩形裁出来填灰
    const pxAt = (xLog) => ML + (xLog - X0) / (X1 - X0) * (MR - ML);
    const pyAt = (yLog) => MB - (yLog - Y0) / (Y1 - Y0) * (MB - MT);
    out += '<g clip-path="url(#gs-clip)">';
    for (let i = 0; i < 10; i++) {
      const sLo = Math.log10(i === 0 ? 1e-9 : lines[i - 1]);
      const sHi = Math.log10(i === 9 ? 1e9 : lines[i]);
      let poly = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
      poly = clipPoly(poly, (q) => (q[0] + q[1]) - sLo);
      if (poly.length >= 3) poly = clipPoly(poly, (q) => sHi - (q[0] + q[1]));
      if (poly.length < 3) continue;
      const pts = poly.map((q) => `${pxAt(q[0]).toFixed(1)},${pyAt(q[1]).toFixed(1)}`).join(' ');
      out += `<polygon points="${pts}" fill="${shade(i)}"/>`;
    }
    out += '</g>';

    // 对数刻度网格（白线压在底纹上，不抢眼）
    const tick = (a, b) => {
      const t = [];
      for (let pw = Math.floor(Math.log10(a)); pw <= Math.ceil(Math.log10(b)); pw++) {
        for (const m of [1, 2, 5]) { const v = m * 10 ** pw; if (v >= a && v <= b) t.push(v); }
      }
      return t;
    };
    for (const v of tick(lo, hi)) {
      out += `<line x1="${ML}" y1="${ly(v).toFixed(1)}" x2="${MR}" y2="${ly(v).toFixed(1)}" stroke="#ffffff" opacity="0.75"/>`;
      out += `<text x="${ML - 8}" y="${(ly(v) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#8a94a6">${v}</text>`;
      out += `<line x1="${lx(v).toFixed(1)}" y1="${MT}" x2="${lx(v).toFixed(1)}" y2="${MB}" stroke="#ffffff" opacity="0.75"/>`;
      out += `<text x="${lx(v).toFixed(1)}" y="${MB + 16}" text-anchor="middle" font-size="10" fill="#8a94a6">${v}</text>`;
    }

    // 分档线
    for (const L of lines) {
      const a = Math.max(0, (Math.log10(L) - Y1 - X0) / (X1 - X0));
      const b = Math.min(1, (Math.log10(L) - Y0 - X0) / (X1 - X0));
      if (!(b > a)) continue;
      const segX = (t) => pxAt(X0 + t * (X1 - X0));
      const segY = (t) => pyAt(Math.log10(L) - (X0 + t * (X1 - X0)));
      out += `<line x1="${segX(a).toFixed(1)}" y1="${segY(a).toFixed(1)}" x2="${segX(b).toFixed(1)}" y2="${segY(b).toFixed(1)}" stroke="#aab4c4" stroke-width="1" stroke-dasharray="5 4"/>`;
    }
    // 档号：沿对角线 r₁ = r₂，每档取相邻两条线的几何中点（两端按同一倍数向外延一格）
    for (let i = 0; i < 10; i++) {
      const loL = i === 0 ? lines[0] / ratio : lines[i - 1];
      const hiL = i === 9 ? lines[8] * ratio : lines[i];
      const r = (loL * hiL) ** 0.25;
      const cx = lx(r);
      const cy = ly(r);
      if (cx < ML + 6 || cx > MR - 6 || cy < MT + 6 || cy > MB - 6) continue;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="#ffffff" opacity="0.86"/>`;
      out += `<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#8a94a6">${i + 1}</text>`;
    }

    // 参照云 + 点位
    for (const q of cloud) {
      const X = lx(q[1]);
      const Y = ly(q[0]);
      if (X < ML || X > MR || Y < MT || Y > MB) continue;
      out += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="2.1" fill="#b6c2d4"/>`;
    }
    for (const d of dots) {
      const X = Math.min(Math.max(lx(d.r2), ML + 12), MR - 12);
      const Y = Math.min(Math.max(ly(d.r1), MT + 14), MB - 10);
      const filled = d.kind === 'jd' || d.kind === 'fit';
      out += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="6.5" fill="${filled ? '#1c2330' : '#ffffff'}" stroke="#1c2330" stroke-width="2.2"/>`;
      out += `<line x1="${X.toFixed(1)}" y1="${(Y - 9).toFixed(1)}" x2="${X.toFixed(1)}" y2="${(Y - 20).toFixed(1)}" stroke="#1c2330" stroke-width="1.2"/>`;
      out += `<text x="${X.toFixed(1)}" y="${(Y - 24).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1c2330">${d.label} ${bandOf(d.r1, d.r2)} 档</text>`;
    }

    // 轴名跟着口径走：官方口径的两个因子由 P20/P50/P80 定义，拟合口径由 b/t 定义
    out += `<text x="${(ML + MR) / 2}" y="${MB + 34}" text-anchor="middle" font-size="11" fill="#5b6678">`
      + (official
        ? '工作价值高度 r₂ ＝ √(P50 · P80) ÷ c（越大＝这个职业的“顶”越高）'
        : '工作价值高度 r₂ ＝ 天花板 ÷ c（越大＝这个职业的“顶”越高）')
      + '</text>';
    out += `<text x="16" y="${(MT + MB) / 2}" font-size="11" fill="#5b6678" transform="rotate(-90 16 ${(MT + MB) / 2})" text-anchor="middle">`
      + (official
        ? '薪资成长空间 r₁ ＝ (P80 − P20) ÷ c（越大＝能涨的幅度越大）'
        : '薪资成长空间 r₁ ＝（天花板 − 普通水平）÷ c（越大＝能涨的幅度越大）')
      + '</text>';
    const shares = cnt.map((v) => `${Math.round((v / (cloud.length || 1)) * 100)}%`).join(' / ');
    out += `<text x="${ML}" y="${MB + 52}" font-size="10.5" fill="#8a94a6">`
      + (cloud.length
        ? `底纹＝每一层的人数占比（${shares}）——中间厚、两端薄，就是正态的阶层结构；`
        : '底纹＝每一层的理论占比——中间厚、两端薄，就是正态的阶层结构；')
      + `${cloud.length ? '灰点＝本城职业库，' : ''}空心＝这个职业（K₁），实心＝这份 JD（K₂）。</text>`;
    out += '</svg>';

    const box = document.createElement('div');
    box.className = 'dim-scale';
    box.innerHTML = out;
    return box;
  }

  /* 成色系数 C 的那张表（只有主观层才有）：三项档位与系数逐行摊开，最后一行是三项相乘的结果。
     用表格而不是一行字：读者要能对着「这一份 JD 为什么乘 0.56」逐项核对——
     哪一项被压了、哪一项是最中立的档，表里各占一行，比一串 · 分隔的字段清楚。
     系数只认有原句的判断；旧档案没存下三项的系数时，那一格显示 —（不猜）。 */
  function growthCTable(c) {
    if (!c || c.C == null || !c.Cmeta || !ScoreModel) return null;
    const meta = c.Cmeta;
    const fac = c.Cfactors || {};
    const text = ScoreModel.GROWTH_FACTOR_TEXT || {};
    const nameOf = (key, level) => ((text[key] || {})[level] || '');
    const rowOf = (key, label, level) => {
      const v = Number(fac[key]);
      return [label, nameOf(key, level) || '—', Number.isFinite(v) ? `×${v.toFixed(2)}` : '—'];
    };
    return {
      caption: '成色系数 C（只作用在主观层）：三项相乘，夹在 [0.30, 1.20]。每项都要拿得出 JD 原句才算数，'
        + '对不上原文的按最中立的一档（系数 1）算——没证据不压分、更不抬分。',
      head: ['看什么', '这一份落在哪一档', '系数'],
      rows: [
        rowOf('fit', '对口度', meta.fit),
        rowOf('form', '用工形式', meta.form),
        rowOf('position', '业务位置', meta.position),
        ['成色系数 C', '三项相乘的结果', `×${Number(c.C).toFixed(2)}`],
      ],
    };
  }

  /* 每个维度的一句话评价：前半句是判断（数字由程序按算分用的那几个数拼，同一份数据永远同一句话），
     后半句是一句能落地的话。分数为 null 的维度不写——宁可不写，也不编。 */
  function verdictOf(key, data) {
    const a = (data && data.analysis) || {};
    const d = (a.dimensions || []).find((x) => x.key === key);
    if (!d || d.score == null) return '';
    const s = d.score;

    if (key === 'growth') {
      const c = a.growthCalc;
      if (!c || typeof c !== 'object') return '';
      // 排位只在官方口径下说：hist 统计的是官方 K₁ 的分布，拟合口径的 k′ 是另一把尺，
      // 摆上去会写出与分数打架的档位（第 9 档 vs 10 分）
      const K = (c.layer === 'jd' && c.K2 != null) ? c.K2 : (c.K1 != null ? c.K1 : c.k);
      const r = (c.basis === 'official' && ScoreModel && ScoreModel.growthRankOf)
        ? ScoreModel.growthRankOf(c.city, K) : null;
      const parts = [];
      if (c.layer === 'jd' && c.K2 != null && c.K1 != null) {
        parts.push(`按这份 JD 的报价算，比这个职业的常态${c.K2 >= c.K1 ? '更靠前' : '更靠后'}`);
      }
      if (r) parts.push(`${c.city || '本城'} ${r.n} 个职业里它落在第 ${r.band} 档${r.above === 0 ? '，前面没有别人' : `，前面还有 ${r.above} 个`}`);
      const tone = s >= 8 ? '台阶长、天花板也高，值得为它多准备一些筹码。'
        : s >= 6 ? '往上的路是通的，缺的只是时间和作品。'
          : s >= 4 ? '台阶不算高，但每一步都算数。'
            : s >= 2 ? '往上的位置不多，把它当一段经历，别把它当终点。'
              : '上升的台阶几乎没有；如果暂时只能选它，也给自己定一个离开的时间。';
      return `这份工作的发展空间${parts.length ? `：${parts.join('；')}` : ''}——${tone}`;
    }

    if (key === 'pay') {
      const pc = a.payCalc;
      const monthly = pc && Number.isFinite(Number(pc.monthly)) ? Number(pc.monthly)
        : (pc && Number.isFinite(Number(pc.effective)) ? Number(pc.effective) : null);
      // 说清「这个价位在这座城市算哪一档」：月当量 + 相当于当地中位几倍 + 落在第几档（本城前多少）
      const L = pc && pc.ladder && Number(pc.ladder.median) > 0 ? pc.ladder : null;
      const pct = L && Array.isArray(L.percents) && pc.band != null ? L.percents[Number(pc.band)] : null;
      const where = pc && pc.band != null
        ? `，落在第 ${pc.band} 档${pct != null && pct < 100 ? `（≥ 本城前 ${pct}%）` : ''}`
        : '';
      const w = monthly > 0
        ? `税前月当量约 ${moneyShort(monthly)}`
          + (L ? `（${L.city || '当地'}工资中位的 ${(monthly / L.median).toFixed(1)} 倍）` : '')
          + where
        : '';
      const tone = s >= 8 ? '这个价位在同城算相当能打，谈的时候把底薪与绩效算法落进合同，别让浮动部分只停在口头。'
        : s >= 6 ? '中上水平，够得上体面生活；把发放方式问清楚，涨薪这件事早谈比晚谈容易。'
          : s >= 4 ? '够过日子，但攒钱要靠计划——先把它当跳板，把手上的活做成能拿得出手的作品。'
            : s >= 2 ? '偏紧，先保证生活不被打乱；把它当过渡，边干边找更好的机会。'
              : '这个价位在大城市很难撑住；如果还有别的选择，别将就。';
      return w ? `这份工作的薪资：${w}——${tone}` : tone;
    }

    if (key === 'rest') {
      const rr = restRangeOf(data);
      const days = rr && Number.isFinite(rr.est) ? `年均休息 ${rr.est} 天` : '';
      const hard = (a.restMeta && a.restMeta.intensity === 'clear') ? '，而且 JD 里写明了经常性加班' : '';
      const tone = s >= 9 ? '双休是落地的，休息日充足——把这段时间用在自己身上，别客气。'
        : s >= 7 ? '双休基本有保障，偶尔会被工作切走一点，剩下的时间记得留一半给自己。'
          : s >= 5 ? '休息被打了折，大小周这类安排会慢慢消耗人；把调休和补偿聊清楚，也把身体放在前面。'
            : s >= 3 ? '休息偏紧，长期这样人会透支；先想清楚能不能撑一年，再决定要不要上。'
              : '休息几乎被工作吃掉了，别用身体换工资；真要去，也给自己设一个明确的期限。';
      return `${days || '这份工作的休息'}${hard}——${tone}`;
    }

    if (key === 'match') {
      if (!a.hasResume) return '';
      // 报考类岗位：用户最关心的是「能不能报」，先说资格这一关，再说后面的结论
      const ex = a.matchMeta && a.matchMeta.exam;
      if (ex && ex.required) {
        const bad = (Array.isArray(ex.items) ? ex.items : [])
          .filter((it) => it && (it.ok === 'no' || it.ok === 'partial'));
        if (bad.length) {
          const why = bad.slice(0, 2).map((it) => `${it.item} ${it.ok === 'no' ? '不符合' : '差一点'}`).join('、');
          return `这是报考类岗位，报考条件里有 ${bad.length} 条卡住：${why}——资格这一关过不了，工作内容再合适也报不上，先把条件凑齐或换一个能报的岗。`;
        }
        return '这是报考类岗位，报考条件在你这份简历上全部符合——能报上，把考试与资格审查要用的材料（证书、证明、报名表）提前备齐。';
      }
      return s >= 8 ? '你的经历和这份 JD 基本对得上，去谈吧，把它当成一次对等的选择。'
        : s >= 6 ? '主要职责能对上，差的是可以补的一两个点；把这几个词补进简历再去投。'
          : s >= 4 ? '对上一半，卡在硬要求或关键经历；先攒一个能拿得出手的案例再回来。'
            : '硬门槛卡住了，别硬投——把学历、年限、证书这几项补齐，或者换个方向。';
    }

    if (key === 'reliable') {
      return s >= 9 ? '招聘内容里没有先收钱、拉人头这类可疑内容，公司信息也查得到——这份招聘可信，放心往下谈。'
        : s >= 7 ? '没发现明显可疑的地方，只是能核实的信息偏少；花十分钟查一下用工主体再投，不吃亏。'
          : s >= 4 ? '信息不够核实，先别交任何费用和证件；「谁在雇你、签什么合同」问不清就别往前走。'
            : '招聘里已经出现先收钱、拉人头这类明确可疑的内容，别投——你的时间值得花在正经公司上。';
    }

    if (key === 'aiProof') {
      return s >= 9 ? '这份工作很稳，能干很久；稳也是资本，可以放心把精力投进去。'
        : s >= 7 ? '稳定性中上，值得认真做几年；技术的浪头一直在动，手上多留一项能带走的本事。'
          : s >= 5 ? '稳定性一般，行业与岗位都在变；别把宝全押在这一家。'
            : s >= 3 ? '流动性偏高，除了薪资更要看「能带走什么」；边干边攒作品，别只攒资历。'
              : '这份工作很难长期干下去，先把它当过渡，同时开着找下一条路。';
    }
    return '';
  }

  function evidenceLinesOf(key, data) {
    const a = (data && data.analysis) || {};
    const out = [];
    if (key === 'growth') {
      const c = a.growthCalc;
      if (c && typeof c === 'object' && c.basis === 'official') {
        // 官方口径（v15）：摊开人社局工资价位的五个分位点、这份 JD 的报价、两个因子与本城非私社平。
        // 这一条分支必须独占——官方 calc 里没有 μ/σ/b/t，拿拟合口径那几行去解释会写出 NaN。
        const K1 = (v) => `${(Number(v) / 1000).toFixed(1)}K`;
        out.push(`官方数据（${c.source || '人社局工资价位'}）：${c.officialJob || c.job || ''}${c.officialSec ? `（${c.officialSec}）` : ''}`
          + `P20＝${K1(c.p20)}、P50＝${K1(c.p50)}、P80＝${K1(c.p80)}（元/月，P20/P80 由官方 P10/P25/P50/P75/P90 对数线性插值）`
          + `${c.match && c.match !== c.officialJob ? `——按「${c.match}」命中的这一条` : ''}`);
        if (c.layer === 'jd') {
          const ct = growthCTable(c);
          if (ct) out.push({ table: ct });
          out.push(`这一份 JD 报价 ${K1(c.jdLow)}–${K1(c.jdHigh)}（月当量）→ 薪资成长空间 ${Number(c.r1).toFixed(3)} × 工作价值高度 ${Number(c.r2).toFixed(3)}${c.C != null ? ` × 成色 ${Number(c.C).toFixed(2)}` : ''} → K₂＝${Number(c.K).toFixed(3)}`);
        } else {
          out.push(`薪资成长空间 ${Number(c.r1).toFixed(3)} × 工作价值高度 ${Number(c.r2).toFixed(3)} → K₁＝${Number(c.K).toFixed(3)}`);
        }
        out.push(`本城非私社平 c＝${Number(c.c)} 元/月；K 查该城职业库的 ln K₁ 分布（0.7σ 等距、到线取本档），落 ${Number(c.score)} 档`);
      } else if (c && typeof c === 'object') {
        // 拟合口径：分布库里的 μ/σ、两条社平与 b/t；有 JD 报价时再摊开主观层 K₂
        const ref = c.ref || {};
        const K1 = Number(c.K1 != null ? c.K1 : c.k);
        const r1b = Number(c.r1Base != null ? c.r1Base : c.r1);
        const r2b = Number(c.r2Base != null ? c.r2Base : c.r2);
        if (c.estimated === 'shape') {
          out.push(`这一维是参考值：借 ${ref.city || ''}·${ref.job || ''} 的分布形状（离散度）${ref.source ? `，来源：${ref.source}` : ''}，按两地社平工资等比折算——本地分布没有采到`);
        } else if (c.estimated === 'neutral') {
          out.push(`这一维是参考值：按当地社平工资配同类岗位的典型离散度（σ＝${Number(c.sigma || 0).toFixed(2)}）中性折算——本地分布没有采到`);
        } else {
          out.push(`分布（${c.source || '网络公开数据'}）：普通人水平 b＝${(c.b / 1000).toFixed(1)}K、天花板 t＝${(c.t / 1000).toFixed(1)}K`);
        }
        out.push(`这个职业（客观层 K₁）：薪资成长空间 ${r1b.toFixed(2)} × 工作价值高度 ${r2b.toFixed(2)} → k′＝${K1.toFixed(2)}${c.lowBase ? '（底薪型：天花板按 P75「普通人够得着」的那一层取，不按 P87.5）' : ''}`);
        if (c.layer === 'jd' && c.K2 != null) {
          const ct = growthCTable(c);
          if (ct) out.push({ table: ct });
          out.push(`这一份 JD 报价 ${(c.jdLow / 1000).toFixed(1)}K–${(c.jdHigh / 1000).toFixed(1)}K（月当量）→ 主观层 K₂：薪资成长空间 ${Number(c.r1).toFixed(2)} × 工作价值高度 ${Number(c.r2).toFixed(2)}${c.C != null ? ` × 成色 ${Number(c.C).toFixed(2)}` : ''} → k′＝${Number(c.k).toFixed(2)}`);
        }
        out.push(`k′ 查维度规则里那张 10 档量表（到线取本档），落 ${Number(c.score)} 分${c.layer === 'jd' ? '——落档用的是这一份 JD 的 K₂' : '——读不到这份 JD 的报价，落档用的是这个职业的 K₁'}`);
        if (c.confidence) out.push(`分布置信度：${c.confidence}${c.samples ? `（样本 ${c.samples} 份）` : ''}`);
      } else {
        const dim = (a.dimensions || []).find((x) => x.key === 'growth');
        out.push(dim && dim.score != null
          ? '这条档案是旧口径算的分（没有存下分布依据），重新分析一次即可换成分布法口径。'
          : '这一维还没有采到分布数据：点标题旁的 ? 可以立刻联网重采，或者重新分析一次。');
      }
    }
    if (key === 'rest') {
      const rr = restRangeOf(data);
      out.push(`年均休息日 ${rr.est} 天，折成月均 ${((rr.est - STATUTORY_HOLIDAYS) / 12).toFixed(1)} 天；依据是摘要「${a.restBrief || '—'}」（来源：${REST_SOURCE_LABEL[rr.source] || '估算'}）`);
      const m = a.restMeta;
      if (m && m.intensity && m.intensity !== 'none') {
        const ev = (m.evidence || [])[0];
        out.push(`劳动强度：${INTENSITY_LABEL[m.intensity] || m.intensity}${m.compTime ? '，加班能换休（降档减半）' : ''}${ev ? `——原句「${ev}」` : ''}`);
      } else if (m) {
        out.push('劳动强度：没有具体线索（「抗压能力强」这类套话不计）');
      }
      if (m && m.beyond === true) out.push('法定之外还有成规模的带薪假：升一档（封顶 10 分）');
    }
    return out;
  }

  // 维度面板内容（不切换开合状态）
  function renderDimPanel(i) {
    const key = DIM_KEYS[i];
    const d = dimsData.find((x) => x.key === key) || {};
    dimPanel.hidden = false;
    dimPanel.classList.remove('swap');
    void dimPanel.offsetWidth;
    dimPanel.classList.add('swap');

    dimPanelName.textContent = DIM_NAMES[key] || d.name || '';
    dimPanelScore.textContent = d.score == null ? '--' : String(d.score);
    dimMeter.innerHTML = '';
    for (let k = 0; k < 10; k++) {
      const cell = document.createElement('span');
      cell.className = 'meter-cell' + (d.score != null && k < d.score ? ' on' : '');
      dimMeter.appendChild(cell);
    }
    // 薪资待遇维度：薪资没读到的话，名字后面挂一个不起眼的 ?
    const oldHint = dimPanel.querySelector('.salary-hint-box');
    if (oldHint) oldHint.remove();
    const oldQ = dimPanel.querySelector('.salary-hint-q');
    if (oldQ) oldQ.remove();
    let hintBox = null;
    if (key === 'pay' && salaryMissing(lastReportData)) {
      const hint = buildSalaryHint(dimPanel, lastReportData);
      dimPanelName.appendChild(hint.q);
      hintBox = hint.box;
    }
    // 休息维度：? 常驻——没读到可以补，读到了也可以纠偏
    if (key === 'rest' && lastReportData) {
      const hint = buildRestHint(dimPanel, lastReportData);
      dimPanelName.appendChild(hint.q);
      hintBox = hint.box;
    }
    // 发展潜力：本地分布没采到、或只是参考值（借形状 / 中性估算）时常驻一个 ?，点开可联网重采
    // 官方口径（basis=official）与本地实测一样是「已经在手的权威数据」，不需要重采，也就没有这个 ?
    if (key === 'growth' && lastReportData && growthNeedsCollect(lastReportData)) {
      const hint = buildGrowthHint(dimPanel, lastReportData);
      dimPanelName.appendChild(hint.q);
      hintBox = hint.box;
    }
    // 展开的内容必须紧贴在 ? 那一行（面板头）下面。buildXxxHint 只负责把 box 挂到面板上，
    // 不搬位置的话它会落到面板最底部（维度分析、规则说明的后面），看起来像点错了地方。
    if (hintBox) dimPanel.insertBefore(hintBox, dimPanel.firstElementChild.nextSibling);
    // 一句话评价：紧贴在面板头下面，比维度分析更靠前——先给结论，再看理由。
    // 插在「第一个孩子（面板头）之后」，会把刚放好的 hintBox 挤到它后面，顺序正好是 头 → 评价 → 展开框。
    const oldVerdict = dimPanel.querySelector('.dim-verdict');
    if (oldVerdict) oldVerdict.remove();
    const verdict = verdictOf(key, lastReportData);
    if (verdict) {
      const line = document.createElement('p');
      line.className = 'dim-verdict';
      line.textContent = verdict;
      dimPanel.insertBefore(line, dimPanel.firstElementChild.nextSibling);
    }
    // 维度面板里的附加小字（休息偏离度 / 薪资计算过程）：换维度时先清掉上一次留下的那行
    const oldNoteLine = dimPanel.querySelector('.dim-note');
    if (oldNoteLine) oldNoteLine.remove();
    // 双休假期：把偏离度模型一并摊开——估算 / 参考来的休息只会更差
    if (key === 'rest' && lastReportData) {
      const rr = restRangeOf(lastReportData);
      const label = REST_SOURCE_LABEL[rr.source] || '估算';
      const line = document.createElement('p');
      line.className = 'dim-note';
      if (rr.dev > 0) {
        line.textContent = `偏离度 ${(rr.dev * 100).toFixed(0)}%：休息天数按${label}算 ${rr.est} 天，最差可能只有 ${rr.lo} 天。`
          + `道理很简单——信息不完整时只会把休息写得比实际好，不会写得更差，所以要往下打折。`
          + `打折多少由三件事决定：信息来自哪里、公司在不在意公开评价、行业作息本身乱不乱（本条：${rr.devWhy}）。`;
      } else {
        line.textContent = `休息天数来自${label}（${rr.est} 天），有明确依据，不打折。`;
      }
      dimPanel.insertBefore(line, dimPanelText);
    }
    // 薪资待遇：把这次的计算过程摊开（读数来自后端纯函数 payCalc，旧记录没有就不显示），
    // 再附上**本城刻度尺 + 刻度表**——「这份工作落在表上哪一格、报价区间跨了几档」都在这里。
    const payCalc = lastReportData && lastReportData.analysis && lastReportData.analysis.payCalc;
    // 薪资小结（三块数字）压在「评价」上面：面板不整体重绘，换维度时这一块自己清掉
    const oldPayEst = dimPanel.querySelector('.pay-est');
    if (oldPayEst) oldPayEst.remove();
    // 薪资专属的 DOM 只属于薪资维度：口径行（payCalcNote）与刻度表换成别的维度时必须一并清掉，
    // 否则它们会原样留在下一个维度的面板里（刻度尺同样是薪资专属，但它挂在 .dim-scale 上，
    // 由下面「清掉上一维的图」那一步统一收走）
    for (const el of Array.from(dimPanel.querySelectorAll('.pay-note, .pay-ladder'))) el.remove();
    if (key === 'pay') {
      const payEst = payEstBlock(payCalc, lastReportData && lastReportData.analysis);
      if (payEst) {
        const verdictEl = dimPanel.querySelector('.dim-verdict');
        dimPanel.insertBefore(payEst, verdictEl || dimPanelText);
      }
    }
    let payRulerEl = null;
    if (key === 'pay' && payCalc && Number.isFinite(payCalc.low)) {
      const line = document.createElement('p');
      line.className = 'dim-note pay-note';
      line.textContent = payCalcNote(payCalc);
      dimPanel.insertBefore(line, dimPanelText);
      // 刻度尺挂在 .dim-scale 上，而面板稍后会「清掉上一维的图」——所以先备好、稍后再插
      payRulerEl = payRulerChart(payCalc);
      const ladderTable = payLadderTable(payCalc);
      if (ladderTable) {
        const cap = document.createElement('p');
        cap.className = 'dim-note pay-note';
        cap.textContent = ladderTable.caption;
        dimPanel.insertBefore(cap, dimPanelText);
        const table = document.createElement('table');
        table.className = 'dim-evidence-table pay-ladder';
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        for (const h of ladderTable.head) {
          const th = document.createElement('th');
          th.textContent = h;
          trh.appendChild(th);
        }
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of ladderTable.rows) {
          const tr = document.createElement('tr');
          for (const cell of row) {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        dimPanel.insertBefore(table, dimPanelText);
      }
    }
    renderAnalysis(dimPanelText, d.analysis || '');
    // 「依据」小字：这一维的分是怎么定出来的（标签 + 原句 + 来源），插在正文之前，
    // 让「凭什么给这个分」有地方可查
    const oldEv = dimPanel.querySelector('.dim-evidence');
    if (oldEv) oldEv.remove();
    const evLines = evidenceLinesOf(key, lastReportData);
    if (evLines.length) {
      const evBox = document.createElement('div');
      evBox.className = 'dim-evidence';
      for (const line of evLines) {
        // 依据里可以嵌小表格（成色系数 C：三项 × 档位 × 系数，用表格才能逐项对账）
        if (line && typeof line === 'object' && line.table) {
          const t = line.table;
          const table = document.createElement('table');
          table.className = 'dim-evidence-table';
          if (t.caption) {
            const cap = document.createElement('p');
            cap.className = 'dim-evidence-caption';
            cap.textContent = t.caption;
            evBox.appendChild(cap);
          }
          const thead = document.createElement('thead');
          const trh = document.createElement('tr');
          for (const h of t.head || []) {
            const th = document.createElement('th');
            th.textContent = h;
            trh.appendChild(th);
          }
          thead.appendChild(trh);
          table.appendChild(thead);
          const tbody = document.createElement('tbody');
          for (const row of t.rows || []) {
            const tr = document.createElement('tr');
            for (const cell of row) {
              const td = document.createElement('td');
              td.textContent = cell;
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
          evBox.appendChild(table);
          continue;
        }
        const p = document.createElement('p');
        p.className = 'dim-evidence-line';
        p.textContent = line;
        evBox.appendChild(p);
      }
      dimPanel.insertBefore(evBox, dimPanelText);
    }
    // 发展潜力：详情里只留第三张图——两个因子上的位置（K₁ / K₂ 落在 10 档的哪一格）。
    // 前两张（价的尺、档位人数）在规则与依据里都有数字可查，图只留这张信息量最大的。
    for (const el of Array.from(dimPanel.querySelectorAll('.dim-scale'))) el.remove();
    // 薪资刻度尺：清理之后才插（它自己也是 .dim-scale，插早了会被上面这段清掉）
    if (payRulerEl) dimPanel.insertBefore(payRulerEl, dimPanelText);
    if (key === 'growth') {
      const chart = growthScaleChart(lastReportData);
      if (chart) dimPanel.insertBefore(chart, dimPanelText);
      // 参照云是懒加载的：第一次绘制只有分档线与点位，拿到灰点后原地重绘一次
      if (!growthScatter) {
        loadGrowthScatter().then(() => {
          if (activeKey !== 'growth' || !chart || !chart.isConnected) return;
          const again = growthScaleChart(lastReportData);
          if (again) chart.replaceWith(again);
        });
      }
    }
    // 没有简历时：薪资与匹配度都提示上传简历能更准；匹配度那条可点，直接上传
    const oldTip = dimPanel.querySelector('.dim-panel-tip');
    if (oldTip) oldTip.remove();
    if ((key === 'pay' || key === 'match') && !(lastReportData && lastReportData.analysis && lastReportData.analysis.hasResume)) {
      const tip = document.createElement('p');
      tip.className = 'dim-panel-tip';
      tip.textContent = '上传简历可获得更准确的分析';
      if (key === 'match') {
        tip.classList.add('clickable');
        tip.addEventListener('click', () => {
          if (loadResume()) openResumePage();
          else resumeInput.click();
        });
      }
      dimPanel.appendChild(tip);
    }
    // 这一维的分数是怎么算出来的：规则 + 举例（逐维写清，避免「凭什么给这个分」）
    const oldRule = dimPanel.querySelector('.dim-rule');
    if (oldRule) oldRule.remove();
    const spec = DIM_RULES[key];
    if (spec) {
      const box = document.createElement('div');
      box.className = 'dim-rule';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'dim-rule-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      const label = document.createElement('span');
      label.textContent = spec.weight ? `评分规则 · ${spec.weight}` : '评分规则';
      const caret = document.createElement('span');
      caret.className = 'jd-caret';
      toggle.appendChild(label);
      toggle.appendChild(caret);
      const body = document.createElement('div');
      body.className = 'dim-rule-body';
      body.hidden = true;
      for (const line of spec.rule) {
        const p = document.createElement('p');
        p.className = 'dim-rule-line';
        p.textContent = line;
        body.appendChild(p);
      }
      // 规则可以带一张或多张表：spec.tables（多张，各自可带 caption）优先，否则退回 spec.head / spec.rows
      const tables = Array.isArray(spec.tables) && spec.tables.length
        ? spec.tables
        : [{ head: spec.head, rows: spec.rows, caption: '' }];
      for (const t of tables) {
        if (!t || !Array.isArray(t.head) || !Array.isArray(t.rows)) continue;
        if (t.caption) {
          const cap = document.createElement('p');
          cap.className = 'dim-rule-caption';
          cap.textContent = t.caption;
          body.appendChild(cap);
        }
        const table = document.createElement('table');
        table.className = 'dim-rule-table';
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        for (const h of t.head) {
          const th = document.createElement('th');
          th.textContent = h;
          tr.appendChild(th);
        }
        thead.appendChild(tr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of t.rows) {
          const r = document.createElement('tr');
          for (const cell of row) {
            const td = document.createElement('td');
            td.textContent = cell;
            r.appendChild(td);
          }
          tbody.appendChild(r);
        }
        table.appendChild(tbody);
        body.appendChild(table);
      }
      toggle.addEventListener('click', () => {
        body.hidden = !body.hidden;
        toggle.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
        box.classList.toggle('open', !body.hidden);
      });
      box.appendChild(toggle);
      box.appendChild(body);
      dimPanel.appendChild(box);
    }
    radarApi.setActive(i);
  }

  // 总分下的提示：薪资缺失 / 未上传简历
  /* 分析过程（审计）：把这次分析的各环记账与校验丢弃摊开——
     「哪一环跑了多久、缓存命中多少、哪些原句被校验丢弃、环与主调用的对照」。
     旧档案没有 steps/verifyDrops 就整块隐藏；块本身默认折叠。 */
  const RING_NAMES = {
    'r1-extract': '抄录环',
    'r2-position': '位置判定环',
    'r15-refill': '缺件重读',
    'r15-autofill': '自动补录',
    rescore: '补薪资重算',
    rerest: '休息重算',
    reresume: '简历重算',
  };
  function fmtMs(ms) { return ms == null ? '' : (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`); }
  function fmtUsage(u) {
    if (!u || u.prompt == null) return '';
    const cached = u.cached != null ? `（缓存 ${u.cached}）` : '';
    const out = u.completion != null ? `＋输出 ${u.completion}` : '';
    return `输入 ${u.prompt}${cached}${out}`;
  }
  /* 重算类调用的审计步（与服务端 auditStep 同一形状）：进 analysis.steps 同一本账 */
  function auditStepOf(ring, out, extra = {}) {
    const step = { ring, status: 'ok', ...extra };
    if (out && out.audit && out.audit.ms != null) step.ms = out.audit.ms;
    if (out && out.audit && out.audit.usage && Object.keys(out.audit.usage).length) step.usage = out.audit.usage;
    return step;
  }
  function renderAudit(data) {
    const sec = $('auditSection');
    const body = $('auditBody');
    const sum = $('auditSummary');
    if (!sec || !body || !sum) return;
    const a = (data && data.analysis) || {};
    const steps = Array.isArray(a.steps) ? a.steps : [];
    const drops = Array.isArray(a.verifyDrops) ? a.verifyDrops : [];
    if (!steps.length && !drops.length) { sec.hidden = true; body.textContent = ''; return; }
    sec.hidden = false;
    body.textContent = '';
    const line = (text) => {
      const p = document.createElement('p');
      p.className = 'audit-line';
      p.textContent = text;
      body.appendChild(p);
    };
    for (const s of steps) {
      const parts = [RING_NAMES[s.ring] || s.ring];
      parts.push(s.status && s.status !== 'ok' ? (s.status === 'skipped' ? '跳过' : `失败${s.error ? `（${s.error}）` : ''}`) : '完成');
      if (s.attempts > 1) parts.push(`${s.attempts} 次尝试`);
      if (s.ms != null) parts.push(fmtMs(s.ms));
      const usage = fmtUsage(s.usage);
      if (usage) parts.push(usage);
      if (s.ring === 'r2-position' && s.agreedWithMain === false) parts.push(`与主判定不一致（主 ${s.mainPosition}／环 ${s.output && s.output.position}）`);
      if (s.ring === 'r1-extract' && s.compare) parts.push(s.compare.diffCount ? `与主调用 ${s.compare.diffCount} 处不同` : '与主调用逐字段一致');
      if (s.ring === 'r15-refill' && s.diag) parts.push(s.diag.found ? '原文里读到了' : '原文确认没有');
      if (s.salary) parts.push(`薪资「${s.salary}」`);
      if (s.restHint) parts.push(`休息「${s.restHint}」`);
      line(parts.join(' · '));
    }
    if (drops.length) {
      line(`校验丢弃 ${drops.length} 条（引用对不上原文的片段）：`);
      for (const d of drops.slice(0, 8)) {
        line(`· ${d.field}「${String(d.text || '').slice(0, 24)}」——${d.reason}`);
      }
      if (drops.length > 8) line(`…等共 ${drops.length} 条`);
    }
    sum.textContent = `分析过程（${steps.length} 环记账${drops.length ? ` · ${drops.length} 条校验丢弃` : ''}）`;
  }

  /* 资料不全提示（⑥b）：有 gaps 清单（新版分析结果）就动态渲染「缺什么 / 为什么 / 怎么补」，
     只展示需要用户知情或可行动的缺口（审计性质的 dropped 与已补上的 filled 不进这里）；
     旧档案没有 gaps 字段，退回原来的两条静态提示。 */
  /* 「缺必要信息」提示（固定挂在总分下方，用户口径）：发展潜力的联网采集要有职位名 + 城市，
     缺哪个就报哪个，并给一个就地手动输入的入口（点开是行内表单，填完保存并重采）。
     不缺、或这一维本来不用联网采的时候，整块不出现。 */
  function renderJobInfoNotice(data) {
    const hints = $('verdictHints');
    let box = $('jobInfoNotice');
    const miss = jobInfoMissing(data);
    const need = miss.length && growthNeedsCollect(data);
    if (!need) {
      if (box) box.hidden = true;
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'jobInfoNotice';
      hints.appendChild(box);
    }
    box.textContent = '';
    const p = document.createElement('p');
    p.className = 'verdict-hint';
    p.appendChild(document.createTextNode(`这条档案缺少${miss.join('和')}，联网采集查不了发展分布的薪资依据 —— `));
    const form = buildJobInfoForm(data);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'verdict-hint-act';
    btn.textContent = '手动输入';
    btn.addEventListener('click', () => form.open());
    p.appendChild(btn);
    box.appendChild(p);
    box.appendChild(form.box);
    box.hidden = false;
    hints.hidden = false;
  }

  function renderVerdictHints(data) {
    // 同一时机顺带刷新「分析过程」（审计）块：所有报告刷新路径都走这里
    renderAudit(data);
    const hints = $('verdictHints');
    const hSalary = $('hintSalary');
    const hResume = $('hintResume');
    let dyn = $('verdictGaps');
    const gaps = data && data.analysis && Array.isArray(data.analysis.gaps)
      ? data.analysis.gaps.filter((g) => g && g.kind !== 'dropped' && g.kind !== 'filled')
      : null;
    if (gaps && gaps.length) {
      if (!dyn) {
        dyn = document.createElement('div');
        dyn.id = 'verdictGaps';
        hints.appendChild(dyn);
      }
      dyn.textContent = '';
      const shown = gaps.slice(0, 4);
      for (const g of shown) {
        const p = document.createElement('p');
        p.className = 'verdict-hint';
        p.appendChild(document.createTextNode(`${g.name}：${g.reason}`));
        const act = gapActionOf(g);
        if (act) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'verdict-hint-act';
          btn.textContent = act.text;
          btn.addEventListener('click', () => { try { act.fn(); } catch (e) { toast(e.message || '操作失败'); } });
          p.appendChild(btn);
        }
        dyn.appendChild(p);
      }
      if (gaps.length > shown.length) {
        const more = document.createElement('p');
        more.className = 'verdict-hint';
        more.textContent = `…等共 ${gaps.length} 项，见各维度旁的补录入口。`;
        dyn.appendChild(more);
      }
      dyn.hidden = false;
      hSalary.hidden = true;
      hResume.hidden = true;
      hints.hidden = false;
      // 缺职位名/城市这类「必要信息缺失」的提示固定摆在缺口清单下方（同一条提示区里）
      renderJobInfoNotice(data);
      return;
    }
    if (dyn) dyn.hidden = true;
    // 旧档案（没有 gaps 字段）：维持原来的两条静态提示
    const noSalary = salaryMissing(data);
    const noResume = !(data && data.analysis.hasResume);
    hSalary.hidden = !noSalary;
    if (noSalary) hSalary.textContent = '未读取到薪资信息：评分已按缺失从重计算；手动写入薪资后可获得更准确的分析。';
    hResume.hidden = !noResume;
    if (noResume) hResume.textContent = '当前未上传简历：上传简历可获得更贴合您情况的评分。';
    hints.hidden = !(noSalary || noResume);
    renderJobInfoNotice(data);
  }

  /* 缺口动作 → 现有入口：补薪资（打开职位描述里的薪资录入）、上传简历（去简历页）、发展重采；
     发展重采缺职位名/城市时改成「补职位名/城市」——点开总分下方那条提示里的行内表单（只在缺失时出现） */
  function gapActionOf(g) {
    if (!g || !g.action) return null;
    if (g.action === 'rescore') return { text: '补薪资', fn: openSalaryFill };
    if (g.action === 'resume') return { text: '上传简历', fn: () => { renderResumePage(); show(viewResume); } };
    if (g.action === 'growth-collect') {
      if (jobInfoMissing(lastReportData).length) return { text: '补职位名/城市', fn: openJobInfoNoticeFill };
      return { text: '联网重采', fn: () => { regrowthNow({}).catch((e) => toast((e && e.message) || '联网重采失败')); } };
    }
    return null;
  }

  // 展开总分下方「缺必要信息」提示里的行内表单（提示块不在时回退到发展潜力面板的补充表单）
  function openJobInfoNoticeFill() {
    const box = $('jobInfoNotice');
    if (!box || box.hidden) { openGrowthInfoFill(); return; }
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const btn = box.querySelector('.verdict-hint-act');
    if (btn) btn.click();
  }

  // 缺口面板的「补职位名/城市」：切到发展潜力面板 → 打开说明框 → 摊开手动补充表单并聚焦
  function openGrowthInfoFill() {
    const idx = DIM_KEYS.indexOf('growth');
    const panel = document.getElementById('dimPanel');
    const needOpen = !panel || panel.hidden || activeKey !== 'growth';
    const label = document.querySelectorAll('.radar-label')[idx];
    if (needOpen && label) label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
      const box = document.querySelector('#dimPanel .growth-hint-box');
      const q = document.querySelector('#dimPanel .growth-hint-q');
      if (box && q && !box.classList.contains('open')) q.click();
      const link = document.querySelector('#dimPanel .jobinfo-open');
      if (link) link.click();
    }, 160);
  }

  // 打开「薪资未读到」那条的行内录入：展开说明框 → 展开输入表单 → 聚焦输入框
  function openSalaryFill() {
    const q = salaryRowEl && salaryRowEl.isConnected && salaryRowEl.querySelector('.salary-hint-q');
    if (!q) { toast('可在薪资维度里手动补录薪资'); return; }
    salaryRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    q.click();
    const box = salaryRowEl.nextElementSibling;
    if (box && box.classList && box.classList.contains('salary-hint-box')) {
      const act = box.querySelector('.salary-hint-act');
      if (act) act.click();
      const input = box.querySelector('.salary-hint-input');
      if (input) input.focus();
    }
  }

  // 雷达图下面那行提示：用户点过一次维度说明已经会用，之后就不再显示（记在本机）
  const RADAR_HINT_KEY = 'ai-jd-radar-hint-v1';
  const radarHintEl = document.querySelector('.radar-hint');

  function dismissRadarHint() {
    if (radarHintEl) radarHintEl.hidden = true;
    try { localStorage.setItem(RADAR_HINT_KEY, '1'); } catch { /* 隐私模式下忽略 */ }
  }

  if (radarHintEl) {
    try {
      if (localStorage.getItem(RADAR_HINT_KEY)) radarHintEl.hidden = true;
    } catch { /* 忽略 */ }
  }

  function selectDim(i) {
    dismissRadarHint();
    const key = DIM_KEYS[i];
    if (activeKey === key) {
      activeKey = null;
      dimPanel.hidden = true;
      radarApi.setActive(-1);
      return;
    }
    activeKey = key;
    renderDimPanel(i);
  }

  /* ---------- 报告播放（真实分析与示例共用） ---------- */

  function resetReportUI(isDemo) {
    verdictSection.hidden = true;
    verdictSection.classList.remove('open');
    scoreValueEl.classList.add('pending');
    scoreLabelEl.classList.add('pending');
    overallMaxEl.classList.add('pending');
    overallScoreEl.textContent = '—';
    overallMaxEl.textContent = ' /100';
    verdictLine.textContent = '';
    personalText.textContent = '';
    // 岗位名同样要清掉：它默认只在报告结尾才被填（renderVerdictHead），不清的话整段动画期间
    // 屏幕上挂的是上一份报告的岗位名——看起来就像「分析了一个别的岗位」。
    verdictJobEl.textContent = '';
    verdictJobEl.hidden = true;
    demoTag.hidden = !isDemo;
    dimPanel.hidden = true;
    activeKey = null;
    ring.show();
    reportLoading.hidden = true;
    radarSection.hidden = true;
    loadingRing.hide();
    jdSection.hidden = true;
    jdSection.classList.remove('grown');
    jdBody.innerHTML = '';
    salaryRowEl = null;   // 旧报告的薪资录入行随 DOM 一起废弃，别让下一份报告点「补薪资」时指到空气
    jdTitleEl.classList.remove('all-collapsed');
    jdRing.hide();
    radarSvg.classList.add('radar-hidden');
    // 上一份报告的「数据分析」图不能留在页面上：分析没跑完之前这块必须是空的
    const chartSlotEl = $('reportChartSlot');
    if (chartSlotEl) { chartSlotEl.innerHTML = ''; chartSlotEl.hidden = true; }
  }

  function startReport(isDemo) {
    aborted = false;
    resetReportUI(isDemo);
    radarApi = buildRadar(radarSvg, DIM_KEYS.map((k) => DIM_NAMES[k]), {
      interactive: true,
      onLabelTap: selectDim,
    });
    show(viewReport);
    history.pushState({ view: 'report' }, '');
    pushedState = true;
    return radarApi;
  }

  function revealRadar() {
    return new Promise((resolve) => {
      // 第一个维度算出来了：收起居中的进度圈，露出雷达图模块
      hideReportLoading();
      // 强制一次布局，确保过渡生效
      void radarSvg.getBoundingClientRect();
      radarSvg.classList.remove('radar-hidden');
      setTimeout(resolve, 520);
    });
  }

  async function playDims(data, speed) {
    const dims = data.analysis.dimensions || [];
    for (let i = 0; i < 6; i++) {
      if (aborted) return false;
      const d = dims.find((x) => x.key === DIM_KEYS[i]);
      setProgressLabel(`正在评估 ${DIM_NAMES[DIM_KEYS[i]]}`);
      if (i === 0) {
        // 第一个维度算出来之前，雷达图整体不可见
        await sleep(780 * speed);
        if (aborted) return false;
        await revealRadar();
        if (aborted) return false;
      }
      if (!d || d.score == null) {
        radarApi.setScore(i, '--', true);
        radarApi.showLabel(i, true);
        await sleep(520 * speed);
      } else {
        await growDim(radarApi, i, d.score, 900 * speed);
        radarApi.setScore(i, String(d.score), false);
        radarApi.showLabel(i, true);
        await sleep(200 * speed);
      }
      setProgress(0.6 + ((i + 1) / 6) * 0.4);
    }
    return true;
  }

  function slotMachine(target, dur) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let nextAt = 0;
      radarApi.centerText.style.opacity = '1';
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        if (now >= nextAt) {
          nextAt = now + 40 + 300 * k * k;
          radarApi.centerText.textContent = String(Math.floor(Math.random() * 100));
        }
        if (k < 1) requestAnimationFrame(tick);
        else {
          radarApi.centerText.textContent = target == null ? '—' : String(target);   // v12：不给数字时显示「—」
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  async function revealVerdictAndFly(data) {
    verdictSection.hidden = false;
    // 总分位一展开就把这一份的岗位名填上（等结尾的 renderVerdictHead 就太晚了）：
    // 名字 + 分数是报告的门面，展开的瞬间就该是「这一份」的名字。
    const job = (data && data.source && data.source.job) || {};
    verdictJobEl.textContent = job.title || '';
    verdictJobEl.hidden = !job.title;
    await nextFrame();
    verdictSection.classList.add('open');
    await sleep(520);

    const from = radarApi.centerText.getBoundingClientRect();
    const to = scoreValueEl.getBoundingClientRect();
    const fromCx = from.left + from.width / 2;
    const fromCy = from.top + from.height / 2;
    const toCx = to.left + to.width / 2;
    const toCy = to.top + to.height / 2;

    const fly = document.createElement('div');
    fly.className = 'fly-score';
    fly.textContent = data.analysis.overall == null ? '—' : String(data.analysis.overall);   // v12：不给数字时飞一个「—」
    fly.style.left = `${fromCx}px`;
    fly.style.top = `${fromCy}px`;
    fly.style.fontSize = `${Math.max(26, from.height * 0.9)}px`;
    document.body.appendChild(fly);
    // 飞行元素就位的同时，雷达中心的总分立刻消失，避免飞行途中中间残留一个数字
    radarApi.centerText.style.transition = 'none';
    radarApi.centerText.style.opacity = '0';
    await nextFrame();

    fly.style.transition = 'left .62s cubic-bezier(.22,1,.36,1), top .62s cubic-bezier(.22,1,.36,1), font-size .62s cubic-bezier(.22,1,.36,1)';
    fly.style.left = `${toCx}px`;
    fly.style.top = `${toCy}px`;
    fly.style.fontSize = window.getComputedStyle(scoreValueEl).fontSize;
    await sleep(640);

    scoreValueEl.classList.remove('pending');
    scoreLabelEl.classList.remove('pending');
    overallMaxEl.classList.remove('pending');
    paintScorePair(data.analysis);
    fly.remove();
  }

  async function streamText(el, text, speed = 26) {
    const chars = Array.from(String(text || ''));
    el.textContent = '';
    for (let i = 1; i <= chars.length; i++) {
      if (aborted) return;
      el.textContent = chars.slice(0, i).join('');
      await sleep(speed);
    }
  }

  async function runReportSequence(data, speed) {
    lastReportData = data;
    const ok = await playDims(data, speed);
    if (!ok) return false;

    setProgress(1);
    setProgressLabel('六维评分完成');
    await sleep(420 * speed);
    hideProgress();

    // 中间逐渐出现老虎机 → 六维依次闪动 → 分数定格 → 飞向总分位
    const spinning = slotMachine(data.analysis.overall, 2000 * speed);
    await sleep(260 * speed);
    await radarApi.flashLabels(200 * speed);
    if (aborted) return false;
    await spinning;
    if (aborted) return false;

    await revealVerdictAndFly(data);
    if (aborted) return false;

    // 雷达谢幕（分数飞入总分位）之后先停一拍，再让数据分析图出场：
    // 这里才第一次「露面」，之前紧接着弹出来，看着像在雷达还没长完时就冒出来了
    await sleep(680 * speed);
    if (aborted) return false;
    renderReportChart();
    revealReportChart();

    // 先做 JD 解读，再给 点评——点评需要参考解读出来的内容
    await sleep(320 * speed);
    if (aborted) return false;
    await runJdModule(data, speed);
    if (aborted) return false;

    await sleep(240 * speed);
    if (aborted) return false;
    if (data.analysis.conclusion) await streamText(verdictLine, data.analysis.personalNote ? stopEnd(data.analysis.conclusion) : data.analysis.conclusion, 46);
    await sleep(220);
    if (aborted) return false;
    renderVerdictHead(data);
    renderVerdictHints(data);
    // 点评的后半段（针对用户）：有简历才有，紧接在前半段后面逐字出现
    const note = String((data && data.analysis.personalNote) || '').trim();
    if (note) {
      personalText.textContent = '';
      await sleep(260);
      if (aborted) return false;
      await streamText(personalText, note, 46);
    }
    return true;
  }

  // 报告头：岗位名，点评排在它下面
  function renderVerdictHead(data) {
    const job = (data && data.source && data.source.job) || {};
    const jobEl = $('verdictJob');
    if (jobEl) {
      jobEl.textContent = job.title || '';
      jobEl.hidden = !job.title;
    }
    // 点评后半段：针对这位用户的结论，和前半段连成一段；没有简历时为空
    const sub = String((data && data.analysis.personalNote) || '').trim();
    if (sub) verdictLine.textContent = stopEnd(verdictLine.textContent || data.analysis.conclusion || '');
    personalText.textContent = sub;
  }

  /* ---------- 报告页底部的职位对比图（一屏一张图，点图名换图） ---------- */

  let reportChartId = 'growthstep';
  let reportHighlightUrl = '';

  // 图名：散点图在「时薪」口径下名字跟着变
  const chartTitleOf = (id) => (id === 'scatter' && payMetric === 'hourly'
    ? '预计时薪、年均休息日分析'
    : CHART_TITLES[id]);

  /* 只负责「把图渲染进 #reportChartSlot」：显隐一律不碰——什么时候露面交给 revealReportChart，
     所以城市数据异步补回来时可以随时重画（提前画也只是画在还藏着的容器里） */
  function renderReportChart() {
    const host = $('reportChartSlot');
    if (!host || !lastReportData) return;
    host.innerHTML = '';

    // 固定大标题「职位对比」，换图靠它下面那颗图名按钮
    const head = document.createElement('div');
    head.className = 'section-head';
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = '职位对比';
    head.appendChild(title);
    host.appendChild(head);

    const picker = document.createElement('div');
    picker.className = 'chart-pick';
    // 图名与图自己的选项同一行（现在只有涨幅图有排序开关；换图后这一行跟着重建）
    const pickRow = document.createElement('div');
    pickRow.className = 'chart-pick-row';
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'chart-name';
    name.setAttribute('aria-expanded', 'false');
    name.textContent = chartTitleOf(reportChartId);
    const caret = document.createElement('span');
    caret.className = 'jd-caret';
    caret.setAttribute('aria-hidden', 'true');
    name.appendChild(caret);
    pickRow.appendChild(name);
    if (reportChartId === 'growthstep') pickRow.appendChild(buildGrowthStepSort(renderReportChart));
    picker.appendChild(pickRow);

    const menu = document.createElement('div');
    menu.className = 'chart-menu';
    menu.hidden = true;
    let off = null;
    const closeMenu = () => {
      menu.hidden = true;
      name.setAttribute('aria-expanded', 'false');
      if (off) { document.removeEventListener('click', off); off = null; }
    };
    const openMenu = () => {
      menu.hidden = false;
      name.setAttribute('aria-expanded', 'true');
      // 点空白处收起：用一次性监听，换图后不会残留
      off = (e) => { if (!picker.contains(e.target)) closeMenu(); };
      setTimeout(() => document.addEventListener('click', off), 0);
    };
    for (const key of Object.keys(CHART_TITLES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chart-menu-btn${key === reportChartId ? ' on' : ''}`;
      b.textContent = CHART_TITLES[key];
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        reportChartId = key;
        renderReportChart();
      });
      menu.appendChild(b);
    }
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (menu.hidden) openMenu(); else closeMenu(); }
    });
    picker.appendChild(menu);
    host.appendChild(picker);

    const body = document.createElement('div');
    body.className = 'chart-body';
    host.appendChild(body);
    // 本次分析的岗位在图上颜色最深（各张图口径一致）
    reportHighlightUrl = jdUrl || (lastReportData && lastReportData.source && lastReportData.source.url) || '';
    try {
      CHART_RENDERERS[reportChartId](body, { redraw: renderReportChart });
    } finally {
      reportHighlightUrl = '';
    }
  }

  /* 「露面」：数据分析图第一次出场时把槽位打开，并放一段淡入落下。
     渲染与显隐分开各管各的——重画（换图 / 城市数据回来）不动显隐，出场只由这里发生 */
  function revealReportChart() {
    const h = $('reportChartSlot');
    if (!h) return;
    h.hidden = false;
    h.classList.add('grow-in');
    setTimeout(() => h.classList.remove('grow-in'), 700);
  }

  /* ---------- 职位描述解读：结构化区块 + 流式生长 + 荧光笔标记 ---------- */

  // 收集正文里的文本节点（跳过小标题），按文档顺序返回，供荧光笔定位
  function collectJdTextNodes(root) {
    const walker = document.createTreeWalker(root || jdBody, NodeFilter.SHOW_TEXT);
    const out = [];
    let n = walker.nextNode();
    while (n) {
      if (n.data.trim() && !(n.parentElement && n.parentElement.closest('.jd-block-title'))) out.push(n);
      n = walker.nextNode();
    }
    return out;
  }

  function jdItemNode(block, text) {
    if (block.type === 'list') {
      const p = document.createElement('p');
      p.className = 'jd-li';
      p.textContent = text;
      return p;
    }
    if (block.type === 'tags') {
      const s = document.createElement('span');
      s.className = 'jd-tag';
      s.textContent = text;
      return s;
    }
    if (block.type === 'kv') {
      const row = document.createElement('p');
      row.className = 'jd-kv';
      const cut = text.search(/[:：]/);
      if (cut > 0 && cut <= 12) {
        const k = document.createElement('span');
        k.className = 'jd-k';
        k.textContent = text.slice(0, cut);
        const v = document.createElement('span');
        v.className = 'jd-v';
        v.textContent = text.slice(cut + 1).trim();
        row.appendChild(k);
        row.appendChild(v);
      } else {
        const v = document.createElement('span');
        v.className = 'jd-v jd-v-wide';
        v.textContent = text;
        row.appendChild(v);
      }
      return row;
    }
    const p = document.createElement('p');
    p.className = 'jd-p';
    p.textContent = text;
    return p;
  }

  function jdBlockShell(block) {
    const sec = document.createElement('section');
    sec.className = 'jd-block jd-line';
    const head = document.createElement('h3');
    head.className = 'jd-block-title';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    const label = document.createElement('span');
    label.className = 'jd-block-name';
    label.textContent = block.title || '职位信息';
    const caret = document.createElement('span');
    caret.className = 'jd-caret';
    caret.setAttribute('aria-hidden', 'true');
    head.appendChild(label);
    head.appendChild(caret);
    const toggle = () => {
      const willCollapse = !sec.classList.contains('collapsed');
      sec.classList.toggle('collapsed', willCollapse);
      if (willCollapse) refreshPeek(sec);
      syncJdTitle();
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    // 折叠时，划线内容不隐藏，按顺序列在标题下
    const peek = document.createElement('div');
    peek.className = 'jd-peek';
    const body = document.createElement('div');
    body.className = 'jd-block-body';
    const inner = document.createElement('div');
    inner.className = `jd-block-inner jd-type-${block.type}`;
    body.appendChild(inner);
    sec.appendChild(head);
    sec.appendChild(peek);
    sec.appendChild(body);
    return { sec, inner, peek };
  }

  // 把这一节里的划线条目，按出现顺序列到折叠后的标题下方
  function refreshPeek(sec) {
    const peek = sec.querySelector('.jd-peek');
    if (!peek) return;
    peek.textContent = '';
    for (const { mark, el } of sec._marks || []) {
      const row = document.createElement('p');
      row.className = 'jd-peek-item';
      const clone = el.cloneNode(true);
      clone.classList.add('hl-peek');
      clone.addEventListener('click', () => {
        sec.classList.remove('collapsed');
        toggleNote(mark, el);
      });
      row.appendChild(clone);
      peek.appendChild(row);
    }
  }

  // 点「职位描述解读」标题：一次收起全部小节（只剩标题与划线），再点展开全部
  function syncJdTitle() {
    const blocks = Array.from(jdBody.querySelectorAll('.jd-block'));
    jdTitleEl.classList.toggle('all-collapsed', blocks.length > 0 && blocks.every((b) => b.classList.contains('collapsed')));
  }

  function toggleAllBlocks() {
    const blocks = Array.from(jdBody.querySelectorAll('.jd-block'));
    if (!blocks.length) return;
    const collapseAll = blocks.some((b) => !b.classList.contains('collapsed'));
    for (const b of blocks) {
      if (collapseAll) refreshPeek(b);
      b.classList.toggle('collapsed', collapseAll);
    }
    syncJdTitle();
  }

  jdTitleEl.addEventListener('click', toggleAllBlocks);
  jdTitleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAllBlocks(); }
  });

  // 结构化区块逐条"生长"出现
  async function streamBlocks(blocks, pace) {
    jdBody.innerHTML = '';
    const total = blocks.reduce((a, b) => a + b.items.length + 1, 0);
    let done = 0;
    const tick = () => {
      done++;
      jdRing.setProgress(0.55 * (done / total));
    };
    let bi = 0;
    for (const block of blocks) {
      if (aborted) return [];
      bi++;
      jdRing.setLabel(`正在读取「${block.title || '正文'}」（${bi}/${blocks.length}）`);
      const { sec, inner } = jdBlockShell(block);
      jdBody.appendChild(sec);
      await nextFrame();
      sec.classList.add('jd-in');
      tick();
      await sleep(90 * pace);
      for (const text of dedupeBlockItems(block.items)) {
        if (aborted) return [];
        const node = jdItemNode(block, text);
        node.classList.add('jd-line');
        inner.appendChild(node);
        await nextFrame();
        node.classList.add('jd-in');
        tick();
        await sleep(46 * pace);
      }
      // 薪资没读到：把 ? 挂到已有的薪资行上；没有这一行才补一行。
      // 说明框紧跟在薪资行下面（不是模块底部）
      if (block === blocks[0] && salaryMissing(lastReportData)) {
        if (aborted) return [];
        let row = Array.from(inner.querySelectorAll('.jd-kv')).find((r) => /薪|待遇/.test(r.textContent));
        if (!row) {
          row = jdItemNode({ type: 'kv' }, '薪资：未读到');
          row.classList.add('jd-line');
          inner.appendChild(row);
          await nextFrame();
          row.classList.add('jd-in');
          tick();
        }
        const hint = buildSalaryHint(null, lastReportData);
        row.appendChild(hint.q);
        row.insertAdjacentElement('afterend', hint.box);
        salaryRowEl = row;
        await sleep(46 * pace);
      }
    }
    return collectJdTextNodes();
  }

  // 在已渲染的正文里，按顺序逐条打荧光笔
  function sweepMark(pieces, from, mark) {
    for (let i = from; i < pieces.length; i++) {
      const node = pieces[i];
      if (!node || !node.data) continue;
      // 已经画过荧光笔的节点不再包第二层（重复扫标/重复标记的防呆）
      if (node.parentElement && node.parentElement.closest('mark')) continue;
      const at = node.data.indexOf(mark.text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + mark.text.length);
      const el = document.createElement('mark');
      el.className = `hl hl-${mark.level}`;
      try {
        range.surroundContents(el);
      } catch (e) {
        return -1;
      }
      void el.offsetWidth; // 先落色带起点，再触发过渡
      el.classList.add('on');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => toggleNote(mark, el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNote(mark, el); }
      });
      const tail = el.nextSibling;
      pieces[i] = tail && tail.nodeType === 3 ? tail : null;
      const sec = el.closest('.jd-block');
      if (sec) {
        if (!sec._marks) sec._marks = [];
        sec._marks.push({ mark, el });
        if (sec.classList.contains('collapsed')) refreshPeek(sec);
      }
      return i;
    }
    return -1;
  }

  async function runJdModule(data, speed) {
    const blocks = Array.isArray(data.source.jdBlocks) ? data.source.jdBlocks : [];
    // 没有结构就不展示这个模块（不设计降级兜底）
    if (!blocks.length) return;
    noteEl = null;
    noteMark = null;

    const pace = Math.max(0.55, speed);
    jdSection.hidden = false;
    await nextFrame();
    jdSection.classList.add('grown');
    jdRing.show();
    jdRing.setLabel(`正在整理职位描述（共 ${blocks.length} 节）`);
    await sleep(520 * pace);
    if (aborted) return;

    // 1) 正文按区块（或纯文本）逐条生长出现
    const pieces = await streamBlocks(blocks, pace);
    if (aborted) return;
    await sleep(260 * pace);
    if (aborted) return;

    // 2) 从开头开始，逐条用荧光笔标记
    const usable = (data.analysis.jdMarks || []).filter((m) => m && typeof m.text === 'string'
      && pieces.some((n) => n && n.data.includes(m.text)));
    jdRing.setLabel(usable.length ? `正在逐条标记风险与不利信息（${usable.length} 处）` : '正在通读职位描述');
    await sleep(200 * pace);

    let from = 0;
    let applied = 0;
    for (const m of usable) {
      if (aborted) return;
      const idx = sweepMark(pieces, from, m);
      if (idx >= 0) {
        from = idx;
        applied++;
        jdRing.setProgress(0.55 + (applied / usable.length) * 0.45);
      }
      await sleep(230 * pace);
    }

    jdRing.setProgress(1);
    jdRing.setLabel('解读完成');
    await sleep(900 * pace);
    if (!aborted) jdRing.hide();
  }

  /* ---------- 划线解读卡 ---------- */

  let noteEl = null;
  let noteMark = null;

  function closeNote() {
    if (!noteEl) return;
    const el = noteEl;
    const host = el.parentElement;
    noteEl = null;
    noteMark = null;
    el.classList.remove('open');
    if (host) host.classList.remove('has-note');
    setTimeout(() => { if (!el.classList.contains('open')) el.remove(); }, 360);
  }

  function buildNote(mark) {
    const wrap = document.createElement('div');
    wrap.className = 'jd-note';
    const inner = document.createElement('div');
    inner.className = 'jd-note-inner';
    const card = document.createElement('div');
    card.className = 'jd-note-card';

    const cat = document.createElement('p');
    cat.className = 'jd-note-cat';
    cat.textContent = `${mark.cat || '其他'} · ${mark.level === 'high' ? '高危' : '不利'}`;
    card.appendChild(cat);

    const why = document.createElement('p');
    why.className = 'jd-note-why';
    why.textContent = mark.why || '';
    card.appendChild(why);

    // 引用：只在有外部依据时出现，给出机构、文件名与条款、原句，并可跳转官方入口
    const cite = mark.cite;
    if (cite) {
      const box = document.createElement('div');
      box.className = 'jd-note-cite';
      const label = document.createElement('span');
      label.className = 'jd-note-cite-label';
      label.textContent = '引用';
      box.appendChild(label);
      const text = document.createElement('span');
      text.className = 'jd-note-cite-text';
      text.textContent = `${cite.org}，${cite.doc}，“${cite.quote}”`;
      box.appendChild(text);
      if (cite.url) {
        const a = document.createElement('a');
        a.href = cite.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `${cite.linkLabel || '查看原文'} ↗`;
        box.appendChild(a);
      }
      card.appendChild(box);
    }

    inner.appendChild(card);
    wrap.appendChild(inner);
    return wrap;
  }

  function toggleNote(mark, el) {
    if (noteEl && noteMark === el) {
      closeNote();
      return;
    }
    closeNote();
    const note = buildNote(mark);
    const tagBox = el.closest('.jd-type-tags');
    const item = el.closest('.jd-li, .jd-p, .jd-kv');
    if (tagBox) {
      tagBox.appendChild(note);
    } else if (item && item.parentElement) {
      item.parentElement.insertBefore(note, item.nextSibling);
      item.classList.add('has-note');
    } else {
      (el.closest('.jd-block-inner') || jdBody).appendChild(note);
    }
    void note.offsetWidth;
    note.classList.add('open');
    noteEl = note;
    noteMark = el;
  }

  /* ---------- 历史记录（存浏览器本地，无文件、无服务端） ---------- */

  const HISTORY_KEY = 'ai-jd-history-v1';
  // 滚动备份：清站点数据、换浏览器配置、误清都会把主副本抹掉，留一份最近几条做兜底
  const HISTORY_BAK_KEY = 'ai-jd-history-v1.bak';
  const HISTORY_BAK_MAX = 5;
  const HISTORY_MAX = 30;
  const HISTORY_PAGE_SIZE = 10;
  let historyPage = 0;
  let historySortMode = 'recent';
  // 方向：默认反序（高的 / 新的在前），切到 asc 就是顺序
  let historySortDir = 'desc';
  // 正在等「删除 / 取消」的那条记录：删之前先在行内问一句（和 V2 的删除确认一致）
  let historyConfirmId = '';
  const historyList = $('historyList');
  const historySort = $('historySort');
  const historyDirBtn = $('historyDirBtn');
  const recentList = $('recentList');
  const btnHistoryTop = $('btnHistoryTop');
  // 首页「最近报告」预览放最近 3 条（用户口径：默认展开、展示 3 个项目）
  const RECENT_MAX = 3;
  // 分析一次要串好几个模型调用；给 3 分钟。等太久会让人以为卡死（服务端其实还在跑），
  // 3 分钟是「慢模型也基本能出结果」与「别让人干等」的折中。
  const ANALYZE_TIMEOUT_MS = 180 * 1000;

  /* ---------- 收藏（心）：档案被收藏后，在各张分析图上用次深的一档颜色 ---------- */

  const FAV_KEY = 'ai-jd-fav-v1';

  // 集合里存的是「档案键」（链接优先，同一份报告只留最新一条就按链接认；老档案退回 id）
  function loadFavs() {
    try {
      const list = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(list) ? list.filter((k) => typeof k === 'string' && k) : [];
    } catch {
      return [];
    }
  }

  function saveFavs(list) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...new Set(list.filter((k) => typeof k === 'string' && k))]));
    } catch { /* 超配额或隐私模式下静默失败，不影响已经生成的分析 */ }
  }

  function favKeyOf(rec) {
    return (rec && (rec.url || (rec.data && rec.data.source && rec.data.source.url) || rec.id)) || '';
  }

  function isFavRec(rec) {
    const key = favKeyOf(rec);
    return !!key && loadFavs().includes(key);
  }

  // 点一下收藏 / 取消收藏，返回变完之后的状态（true ＝ 已收藏）
  function toggleFav(rec) {
    const key = favKeyOf(rec);
    if (!key) return false;
    const list = loadFavs();
    const i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else list.push(key);
    saveFavs(list);
    return i < 0;
  }

  // 档案没了（删掉 / 被 HISTORY_MAX 截断）就顺手把它的收藏键收掉，别在集合里攒死键
  function pruneFavs(list) {
    const alive = new Set((list || []).map(favKeyOf));
    const now = loadFavs();
    const kept = now.filter((k) => alive.has(k));
    if (kept.length !== now.length) saveFavs(kept);
  }

  // 把薪资文本折算成"月薪 K"，用于排序（日薪按 21.75 天折算）
  function salaryMonthlyK(s) {
    const t = String(s || '');
    if (!t) return -1;
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return -1;
    const hi = Math.max(...nums);
    if (/\/天|元\/?天|日薪/.test(t)) return (hi * 21.75) / 1000;
    if (/万/.test(t)) return hi * 10;
    if (/[Kk千]/.test(t)) return hi;
    if (hi > 1000) return hi / 1000;
    return hi;
  }

  // 薪资统一成「K × 月数」的写法：30k-60k → 30–60K；2.5-3.5万元 → 25–35K；
  // 6000 元/月 × 12 个月 → 6K × 12；3-6万元·16月 → 30–60K × 16（认不出月数就不写 ×）
  function salaryKText(s) {
    let t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    // 月数先从串里拿出来：它是“发几个月”，不是薪资区间的第二个数
    const m = t.match(/(\d+)\s*薪|(\d+)\s*个月|(\d+)\s*月/);
    const months = m ? (m[1] || m[2] || m[3]) : '';
    if (m) t = t.replace(m[0], ' ');
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return '';
    const toK = (v) => {
      if (/\/天|元\/?天|日薪|每天/.test(t)) return (v * 21.75) / 1000;
      if (/万/.test(t)) return v * 10;
      if (/[Kk千]/.test(t)) return v;
      return v >= 1000 ? v / 1000 : v;
    };
    const fmt = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(1));
    const ks = nums.slice(0, 2).map((v) => fmt(toK(v)));
    const range = ks.length >= 2 ? `${ks[0]}–${ks[1]}K` : `${ks[0]}K`;
    return range + (months ? ` × ${months}` : '');
  }

  /* 排序：字段 × 方向。缺失值（-1 / undefined）不跟着方向翻，永远沉到最后；
     同值时按时间新的在前兜底。 */
  function sortHistory(list) {
    const dimScore = (rec, key) => {
      const hit = (rec.dims || []).find((d) => d && d.key === key);
      const n = Number(hit && hit.score);
      // 记录里的 dims 形如 [{key, score}]，没跑过这条维度（老记录）当缺失
      return Number.isFinite(n) && n > 0 ? n : -1;
    };
    // 休息时间按「年均休息日」比：优先记录里戳好的 restRange.est
    const restDays = (rec) => {
      const est = Number((((rec.data || {}).analysis || {}).restRange || {}).est);
      return Number.isFinite(est) && est > 0 ? est : -1;
    };
    const pick = {
      recent: (r) => Number(r.savedAt) || 0,
      salary: (r) => salaryMonthlyK(r.job && r.job.salary),
      score: (r) => Math.round(Number(r.overall)) || 0,
      // 按原始分排：撇开「你的简历配不配得上」，只看岗位本身值多少
      base: (r) => scoreDenom(r.data && r.data.analysis),
      growth: (r) => dimScore(r, 'growth'),
      stable: (r) => dimScore(r, 'aiProof'),
      rest: restDays,
    }[historySortMode] || ((r) => Number(r.savedAt) || 0);
    const asc = historySortDir === 'asc';
    const arr = list.slice();
    arr.sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      const hasA = Number.isFinite(va) && va >= 0;
      const hasB = Number.isFinite(vb) && vb >= 0;
      if (hasA !== hasB) return hasA ? -1 : 1;
      if (hasA && va !== vb) return asc ? va - vb : vb - va;
      return (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0);
    });
    return arr;
  }

  // 三层结构之前存的老记录：打开时按字段映射搬进 source / analysis / reference，
  // 记录层自己的快照字段（rec.job / rec.overall / rec.dims / rec.jdRaw）保持不动
  function migrateRecord(rec) {
    const d = rec && rec.data;
    if (!d || typeof d !== 'object') return rec;
    if (d.source || d.analysis) {
      // 已经是新结构：只补齐缺掉的那一层，免得下游少一层就报错
      return {
        ...rec,
        data: {
          ...d,
          source: d.source || {},
          analysis: d.analysis || {},
          reference: d.reference || { cityData: null },
        },
      };
    }
    if (!d.job && !d.dimensions) return rec;
    const {
      job, jdBlocks, jdText, jdRaw, sourceUrl,
      dimensions, jdMarks, conclusion, personalNote, restBrief, restSource, restNote,
      overall, overallMax, baseScore, matchMultiplier, payCalc, hasResume, resumeStamp,
      salaryInput, deps, restRange, cityData,
      ...rest
    } = d;
    return {
      ...rec,
      data: {
        ...rest,
        source: {
          job: job || {}, jdBlocks: jdBlocks || [], jdText: jdText || '', jdRaw: jdRaw || (rec && rec.jdRaw) || '',
          url: sourceUrl || (rec && rec.url) || '',
        },
        analysis: {
          dimensions: dimensions || [], jdMarks: jdMarks || [],
          conclusion, personalNote, restBrief, restSource, restNote,
          overall, overallMax, baseScore, matchMultiplier, payCalc, hasResume, resumeStamp,
          salaryInput, deps, restRange,
        },
        reference: { cityData: cityData || null },
      },
    };
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      // 老版本写入或写到一半的记录字段形状可能不同，归一化掉，别让一条脏记录中断整页渲染
      return list
        .filter((r) => r && typeof r === 'object')
        .map((r) => migrateRecord({ ...r, dims: Array.isArray(r.dims) ? r.dims : [] }));
    } catch {
      return [];
    }
  }

  // 主副本被外部清空（清站点数据 / 换浏览器 / 误清）时，从滚动备份里恢复最近几条
  function restoreHistoryFromBackup() {
    try {
      if (loadHistory().length) return 0;
      const bak = JSON.parse(localStorage.getItem(HISTORY_BAK_KEY) || '[]');
      if (!Array.isArray(bak) || !bak.length) return 0;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(bak));
      return bak.length;
    } catch {
      return 0;
    }
  }

  /* ---------- 服务端镜像：档案全量同步（去抖 2 秒） ----------
     localStorage 仍是唯一数据源：这里只把「当前那份档案列表」整份镜像到服务端存档
     （/api/archive/sync 幂等，服务端整份替换）。失败静默——离线、服务端没部署都不影响
     任何本地行为，下次落盘再同步一遍。挂在 saveHistory() 后面，覆盖新增/删除/重算等所有落盘路径。 */
  let mirrorTimer = null;
  function mirrorHistory() {
    if (!T.clientId) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      let records = [];
      try {
        records = loadHistory();
      } catch {
        return;
      }
      fetch('/api/archive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ clientId: T.clientId, records }),
      }).catch(() => { /* 静默：镜像失败不影响本地 */ });
    }, 2000);
  }

  function saveHistory(list) {
    // 截断时先丢内置参照档案：用户自己的档案排在前面，被挤掉的永远是 seed（sort 稳定，两组内部顺序都不动）
    const keep = list
      .slice()
      .sort((a, b) => ((a && a.seed === true) ? 1 : 0) - ((b && b.seed === true) ? 1 : 0))
      .slice(0, HISTORY_MAX);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(keep));
      localStorage.setItem(HISTORY_BAK_KEY, JSON.stringify(keep.slice(0, HISTORY_BAK_MAX)));
      pruneFavs(keep);
    } catch {
      // 超配额或隐私模式下静默失败，不影响分析本身
    }
    renderDataAnalysis();
    mirrorHistory();
  }

  // 一条历史 = 完整分析结果 + 少量列表用字段（同一份报告只留最新一条，按链接认）
  // 每次生成/更新分析时就把休息偏离度算出来，随档案一起存（不再等看图才算）
  function stampRestRange(data) {
    if (!data || typeof data !== 'object') return;
    const r = restRangeOf(data);
    data.analysis.restSource = r.source;
    data.analysis.restRange = { est: r.est, lo: r.lo, dev: r.dev, source: r.source, at: Date.now() };
  }

  function recordHistory(url, data) {
    if (!url || !data || !data.ok) return;
    stampRestRange(data);
    const job = data.source.job || {};
    // 记录里的 url 一律以分析时用的链接为准，落库时同时写进 data.source.url，
    // 这样这条记录自己被打开时，仍能认回原链接（补薪资、简历重算都靠它）
    data.source.url = url;
    const list = loadHistory().filter((r) => r.url !== url);
    list.unshift({
      id: `${Date.now()}`,
      url,
      jdRaw: data.source.jdRaw || '',
      savedAt: Date.now(),
      job,
      overall: data.analysis.overall,
      dims: (data.analysis.dimensions || []).map((d) => ({ key: d.key, score: d.score })),
      data,
    });
    saveHistory(list);
    renderHistory();
  }

  /* 历史档案评分重算：把已经存下来的报告按当前口径重新算一遍分数。
     时机只有一个——口径升号（SCORE_VERSION 变了）或这条记录根本没存过版本号：进页面时自动补一次，
     用户不需要、也没有手动重算的入口。
     纯本地规则计算：只用档案里已经存下来的六维分，不联网、不调模型、也不重新读 JD。
     总分 / 原始分 / 匹配度系数三个数必须一起换——它们是一组，只改一个图就对不上。
     返回真正被改写的条数。 */
  function refreshArchiveScores() {
    if (!ScoreModel) return 0;
    const V = ScoreModel.SCORE_VERSION;
    let changed = 0;
    const list = loadHistory().map((rec) => {
      const a = rec.data && rec.data.analysis;
      if (!a || !Array.isArray(a.dimensions) || !a.dimensions.length) return rec;
      if (a.scoreVersion === V) return rec;
      // 由代码算分的两维要跟着口径走：
      //   双休假期——梯度表 + 劳动强度降档，用档案里存的 restMeta；
      //   发展空间——用档案里存的 growthCalc 重算：官方口径（basis=official）按官方分位点重算 K，
      //     拟合口径按 μ/σ + 两条社平重算 k′；两层都算，档案里存了 JD 报价就折进主观层 K₂
      //     （读的仍是档案里那一份 JD 的报价，不重读原文）；都是纯本地计算、天然幂等。
      // 发展空间的派生字段（b/t、k′、k1、落档）也要一起落回档案——只改分不改这些，
      // 「依据」面板会拿旧口径的数去解释新口径的分。
      // 旧档案（36 格表时期 / 折进模型时期）没有 growthCalc 就无从重算，保留原分——不猜、也不报错，重分析一次即可换新口径。
      let growthCalc = a.growthCalc;
      let payCalc = a.payCalc;
      const dimensions = a.dimensions.map((d) => {
        if (d.key === 'rest') return { ...d, score: ScoreModel.restScore(a.restMeta, a.restBrief) };
        // 薪资：刻度随档案存着（锚点 + 11 个档位下界），照当前口径重建后重算——不联网、不重读原文、天然幂等。
        // 「重建」这一步不能省：v19 存下的是「一条 σ 走到底」的刻度，锚点一样但档位下界不同，
        // 直接拿旧 lines 落档会把旧口径的分原样留下，版本号却已经翻新。
        // v18 及以前没存 ladder 的档案无从重算，保留原分（重分析一次即换新口径）。
        if (d.key === 'pay' && payCalc && payCalc.ladder) {
          const L0 = payCalc.ladder;
          const anchors = ScoreModel.payAnchorsOf(L0.median, L0.minWage, null);
          const lines = ScoreModel.payLinesOf(anchors);
          const band = ScoreModel.payBandOf(payCalc.monthly, lines);
          if (band != null) {
            payCalc = { ...payCalc, band, ladder: { ...L0, ...anchors, percents: ScoreModel.PAY_BAND_PERCENTS, lines } };
            return { ...d, score: band };
          }
        }
        if (d.key === 'growth' && growthCalc) {
          if (growthCalc.basis === 'official') {
            // 官方口径（v15）：公式与城市刻度都在 public/score.js 里，档案只存三个分位点与 JD 报价就够了
            const q = { p20: growthCalc.p20, p50: growthCalc.p50, p80: growthCalc.p80 };
            const jd = (growthCalc.jdLow > 0 && growthCalc.jdHigh > growthCalc.jdLow)
              ? { low: growthCalc.jdLow, high: growthCalc.jdHigh } : null;
            const now = ScoreModel.growthScoreOfJd(growthCalc.city, q, jd) || ScoreModel.growthScoreOf(growthCalc.city, q);
            if (now) {
              growthCalc = {
                ...growthCalc, c: now.ladder.c, r1: now.r1, r2: now.r2, K: now.K,
                layer: now.usedJd ? 'jd' : 'occupation',
                jdMid: now.usedJd ? now.mid : null,
                score: now.score,
              };
              return { ...d, score: now.score };
            }
            return d;
          }
          // 拟合口径：客观层（μ/σ）＋主观层（档案里存的那份 JD 报价，读不到就只有客观层）
          const jdFit = (growthCalc.jdLow > 0 && growthCalc.jdHigh > growthCalc.jdLow)
            ? { low: growthCalc.jdLow, high: growthCalc.jdHigh } : null;
          const base = ScoreModel.growthSpaceScore(growthCalc);
          const r = (jdFit ? ScoreModel.growthSpaceScoreJd(growthCalc, jdFit) : null) || base;
          if (r) {
            // 只落回这一维留下的字段（v13 起没有修正层的系数与薪资项）
            growthCalc = {
              basis: growthCalc.basis,
              job: growthCalc.job,
              city: growthCalc.city,
              mu: growthCalc.mu,
              sigma: growthCalc.sigma,
              nonpriv: growthCalc.nonpriv,
              priv: growthCalc.priv,
              b: Math.round(r.b),
              t: Math.round(r.t),
              r1: Number(r.r1.toFixed(4)),
              r2: Number(r.r2.toFixed(4)),
              r1Base: base ? Number(base.r1.toFixed(4)) : null,
              r2Base: base ? Number(base.r2.toFixed(4)) : null,
              k: Number(r.k.toFixed(3)),
              K: Number(r.k.toFixed(3)),
              K1: base ? Number(base.k.toFixed(3)) : null,
              K2: r.usedJd ? Number(r.k.toFixed(3)) : null,
              layer: r.usedJd ? 'jd' : 'occupation',
              jdLow: r.usedJd ? jdFit.low : null,
              jdHigh: r.usedJd ? jdFit.high : null,
              jdMid: r.usedJd ? r.mid : null,
              lowBase: r.lowBase,
              score: r.score,
              confidence: growthCalc.confidence,
              samples: growthCalc.samples,
              source: growthCalc.source,
              estimated: growthCalc.estimated,
              ref: growthCalc.ref,
            };
            return { ...d, score: r.score };
          }
        }
        return d;
      });
      const s = ScoreModel.scoresOf(dimensions);
      const same = a.overall === s.overall && a.baseScore === s.baseScore
        && a.matchMultiplier === s.matchMultiplier
        && a.dimensions.every((d, i) => d.score === dimensions[i].score);
      // 分与版本号都要落回档案：只落分不落版本号，下次进页面会白重算一遍
      if (same && a.scoreVersion === V) return rec;
      changed++;
      return {
        ...rec,
        overall: s.overall,
        dims: dimensions.map((d) => ({ key: d.key, score: d.score })),
        data: {
          ...rec.data,
          analysis: {
            ...a,
            dimensions,
            growthCalc,
            payCalc,
            overall: s.overall,
            baseScore: s.baseScore,
            matchMultiplier: s.matchMultiplier,
            scoreVersion: V,
          },
        },
      };
    });
    if (changed) saveHistory(list);
    return changed;
  }

  /* 旧档案的发展潜力补课：36 格表时期（v9 以前）的档案只存了分数、没存分布依据（growthCalc），
     前端算不出来——官方工资价位表与分布库都在后端，所以按需问一次 /api/growth-rescore。
     它不联网、不读 JD，纯查库；查到就把这一维与 growthCalc 落回档案，总分一起换。
     一次会话里每条只问一次：失败（比如那个职业哪儿都查不到）就跳过，不反复打服务器。 */
  const growthHealTried = new Set();
  let growthHealing = false;
  async function healGrowthCalcs() {
    if (growthHealing) return;
    const need = loadHistory().filter((rec) => {
      if (growthHealTried.has(rec.id)) return false;
      const a = (rec.data && rec.data.analysis) || {};
      if (a.growthCalc) return false;
      const d = (a.dimensions || []).find((x) => x.key === 'growth');
      const job = (rec.data && rec.data.source && rec.data.source.job) || {};
      return !!d && !!String(job.title || '').trim() && !!String(job.city || '').trim();
    });
    if (!need.length) return;
    growthHealing = true;
    let changed = 0;
    for (const rec of need) {
      growthHealTried.add(rec.id);
      try {
        const job = rec.data.source.job || {};
        const r = await postJson('/api/growth-rescore',
          { job: { title: job.title, city: job.city, salary: job.salary } }, 30000);
        if (!r || !r.ok || !r.found || !r.dimension) continue;
        const list = loadHistory().map((x) => {
          if (x.id !== rec.id) return x;
          const a = (x.data && x.data.analysis) || {};
          const dimensions = (a.dimensions || []).map((d) => (d.key === 'growth' ? { ...d, ...r.dimension } : d));
          const s = ScoreModel ? ScoreModel.scoresOf(dimensions) : null;
          return {
            ...x,
            overall: s ? s.overall : x.overall,
            dims: dimensions.map((d) => ({ key: d.key, score: d.score })),
            data: {
              ...(x.data || {}),
              analysis: {
                ...a,
                dimensions,
                growthCalc: r.growthCalc,
                overall: s ? s.overall : a.overall,
                baseScore: s ? s.baseScore : a.baseScore,
                matchMultiplier: s ? s.matchMultiplier : a.matchMultiplier,
                scoreVersion: ScoreModel ? ScoreModel.SCORE_VERSION : a.scoreVersion,
              },
            },
          };
        });
        saveHistory(list);
        changed++;
      } catch (e) {
        // 单条失败不影响其他档案：跳过去，这次会话不再重试
      }
    }
    growthHealing = false;
    if (changed) {
      renderHistory();
      renderDataAnalysis();
    }
  }

  // 列表一行的展示字段：职位名（没解析出来就退到 JD 第一行）、灰 meta（薪资 · 休息 · 城市 · 公司 · 日期）
  function historyTitle(rec) {
    const j = (rec && rec.job) || {};
    if (j.title) return j.title;
    const first = String((rec.data && rec.data.source && rec.data.source.jdText) || '')
      .split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    return first ? (first.length > 28 ? `${first.slice(0, 28)}…` : first) : '未命名岗位';
  }

  // 行上的灰字：只写薪资和公司（用户定的口径，别往里塞城市/日期/口径说明）
  function historyMeta(rec) {
    const j = (rec && rec.job) || {};
    return [salaryKText(j.salary), j.company].filter(Boolean).join(' · ') || '—';
  }

  // 行内确认里的文字按钮（下划线那种，沿用 V1 的 .link-btn）
  function historyLinkBtn(label, onclick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn';
    btn.textContent = label;
    btn.addEventListener('click', onclick);
    return btn;
  }

  // 历史档案页：排序行 + 列表（每页 10 条），空态一句说明；渲染完顺带刷新首页「最近报告」
  function renderHistory() {
    const all = loadHistory();
    const pending = sortSelfPending(loadSelfPending());
    // 只有「待分析的自述」和已分析档案都空着，才算是真的没有历史档案
    if (!all.length && !pending.length) { renderHistoryEmpty(); renderRecent(); return; }
    const list = sortHistory(all);
    const pages = Math.max(1, Math.ceil(list.length / HISTORY_PAGE_SIZE));
    historyPage = Math.min(historyPage, pages - 1);
    const start = historyPage * HISTORY_PAGE_SIZE;
    const pageItems = list.slice(start, start + HISTORY_PAGE_SIZE);
    historyList.innerHTML = '';

    // 待分析的自述草稿固定在顶部：不参与排序、不参与分页，删掉也留一次撤销
    pending.forEach((rec, i) => {
      const lastPending = !pageItems.length && i === pending.length - 1;

      // 与正式档案同一句问法：说好了再删
      if (historyConfirmId === rec.id) {
        const ask = document.createElement('div');
        ask.className = 'history-item history-confirm';
        const line = document.createElement('p');
        line.className = 'confirm-line';
        line.appendChild(document.createTextNode(`确定删除「${selfTitle(rec)}」？`));
        line.appendChild(historyLinkBtn('删除', () => {
          historyConfirmId = '';
          removeSelfPendingRecord(rec, i);
        }));
        const sep = document.createElement('span');
        sep.className = 'notice-sep';
        sep.textContent = '/';
        line.appendChild(sep);
        line.appendChild(historyLinkBtn('取消', () => { historyConfirmId = ''; renderHistory(); }));
        ask.appendChild(line);
        if (lastPending) ask.classList.add('history-item-last');
        historyList.appendChild(ask);
        return;
      }

      const row = selfPendingRow(rec);
      // × 只负责问一句，不直接删（真删在问句里）
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-del';
      del.textContent = '×';
      del.setAttribute('aria-label', `删除 ${selfTitle(rec)}`);
      del.addEventListener('click', () => { historyConfirmId = rec.id; renderHistory(); });
      row.appendChild(del);
      if (lastPending) row.classList.add('history-item-last');
      historyList.appendChild(row);
    });

    pageItems.forEach((rec, i) => {
      const last = i === pageItems.length - 1;

      // 说好了再删：这一行原地换成一句问句，答案就在句子里（删除 / 取消）
      if (historyConfirmId === rec.id) {
        const ask = document.createElement('div');
        ask.className = 'history-item history-confirm';
        const line = document.createElement('p');
        line.className = 'confirm-line';
        line.appendChild(document.createTextNode(`确定删除「${historyTitle(rec)}」？`));
        line.appendChild(historyLinkBtn('删除', () => {
          historyConfirmId = '';
          removeHistoryRecord(rec, start + i);
        }));
        const sep = document.createElement('span');
        sep.className = 'notice-sep';
        sep.textContent = '/';
        line.appendChild(sep);
        line.appendChild(historyLinkBtn('取消', () => { historyConfirmId = ''; renderHistory(); }));
        ask.appendChild(line);
        if (last) ask.classList.add('history-item-last');
        historyList.appendChild(ask);
        return;
      }

      const row = historyRow(rec);

      // × 只负责问一句，不直接删（真删在问句里）
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-del';
      del.textContent = '×';
      del.setAttribute('aria-label', `删除 ${historyTitle(rec)}`);
      del.addEventListener('click', () => { historyConfirmId = rec.id; renderHistory(); });
      row.appendChild(del);

      if (last) row.classList.add('history-item-last');
      historyList.appendChild(row);
    });

    // 分页：每页 10 条（HISTORY_PAGE_SIZE）
    if (pages > 1) {
      const pager = document.createElement('div');
      pager.className = 'history-pager';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'history-page-btn';
      prev.textContent = '‹';
      prev.disabled = historyPage === 0;
      prev.addEventListener('click', () => { historyPage--; renderHistory(); });
      const label = document.createElement('span');
      label.className = 'history-page-label';
      label.textContent = `${historyPage + 1} / ${pages}`;
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'history-page-btn';
      next.textContent = '›';
      next.disabled = historyPage >= pages - 1;
      next.addEventListener('click', () => { historyPage++; renderHistory(); });
      pager.appendChild(prev);
      pager.appendChild(label);
      pager.appendChild(next);
      historyList.appendChild(pager);
    }
    renderRecent();
  }

  /* 行里那颗心：空心＝没收藏，实心＝已收藏。它就贴在职位的名右侧。
     它是 button 里的一个 span（按钮不能套按钮），点击的分流写在 history-main 的 click 里。
     路径单独抽出来：薪资涨幅分析图的条尾那颗粒小心（heartAt，SVG 里用）用的是同一条路径。 */
  const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09'
    + 'C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  const HEART_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">'
    + `<path d="${HEART_PATH}"/></svg>`;

  function favIcon(rec) {
    const on = isFavRec(rec);
    const icon = document.createElement('span');
    icon.className = 'fav' + (on ? ' on' : '');
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', on ? '取消收藏' : '收藏');
    icon.title = on ? '取消收藏' : '收藏';
    icon.innerHTML = HEART_SVG;
    return icon;
  }

  /* 历史行右端的六维小雷达：把六个维度分画成缩略图，几何与报告页同一套
     （0 分从 r0 起画，不缩成一点）。只画不点——整行的可点区域仍是 history-main 那一个按钮。 */
  const MINI_RADAR = { size: 64, cx: 32, cy: 32, r10: 27, r0: 7 };

  // 一行的六维分：先看记录层快照 rec.dims，缺的那几维回档案里取；一个都没有返回 null
  function dimScoresOf(rec) {
    const at = (list, key) => {
      const d = (list || []).find((x) => x && x.key === key && typeof x.score === 'number' && isFinite(x.score));
      return d ? d.score : null;
    };
    const dims = ((rec.data || {}).analysis || {}).dimensions || [];
    const scores = DIM_KEYS.map((k) => {
      const s = at(rec.dims, k);
      return s != null ? s : at(dims, k);
    });
    return scores.some((v) => v != null) ? scores : null;
  }

  function miniRadarEl(rec) {
    const scores = dimScoresOf(rec);
    if (!scores) return null;
    const M = MINI_RADAR;
    const polar = (i, r) => {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      return { x: M.cx + Math.cos(a) * r, y: M.cy + Math.sin(a) * r };
    };
    const rFor = (s) => M.r0 + (Math.max(0, Math.min(10, s)) / 10) * (M.r10 - M.r0);
    const hex = (r) => [0, 1, 2, 3, 4, 5].map((i) => {
      const p = polar(i, r);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');

    const box = document.createElement('span');
    box.className = 'history-radar';
    const svg = svgEl('svg', {
      viewBox: `0 0 ${M.size} ${M.size}`, width: M.size, height: M.size,
      'aria-hidden': 'true', focusable: 'false',
    });
    // 底盘：0 / 5 / 10 三圈六边形 + 六条轴线（0 分那圈最深，与报告页的层级一致）
    for (const s of [0, 5, 10]) {
      svg.appendChild(svgEl('polygon', {
        points: hex(rFor(s)), fill: 'none', 'stroke-width': 1,
        stroke: s === 0 ? '#e4e4e1' : '#f0f0ee',
      }));
    }
    for (let i = 0; i < 6; i++) {
      const p = polar(i, M.r10);
      svg.appendChild(svgEl('line', {
        x1: M.cx, y1: M.cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1), stroke: '#f0f0ee', 'stroke-width': 1,
      }));
    }
    // 六个分：没采集到的那一维按 0 画（与报告页雷达对 null 的处理一致）
    svg.appendChild(svgEl('polygon', {
      points: scores.map((v, i) => {
        const p = polar(i, rFor(v == null ? 0 : v));
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' '),
      fill: 'rgba(25,25,25,0.055)',
      stroke: '#191919',
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
    }));
    box.appendChild(svg);

    // 小图上没有标签：悬停给一句六维明细，数字都收在这句提示里
    const detail = DIM_KEYS.map((k, i) => `${DIM_NAMES[k]} ${scores[i] == null ? '--' : scores[i]}`).join(' · ');
    box.title = `六维雷达：${detail}`;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `六维雷达：${detail}`);
    return box;
  }

  // 雷达位的空占位：待分析草稿与没有六维分的老档案共用，几行的分数才落在同一列上
  function radarSlot() {
    const slot = document.createElement('span');
    slot.className = 'history-radar';
    slot.setAttribute('aria-hidden', 'true');
    return slot;
  }

  /* 列表一行的主体：职位名 + 灰 meta + 简历标记 + 右端分数对与六维小雷达。
     历史档案页与首页「最近报告」共用这一份，两处长得一样、改动只改一处。 */
  function historyRow(rec) {
    const row = document.createElement('div');
    row.className = 'history-item';

    // 整行的可点区域就这一块（真按钮，键盘回车／空格直接可用）
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'history-main';
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = historyTitle(rec);
    // 名与那颗心同一行：心紧贴着名字右侧，不跟分数、× 挤在行尾
    const head = document.createElement('span');
    head.className = 'history-head';
    head.appendChild(title);
    head.appendChild(favIcon(rec));
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = historyMeta(rec);
    main.appendChild(head);
    main.appendChild(meta);
    // 内置参照档案：淡淡一个小标说明它不是用户自己的档案（比「无简历」那枚更轻一档）
    if (isSeedRec(rec)) {
      const seedTag = document.createElement('span');
      seedTag.className = 'history-tag history-tag-seed';
      seedTag.textContent = '参照';
      seedTag.title = '脱敏的内置参照档案，只用来当图表参照';
      main.appendChild(seedTag);
    }
    // 简历变了/根本没传过：在记录上标出来，避免和当前评分对不上时被误读
    const stamp = localResumeStamp((loadResume() || {}).md || '');
    const recStamp = (rec.data && rec.data.analysis.resumeStamp) || '';
    const tagText = !recStamp ? '无简历' : (recStamp !== stamp ? '简历已更新' : '');
    if (tagText) {
      const tag = document.createElement('span');
      tag.className = 'history-tag';
      tag.textContent = tagText;
      main.appendChild(tag);
    }
    main.addEventListener('click', (e) => {
      // 点心只切换收藏：行自己重画（两个列表一起变），图上的深浅也跟着变
      if (e.target.closest('.fav')) {
        toggleFav(rec);
        renderHistory();
        refreshToneCharts();
        return;
      }
      openHistory(rec);
    });
    row.appendChild(main);

    // 分数对：与报告页同一套数字呈现——大数字 + 灰色「/另一个数」。
    // 贴着右端雷达的左侧（右对齐）：几条档案的分母落在同一条线上，与雷达的间距也一致
    const score = document.createElement('span');
    score.className = 'history-score';
    const pair = scorePairOf({ ...((rec.data && rec.data.analysis) || {}), overall: rec.overall });
    const value = document.createElement('span');
    value.className = 'history-score-value';
    const num = document.createElement('b');
    num.className = 'history-score-num';
    num.textContent = String(pair.main);
    const unit = document.createElement('span');
    unit.className = 'history-score-unit';
    unit.textContent = pair.sub == null ? '' : ` /${pair.sub}`;
    value.appendChild(num);
    value.appendChild(unit);
    score.appendChild(value);
    row.appendChild(score);

    // 右端六维小雷达：没有六维分的记录（比如更早版本的档案）不画图，但雷达位照样占着，
    // 分数列才和别的行对得齐（宽高由 .history-radar 定）
    row.appendChild(miniRadarEl(rec) || radarSlot());
    return row;
  }

  // 首页「最近报告」预览：待分析的自述置顶，已分析的最多 2 条；空着就一行灰字
  function renderRecent() {
    recentList.innerHTML = '';
    const pending = sortSelfPending(loadSelfPending());
    const list = sortHistory(loadHistory()).slice(0, RECENT_MAX);
    if (!pending.length && !list.length) {
      const p = document.createElement('p');
      p.className = 'recent-empty';
      p.textContent = '还没有报告，分析完一条 JD 就会出现在这里。';
      recentList.appendChild(p);
      return;
    }
    const rows = [
      ...pending.map((rec) => selfPendingRow(rec)),
      ...list.map((rec) => historyRow(rec)),
    ];
    rows.forEach((row, i) => {
      if (i === rows.length - 1) row.classList.add('history-item-last');
      recentList.appendChild(row);
    });
  }

  /* 删除一条：先从存储里拿掉，再留 5 秒撤销的机会（撤销按原位置放回）。
     位置按「排好序的那一份」里的下标算，和 V2 一致——恢复后顺序不乱。 */
  function removeHistoryRecord(rec, index) {
    const list = loadHistory();
    const i = list.findIndex((r) => r.id === rec.id);
    const removed = i >= 0 ? list.splice(i, 1)[0] : null;
    saveHistory(list);
    renderHistory();
    if (!removed) return;
    // 服务端缓存同步失效：不然删掉后重新分析同一个 JD 会直接套用旧结果（fromCache），
    // 用户会以为「删了又回来 / 结果还是旧的」。静默失败：删档案本身已经完成。
    if (removed.url) postJson('/api/forget', { url: removed.url }).catch(() => {});
    toast(`已删除「${historyTitle(removed)}」`, 5000, {
      label: '撤销',
      on: () => {
        const back = loadHistory();
        back.splice(Math.max(0, Math.min(index, back.length)), 0, removed);
        saveHistory(back);
        renderHistory();
        toast('已恢复');
      },
    });
  }

  /* 删除一份「待分析 · 自述」草稿：与正式档案同一套「先问一句 → 删除 → 5 秒撤销」，
     只是作用在 pending 那份数组上——正式档案一个字都不动。 */
  function removeSelfPendingRecord(rec, index) {
    const removed = removeSelfPending(rec.id);
    renderHistory();
    if (!removed) return;
    toast(`已删除「${selfTitle(removed)}」`, 5000, {
      label: '撤销',
      on: () => {
        const back = loadSelfPending();
        back.splice(Math.max(0, Math.min(index, back.length)), 0, removed);
        saveSelfPending(back);
        renderHistory();
        toast('已恢复');
      },
    });
  }

  // 一条记录都没有时的空态：说清楚记录存在哪里、怎么才会有，别让人以为坏了
  function renderHistoryEmpty() {
    historyList.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'history-empty';
    const t = document.createElement('p');
    t.className = 'history-empty-title';
    t.textContent = '还没有历史档案';
    const d = document.createElement('p');
    d.className = 'history-empty-note';
    d.textContent = '把一条 JD 分析完，报告会自动存在这里——只存本机浏览器，不联网、不上传。';
    const act = document.createElement('p');
    act.className = 'history-empty-act';
    // 空态里给一条出路：回首页的输入口（与品牌位共用 goHome——就地回首页，不依赖历史栈）
    act.appendChild(historyLinkBtn('去分析一条 JD', goHome));
    box.appendChild(t);
    box.appendChild(d);
    box.appendChild(act);
    historyList.appendChild(box);
  }

  /* ---------- 内置「参照档案」----------
     新用户第一次打开时历史是空的，六张分析图要几条档案才画得出来，散点图的成形门槛是 5 条——
     所以内置 11 条脱敏的真实档案当参照（public/seed-history.json，每条带 seed: true，
     id / url 形如 seed-3 / seed://3）。首次打开自动铺进历史（打一枚「参照」小标），
     用户想清掉自己在历史里删就行——不再给「载入 / 移除参照档案」的开关按钮（用户口径）。 */

  const isSeedRec = (r) => !!(r && r.seed === true);

  // 拉一次内置参照档案文件：失败（离线 / 文件不在 / 不是 JSON）一律当空，不挡主页
  function fetchSeedHistory() {
    return fetch('/seed-history.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((list) => (Array.isArray(list) ? list.filter((r) => r && typeof r === 'object') : []))
      .catch(() => []);
  }

  // 首次打开（一条档案都没有）时铺参照：要在 renderHistory() 之前完成，首屏才不闪一下空态。
  // 铺过一次就落印记：用户把参照全删光之后，刷新不会再自作主张塞回来（他们可以自己删掉）。
  const SEED_DONE_KEY = 'ai-jd-seed-done-v1';
  function seedFirstRunHistory() {
    if (loadHistory().length) return Promise.resolve(0);
    let done = false;
    try { done = localStorage.getItem(SEED_DONE_KEY) === '1'; } catch { /* 隐私模式：按没铺过处理 */ }
    if (done) return Promise.resolve(0);
    return fetchSeedHistory().then((list) => {
      // 等文件的这会儿可能已经落了别的档案（比如刚分析完一条），那就不塞了
      if (!list.length || loadHistory().length) return 0;
      saveHistory(list);
      try { localStorage.setItem(SEED_DONE_KEY, '1'); } catch { /* 忽略 */ }
      return list.length;
    });
  }

  /* ---------- 顶部导航：当前那一条加粗；「历史档案」是一个页面入口 ---------- */
  const navAnalysisBtn = $('btnAnalysisTop');

  function paintNav() {
    navAnalysisBtn.setAttribute('aria-current', viewAnalysis.hidden ? 'false' : 'page');
    btnHistoryTop.setAttribute('aria-current', viewHistory.hidden ? 'false' : 'page');
    btnMine.setAttribute('aria-current', viewResume.hidden ? 'false' : 'page');
    $('btnSettings').setAttribute('aria-current', viewSettings.hidden ? 'false' : 'page');
  }

  // 历史档案页：与「职位对比」「我的简历」同一条路径（渲染 → 切视图 → 压一条历史记录）
  function openHistoryPage() {
    renderHistory();
    show(viewHistory);
    history.pushState({ view: 'history' }, '');
    pushedState = true;
  }

  btnHistoryTop.addEventListener('click', openHistoryPage);
  // 首页「最近报告」的「查看全部」进同一个页面；它是跳转不是折叠，自己拦掉冒泡
  $('btnAllHistory').addEventListener('click', (e) => { e.stopPropagation(); openHistoryPage(); });

  /* 首页「最近报告」默认展开（用户口径）：点标题行（或回车／空格）仍可折叠，展开状态不落盘，刷新回到展开。
     折叠体靠 grid-template-rows 1fr → 0fr 收放，和 JD 区块同一手法。 */
  const recentBlock = $('recentBlock');
  const recentHead = $('recentHead');

  function toggleRecent() {
    recentHead.setAttribute('aria-expanded', String(!recentBlock.classList.toggle('collapsed')));
  }

  recentHead.addEventListener('click', toggleRecent);
  recentHead.addEventListener('keydown', (e) => {
    // 头里那个按钮的回车／空格由它自己管（键盘事件会冒泡上来），这里只管焦点还在折叠头上时
    if (e.target !== recentHead || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar')) return;
    e.preventDefault();
    toggleRecent();
  });

  /* 静态演示：分析记录数是固定示例值，不随日期增长 */
  $('proofNum').textContent = '26';

  historySort.addEventListener('click', (e) => {
    const dirBtn = e.target.closest('.history-dir-btn');
    if (dirBtn) {
      historySortDir = historySortDir === 'asc' ? 'desc' : 'asc';
      paintHistoryDir();
      historyPage = 0;
      renderHistory();
      return;
    }
    const btn = e.target.closest('.history-sort-btn');
    if (!btn) return;
    historySortMode = btn.dataset.sort;
    historyPage = 0;
    historySort.querySelectorAll('.history-sort-btn').forEach((b) => b.classList.toggle('on', b === btn));
    renderHistory();
  });

  // 方向按钮的文案就是「当前方向」：反序 ↓ 是降序，顺序 ↑ 是升序
  function paintHistoryDir() {
    const asc = historySortDir === 'asc';
    historyDirBtn.textContent = asc ? '顺序 ↑' : '反序 ↓';
    historyDirBtn.dataset.dir = asc ? 'asc' : 'desc';
    historyDirBtn.classList.toggle('on', asc);
  }

  // 打开历史报告：短暂显示「正在读取 xxx」，然后直接呈现完整报告（不重放动画）
  async function openHistory(rec) {
    if (!rec || !rec.data) return;
    const title = (rec.job && rec.job.title) || '历史报告';
    // 补薪资、简历重算都要认准「当前打开的是哪一份」，不能用上一次分析残留的链接
    jdUrl = rec.url || rec.data.source.url || '';
    T.event('history_open', { id: rec.id || '', title, url: jdUrl });
    // 老档案可能没把链接存进 data.source.url（旧版服务端落库时没写）：回填一次，
    // 「补薪资 / 联网重采」这些要回传 url 的动作都靠它取键，缺了就会被服务端拒成「缺少职位链接」
    if (jdUrl && rec.data.source && !rec.data.source.url) rec.data.source.url = jdUrl;
    // 刷新还原用：报告页打开的到底是哪一份档案
    reportMemo = { recUrl: jdUrl || '', recId: rec.id || '' };
    startReport(false);
    // 读取档案也是「什么都不显示 → 报告整页出现」，用同一个居中的进度圈
    showReportLoading(`正在读取${title}…`);
    loadingRing.setProgress(0.35);
    await sleep(420);
    loadingRing.setProgress(1);
    renderReportStatic(rec, title);
    await sleep(260);
    ring.hide();
    // 简历变了（新上传或改过）：只重算带简历依赖标记的项，其余不动
    maybeRefreshResumeParts(rec);
    // 注意：这里**不再**自动联网查休息情况。产品口径是「JD 分析时找不到休息情况可以搜一次」，
    // 所以只挂在新分析之后（见 btnAnalyze 那条路径）。挂在打开档案上会让用户莫名其妙，
    // 而且一旦失败就会每打开一次重搜一遍——这是踩过的坑，别再挂回来。
  }

  /* ---------- 自述问卷：待分析草稿 + 成果预览 ----------
     问卷页（_self_survey.html）把 20 题的答案写成一份「待分析草稿」存进本机，
     历史档案页与首页「最近报告」把它当一行「待分析 · 自述」显示，点开是成果预览；
     从预览点「现在进行分析」就把它当一次普通分析发出去（正文＝草稿的 text）。
     草稿只活在下面这个键里，**绝不写进 ai-jd-history-v1**——图表、评分口径重算、
     排序、对比这些消费者只认正式档案，草稿进来会把它们算脏。 */

  const SELF_PENDING_KEY = 'ai-jd-self-pending-v1';
  const SELF_PENDING_MAX = 10;      // 与问卷页写入时的条数上限一致
  // 预览当前打开的是哪一份草稿：popstate 回到这一页时靠它重渲染
  let selfPreviewId = '';

  const viewSelf = $('viewSelf');
  const selfTitleEl = $('selfTitle');
  const selfSum = $('selfSum');
  const selfTextEl = $('selfText');
  const btnSelfAnalyze = $('btnSelfAnalyze');
  const btnSelfEdit = $('btnSelfEdit');
  const btnSelfLater = $('btnSelfLater');
  const btnSelfSurvey = $('btnSelfSurvey');

  // 存进去的是别的东西、或隐私模式下写不进去，都当「没有草稿」，别让一页渲染炸掉
  function loadSelfPending() {
    try {
      const list = JSON.parse(localStorage.getItem(SELF_PENDING_KEY) || '[]');
      return Array.isArray(list)
        ? list.filter((r) => r && typeof r === 'object' && r.id)
        : [];
    } catch {
      return [];
    }
  }

  function saveSelfPending(arr) {
    try {
      localStorage.setItem(SELF_PENDING_KEY, JSON.stringify(arr.slice(0, SELF_PENDING_MAX)));
    } catch { /* 超配额或隐私模式下静默失败，不影响已经生成的分析 */ }
  }

  /* 一次性清理口（作者自用）：URL 带 ?clear-self=1 清空本机全部自述草稿；
     带 ?clear-self=关键词 则只删命中的那几条。清完把参数抹掉，地址栏不留痕。
     正常访问不带这个参数，这里什么都不做。 */
  (function clearSelfPendingByQuery() {
    let flag = '';
    try { flag = new URLSearchParams(location.search).get('clear-self') || ''; } catch { return; }
    if (!flag) return;
    try {
      const list = loadSelfPending();
      const keep = flag === '1' ? [] : list.filter((r) => !JSON.stringify(r).includes(flag));
      if (keep.length !== list.length) saveSelfPending(keep);
    } catch { /* 忽略 */ }
    try {
      const u = new URL(location.href);
      u.searchParams.delete('clear-self');
      history.replaceState(null, '', u.href);
    } catch { /* 忽略 */ }
  })();

  // 删掉一份草稿，返回被删掉的那条（调用方拿它做撤销）；没这条返回 null
  function removeSelfPending(id) {
    const list = loadSelfPending();
    const rec = list.find((r) => r.id === id) || null;
    if (!rec) return null;
    saveSelfPending(list.filter((r) => r.id !== id));
    return rec;
  }

  function selfPendingById(id) {
    return loadSelfPending().find((r) => r.id === id) || null;
  }

  // 草稿固定置顶，只按存入时间新→旧排（不参与历史档案那套排序与分页）
  function sortSelfPending(list) {
    return list.slice().sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0));
  }

  function selfTitle(rec) {
    const t = String(((rec && rec.job) || {}).title || '').trim();
    return t || '未命名自述';
  }

  // 草稿行上那一行灰字：城市 · 公司（都没有就是一句说明）
  function selfMeta(rec) {
    const j = (rec && rec.job) || {};
    return [j.city, j.company].filter(Boolean).join(' · ') || '自述档案，还没分析';
  }

  // 草稿在列表里的一行：结构与正式档案一致（分数位同样在雷达那一段的前面），只是还没数、多一枚「待分析 · 自述」标签
  function selfPendingRow(rec) {
    const row = document.createElement('div');
    row.className = 'history-item';
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'history-main';
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = selfTitle(rec);
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = selfMeta(rec);
    main.appendChild(title);
    main.appendChild(meta);
    const tag = document.createElement('span');
    tag.className = 'history-tag';
    tag.textContent = '待分析 · 自述';
    main.appendChild(tag);
    main.addEventListener('click', () => openSelfPreview(rec.id));
    row.appendChild(main);
    // 分数位留一个浅灰破折号：行高与正式档案对齐，一眼看出这份还没跑分
    const score = document.createElement('span');
    score.className = 'history-score self-pending-score';
    score.textContent = '—';
    row.appendChild(score);
    // 雷达那一段留一个同宽的空位：破折号才和正式档案的分数落在同一列上
    row.appendChild(radarSlot());
    return row;
  }

  // 摘要：按 summaryRows 的 group 分组，k/v 依次平铺（分组顺序照 JSON 里的原始顺序）
  function renderSelfSum(rec) {
    selfSum.innerHTML = '';
    const groups = new Map();
    for (const row of (rec.summaryRows || [])) {
      if (!row || typeof row !== 'object') continue;
      const name = row.group || '自述';
      let box = groups.get(name);
      if (!box) {
        box = document.createElement('div');
        box.className = 'self-sum-group';
        const h = document.createElement('h3');
        h.textContent = name;
        box.appendChild(h);
        selfSum.appendChild(box);
        groups.set(name, box);
      }
      const line = document.createElement('div');
      line.className = 'self-sum-row';
      const k = document.createElement('span');
      k.className = 'self-sum-k';
      k.textContent = row.k || '';
      const v = document.createElement('span');
      v.className = 'self-sum-v';
      v.textContent = row.v == null || row.v === '' ? '未填' : String(row.v);
      line.appendChild(k);
      line.appendChild(v);
      box.appendChild(line);
    }
  }

  // 重渲染当前预览的那份草稿；草稿已经不在了（比如刚被分析掉）返回 null
  function renderSelfPreview() {
    const rec = selfPendingById(selfPreviewId);
    if (!rec) return null;
    // 标题写成「xx的xx岗」：公司（没有就用城市）＋ 岗位名，如「某奢侈品公司的品牌设计岗」
    const job = rec.job || {};
    const what = job.title || (rec.answers && rec.answers.title) || '这份工作';
    const who = job.company || job.city || (rec.answers && rec.answers.city) || '';
    if (selfTitleEl) selfTitleEl.textContent = who ? `${who}的${what}岗` : `${what}岗`;
    renderSelfSum(rec);
    selfTextEl.textContent = rec.text || '';
    return rec;
  }

  // 打开成果预览。opts.noPush：不再压一条历史记录（从跳转参数进来、马上又要起报告时用）
  function openSelfPreview(id, opts) {
    const rec = selfPendingById(id);
    if (!rec) {
      toast('这份草稿找不到了');
      return null;
    }
    selfPreviewId = id;
    renderSelfPreview();
    show(viewSelf);
    if (!(opts && opts.noPush)) {
      history.pushState({ view: 'self' }, '');
      pushedState = true;
    }
    return rec;
  }

  /* 「现在进行分析」：与截图入口走同一条链路——把自述正文当一次分析发出去，
     出报告、播报告、存档案、补城市数据全都不重写第二遍（见 runAnalyzeFlow）。
     服务端回传的 source.url 就是草稿 id，落库之后从历史点它就是一份普通报告。 */
  async function runSelfAnalyze() {
    const rec = selfPendingById(selfPreviewId);
    if (!rec) {
      toast('这份草稿找不到了');
      return;
    }
    await runAnalyzeFlow(() => postJson('/api/analyze-text', {
      url: rec.id,
      text: rec.text,
      resume: (loadResume() || {}).md || '',
    }, ANALYZE_TIMEOUT_MS));
    // 成功与否只看档案有没有落库：runAnalyzeFlow 自己负责失败的提示（草稿原样留着，可以重试）
    if (loadHistory().some((r) => r.url === rec.id)) {
      removeSelfPending(rec.id);
      renderHistory();
    }
  }

  // 按钮与分析进行中只许起一条链路：分析页虽然把预览藏了，双击也不该发第二遍
  async function startSelfAnalyze() {
    if (btnSelfAnalyze.disabled) return;
    btnSelfAnalyze.disabled = true;
    try {
      await runSelfAnalyze();
    } finally {
      btnSelfAnalyze.disabled = false;
    }
  }

  btnSelfAnalyze.addEventListener('click', startSelfAnalyze);

  // 「改一改」＝回问卷页带上草稿 id，问卷用 ?resume=<id> 回填原答案，存的时候还是同一条
  btnSelfEdit.addEventListener('click', () => {
    if (!selfPreviewId) return;
    location.href = `_self_survey.html?resume=${encodeURIComponent(selfPreviewId)}`;
  });

  btnSelfLater.addEventListener('click', goHome);

  // 首页第 4 个入口：没有链接、没有截图时的第三条路
  btnSelfSurvey.addEventListener('click', () => { location.href = '_self_survey.html'; });

  // 重算过程中的可视化：雷达图大标题 + 被重算的维度 + 总分 / 点评 / JD 薪资
  // 进度圈先按时间柔和爬升，结果回来时一起转满，再依次退场
  function startReportUpdate() {
    const slots = [];
    const add = (ctl) => {
      if (!ctl) return;
      ctl.show();
      slots.push(ctl);
    };
    ring.show();
    ring.setLabel('正在根据最新简历更新报告');
    slots.push(ring);
    add(miniScore);
    add(miniVerdict);
    if (radarApi) {
      const mi = DIM_KEYS.indexOf('match');
      add({ show: () => radarApi.showRing(mi), setProgress: (p) => radarApi.setRing(mi, p), hide: () => radarApi.hideRing(mi) });
    }

    const t0 = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(0.9, 1 - Math.exp(-(Date.now() - t0) / 2600));
      slots.forEach((s) => s.setProgress(p));
    }, 90);

    const clear = () => { clearInterval(timer); slots.forEach((s) => s.hide()); };
    return {
      // 结果到手：转满 → 给眼睛一点时间 → 报告整体换新
      async fill() {
        clearInterval(timer);
        slots.forEach((s) => s.setProgress(1));
        await sleep(460);
      },
      async done(text) {
        ring.setLabel(text);
        await sleep(900);
        clear();
      },
      async abort() {
        clearInterval(timer);
        slots.forEach((s) => s.setProgress(0));
        await sleep(240);
        clear();
      },
    };
  }

  // 简历相关项的重算：靠后端 deps 标记判断要不要算、要算哪些
  async function maybeRefreshResumeParts(rec) {
    const data = rec.data || {};
    const resume = loadResume();
    const stamp = localResumeStamp(resume ? resume.md : '');
    if (!resume || !stamp || data.analysis.resumeStamp === stamp) return;
    // 老记录没有 deps 标记，或当初就是没简历时生成的：简历相关项一律算过期
    const deps = data.analysis.deps || {};
    const marked = Object.keys(deps).length > 0;
    const resumeDerived = !data.analysis.hasResume || !marked || Object.values(deps).some((d) => d && d.resume);
    if (!resumeDerived) return;
    // 没有匹配度这一项的旧记录，重算也落不到实处，直接跳过
    if (!(data.analysis.dimensions || []).some((d) => d.key === 'match')) return;
    const visual = startReportUpdate();
    try {
      const out = await postJson('/api/reresume', { url: rec.url || data.source.url || '', resume: resume.md, jdRaw: rec.jdRaw || '', prev: data });
      if (!out || out.unchanged) { await visual.abort(); return; }
      await visual.fill();
      // 就地更新：匹配度（以及日薪时的薪资）、总分、点评（两段都换）
      // 同步把依赖标记补上，否则这条记录的 deps 永远停在「没简历时」的样子，下次改简历不会再触发重算
      const prevAnalysis = data.analysis || {};
      const prevDeps = prevAnalysis.deps || {};
      const updated = {
        ...data,
        analysis: {
          ...prevAnalysis,
          dimensions: out.dimensions,
          overall: out.overall,
          baseScore: out.baseScore,
          matchMultiplier: out.matchMultiplier,
          conclusion: out.conclusion,
          // 简历变了：点评的第二段（针对用户的那条）也要跟着换
          personalNote: out.personalNote || prevAnalysis.personalNote || '',
          resumeStamp: out.resumeStamp,
          hasResume: true,
          // 留痕合并：这次重算里被校验丢弃的原句追加进同一本账（与服务端缓存保持一份）
          verifyDrops: [...(prevAnalysis.verifyDrops || []), ...(out.drops || [])].slice(0, 40),
          // 审计合并：简历重算的耗时与用量也进同一本账
          steps: [...(prevAnalysis.steps || []), auditStepOf('reresume', out)],
          // 缺口消账：简历已更新、这一维已重算，匹配度对应的缺口改标已解决（面板按 filled 过滤）
          gaps: (prevAnalysis.gaps || []).map((g) => (g.key === 'match' && g.kind !== 'filled'
            ? { ...g, kind: 'filled', reason: '简历已更新，匹配度已按简历重算', action: 'none' }
            : g)),
          deps: {
            ...prevDeps,
            match: { resume: true },
            overall: { resume: true, salary: !!(prevDeps.overall && prevDeps.overall.salary) },
            conclusion: { resume: true, salary: !!(prevDeps.conclusion && prevDeps.conclusion.salary) },
          },
        },
      };
      rec.data = updated;
      const list = loadHistory().map((x) => (x.id === rec.id ? { ...x, data: updated, overall: out.overall, dims: updated.analysis.dimensions.map((d) => ({ key: d.key, score: d.score })) } : x));
      saveHistory(list);
      renderHistory();

      // 画面同步：雷达重画（被重算的维度分数随之跳新值）。
      // 只在「打开的仍是这份档案」时重画——重算要跑两三秒，期间用户可能已经切走，
      // 无条件重画会把用户从别的报告上拽回来（数据已落库，切走就等下次打开看新值）。
      if (lastReportData === data) {
        const merged = { job: updated.source.job, data: updated };
        renderReportStatic(merged, (rec.job && rec.job.title) || '历史报告');
      }
      toast('简历已更新，相关分析已重新生成');
      await visual.done('报告已按最新信息更新');
    } catch (e) {
      await visual.abort();
      toast(e.message || '重算失败，请重新生成分析', 3200);
    }
  }

  /* 休息情况没写清时自动联网查一次（产品口径：JD 分析时找不到休息情况，可以搜一次）。
     每条档案只搜一次——搜过就留印记，查不到也不反复重搜（一次要等 10-30 秒）。
     查到就按「公开信息」重算休息维度：跟手动点「联网查找」走同一条路（/api/rerest）。 */
  function markRestSearched(url, data) {
    if (!url || !data) return;
    const list = loadHistory().map((x) => ((x.url || (x.data && x.data.source && x.data.source.url)) === url
      ? {
        ...x,
        data,
        overall: data.analysis.overall,
        dims: (data.analysis.dimensions || []).map((d) => ({ key: d.key, score: d.score })),
      }
      : x));
    saveHistory(list);
  }

  // 同一条档案正在联网查询时去重，避免重复发请求
  const restSearching = new Set();

  /* 休息情况没写清时自动联网查一次（产品口径：JD 分析时找不到休息情况，可以搜一次）。
     印记只在「有定论」时落库：明确没查到 → 记 found:false 不再重查；
     查到 → 记 found:true 并随即重算；查询或重算失败属于临时故障，不留印记，下次打开再试。
     查到之后走的是手动「联网查找」同一条路（/api/rest-lookup → /api/rerest）。 */
  async function maybeSearchRestOnce(rec) {
    const data = (rec && rec.data) || lastReportData;
    if (!data || !data.analysis) return;
    if (!restIsMissing(data)) return;               // 原文/本人补充/联网已有依据，不用查
    if (data.analysis.restSearch) return;           // 这条已经查过并有了定论
    const company = (((data.source || {}).job || {}).company || '').trim();
    if (!company) return;                           // 没公司名，没法查
    const url = (rec && rec.url) || jdUrl || '';
    if (url && restSearching.has(url)) return;
    if (url) restSearching.add(url);
    ring.show();
    ring.setLabel(`JD 没写休息情况，正在联网查「${company}」…`);
    ring.setProgress(0.3);
    try {
      const r = await postJson('/api/rest-lookup', { company });
      ring.setProgress(1);
      await sleep(220);
      ring.hide();
      if (!r || !r.found) {
        // 明确没查到：落印记，之后不再为这条档案联网
        data.analysis.restSearch = { at: Date.now(), found: false };
        markRestSearched(url, data);
        return;
      }
      // 查到了：先记下结果再重算（重算失败会把这个印记清掉，下次打开自动重试）
      data.analysis.restSearch = { at: Date.now(), found: true, summary: r.summary };
      try {
        await rerestRest({ webSummary: r.summary, webSource: r.source }, data);
        toast(`休息情况按公开信息更新：${r.summary}`, 4200);
      } catch (e) {
        delete data.analysis.restSearch;
        markRestSearched(url, data);
        // 失败后不再「下次打开自动重试」——那会让用户每次打开都白等 10~30 秒再失败一遍。
        // 现在只提示，重试交给用户：在双休假期里手动点「联网查找」，或者重新分析一次这个 JD。
        toast(`联网查到「${r.summary}」，但更新没成功；可在双休假期里点「联网查找」重试`, 4200);
      }
    } catch (e) {
      // 查询请求本身失败（服务没起来、超时等）：临时故障，不留印记
      ring.hide();
    } finally {
      if (url) restSearching.delete(url);
    }
  }

  // 直接铺满整份报告：不做生长动画
  function renderReportStatic(rec, title) {
    const data = rec.data;
    dimsData = data.analysis.dimensions || [];
    lastReportData = data;
    // 档案已就绪：收起居中的进度圈，露出雷达图模块
    hideReportLoading();
    radarApi = buildRadar(radarSvg, DIM_KEYS.map((k) => DIM_NAMES[k]), {
      interactive: true,
      onLabelTap: selectDim,
    });
    DIM_KEYS.forEach((k, i) => {
      const d = dimsData.find((x) => x.key === k);
      radarApi.showLabel(i, true);
      if (!d || d.score == null) {
        radarApi.setScore(i, '--', true);
        radarApi.setValue(i, 0);
      } else {
        radarApi.setScore(i, String(d.score), false);
        radarApi.setValue(i, d.score);
      }
    });
    radarSvg.classList.remove('radar-hidden');

    verdictSection.hidden = false;
    verdictSection.classList.add('open');
    scoreValueEl.classList.remove('pending');
    scoreLabelEl.classList.remove('pending');
    overallMaxEl.classList.remove('pending');
    paintScorePair(data.analysis);
    verdictLine.textContent = data.analysis.personalNote ? stopEnd(data.analysis.conclusion) : (data.analysis.conclusion || '');
    renderVerdictHead(data);
    // 历史档案是整页直接铺满，不需要等分析播放，图跟着报告一起出（先渲染，再露面）
    renderReportChart();
    revealReportChart();
    renderVerdictHints(data);

    renderJdBlocksStatic(data);

    // 历史页打开时，把签名停在报告页顶部（进度圈提示已完成）
    setProgressLabel(`已读取${title}`);
    // 这条档案的发展潜力还没采到（旧档案 / 上次没采成）：挂进度圈后台采一次
    autoCollectGrowth(rec.url || (data.source && data.source.url) || '', data);
  }

  /* JD 结构化区块画进指定容器：报告页（jdBody）与首页示例轮播共用这一段渲染，
     免得示例里再抄一份区块样式。返回画出的区块数。 */
  // 同一块里逐字重复的行（重叠截图 OCR 常见的产物）只渲染一次，标荧光笔也只标一处
  function dedupeBlockItems(items) {
    const seen = new Set();
    const out = [];
    for (const t of items || []) {
      const key = String(t == null ? '' : t).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  // 岗位信息里的「城市」行：值里除了城市还带区 / 街道这类细节时（那是工作地点），
  // 拆成「城市：<市>」+「工作地点：<原文>」两行——对比、社平、房价用的都是「市」一级（用户口径）。
  const CITY_LABEL_RE = /^(城市|工作城市|所在地|工作地点|地点|地址)$/;
  function citySplitOf(block, text) {
    if (!block || block.type !== 'kv') return null;
    const cut = String(text).search(/[:：]/);
    if (cut <= 0 || cut > 12) return null;
    const label = text.slice(0, cut).trim();
    const value = text.slice(cut + 1).trim();
    if (!CITY_LABEL_RE.test(label) || !value) return null;
    const city = normalizeCity(value);
    if (!city || city === value.replace(/[·•\s/、]+/g, '')) return null;   // 只写到城市：原样留着，不拆
    return [`城市：${city}`, `工作地点：${value}`];
  }

  function jdBlocksInto(host, data) {
    const blocks = Array.isArray(data.source.jdBlocks) ? data.source.jdBlocks : [];
    if (!blocks.length) return 0;
    host.innerHTML = '';
    for (const block of blocks) {
      const { sec, inner } = jdBlockShell(block);
      sec.classList.add('jd-in');
      for (const text of dedupeBlockItems(block.items)) {
        for (const t of (citySplitOf(block, text) || [text])) {
          const node = jdItemNode(block, t);
          node.classList.add('jd-line', 'jd-in');
          inner.appendChild(node);
        }
      }
      host.appendChild(sec);
    }
    // 荧光笔：把 JD 风险标记的原句逐条扫出来（扫不到的跳过）——报告页与示例共用的就这一处
    const pieces = collectJdTextNodes(host);
    let from = 0;
    for (const m of (data.analysis.jdMarks || [])) {
      if (!m || typeof m.text !== 'string') continue;
      const idx = sweepMark(pieces, from, m);
      if (idx >= 0) from = idx;
    }
    return blocks.length;
  }

  function renderJdBlocksStatic(data) {
    if (!jdBlocksInto(jdBody, data)) return;
    jdSection.hidden = false;
    jdSection.classList.add('grown');
    if (salaryMissing(data)) {
      const firstInner = jdBody.querySelector('.jd-block-inner');
      if (firstInner) {
        let row = Array.from(firstInner.querySelectorAll('.jd-kv')).find((r) => /薪|待遇/.test(r.textContent));
        if (!row) {
          row = jdItemNode({ type: 'kv' }, '薪资：未读到');
          row.classList.add('jd-line', 'jd-in');
          firstInner.appendChild(row);
        }
        const hint = buildSalaryHint(null, data);
        row.appendChild(hint.q);
        row.insertAdjacentElement('afterend', hint.box);
        salaryRowEl = row;
      }
    }
    // 荧光笔已经在 jdBlocksInto 里扫过一遍了——这里不能再扫第二遍，
    // 否则会把已有 <mark> 里的文字再包一层，出现重复标注（mark > mark）。
  }


  // 岗位信息小字的统一结构：薪资 · 休息情况 · 地点 · 公司名
  /* 总分下面那个分母：用「这份岗位的原始分」，不是满分 100。
     总分 = 原始分 × 匹配度系数 × 极化系数，写成「总分 / 原始分」才看得出匹配度到底在帮你还是拖你：
     原始分是这份工作本身值多少（与你是谁无关），总分才是「以你的条件算下来值多少」。
     老记录没有 baseScore 时退回 100，别显示成「/ undefined」。 */
  function scoreDenom(ana) {
    const b = Math.round(Number((ana || {}).baseScore));
    return Number.isFinite(b) && b > 0 ? b : 100;
  }

  /* 分数口径（顶栏「设置」里可切）：大数字给谁。
       total（默认）：大数字＝加权分（按你的条件修正后的总分），分母＝原始分 —— 强调「按你的条件算下来值多少」；
       base        ：大数字＝原始分（这份工作本身值多少），分母＝加权分。
     报告页与历史列表用同一个口径，切换后立刻重画。 */
  const SCORE_MODE_KEY = 'ai-jd-score-mode-v1';
  let scoreMode = 'total';
  try {
    const saved = localStorage.getItem(SCORE_MODE_KEY);
    if (saved === 'base' || saved === 'total') scoreMode = saved;
  } catch { /* 隐私模式下用默认口径 */ }

  /* v12 预留：analysis.overall 为 null＝「不给数字」（核心维度缺项）——
     如实显示「资料不全」，不拿原始分冒充总分；数据层已经会在 scoresOf 里给 null。 */
  const overallMissing = (ana) => !!(ana && ana.overall == null);

  function scorePairOf(ana) {
    const a = ana || {};
    const base = scoreDenom(a);
    if (overallMissing(a)) {
      if (scoreMode === 'base') return { main: base, sub: null, label: '原始分 / 资料不全', missing: true };
      return { main: '—', sub: null, label: '资料不全 / 原始分', missing: true };
    }
    const total = Math.round(Number(a.overall));
    const hasTotal = Number.isFinite(total) && total > 0;
    if (scoreMode === 'base') {
      return { main: base, sub: hasTotal ? total : null, label: '原始分 / 总分' };
    }
    return { main: hasTotal ? total : base, sub: base, label: '总分 / 原始分' };
  }

  function paintScorePair(ana) {
    const p = scorePairOf(ana);
    overallScoreEl.textContent = String(p.main);
    overallMaxEl.textContent = p.sub == null ? '' : ` /${p.sub}`;
    if (scoreLabelEl && scoreLabelEl.firstChild && scoreLabelEl.firstChild.nodeType === 3) {
      scoreLabelEl.firstChild.nodeValue = p.label;
    }
  }

  /* ---------- 简历（本地存储，md 结构化） ---------- */

  const RESUME_KEY = 'ai-jd-resume-v1';
  const viewResume = $('viewResume');
  const resumeInput = $('resumeInput');
  const resumeBody = $('resumeBody');
  const resumeActions = $('resumeActions');
  const resumeProgress = $('resumeProgress');
  const resumeHint = $('resumeHint');
  const btnMine = $('btnMine');
  // 解析中、清空待确认：都体现在 renderResumePage 的排版里
  let resumeBusy = false;
  let resumeConfirm = false;
  const resumeRing = makeRingLater($('resumeRing'), $('resumeArc'), $('resumeDot'), $('resumeLabel'), resumeProgress);

  function makeRingLater(ringEl, arcEl, dotEl, labelEl, hostEl) {
    let hideTimer = 0;
    const R = 7.5;
    const C = 2 * Math.PI * R;
    return {
      setProgress(p) {
        const v = Math.max(0, Math.min(1, p));
        arcEl.setAttribute('stroke-dashoffset', String(C * (1 - v)));
        const ang = (-90 + 360 * v) * Math.PI / 180;
        dotEl.setAttribute('cx', String(10 + R * Math.cos(ang)));
        dotEl.setAttribute('cy', String(10 + R * Math.sin(ang)));
      },
      setLabel(t) { labelEl.textContent = t; },
      show() {
        clearTimeout(hideTimer);
        if (hostEl) hostEl.hidden = false;
        ringEl.style.opacity = '1';
        labelEl.style.opacity = '1';
        this.setProgress(0);
      },
      // 先淡出，再收起整行：否则页顶会留一条空行
      hide() {
        ringEl.style.opacity = '0';
        labelEl.style.opacity = '0';
        if (hostEl) hideTimer = setTimeout(() => { hostEl.hidden = true; }, 420);
      },
    };
  }

  function loadResume() {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      const rec = raw ? JSON.parse(raw) : null;
      return rec && rec.md ? rec : null;
    } catch {
      return null;
    }
  }

  function saveResume(rec) {
    try {
      if (rec) localStorage.setItem(RESUME_KEY, JSON.stringify(rec));
      else localStorage.removeItem(RESUME_KEY);
    } catch { /* 隐私模式等场景静默失败 */ }
  }

  // 简历页眉那行「更新于 2026-09-30 14:05」
  function resumeTimeText(ts) {
    const d = new Date(Number(ts) || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 简历入口在顶部导航、始终在：没有简历时点它是选文件，所以只切换首页那句提示
  function refreshResumeEntries() {
    const rec = loadResume();
    resumeHint.hidden = !!rec;
    // 没简历时这个入口就是上传入口，别挂着「我的简历」让人猜
    btnMine.textContent = rec ? '我的简历' : '上传简历';
    if (activeKey === 'match') renderDimPanel(DIM_KEYS.indexOf('match'));
  }

  // 简历内容指纹：与后端同一套算法，用来判断历史报告里的简历结论是否过期
  function localResumeStamp(md) {
    const s = String(md || '').replace(/\s+/g, '');
    if (!s) return '';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
    return `${s.length}-${h}`;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsDataURL(file);
    });
  }

  // 通用下载：Blob → 临时 <a download>。简历页的「来源的文件」与「简历.md」都用它
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function downloadTextFile(text, name) {
    downloadBlob(new Blob([String(text == null ? '' : text)], { type: 'text/markdown;charset=utf-8' }), name);
  }
  function downloadBase64File(b64, mime, name) {
    try {
      const bin = atob(String(b64 || ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      downloadBlob(new Blob([bytes], { type: mime || 'application/octet-stream' }), name);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function handleResumeFile(file) {
    if (!file) return;
    const existed = loadResume();
    // 立即跳进简历页，边处理边等（不留在首页干等）
    if (!pushedState) {
      show(viewResume);
      history.pushState({ view: 'resume' }, '');
      pushedState = true;
    } else {
      show(viewResume);
    }
    resumeConfirm = false;
    resumeBusy = true;
    resumeRing.show();
    resumeRing.setLabel(existed ? '正在更新简历' : '正在解析简历');
    resumeRing.setProgress(0.12);
    renderResumePage();   // 解析中：已有简历照旧显示，只是多一句「正在解析，请稍等…」
    try {
      const b64 = await fileToBase64(file);
      resumeRing.setProgress(0.32);
      const parsed = await postJson('/api/resume-parse', { filename: file.name, data: b64 });
      resumeRing.setProgress(0.55);
      resumeRing.setLabel(existed ? '正在合并简历' : '正在整理简历');
      const out = await postJson('/api/resume-structure', {
        text: parsed.text,
        previousMd: existed ? existed.md : '',
      });
      // 原文件留存一份（≤1.2MB）：「来源的文件」可以点开/保存；太大就不留，退回 md 版
      const keepOrig = file.size <= 1200 * 1024;
      saveResume({
        md: out.md, filename: file.name, updatedAt: Date.now(),
        orig: keepOrig ? { name: file.name, type: file.type || '', data: b64 } : null,
      });
      refreshResumeEntries();
      resumeBusy = false;
      await renderResumePage(true);   // 逐项流式出现
      toast(existed ? '简历已更新：相同内容保持不变' : '简历已保存');
    } catch (e) {
      toast(e.message || '简历处理失败，请重试', 3200);
      resumeBusy = false;
      renderResumePage();
    } finally {
      resumeBusy = false;
      resumeRing.setProgress(1);
      await sleep(420);
      resumeRing.hide();
    }
  }

  // markdown → 块数组（每一项记住它在原文里的行号，便于就地编辑）
  function parseResumeBlocks(md) {
    const lines = String(md || '').split('\n');
    const blocks = [];
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const h = line.match(/^(#{1,4})\s*(.+)$/);
      if (h) {
        blocks.push({ type: 'h' + h[1].length, text: cleanMdText(h[2]), line: i, raw: line });
        return;
      }
      const li = line.match(/^[-*·]\s*(.+)$/);
      if (li) {
        blocks.push({ type: 'li', text: cleanMdText(li[1]), line: i, raw: line });
        return;
      }
      blocks.push({ type: 'p', text: cleanMdText(line), line: i, raw: line });
    });
    return blocks;
  }

  // 块数组 → 章节数组：一个章节 = 一个标题 + 标题下方到下一个标题之间的正文
  function parseResumeSections(md) {
    const sections = [{ head: null, body: [] }];   // 第一个标题之前的散行
    let cur = sections[0];
    for (const b of parseResumeBlocks(md)) {
      if (b.type[0] === 'h') {
        cur = { head: b, body: [] };
        sections.push(cur);
      } else {
        cur.body.push(b);
      }
    }
    return sections;
  }

  // 去掉 markdown 强调符号（** __ * _ ` ），只留纯文本
  function cleanMdText(s) {
    return String(s)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s*/, '')
      .trim();
  }

  // 块 → 元素：标题一律 h3、正文 p、列表 li，版式与 V2 的 md 排版一致
  function resumeBlockEl(block) {
    const el = document.createElement(block.type === 'li' ? 'li' : (block.type === 'p' ? 'p' : 'h3'));
    el.textContent = block.text;
    return el;
  }

  // 简历展示层脱敏：手机号留头尾、中间打星；邮箱只留前两位本地名。
  // 只遮页面上的显示——原始 md 不动，下载的 .md 仍是完整内容，分节编辑里的原文也不受影响。
  function maskSensitive(s) {
    let t = String(s == null ? '' : s);
    t = t.replace(/1[3-9]\d{9}/g, (m) => m.slice(0, 3) + '****' + m.slice(-4));
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => {
      const at = m.indexOf('@');
      const local = m.slice(0, at);
      const domain = m.slice(at + 1);
      return local.slice(0, 2) + '***@' + domain;
    });
    return t;
  }

  // 铅笔只挂在章节标题旁：点一下编辑整节，不做逐行编辑
  function attachSectionPencil(headEl, section) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'resume-pencil';
    btn.setAttribute('aria-label', `编辑「${section.head.text}」这一节`);
    btn.textContent = '✎';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditResumeSection(headEl, section);
    });
    headEl.appendChild(btn);
  }

  // 就地编辑整节：标题不动，正文整体替换，保存后覆盖 md
  function startEditResumeSection(headEl, section) {
    if (headEl.parentNode.querySelector('.resume-edit')) return;
    const body = section.body;
    const hidden = body.map((b) => b.el);
    hidden.forEach((el) => { el.hidden = true; });
    const box = document.createElement('div');
    box.className = 'resume-edit';
    const ta = document.createElement('textarea');
    ta.className = 'resume-edit-input';
    ta.value = body.map((b) => b.text).join('\n');
    ta.rows = Math.min(10, Math.max(2, body.length + 1));
    const actions = document.createElement('div');
    actions.className = 'resume-edit-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'resume-edit-save';
    save.textContent = '保存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'resume-edit-cancel';
    cancel.textContent = '取消';
    actions.appendChild(save);
    actions.appendChild(cancel);
    box.appendChild(ta);
    box.appendChild(actions);
    headEl.insertAdjacentElement('afterend', box);
    ta.focus();

    const close = () => { box.remove(); hidden.forEach((el) => { el.hidden = false; }); };
    cancel.addEventListener('click', close);
    save.addEventListener('click', () => {
      const rec = loadResume();
      if (!rec) return;
      const lines = rec.md.split('\n');
      const next = ta.value.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
      const types = body.map((b) => b.type);
      const start = body.length ? body[0].line : section.head.line + 1;
      const count = body.length ? body[body.length - 1].line - start + 1 : 0;
      const rebuilt = next.map((s, i) => {
        const t = types[i] || types[types.length - 1] || 'li';
        return t === 'li' ? `- ${s}` : s;
      });
      lines.splice(start, count, ...rebuilt);
      saveResume({ ...rec, md: lines.join('\n'), updatedAt: Date.now() });
      toast('已保存修改');
      renderResumePage();
    });
  }

  function resumeTextEl(cls, t) {
    const el = document.createElement('p');
    el.className = cls;
    el.textContent = t;
    return el;
  }

  // 清空先问一句（V2 的 confirm-line）：一行字 + 两个句内动作
  function resumeConfirmLine() {
    const line = document.createElement('p');
    line.className = 'confirm-line';
    line.appendChild(document.createTextNode('清空后，岗位匹配度会失去简历依据。确定清空？'));
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'link-btn';
    yes.textContent = '清空简历';
    yes.addEventListener('click', () => {
      const backup = loadResume();
      resumeConfirm = false;
      saveResume(null);
      refreshResumeEntries();
      renderResumePage();
      toast('简历已清空', 5000, {
        label: '撤销',
        on: () => {
          saveResume(backup);
          refreshResumeEntries();
          renderResumePage();
          toast('已恢复简历');
        },
      });
    });
    const sep = document.createElement('span');
    sep.className = 'notice-sep';
    sep.textContent = '/';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'link-btn';
    no.textContent = '取消';
    no.addEventListener('click', () => { resumeConfirm = false; renderResumePage(); });
    line.appendChild(yes);
    line.appendChild(sep);
    line.appendChild(no);
    return line;
  }

  // 渲染简历：页眉两行（文件名、更新于）+ md 正文 + 页脚两个动作，与 V2 的简历页同版式。
  // 铅笔只出现在章节标题旁，正文各行不再挂铅笔；stream = true 时逐项淡入（上传后使用）。
  async function renderResumePage(stream) {
    const rec = loadResume();
    const busy = resumeBusy;
    resumeBody.innerHTML = '';
    if (!rec) {
      const empty = document.createElement('div');
      empty.className = 'resume-empty';
      empty.appendChild(resumeTextEl('resume-empty-title', busy ? '正在解析简历…' : '还没有简历'));
      empty.appendChild(resumeTextEl('page-sub', busy
        ? '解析完成后会自动整理成结构化内容，请稍等。'
        : '支持 PDF / Word / md / txt。'));
      if (!busy) {
        const act = document.createElement('p');
        act.className = 'empty-act';
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'link-btn';
        up.textContent = '上传简历';
        up.addEventListener('click', () => resumeInput.click());
        act.appendChild(up);
        empty.appendChild(act);
      }
      resumeBody.appendChild(empty);
      resumeActions.hidden = true;
      return;
    }
    // 「来源的文件」：可点开 / 保存。上传时留存了原件（≤1.2MB）就下载原件；
    // 没留存（老简历或文件太大）就提示去下 Markdown 版
    // 先找出「姓名」：第一个只有标题、没有正文的标题——正文和文件名显示都要把它遮掉（下载不受影响）
    const sectionsAll = parseResumeSections(rec.md);
    const nameHead = (() => {
      const s0 = sectionsAll.find((s) => s.head);
      return s0 && s0.body.length === 0 ? cleanMdText(s0.head.text) : '';
    })();
    const dispFilename = nameHead && nameHead.length >= 2 && String(rec.filename || '').includes(nameHead)
      ? String(rec.filename).split(nameHead).join(nameHead[0] + '**')
      : (rec.filename || '我的简历');
    const nameEl = resumeTextEl('resume-name', dispFilename);
    nameEl.classList.add('resume-file');
    nameEl.setAttribute('role', 'button');
    nameEl.setAttribute('tabindex', '0');
    nameEl.title = rec.orig && rec.orig.data ? '点击保存原文件' : '这份简历没有留存原件，可在下面保存 Markdown 版';
    const openOrig = () => {
      if (rec.orig && rec.orig.data) {
        if (downloadBase64File(rec.orig.data, rec.orig.type, rec.orig.name || rec.filename || '简历')) {
          toast('已开始下载原文件');
        } else {
          toast('原文件读取失败，可在下面保存 Markdown 版', 3200);
        }
        return;
      }
      toast('这份简历没有留存原件，可在下面保存 Markdown 版', 3200);
    };
    nameEl.addEventListener('click', openOrig);
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrig(); }
    });
    resumeBody.appendChild(nameEl);
    // 不再另挂「简历.md」下载按钮：上传的就是 .md 时头部那行「点击保存原文件」是同一份东西，
    // 摆两个入口纯属重复（用户点名去掉）。
    resumeBody.appendChild(resumeTextEl('resume-meta',
      (busy ? '正在解析，请稍等… · ' : '') + `更新于 ${resumeTimeText(rec.updatedAt)}`));
    // 确认清空的那一行要出现在点「清空」的地方（按钮行原地替换）——
    // 之前放在正文顶上，用户在页脚点清空时它出现在屏幕外，看起来像没反应
    resumeActions.hidden = busy || resumeConfirm;

    const md = document.createElement('div');
    md.className = 'md-body';
    resumeBody.appendChild(md);
    // 确认行挂在正文末尾（就在按钮行原来的位置上），点「清空」时它出现在眼皮底下
    if (resumeConfirm) resumeBody.appendChild(resumeConfirmLine());

    const sections = sectionsAll;
    const total = sections.reduce((n, s) => n + s.body.length + (s.head ? 1 : 0), 0) || 1;
    let shown = 0;

    const reveal = async (el) => {
      shown += 1;
      if (!stream) { el.classList.add('resume-in'); return; }
      await nextFrame();
      el.classList.add('resume-in');
      resumeRing.setProgress(0.6 + (shown / total) * 0.4);
      await sleep(34);
    };

    let firstHeadSeen = false;
    for (const section of sections) {
      if (section.head) {
        // 顶部那个「只有姓名、没有正文」的标题：不显示（隐私——名字不上屏）
        const isNameHead = !firstHeadSeen && section.body.length === 0;
        firstHeadSeen = true;
        if (isNameHead) continue;
        const el = resumeBlockEl(section.head);
        el.textContent = maskSensitive(el.textContent);
        // 其余章节标题各配一个铅笔
        el.classList.add('resume-sec');
        attachSectionPencil(el, section);
        el.classList.add('resume-line');
        md.appendChild(el);
        await reveal(el);
      }
      let list = null;
      for (const b of section.body) {
        let el;
        if (b.type === 'li') {
          if (!list) {
            list = document.createElement('ul');
            md.appendChild(list);
          }
          el = resumeBlockEl(b);
          list.appendChild(el);
        } else {
          list = null;
          el = resumeBlockEl(b);
          md.appendChild(el);
        }
        el.textContent = maskSensitive(el.textContent);
        b.el = el;
        el.classList.add('resume-line');
        await reveal(el);
      }
    }
  }


  function openResumePage() {
    resumeConfirm = false;
    resumeRing.hide();
    renderResumePage();
    show(viewResume);
    history.pushState({ view: 'resume' }, '');
    pushedState = true;
  }

  $('btnResumeUpload').addEventListener('click', () => resumeInput.click());
  btnMine.addEventListener('click', () => {
    if (loadResume()) openResumePage();
    else resumeInput.click();
  });
  $('btnResumeMore').addEventListener('click', () => resumeInput.click());
  // 清空不再一点就清：先亮出确认行，确认后才真的清（V2 的做法）
  $('btnResumeClear').addEventListener('click', () => {
    if (!loadResume()) { toast('还没有简历'); return; }
    resumeConfirm = true;
    renderResumePage();
  });
  resumeInput.addEventListener('change', () => {
    const file = resumeInput.files && resumeInput.files[0];
    resumeInput.value = '';
    handleResumeFile(file);
  });

  /* ---------- 按钮3：生成深度分析 ---------- */

  /* 扩展在不在：往页面里发 PING，content script 收到会回 READY。
     一次探测不放就多探几次（content script 是 document_idle 注入的，页面刚打开、浏览器忙、
     扩展刚更新过时，第一次探测都可能赶不上）——探测偶尔失败不再等于「没装扩展」。
     一旦本会话确认过它在（页面加载时报到或任何一次探测成功），就记住 extEverReady，
     后续探测失败也按「在」处理，避免把装了的用户误报成没装。 */
  let extEverReady = false;
  function extensionReady(timeout = 600) {
    return new Promise((resolve) => {
      if (extEverReady) return resolve(true);
      let settled = false;
      let timer = null;
      let retry = null;
      const done = (v) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        if (timer) clearTimeout(timer);
        if (retry) clearTimeout(retry);
        if (v) extEverReady = true;
        resolve(v);
      };
      const onMsg = (e) => {
        if (e.source === window && e.data && e.data.type === 'AI_JD_EXTENSION_READY') done(true);
      };
      const ping = () => {
        if (settled) return;
        window.postMessage({ type: 'AI_JD_PING' }, '*');
        retry = setTimeout(ping, 400);
      };
      window.addEventListener('message', onMsg);
      ping();
      timer = setTimeout(() => done(false), timeout);
    });
  }

  function extensionFetchJd(url, timeout = 45000) {
    return new Promise((resolve) => {
      const reqId = 'req-' + Math.random().toString(36).slice(2);
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(v);
      };
      const onMsg = (e) => {
        const d = e.data;
        if (e.source !== window || !d || d.type !== 'AI_JD_RESULT' || d.reqId !== reqId) return;
        done(d);
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'AI_JD_FETCH', reqId, url }, '*');
      setTimeout(() => done(null), timeout);
    });
  }

  /* ---------- 浏览器扩展引导：没装扩展时给一份能照着做的教程 ----------
     以前只有等到点「生成深度分析」时才蹦一句干巴巴的报错，用户不知道该干什么。
     这里把「为什么需要扩展 + 怎么装 + 装完怎么办」摊开讲清楚：
     主按钮就地重测，装上了就顺着这次的路（剪贴板 / 粘进来的文本 / 二维码）把链接读下去；
     次按钮把人送去截图那条路。选过的选择记在 localStorage，同一个选择不反复弹。 */

  const EXT_GUIDE_KEY = 'ai-jd-ext-guide-v1';
  const extGuideModal = $('extGuideModal');
  const extGuideStatus = $('extGuideStatus');
  const extGuideErr = $('extGuideErr');
  const extGuideContinue = $('extGuideContinue');
  const extGuideCopy = $('extGuideCopy');
  const extHelpBtn = $('extHelpBtn');
  const extHelpMore = $('extHelpMore');

  // 最近一次检测结果（null＝还没测过）：弹层顶部那行状态、按钮下面那行文案都看它
  let extReadySeen = null;
  // 这次弹层是为哪条路打开的：装好后点主按钮，接着把这条路的链接读下去
  let extGuidePending = null;

  function extGuideFlag() {
    try { return localStorage.getItem(EXT_GUIDE_KEY) || ''; } catch { return ''; }
  }
  function setExtGuideFlag(v) {
    try { localStorage.setItem(EXT_GUIDE_KEY, v); } catch { /* 隐私模式下本次会话照走 */ }
  }
  function clearExtGuideFlag() {
    try { localStorage.removeItem(EXT_GUIDE_KEY); } catch { /* 同上 */ }
  }

  // 检测结果落到界面上：只改按钮下面那行的文案，不动颜色（两种状态都能点开教程）
  function paintExtGuideState(ready) {
    extReadySeen = ready;
    extHelpMore.textContent = ready
      ? '「粘贴链接」「上传二维码」扩展已就绪 —— 点这里查看说明'
      : '「粘贴链接」「上传二维码」需安装浏览器扩展 —— 点这里看安装步骤';
    if (!extGuideModal.hidden) paintExtGuideStatus();
  }

  function paintExtGuideStatus() {
    // 文案压到最短：状态本身由前面的标志（空心圈 / 墨点）说，这里只补一句
    const known = extReadySeen !== null;
    extGuideStatus.textContent = !known ? '正在检测扩展…'
      : (extReadySeen ? '已检测到扩展' : '未检测到扩展');
    extGuideStatus.classList.toggle('ok', !!extReadySeen);
  }

  // 打开教程。pending 有值＝这条路上有个链接等着装完继续；没有＝用户自己点「?」翻说明书
  function openExtGuide(pending) {
    extGuidePending = pending || null;
    extGuideErr.hidden = true;
    extGuideContinue.disabled = false;
    extGuideModal.hidden = false;
    paintExtGuideStatus();
  }

  function closeExtGuide() {
    extGuideModal.hidden = true;
    extGuidePending = null;
  }

  // 取剪贴板里的链接并捕获下来：拿到就返回这条链接，没拿到返回 null（提示已经就地给出）
  async function pasteFromClipboard() {
    let text = null;
    try {
      text = await Promise.race([
        navigator.clipboard.readText(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
    } catch {
      text = null;
    }
    if (text == null) {
      pasteArmed = true;
      toast('请按 Ctrl+V 粘贴链接', 4000);
      return null;
    }
    if (!isValidUrl(text)) {
      toast('剪贴板中未找到链接');
      return null;
    }
    const url = text.trim();
    acceptUrl(url, btnPaste);
    return url;
  }

  // 装好扩展之后，接着把这次要分析的链接读完：三种入口共用（剪贴板要重新取一次）
  async function continueAfterExtGuide(pending) {
    if (pending.resume === 'clipboard') {
      const url = await pasteFromClipboard();
      if (url) await runAnalyzeFlow(() => fetchAnalysis(url));
      return;
    }
    if (!pending.url) return;
    acceptUrl(pending.url, pending.resume === 'qr' ? btnQr : btnPaste);
    await runAnalyzeFlow(() => fetchAnalysis(pending.url));
  }

  // 主按钮：就地重测。没测到就不关弹层，把「还是没检测到」那行红字摆到按钮下面
  extGuideContinue.addEventListener('click', async () => {
    extGuideErr.hidden = true;
    extGuideContinue.disabled = true;
    const ready = await extensionReady(2400);
    paintExtGuideState(ready);
    extGuideContinue.disabled = false;
    if (!ready) {
      extGuideErr.hidden = false;
      return;
    }
    setExtGuideFlag('done');
    const pending = extGuidePending;
    closeExtGuide();
    toast('已检测到扩展', 2400);
    if (pending) await continueAfterExtGuide(pending);
  });

  // 次按钮：不装也行，直接把人送到「上传截图」那条路（同步触发，保住这次点击的用户手势）
  $('extGuideSkip').addEventListener('click', () => {
    setExtGuideFlag('skip');
    closeExtGuide();
    shotInput.click();
    toast('也可以随时点首页的「上传截图」，效果一样', 3600);
  });

  $('extGuideClose').addEventListener('click', closeExtGuide);
  $('extGuideBackdrop').addEventListener('click', closeExtGuide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !extGuideModal.hidden) closeExtGuide();
  });

  // 教程里那行小字：把 flag 清掉＝自动弹层那道门重新打开，然后当场再测一次
  $('extGuideReset').addEventListener('click', async () => {
    clearExtGuideFlag();
    extGuideErr.hidden = true;
    paintExtGuideState(await extensionReady(2400));
  });

  // 第一步的复制按钮：页面拿不到工具文件夹的绝对路径，所以复制的是目录名，
  // 配合那行小字（先在文件夹窗口地址栏复制完整路径，再把 extension 接上去）
  extGuideCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('extension');
      toast('已复制「extension」：把它接在本工具文件夹路径后面', 4200);
    } catch {
      toast('复制失败：手动记下本工具文件夹里的 extension 目录', 4200);
    }
  });

  // 「?」与右边那句话：任何时候都能点开同一份教程。不做事先检测——先开门，再更新顶部那行状态
  for (const el of [extHelpBtn, extHelpMore]) {
    el.addEventListener('click', async () => {
      openExtGuide(null);
      paintExtGuideState(await extensionReady(2400));
    });
  }

  // 扩展自己会在页面加载时报一次到（content script 是 document_idle 注入的）：
  // 收到就说明它在，别让那一行白写「需要扩展」；本会话记上「确认过在」（extEverReady）
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === 'AI_JD_EXTENSION_READY') {
      extEverReady = true;
      paintExtGuideState(true);
    }
  });

  // 进来先静默探一次（稍等一会儿，等 content script 注入完），把那行文案画对
  setTimeout(() => { extensionReady(2600).then(paintExtGuideState); }, 900);

  // timeoutMs：给每次请求一个上限。之前没有超时，一旦请求发出去没回来（浏览器连接被占住、
  // 网络卡死），界面就永远停在「运算中…」，用户只看到转圈、拿不到任何原因——必须有个出口。
  async function postJson(path, body, timeoutMs = 150000) {
    const ac = new AbortController();
    inflight = ac;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { ac.abort(); } catch { /* 已结束 */ } }, timeoutMs);
    let res;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      if (inflight === ac) inflight = null;
      if (timedOut) throw new Error('这次请求等太久了（超过 150 秒还没回来），请重试一次');
      // 用户按了「返回」取消：交给上层按「已取消」处理，不报错
      if (e && e.name === 'AbortError') throw e;
      throw new Error(e && e.message ? `网络请求失败：${e.message}` : '网络请求失败');
    } finally {
      clearTimeout(timer);
    }
    if (inflight === ac) inflight = null;
    // 401：口令不对或还没输。弹框要一次，拿到口令后重试这次请求。
    if (res.status === 401) {
      if (await promptToken()) return postJson(path, body, timeoutMs);
      throw new Error('需要访问口令才能使用');
    }
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.error || '分析失败');
      err.code = data.code || 'UNKNOWN';   // 带上失败原因的类型，前端据此决定要不要降级
      throw err;
    }
    return data;
  }

  /* 读 JD 页只走浏览器扩展：在用户自己的浏览器里打开页面取文本，带着登录态，
     招聘站点的风控基本拦不住。服务端原来还有一条「静默浏览器」读页的链路（/api/analyze），
     实测在 BOSS 这类站点上会被直接 302 到风控页、读不出任何 JD，已停用——
     那套静默浏览器现在只用于联网查城市数据（房价、工资、消费），不再碰 JD 页。 */
  async function fetchAnalysis(url) {
    if (!(await extensionReady(2400))) {
      paintExtGuideState(false);
      // 兜底：前面三条路都拦过一道了，这里再拦一道——先把安装教程摆到眼前再报错
      openExtGuide({ resume: 'url', url });
      throw new Error('「粘贴链接」「上传二维码」都要靠配套的浏览器扩展帮忙读页面：二维码里装的还是链接，'
        + '解出来一样得让扩展去打开它。'
        + '装法：浏览器地址栏打开 edge://extensions（Chrome 是 chrome://extensions）→ 打开「开发人员模式」→'
        + '「加载解压缩的扩展」→ 选随包的 extension 文件夹，然后刷新本页重试。'
        + '不想装扩展也可以：改用「上传截图」或「20 题分析我现在的工作」，这两条路不需要扩展。');
    }
    paintExtGuideState(true);
    const r = await extensionFetchJd(url);
    if (!r || !r.ok || !r.text) {
      throw new Error(`扩展没能读到这个页面的内容${r && r.error ? `（${r.error}）` : ''}——请确认页面在浏览器里能正常打开，等它加载完再点一次。`);
    }
    return postJson('/api/analyze-text', { url, text: r.text, resume: (loadResume() || {}).md || '' }, ANALYZE_TIMEOUT_MS);
  }

  /* 一次分析的完整流程。fetcher 只负责「把 JD 弄回来」——链接走扩展、截图走 OCR，
     之后的出报告、存档案、补城市数据完全一样，不写第二遍。 */
  async function runAnalyzeFlow(fetcher) {
    btnAnalyze.disabled = true;
    const tAnalyze = Date.now();
    T.event('analyze_start', { shots: pendingShots.length, url: jdUrl || '' });
    startReport(false);
    startWaitProgress();
    try {
      const data = await fetcher();
      if (aborted) return;
      T.event('analyze_done', {
        ms: Date.now() - tAnalyze,
        fromCache: !!data.fromCache,
        title: ((data.source || {}).job || {}).title || '',
      });
      await finishWaitProgress();
      dimsData = data.analysis.dimensions || [];
      // 身份用服务端回传的 url（截图模式是一个由正文算出来的 shot-xxx），
      // 两条路都能靠它存档案、命中缓存、之后重算薪资。
      const key = (data.source && data.source.url) || jdUrl || '';
      // 服务端没回传 url 时（旧版服务端），用本地解析出的 key 回填一次再落库，
      // 保证这条档案以后也认得回自己的链接
      if (key && data.source && !data.source.url) data.source.url = key;
      // 刷新还原用：这次分析的报告对应哪一份档案（缓存复用的那支走 openHistory，同样会登记）
      reportMemo = { recUrl: key || '', recId: '' };
      // JD 与上次完全一致：不重复生成，直接调出原分析档案（服务端也已跳过模型调用）
      if (data.fromCache) {
        recordHistory(key, data);
        ensureRegionData();
        toast('这个岗位的 JD 没有变化，直接读取上次的分析', 3200);
        await openHistory({ job: data.source.job, data });
      } else {
        recordHistory(key, data);
        // 发展潜力要联网采一次（几十秒）：不挡报告——先把其余五维、JD 解读、点评放出来，
        // 这一维在雷达图上挂进度圈后台采，采到自动补上（见 autoCollectGrowth）。
        // **先让它进队**：服务端那条队列是串行的，城市数据又是看不见的后台补数，
        // 先排城市数据会把报告上那个圈堵在它后面（见下面的 ensureRegionData）。
        const growthTask = autoCollectGrowth(key, data);
        await runReportSequence(data, 1);
        // JD 里没写休息情况：报告出来之后自动联网查一次（每条档案只查一次）
        const restTask = maybeSearchRestOnce({ url: key, data });
        // 城市数据排在最后：采集和休息查询都落定了再补它（用户不看着它，不值得挡在前面）
        Promise.allSettled([Promise.resolve(growthTask), Promise.resolve(restTask)])
          .then(() => ensureRegionData());
      }
    } catch (err) {
      stopWaitProgress();
      hideProgress();
      if (aborted) return;
      T.event('analyze_fail', { ms: Date.now() - tAnalyze, error: String((err && err.message) || '').slice(0, 120) });
      show(viewHome);
      toast(err.message || '分析失败，请重试');
    } finally {
      btnAnalyze.disabled = false;
    }
  }

  btnAnalyze.addEventListener('click', async () => {
    // 截图是选好之后才起跑的（选完不再直接分析）
    if (pendingShots.length) {
      await runAnalyzeFlow(() => postJson('/api/analyze-shots', { images: pendingShots, resume: (loadResume() || {}).md || '' }, ANALYZE_TIMEOUT_MS));
      return;
    }
    if (!jdUrl) return;
    await runAnalyzeFlow(() => fetchAnalysis(jdUrl));
  });

  // 「重新上传」：收起这一行、放回两行输入入口（连扩展说明那行），清掉已捕获的输入与勾，可以重新选任意方式
  btnReupload.addEventListener('click', () => {
    clearInput();
    setInputReady(false);
  });

  /* ---------- 按钮：上传 JD 截图（可多张，按选择顺序拼接） ---------- */

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error(`读取图片失败：${file.name}`));
      fr.readAsDataURL(file);
    });
  }

  btnShots.addEventListener('click', () => shotInput.click());

  shotInput.addEventListener('change', async () => {
    const files = [...(shotInput.files || [])];
    shotInput.value = '';            // 清空，同一批图还能再选一次
    if (!files.length) return;
    if (files.length > 12) {
      toast('一次最多 12 张截图', 3600);
      return;
    }
    const images = [];
    try {
      for (const f of files) images.push(await readAsDataUrl(f));
    } catch (err) {
      toast(err.message || '读取图片失败，换一张试试');
      return;
    }
    // 选完不再直接分析：和粘贴链接一样先进「已就绪」，收起整块输入入口、展开生成按钮
    pendingShots = images;
    jdUrl = null;
    pasteArmed = false;
    markInputDone(btnShots);
    setInputReady(true);
    T.event('shots_selected', { count: images.length });
  });

  /* ---------- 长图分享：先生成长图 → 出预览 → 点「导出图片」才下载 ----------
     入口按钮已按用户要求去掉；生成 / 预览 / 导出这套先留着，以后想再开入口直接接回来。 */

  const shotModal = $('shotModal');
  const shotImg = $('shotImg');
  let shotBlob = null;
  let shotUrl = '';

  function closeShotPreview() {
    shotModal.hidden = true;
    shotImg.removeAttribute('src');
    if (shotUrl) {
      URL.revokeObjectURL(shotUrl);
      shotUrl = '';
    }
    shotBlob = null;
  }

  function downloadShot() {
    if (!shotBlob || !shotUrl) return;
    const name = String((lastReportData && lastReportData.source && lastReportData.source.job && lastReportData.source.job.title) || '岗位分析')
      .replace(/[\\/:*?"<>|\s]/g, '_');
    const a = document.createElement('a');
    a.href = shotUrl;
    a.download = `岗位分析-${name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('长图已保存，可直接分享', 3200);
    // 关掉预览，但延后回收 URL：立刻 revoke 可能打断刚触发的下载
    const url = shotUrl;
    shotBlob = null;
    shotUrl = '';
    shotModal.hidden = true;
    shotImg.removeAttribute('src');
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // 长图分享的入口按钮已去掉（用户要求）；生成/预览/导出的这套代码先留着，
  // 以后想在别处再开一个入口，接回来就行。
  $('shotExport').addEventListener('click', downloadShot);
  $('shotCancel').addEventListener('click', closeShotPreview);
  $('shotClose').addEventListener('click', closeShotPreview);
  $('shotBackdrop').addEventListener('click', closeShotPreview);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shotModal.hidden) closeShotPreview();
  });

  /* ---------- 数据分析：年薪 × 年均休息日 ---------- */

  const QUAD_W = 720;
  const QUAD_L = 78;
  const QUAD_R = 112;   // 右侧留出空间放辅助线注释（不压在图上）
  const QUAD_T = 26;
  const QUAD_B = 60;
  const WEEK_PER_YEAR = 52;
  // 全年法定节假日：2025 年起为 13 天（春节 4 天、劳动节 2 天，其余同旧制）
  const STATUTORY_HOLIDAYS = 13;
  // 未写明休息时的默认天数：与评分口径共用同一个常量（public/score.js 的 REST_UNCLEAR_DAYS = 104 天），
  // 免得评分按一个天数、图表按另一个天数，同一条档案出现两个结论
  const REST_DEFAULT = (ScoreModel && ScoreModel.REST_UNCLEAR_DAYS) || (2 * WEEK_PER_YEAR);
  const MIN_SAMPLE = 5;   // 形成分析图的最低样本量（低于此值不生成图）


  function median(nums) {
    const a = nums.slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // 金额按「万」显示：最多一位小数，整数不带 .0
  function fmtWan(v) {
    const r = Math.round((v / 10000) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  // 金额短写（自带单位）：≥ 1 万写「X 万」，1 千 ~ 1 万写「X 千」（最多一位小数、整数不带 .0），
  // 不足 1 千直接写元的整数——月薪这类「月」口径的数低于 1 万时，0.6 万读不出量级，6 千才可以
  function moneyShort(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    if (n < 1000) return String(Math.round(n));
    // 千位四舍五入到一位小数；9,999 这种会舍成 10 千，直接升到「万」写才不会出现两位数的千
    const r = Math.round(n / 100) / 10;
    return r < 10 ? `${Number.isInteger(r) ? String(r) : r.toFixed(1)} 千` : `${fmtWan(n)} 万`;
  }

  // 休息描述 → 年均休息日：规则与后端评分共用一份（public/score.js 的 restDaysOfBrief），
  // 评分、时薪、性价比用的是同一个天数，不会各算各的——那边同样做「未提及双休」这类否定判断，
  // 所以这里别再抄一套正则。
  function restDaysFromText(text) {
    return ScoreModel ? ScoreModel.restDaysOfBrief(text) : null;
  }

  // 休息信息是不是「没有依据」的估算值：结论里读不出任何休息信号，就是估算
  function restIsMissing(data) {
    return restDaysFromText((data && data.analysis && data.analysis.restBrief) || '') == null;
  }

  const briefIsMissing = (b) => restDaysFromText(b) == null;

  // 休息数据的来源：user（本人补充）/ web（网络参考）/ jd（原文写了）/ ''（估算）
  function restSourceOf(data) {
    const a = (data && data.analysis) || {};
    if (a.restSource) return a.restSource;
    if (restIsMissing(data)) return '';
    const dim = (a.dimensions || []).find((d) => d.key === 'rest') || {};
    const txt = `${a.restBrief || ''} ${dim.analysis || ''}`;
    // 早期记录没存 restSource，但结论其实是联网查来的：靠措辞认出来
    if (/公开信息|员工评价|职友集|牛客|看准|爱企查|知乎/.test(txt)) return 'web';
    return 'jd';
  }

  // 休息描述 → 年均休息日。以结论 restBrief 为准（它就是档案上显示的那句话）。
  // 直接走评分口径那份实现：读不出来时用的是同一个默认假设（104 天），评分与图表永远是同一个天数。
  function restDaysOf(data) {
    const brief = (data && data.analysis && data.analysis.restBrief) || '';
    return ScoreModel ? ScoreModel.restDaysOf(brief) : REST_DEFAULT;
  }

  // 偏离度模型 v2 —— 对数尺度上的单边不确定性
  //   假设：信息不完整时只会高估休息，真实值 R = R̂·(1 − δ)，δ ≥ 0（单边，不会更好）
  //   合成：三项相互独立的不确定度按「误差传播」平方和开方：
  //         σ = sqrt(σ_证据² + σ_企业² + σ_行业²)
  //   取值：δ = min(σ, 0.35)，lo = round(R̂·(1 − δ))
  const SIG_EVIDENCE = { user: 0, jd: 0, web: 0.08, '': 0.15 };
  const SIG_COMPANY = { big: 0.03, mid: 0.06, small: 0.12, unknown: 0.08 };
  const SIG_INDUSTRY = { stable: 0.03, normal: 0.06, volatile: 0.10 };
  const REST_SOURCE_LABEL = { jd: 'JD 原文', user: '本人补充', web: '网络参考', '': '估算' };

  function companySigma(data) {
    const src = (data && data.source) || {};
    let txt = '';
    try { txt = JSON.stringify((src.jdBlocks || []).concat([src.job || {}])); } catch { txt = ''; }
    if (/已上市|1万人以上|10000人以上|万人以上/.test(txt)) return { s: SIG_COMPANY.big, why: '上市 / 万人以上，公开信息充分' };
    if (/不需要融资|1000-9999人/.test(txt)) return { s: SIG_COMPANY.mid, why: '中大厂，公开信息较多' };
    if (/天使轮|种子轮|未融资|0-20人|20-99人/.test(txt)) return { s: SIG_COMPANY.small, why: '早期公司 / 小团队，样本少' };
    return { s: SIG_COMPANY.unknown, why: '公司体量未知' };
  }

  function industrySigma(data) {
    const ind = industryKindOf(data);
    if (ind === 'stable') return { s: SIG_INDUSTRY.stable, why: '作息相对稳定的行业' };
    if (ind === 'volatile') return { s: SIG_INDUSTRY.volatile, why: '作息离散度大的行业' };
    return { s: SIG_INDUSTRY.normal, why: '一般行业' };
  }

  // 行业分类：与休息偏离度共用一个判断（public/score.js 的 industryKindOf），
  // 不在前端另抄一份关键词表——否则时薪按 A 行业估、休息偏离按 B 行业算，同一条档案两个口径。
  function industryKindOf(data) {
    const src = (data && data.source) || {};
    const job = src.job || {};
    const txt = `${job.title || ''} ${(src.jdBlocks || []).map((b) => (b.items || []).join(' ')).join(' ')} ${src.jdText || ''}`;
    return ScoreModel && ScoreModel.industryKindOf ? ScoreModel.industryKindOf(txt) : 'normal';
  }

  /* 每日工作时长（小时）：口径在 public/score.js 的 dailyHoursOf（页面、导出共用同一份）。
     这里只负责把这条档案能用的文本凑齐：
       · jd  ＝ JD 原文 ＋ 强度线索里那两句可核原句（模型摘出来的，已在服务端校验过确在原文里）
       · note＝ 休息摘要 ＋ 联网参考的结论（联网查到的作息同样算数） */
  function hoursOf(data) {
    const a = (data && data.analysis) || {};
    const src = (data && data.source) || {};
    const meta = a.restMeta || {};
    const evidence = Array.isArray(meta.evidence) ? meta.evidence.join(' ') : '';
    const jd = `${src.jdText || ''} ${evidence}`;
    const note = `${a.restBrief || ''} ${a.restNote || ''} ${(a.restSearch && a.restSearch.summary) || ''}`;
    if (ScoreModel && ScoreModel.dailyHoursOf) return ScoreModel.dailyHoursOf({ jd, note }, meta);
    // 公共口径模块没加载上时退回法定标准工时，图还能画出来
    return { lo: 7, mid: 8, hi: 9.5, source: 'industry', why: '按法定每日 8 小时' };
  }

  const HOURS_SOURCE_LABEL = { jd: 'JD 原文', web: '联网参考', intensity: '行业水平＋强度线索', industry: '行业水平估算' };

  // 每日工时的短描述：详情里一行说清「按几小时算的、凭什么」
  function hoursBriefOf(h) {
    if (!h) return '';
    const label = HOURS_SOURCE_LABEL[h.source] || '估算';
    return h.hi > h.lo
      ? `每日工时 ${h.lo}~${h.hi} 小时，取中 ${h.mid}（${label}）`
      : `每日工时 ${h.mid} 小时（${label}）`;
  }

  function restDevOf(data) {
    const src = restSourceOf(data);
    const s1 = SIG_EVIDENCE[src] == null ? SIG_EVIDENCE[''] : SIG_EVIDENCE[src];
    if (!s1) return { dev: 0, parts: null, why: '休息信息有依据（JD / 本人补充），不计偏离' };
    const c = companySigma(data);
    const ind = industrySigma(data);
    const dev = Math.min(0.35, Math.sqrt(s1 * s1 + c.s * c.s + ind.s * ind.s));
    return {
      dev: Math.round(dev * 1000) / 1000,
      parts: `${s1.toFixed(3)}² + ${c.s.toFixed(3)}² + ${ind.s.toFixed(3)}²`,
      why: `${c.why}；${ind.why}`,
    };
  }

  function restRangeOf(data) {
    const est = restDaysOf(data);
    const source = restSourceOf(data);
    const d = restDevOf(data);
    return {
      est,
      lo: Math.max(0, Math.round(est * (1 - d.dev))),
      hi: est,
      dev: d.dev,
      devWhy: d.why,
      devParts: d.parts,
      source,
    };
  }

  // 单个数值 → 年薪（元/年）：月薪按薪数年化；日薪 / 时薪按年工作天数（365 − 年休息日）折算。
  function annualOfOne(t, v, restDays) {
    const workDays = Math.max(1, 365 - restDays);
    if (/\/\s*天|元\s*\/?\s*天|日薪|每天/.test(t)) return v * workDays;
    if (/\/\s*时|元\s*\/?\s*时|时薪|小时/.test(t)) return v * 8 * workDays;
    let monthly;
    if (/万/.test(t)) {
      const yuan = v * 10000;
      monthly = /年/.test(t) ? yuan / 12 : yuan;
    } else if (/[Kk千]/.test(t)) {
      monthly = v * 1000;
    } else {
      monthly = v >= 1000 ? v : v * 1000;
    }
    const months = Number((t.match(/(\d+)\s*薪/) || [])[1]) || 12;
    return monthly * months;
  }

  // 档案里的薪资本来就是区间（如 30k-60k），所以年薪也有区间：lo / hi / mid
  function annualRangeOf(job, restDays) {
    const t = String((job && job.salary) || '').trim();
    if (!t) return null;
    const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (!nums.length) return null;
    const a = annualOfOne(t, nums[0], restDays);
    const b = nums.length >= 2 ? annualOfOne(t, nums[1], restDays) : a;
    return { lo: Math.min(a, b), hi: Math.max(a, b), mid: (a + b) / 2 };
  }

  // 时薪：年薪 ÷ 全年工作时间（年工作天数 × 每日工作时长）。休息日越多、每天越短，时薪越高。
  // 每日工时按岗位分别取（hoursOf），默认 8 小时只兜底用。
  function hourlyPayOf(annualPay, restDays, hoursPerDay) {
    if (annualPay == null) return null;
    const workDays = Math.max(1, 365 - restDays);
    const perDay = hoursPerDay > 0 ? hoursPerDay : 8;
    return Math.round(annualPay / (workDays * perDay));
  }

  // 匹配度分（0~10）：先看记录层的快照 rec.dims，再退回档案里的 dimensions。
  // 两处都没有就返回 null——乘数（matchMultiplier）反推不出分数，不硬凑。
  function matchScoreOf(rec) {
    const at = (list) => {
      const d = (list || []).find((x) => x && x.key === 'match' && typeof x.score === 'number' && isFinite(x.score));
      return d ? d.score : null;
    };
    const s = at(rec.dims) != null ? at(rec.dims) : at(rec.data && rec.data.analysis && rec.data.analysis.dimensions);
    return s == null ? null : Math.max(0, Math.min(10, s));
  }

  // 历史档案 → 图上的点。没读到薪资的岗位画不出位置，直接不进图。
  function analysisPoints() {
    const pts = [];
    for (const rec of historySource()) {
      const data = rec.data || {};
      const restRange = restRangeOf(data);
      const rest = restRange.est;
      const payRange = annualRangeOf(data.source.job || {}, rest);
      if (payRange == null) continue;
      const pay = payRange.mid;
      // 预期年薪：在档案给的薪资区间里按匹配度落位——匹配度越高，越靠区间上沿。
      // 没有匹配度分时不硬凑（乘数反推不出分数），退回 JD 薪资中位。
      const match = matchScoreOf(rec);
      const expPay = match == null ? pay : payRange.lo + (payRange.hi - payRange.lo) * (match / 10);
      const hours = hoursOf(data);
      // 时薪区间要吃三个不确定性：档案给的薪资区间 × 休息偏离度 × 每日工时的区间。
      // 下沿＝薪资下沿、休息最差、工时最长；上沿＝薪资上沿、休息最好、工时最短——
      // 所以不同岗位的时薪排序不一定跟年薪一致（每天 10 小时的 30 万和每天 8 小时的 30 万不是一回事）。
      const hLo = hourlyPayOf(payRange.lo, restRange.lo, hours.hi);
      const hHi = hourlyPayOf(payRange.hi, restRange.est, hours.lo);
      pts.push({
        rec, pay, rest, match, expPay,
        payLo: payRange.lo,
        payHi: payRange.hi,
        restMid: (restRange.lo + restRange.est) / 2,
        hours,
        hourly: Math.round((hLo + hHi) / 2),
        hourlyLo: Math.min(hLo, hHi),
        hourlyHi: Math.max(hLo, hHi),
        restRange,
        title: (rec.job && rec.job.title) || '未命名岗位',
        company: (rec.job && rec.job.company) || '',
        source: restRange.source,
      });
    }
    return pts;
  }

  function quadLabelOf(p, mx, my, val) {
    // val 是当前纵轴口径下的值（切换时薪时不能拿年薪去比）
    const rich = (val == null ? p.pay : val) >= my;
    const free = p.rest >= mx;
    if (rich && free) return '高薪 · 多休';
    if (rich) return '高薪 · 少休';
    if (free) return '低薪 · 多休';
    return '低薪 · 少休';
  }

  // 刻度步长取 1 / 2 / 2.5 / 5 / 10 × 10^n，保证刻度值是整齐的数
  function ticksOf(min, max, count) {
    const raw = (max - min) / Math.max(1, count);
    if (!(raw > 0)) return [];
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let i = 0; i * step + start <= max + 1e-9; i++) out.push(start + i * step);
    return out;
  }

  // 传统坐标系散点图：左下两条带箭头的轴、整齐刻度、中位十字线。
  // 取完范围后再补留白，保证最外圈的点离图边至少 5%。
  function renderQuadrant(svg, pts, opts = {}) {
    const H = opts.h || 420;
    const L = QUAD_L;
    const R = QUAD_W - QUAD_R;
    const T = QUAD_T;
    const B = H - QUAD_B;
    svg.setAttribute('viewBox', `0 0 ${QUAD_W} ${H}`);
    svg.innerHTML = '';

    // 纵轴可切换年薪 / 时薪：时薪＝年薪 ÷（年工作天数 × 每日工时），休息日越多时薪越高。
    // 年薪口径下点的纵坐标用「预期年薪」——在薪资区间里按匹配度落位，不再是 JD 中位。
    const hourly = opts.metric === 'hourly';
    const yVal = (p) => (hourly ? (p.hourly == null ? 0 : p.hourly) : (p.expPay == null ? p.pay : p.expPay));
    const yFmt = (v) => (hourly ? String(Math.round(v)) : fmtWan(v));
    // 竖辅助线用的区间跟着纵轴口径走：纵轴是年薪就取年薪区间，切到时薪就取时薪区间
    const yRangeOf = (p) => (hourly ? [p.hourlyLo, p.hourlyHi] : [p.payLo, p.payHi]);

    const add = (tag, attrs) => { const e = svgEl(tag, attrs); svg.appendChild(e); return e; };
    const txt = (x, y, s, o = {}) => {
      const e = svgEl('text', {
        x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 11.5, fill: o.fill || '#9b9a97',
        ...(o.rotate ? { transform: `rotate(${o.rotate} ${x} ${y})` } : {}),
        ...(o.weight ? { 'font-weight': o.weight } : {}),
      });
      e.textContent = s;
      svg.appendChild(e);
      return e;
    };

    // 坐标轴框架（箭头 + 轴名）：无论有没有数据都画，这是图的骨架
    add('line', { x1: L, y1: B, x2: L, y2: T - 1, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${L - 3.6},${T - 1} ${L + 3.6},${T - 1} ${L},${T - 11}`, fill: '#191919' });
    add('line', { x1: L, y1: B, x2: R + 1, y2: B, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${R + 1},${B - 3.6} ${R + 1},${B + 3.6} ${R + 11},${B}`, fill: '#191919' });
    txt((L + R) / 2, B + 40, '年均休息日（天/年）', { size: 12 });
    txt(16, (T + B) / 2, hourly ? '时薪（元/小时 · 对数刻度）' : '年薪（万元/年 · 对数刻度）', { size: 12, rotate: -90 });

    // 样本不足：只留框架，不画任何数据（居中提示由外部 overlay 负责）
    if (opts.empty || !pts.length) return;

    // 休息制度参考线：52 周 + 13 天法定节假日，即单休 65 / 大小周 91 / 双休 117 天
    const REST_REFS = [
      { v: WEEK_PER_YEAR + STATUTORY_HOLIDAYS, label: '单休' },
      { v: Math.round(1.5 * WEEK_PER_YEAR) + STATUTORY_HOLIDAYS, label: '大小周' },
      { v: 2 * WEEK_PER_YEAR + STATUTORY_HOLIDAYS, label: '双休' },
    ];
    // 点位取「偏离度区间的中点」——区间是只会更差的那一段，中点才是可比的估计位置
    const xVal = (p) => (p.restMid == null ? p.rest : p.restMid);
    // 象限参考：默认中位数；换成全国 / 某城市时用固定基准（由图下方的选择器决定）
    const basis = opts.basis || null;
    const mx = basis ? basis.mx : median(pts.map(xVal));
    const my = basis ? basis.my : median(pts.map(yVal));
    let x0 = Math.min(mx, ...pts.map(xVal));
    let x1 = Math.max(mx, ...pts.map(xVal));
    // 参考线始终留在视野内，否则数据集中在窄区间时它们会跑到图外
    for (const r of REST_REFS) { x0 = Math.min(x0, r.v); x1 = Math.max(x1, r.v); }
    let y0 = Math.min(my, ...pts.map(yVal));
    let y1 = Math.max(my, ...pts.map(yVal));
    // 竖辅助线的两端（薪资区间的两端）也要留在视野内，否则区间线会伸出坐标框
    for (const p of pts) {
      const [pl, ph] = yRangeOf(p);
      if (pl != null) y0 = Math.min(y0, pl);
      if (ph != null) y1 = Math.max(y1, ph);
    }
    // 工资参考线也纳入视野，否则它们会跑到图外看不到
    for (const wl of opts.wageLines || []) {
      if (wl.value > 0) { y0 = Math.min(y0, wl.value); y1 = Math.max(y1, wl.value); }
    }
    // 横轴按数据范围补留白：20% 余量，最外圈的点至少离图边 14%。
    // 不把下界压到 0——否则低值点会被顶到贴着轴；刻度里负值不显示，轴上就看不到负数。
    const xPad = Math.max((x1 - x0) * 0.2, Math.max(6, mx * 0.08));
    x0 -= xPad; x1 += xPad;
    // 纵轴走对数刻度：等距离＝等比例，6~20 万这段挨在一起的点才拉得开。
    // 留白按比例留（乘除，不是加减）——低位那半段的间距才不会被余量又压回去；
    // y0 / y1 仍然是原值：悬停读数、象限比较一律用原值，不拿换算后的数去比。
    const logFloor = hourly ? 1 : 1000;       // 对数没有 0：时薪保底 1 元/时、年薪保底 1000 元/年
    const ln = (v) => Math.log(Math.max(v, logFloor));
    const lo = Math.max(y0, logFloor) / 1.2;  // 轴的下界：往下留两成，最低的点不会贴着轴
    const hi = Math.max(y1, lo * 1.05) * 1.2; // 轴的上界：往上留两成；点全都一样高时也留得出来
    const lnLo = Math.log(lo);
    const lnSpan = Math.log(hi) - lnLo;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * (R - L);
    const Y = (v) => B - ((ln(v) - lnLo) / lnSpan) * (B - T);

    // 对数刻度上标什么数：还是好读的整数 1 / 1.2 / 1.5 / 2 / 3 / 4 / 5 / 6 / 8 × 10^n
    // （…5 / 6 / 8 / 10 / 12 / 15 / 20 / 30 / 40 / 50 / 60 / 80 万…），落点按 ln 换算——
    // 等距离＝等比例，低位那半段自然比高位疏。
    const LOG_MANTISSA = [1, 1.2, 1.5, 2, 3, 4, 5, 6, 8];
    const logTicksOf = (a0, a1) => {
      const a = Math.max(a0, logFloor);
      const b = Math.max(a1, a * 1.05);
      const out = [];
      for (let n = Math.floor(Math.log10(a)) - 1; n <= Math.floor(Math.log10(b)) + 1; n++) {
        for (const k of LOG_MANTISSA) {
          // 乘出来是 119999.99999999999 这种，收一下小数位，标出来的才是整数
          const v = Number((k * Math.pow(10, n)).toPrecision(12));
          if (v < logFloor) continue;
          if (v > a - 1e-9 && v < b + 1e-9) out.push(v);
        }
      }
      return out.sort((p, q) => p - q);
    };

    // 岗位太少时中位线没有统计意义，就只画参考线，不下「高薪/低薪」的判断
    const showQuad = pts.length >= 5;

    // 右上（高薪 + 多休）淡底，视觉上给出「好位置」
    if (showQuad) {
      add('rect', { x: X(mx), y: T, width: R - X(mx), height: Y(my) - T, fill: 'rgba(25,25,25,0.06)' });
    }

    // 参考线的开关：点标签就收起这条线，各张分析图共用同一套状态（见 refLineOff）
    const chart = opts.chart || 'scatter';
    const redraw = opts.redraw;

    // 单休 / 大小周 / 双休参考线：浅灰竖线压在数据点下面，顶部标名称与天数
    for (const r of REST_REFS) {
      if (!isRefOff(chart, r.label)) {
        add('line', { x1: X(r.v), y1: T, x2: X(r.v), y2: B, stroke: '#e7e7e4', 'stroke-width': 1 });
      }
      markRefToggle(txt(X(r.v), T - 8, `${r.label} ${r.v}`, { size: 10.5, fill: '#b9b8b5' }), chart, r.label, redraw);
    }

    // 工资参考线（全国 / 各城市平均）：浅灰横线，注释放到图外右侧，不压数据
    for (const wl of opts.wageLines || []) {
      if (!(wl.value > 0)) continue;
      if (!isRefOff(chart, wl.label)) {
        add('line', { x1: L, y1: Y(wl.value), x2: R, y2: Y(wl.value), stroke: '#dcdcda', 'stroke-width': 1, 'stroke-dasharray': '4 3' });
      }
      markRefToggle(txt(R + 8, Y(wl.value) + 4, `${wl.label} ${yFmt(wl.value)}`, { anchor: 'start', size: 10.5, fill: '#9b9a97' }),
        chart, wl.label, redraw);
    }

    // 中位十字线：划出四个象限，故意画得比参考线重。这一对当作一条「中位线」——
    // 轴上加粗的那个中位值就是它的开关，点哪一头都是收起 / 展开这一整对。
    if (!isRefOff(chart, '中位')) {
      add('line', { x1: X(mx), y1: T, x2: X(mx), y2: B, stroke: '#a9a8a4', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
      add('line', { x1: L, y1: Y(my), x2: R, y2: Y(my), stroke: '#a9a8a4', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
    }

    // 刻度：中位那一档让位给中位值，避免两行数字打架；负值不标（两项都不该为负）。
    // 纵轴上的刻度还要跟上一档隔开 15px——对数刻度下低位那几档天然更密，挤在一起谁也读不出来。
    for (const v of ticksOf(x0, x1, 5)) {
      if (v < 0 || Math.abs(X(v) - X(mx)) < 30) continue;
      add('line', { x1: X(v), y1: B, x2: X(v), y2: B + 4, stroke: '#c9c9c6', 'stroke-width': 1 });
      txt(X(v), B + 17, String(Math.round(v)), { size: 11 });
    }
    let lastTY = null;
    // 取值的范围按数据本身（y0~y1）：对数刻度上贴着轴的那一档会压到横轴上，不如不标
    for (const v of logTicksOf(y0, y1)) {
      const ty = Y(v);
      if (Math.abs(ty - Y(my)) < 15) continue;
      if (lastTY != null && Math.abs(ty - lastTY) < 15) continue;
      lastTY = ty;
      add('line', { x1: L - 4, y1: ty, x2: L, y2: ty, stroke: '#c9c9c6', 'stroke-width': 1 });
      txt(L - 8, ty + 4, yFmt(v), { anchor: 'end', size: 11 });
    }
    // 中位值单独加粗标出来：这两个加粗的数字同时就是中位线的开关（点一下收起 / 显示那一对虚线）
    markRefToggle(txt(X(mx), B + 17, String(Math.round(mx)), { size: 11, fill: '#191919', weight: 600 }), chart, '中位', redraw);
    markRefToggle(txt(L - 8, Y(my) + 4, yFmt(my), { anchor: 'end', size: 11, fill: '#191919', weight: 600 }), chart, '中位', redraw);

    // 象限注解
    if (showQuad) {
      const inset = 12;
      const qo = { size: 12.5, fill: '#6f6e69', weight: 600 };
      txt(R - inset, T + 20, '高薪 · 多休', { anchor: 'end', ...qo });
      txt(L + inset, T + 20, '高薪 · 少休', { anchor: 'start', ...qo });
      txt(R - inset, B - 12, '低薪 · 多休', { anchor: 'end', ...qo });
      txt(L + inset, B - 12, '低薪 · 少休', { anchor: 'start', ...qo });
    }

    // 每个岗位＝一个点 ＋ 两条区间辅助线：
    //   横线＝休息天数区间（右端＝估计值，左端＝最差情形），竖线＝该口径下的薪资 / 时薪区间；
    //   点的横坐标＝休息取中，纵坐标＝预期年薪（薪资区间里按匹配度落位）。
    // 重叠时不做抖动，坐标保持真实；辅助线先画在点下面，点仍然一个个数得清。
    // 本次分析的岗位（报告页正在看的那份）画成最深的一个墨点：别的点都淡一档，一眼能挑出它；
    // 收藏过的岗位次之——也是墨色，只是半径维持常规大小。
    // 点自己就是命中目标（悬停 / 点击的坐标从 .quad-pt 的 cx / cy 上读），颜色只影响认不认得出。
    const hUrl = opts.highlightUrl !== undefined ? opts.highlightUrl : reportHighlightUrl;
    const tone = (p) => toneOf(p.rec, hUrl);

    const guides = add('g', { class: 'quad-guides', 'pointer-events': 'none' });
    const dots = [];
    for (const p of pts) {
      const cx = X(xVal(p));
      const cy = Y(yVal(p));
      const t = tone(p);
      // 本次分析的岗位：点和两条区间辅助线都用纯黑，一眼挑得出来（其余岗位维持浅灰线）
      const guideAttrs = t === 'cur' ? { class: 'quad-guide', style: 'stroke:#191919' } : { class: 'quad-guide' };
      const rr = p.restRange;
      // 没有区间（偏离度为 0）就不画线，只留点
      if (rr && rr.dev > 0 && rr.lo < rr.hi) {
        guides.appendChild(svgEl('line', {
          x1: X(rr.lo).toFixed(1), y1: cy.toFixed(1), x2: X(rr.hi).toFixed(1), y2: cy.toFixed(1),
          ...guideAttrs,
        }));
      }
      const [pl, ph] = yRangeOf(p);
      if (pl != null && ph != null && ph > pl) {
        guides.appendChild(svgEl('line', {
          x1: cx.toFixed(1), y1: Y(pl).toFixed(1), x2: cx.toFixed(1), y2: Y(ph).toFixed(1),
          ...guideAttrs,
        }));
      }
      // 点按休息来源分三种画法：有依据＝实心，估算＝空心，网络参考＝虚线空心；
      // 本次分析的岗位与收藏过的都不按来源分，统一画成墨色点，前者半径再大一点
      const kind = p.source === 'web' ? 'dash' : (p.source === 'jd' || p.source === 'user' ? 'solid' : 'hollow');
      dots.push(svgEl('circle', {
        cx: cx.toFixed(1), cy: cy.toFixed(1), r: t === 'cur' ? 4.4 : 3.8,
        class: t === 'fav' ? 'quad-pt quad-pt-fav' : (t === 'cur' ? 'quad-pt quad-pt-cur' : `quad-pt quad-pt-${kind}`),
      }));
    }
    dots.forEach((d) => svg.appendChild(d));
    // 悬停 / 选中点时跟随的十字辅助线：从点对到两条轴，方便读数
    const crossG = add('g', { class: 'quad-cross', opacity: '0', 'pointer-events': 'none' });
    const crossV = add('line', { x1: 0, y1: T, x2: 0, y2: B, stroke: '#b9b8b5', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
    const crossH = add('line', { x1: L, y1: 0, x2: R, y2: 0, stroke: '#b9b8b5', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
    crossG.appendChild(crossV);
    crossG.appendChild(crossH);
    if (opts.tipEl) bindQuadTips(svg, opts.tipEl, pts, mx, my, yVal, { g: crossG, v: crossV, h: crossH });
  }

  /* 图上「依次选中」的记号：一岗一色（低饱和度，与对比页同一套色系），序号从 1 起。
     选中的方框与图下详情前面那颗序号共用同一个颜色——几份档案横着比的时候，
     不用回头看标题，就知道哪条详情对应图上的哪个框。 */
  const PICK_COLORS = ['#c98a8a', '#7f9ec0', '#86a986', '#9d9d9b', '#b9a07f', '#a08fbb'];
  const PICK_NOS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const pickColorOf = (k) => PICK_COLORS[k % PICK_COLORS.length];

  /* 选中的方框：点为中心、只描边，颜色按选中次序。
     颜色必须写在 style 上——.quad-pick 那条 CSS 规则（stroke: #191919）会盖掉 SVG 的
     表现属性（presentation attribute），写 stroke 属性在屏幕上仍是黑的。 */
  function pickBoxEl(x, y, size, order) {
    return svgEl('rect', {
      x: (x - size / 2).toFixed(1), y: (y - size / 2).toFixed(1),
      width: size, height: size, class: 'quad-pick', style: `stroke:${pickColorOf(order)}`,
    });
  }

  // 详情标题前面那一粒序号：与框同色、加粗
  function pickNoEl(order) {
    const no = document.createElement('span');
    no.className = 'quad-tip-no';
    no.textContent = PICK_NOS[order % PICK_NOS.length];
    no.style.color = pickColorOf(order);
    return no;
  }

  // 点交互：悬停看岗位信息、光标跟着走；点一下选中（再点一下取消，可以多选），选中的点各带一个方框；
  // 点某条信息就跳到那份档案；点空白处只解除钉住——已经选中的点留着。
  // 点重叠时不做抖动，坐标保持真实：就近命中一整簇，把簇里的岗位竖排列出来。
  function bindQuadTips(svg, tipEl, pts, mx, my, yVal, cross) {
    const dots = [...svg.querySelectorAll('.quad-pt')];
    if (!dots.length) return;
    // 纵轴当前口径（年薪 / 时薪）
    const yv = (p) => (yVal ? yVal(p) : p.pay);
    const HIT = 16;    // 命中半径，单位是 SVG 用户坐标，和像素基本 1:1
    const PICK = 16;   // 选中方框的边长
    // 命中按点算：坐标直接从点上读，不再看任何包围盒（dots 与 pts 一一对应）
    const coords = dots.map((d) => ({
      x: Number(d.getAttribute('cx')),
      y: Number(d.getAttribute('cy')),
    }));
    let lastKey = '';
    let hoverList = [];       // 光标当前扫到的那一簇（没选中任何点时用它做预览）
    const picked = [];        // 选中的点（存点在 pts 里的下标，可多选，按点选顺序）
    const boxes = new Map();  // 选中点各自的方框：下标 → rect
    let hideTimer = null;

    // 图下方的固定详情区不需要浮层定位，也不该被整块隐藏
    const floating = !tipEl.classList.contains('chart-detail');
    if (floating) tipEl.hidden = true;

    const toSvg = (evt) => {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return {
        x: ((evt.clientX - box.left) / box.width) * vb.width,
        y: ((evt.clientY - box.top) / box.height) * vb.height,
      };
    };

    // 光标附近的一簇点，按距离从近到远
    const clusterAt = (p) => coords
      .map((c, i) => ({ i, d: Math.hypot(c.x - p.x, c.y - p.y) }))
      .filter((o) => o.d <= HIT)
      .sort((a, b) => a.d - b.d)
      .map((o) => o.i);

    const highlight = (i) => {
      dots.forEach((el, k) => el.classList.toggle('quad-pt-hit', k === i));
      if (!cross) return;
      const c = i != null ? coords[i] : null;
      if (!c) { cross.g.setAttribute('opacity', '0'); return; }
      cross.v.setAttribute('x1', c.x); cross.v.setAttribute('x2', c.x);
      cross.h.setAttribute('y1', c.y); cross.h.setAttribute('y2', c.y);
      cross.g.setAttribute('opacity', '1');
    };

    // 选中 / 取消选中：选中的点各配一个方框（点为中心、只描边），多选时互不干扰。
    // 框的颜色与详情前面的序号按**选中顺序**排：取消掉一个，后面的颜色与序号跟着往前挪。
    const repaintBoxes = () => {
      for (const [i, box] of boxes) box.style.stroke = pickColorOf(picked.indexOf(i));
    };
    const pick = (i) => {
      if (picked.includes(i)) return;
      picked.push(i);
      const c = coords[i];
      const box = pickBoxEl(c.x, c.y, PICK, picked.length - 1);
      svg.appendChild(box);
      boxes.set(i, box);
    };
    const unpick = (i) => {
      const at = picked.indexOf(i);
      if (at < 0) return;
      picked.splice(at, 1);
      const box = boxes.get(i);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      boxes.delete(i);
      repaintBoxes();
    };

    // list＝要列的点（选中的那些，或悬停预览的那一簇）；pickedMode＝这次画的是「选中列表」
    const paint = (list, pickedMode = false) => {
      lastKey = (pickedMode ? 'pick:' : 'hover:') + list.join(',');
      tipEl.textContent = '';
      if (!list.length) {
        if (floating) tipEl.hidden = true;
        svg.style.cursor = '';
        highlight(null);
        return;
      }
      if (pickedMode) {
        const hint = document.createElement('p');
        hint.className = 'quad-tip-hint';
        hint.textContent = `已选中 ${list.length} 个岗位（再点一下图上的点取消选择）`;
        tipEl.appendChild(hint);
      }
      // 完全重合的点数值是一样的，数值只写一次，下面竖排列出各自的岗位
      const first = pts[list[0]];
      const allSame = list.length > 1
        && list.every((pi) => pts[pi].pay === first.pay && pts[pi].rest === first.rest);
      // 每个点位把「休息偏离度」「每日工时」「薪资 / 时薪区间」都写清楚
      const rangeLine = (p) => {
        const parts = [];
        if (p.payLo != null && p.payHi != null && p.payHi > p.payLo) {
          // 图上点的高度按「预期年薪」落位，所以除了区间中点，也把预期值写出来
          const exp = p.match != null && p.expPay != null
            ? `，预期 ${fmtWan(p.expPay)} 万（匹配度 ${Math.round(p.match * 10) / 10}/10 落位）`
            : '';
          parts.push(`年薪区间 ${fmtWan(p.payLo)}~${fmtWan(p.payHi)} 万，取中 ${fmtWan(p.pay)} 万${exp}`);
        } else {
          parts.push(`年薪约 ${fmtWan(p.pay)} 万`);
        }
        const rr = p.restRange;
        if (rr) {
          const label = REST_SOURCE_LABEL[rr.source] || '估算';
          parts.push(rr.dev > 0
            ? `休息 ${rr.lo}~${rr.est} 天（${label}，偏离度 -${Math.round(rr.dev * 100)}%），取中 ${Math.round((rr.lo + rr.est) / 2)} 天`
            : `休息 ${rr.est} 天（${label}，无偏离）`);
        }
        if (p.hours) parts.push(hoursBriefOf(p.hours));
        if (p.hourly != null) {
          parts.push(p.hourlyHi > p.hourlyLo
            ? `时薪 ${p.hourlyLo}~${p.hourlyHi} 元/小时（取中 ${p.hourly}）`
            : `时薪约 ${p.hourly} 元/小时`);
        }
        return parts.join(' · ');
      };
      const payLine = (p) => `${rangeLine(p)} · ${quadLabelOf(p, mx, my, yv(p))}`;
      if (allSame) {
        const head = document.createElement('p');
        head.className = 'quad-tip-meta quad-tip-shared';
        head.textContent = payLine(first);
        tipEl.appendChild(head);
      }
      list.forEach((pi, k) => {
        const p = pts[pi];
        const item = document.createElement('div');
        item.className = 'quad-tip-item';
        const a = document.createElement('p');
        a.className = 'quad-tip-title';
        // 选中列表里每条前面挂一粒序号（颜色＝图上那个框的颜色）；悬停预览不挂
        if (pickedMode) a.appendChild(pickNoEl(k));
        a.appendChild(document.createTextNode(p.title + (p.company ? ` · ${p.company}` : '')));
        item.appendChild(a);
        if (!allSame) {
          const b = document.createElement('p');
          b.className = 'quad-tip-meta';
          b.textContent = payLine(p);
          item.appendChild(b);
        }
        item.addEventListener('mouseenter', () => highlight(pi));
        item.addEventListener('mouseleave', () => highlight(list[0]));
        item.addEventListener('click', (e) => { e.stopPropagation(); openHistory(p.rec); });
        tipEl.appendChild(item);
      });
      highlight(list[0]);

      // 位置按 SVG 用户坐标换算到实际像素；先按默认方向摆，再整体夹在图内不越界
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const x = (coords[list[0]].x / vb.width) * box.width;
      const y = (coords[list[0]].y / vb.height) * box.height;
      if (floating) tipEl.hidden = false;
      const w = tipEl.offsetWidth;
      const h = tipEl.offsetHeight;
      const flipX = x > box.width * 0.55;
      let left = flipX ? x - 12 - w : x + 12;
      left = Math.max(4, Math.min(left, box.width - 4 - w));
      let top = y - 12 - h;
      if (top < 4) top = y + 14;
      top = Math.max(4, Math.min(top, Math.max(4, box.height - 4 - h)));
      tipEl.style.left = `${Math.round(left)}px`;
      tipEl.style.top = `${Math.round(top)}px`;
      tipEl.style.transform = 'none';
      svg.style.cursor = 'pointer';
    };

    // 有选中就把选中的都列出来；一个都没选中时，只预览鼠标扫到的那一簇
    const renderTips = () => {
      if (picked.length) { paint(picked.slice(), true); return; }
      clear();
    };

    // 收起列表（选中的点不在清理范围内，要再点它一下才取消）
    const clear = () => {
      lastKey = '';
      if (floating) tipEl.hidden = true;
      tipEl.textContent = '';
      svg.style.cursor = '';
      highlight(null);
    };

    // 从点移到标签上时留一点缓冲，别让信息先消失
    const clearSoon = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (!picked.length) clear(); }, 200);
    };

    svg.addEventListener('mousemove', (e) => {
      clearTimeout(hideTimer);
      hoverList = clusterAt(toSvg(e));
      if (picked.length) {               // 已经选了：只挪命中高亮，列表不动
        if (hoverList.length) highlight(hoverList[0]);
        return;
      }
      if (!hoverList.length) { if (lastKey) clear(); return; }
      if (`hover:${hoverList.join(',')}` === lastKey) return;
      paint(hoverList);
    });

    svg.addEventListener('mouseleave', clearSoon);
    tipEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tipEl.addEventListener('mouseleave', clearSoon);

    // 点数据点：整簇一起入选 / 一起取消（重叠的点算一簇，不抖动、坐标保持真实）
    svg.addEventListener('click', (e) => {
      const list = clusterAt(toSvg(e));
      // 点空白：把列表收起来，但选中的点一个都不少
      if (!list.length) { clear(); return; }
      const allIn = list.every((i) => picked.includes(i));
      if (allIn) list.forEach(unpick); else list.forEach(pick);
      renderTips();
    });
  }

  /* ---------- 分析图：两个槽位，点标题换图 ---------- */

  // 纵轴口径：年薪 / 时薪（时薪＝年薪 ÷ 年工作时间，休息一变它也跟着变）
  let payMetric = 'annual';
  // 象限参考：median（中位数，相对位置）/ national（全国平均）/ city（某城市平均，留给以后的入口）。
  // 「一线 / 二线」两条口径按用户要求从界面上撤了（按钮去掉），取数分支也一并删掉；
  // 那份分组数据还在（data/city-tier.json 与 score.js 的镜像，test/citytier.test.js 继续盯着它）
  let quadBasisMode = 'median';
  let quadBasisCity = '';
  // 职位对比页只有一个图槽，当前展示哪张图
  const slotCharts = ['growthstep'];

  const CHART_TITLES = {
    growthstep: '薪资涨幅分析',
    scatter: '预计年薪、年均休息日分析',
    hourly: '时薪、性价比分析',
    scorevalue: '原始分、性价比分析',
    compare: '雷达图对比',
    growthrank: '发展潜力档位分析',
    growthmap: '薪资 × 发展潜力分析',
  };

  // 全国平均工资的两套口径（public/score.js 的常量，图上各画一条线、各标各的名）：
  //   · 城镇非私营单位 124,110 元/年 ≈ 62.6 元/时（含国企、机关、事业单位）
  //   · 城镇私营单位    69,476 元/年 ≈ 35.0 元/时（民企，多数打工人在这一侧）
  // 不用档案里联网查到的「全国年薪」——那份自报口径是「城镇非私营单位」，而且每条档案各存一份，
  // 同一张图上可能出现两个不同的「全国平均」。
  const NATIONAL_WAGE = (ScoreModel && ScoreModel.NATIONAL_WAGE_PRIVATE)
    || (ScoreModel && ScoreModel.NATIONAL_VALUE_DATA && ScoreModel.NATIONAL_VALUE_DATA.annualWage) || 69476;
  const NATIONAL_WAGE_NP = (ScoreModel && ScoreModel.NATIONAL_WAGE_NONPRIVATE) || 124110;
  // 折算成时薪要用的年工作天数：双休 248 天（与图上的参考线同口径）
  const NAT_WORK_DAYS = 365 - (2 * WEEK_PER_YEAR + STATUTORY_HOLIDAYS);
  const NATIONAL_HOURLY = Math.round(NATIONAL_WAGE / (NAT_WORK_DAYS * 8));
  const NATIONAL_HOURLY_NP = Math.round(NATIONAL_WAGE_NP / (NAT_WORK_DAYS * 8));
  // 性价比那张图的全国基准三件套（同一个来源模块，图注里逐项标出是什么口径）
  const NAT_VALUE = (ScoreModel && ScoreModel.NATIONAL_VALUE_DATA)
    || { annualWage: 69476, housePrice: 9935, livingCost: 2217 };

  // 口径注释：纯文本，不要写 markdown —— .analysis-note 是用 textContent 渲染的，
  // 写 **加粗** 只会把星号原样显示出来（长图里也一样）。要强调用「」。
  const CHART_NOTES = {
    scatter: `口径：年薪＝月薪中位 × 薪数（13/14/16 薪按实际月数年化）；横轴＝年均休息日＝每周休息天数 × 52 ＋ 13 天法定节假日（2025 年起），JD 没写明双休与工时的按悲观口径估算，日薪 / 时薪按年工作天数（365 − 年均休息日）折算。`
      + '纵轴切到「时薪」时：时薪＝年薪 ÷（年工作天数 × 每日工作时长），每日工作时长按岗位分别估——原文明写作息（9:00-18:00、朝九晚六、996、每天 N 小时）按其折算，没写明但有带原句的强度线索就在行业水平上加 0.75~1.5 小时，都没有则按行业水平（作息稳定 8 小时 / 一般 8.5 / 离散度大 9.5）；点上下的竖线段就是它的时薪区间。'
      + `所以时薪的高低不完全跟年薪一致。两条「全国平均」参考线（国家统计局 2024）：非私营单位 ${NATIONAL_WAGE_NP} 元/年、私营单位 ${NATIONAL_WAGE} 元/年。纵轴为对数刻度：等距离＝等比例，不是等差——低位那半段自然拉得更开（轴上不标 0：对数轴上的 0 画不出来，最低一档是最靠近轴底的那个整数刻度）。未读到薪资的岗位不进入本图。`,
    hourly: '这张图两个口径画在一起：柱子＝时薪（读左轴），圆点＝性价比倍数（读右轴），同一个岗位的两面；柱子从高到低排，圆点落在哪跟它的排位不一定同向。'
      + '时薪＝年薪 ÷（年工作天数 × 每日工作时长）；年薪＝月薪中位 × 薪数，年工作天数＝365 − 年均休息日（每周休息天数 × 52 ＋ 13 天法定节假日，JD 没写明双休与工时的按悲观口径估算）；每日工作时长按岗位分别估：原文明写作息（9:00-18:00、朝九晚六、996、每天 N 小时、每周 N 小时）按其折算，没写明但有带原句支撑的强度线索就在行业水平上加 0.75~1.5 小时，都没有则按行业水平（作息稳定 8 小时 / 一般 8.5 / 离散度大 9.5）。'
      + `两条「时薪全国平均」参考线是两个工资口径（国家统计局 2024，都按 248 天 × 8 小时折成时薪）：非私营单位 ${NATIONAL_WAGE_NP} 元/年 ≈ ${NATIONAL_HOURLY_NP} 元/时（含国企、机关、事业单位）；私营单位 ${NATIONAL_WAGE} 元/年 ≈ ${NATIONAL_HOURLY} 元/时（民企）。`
      + '性价比倍数＝（时薪 ÷ 当地每人每天的固定支出）÷（全国平均工资 ÷ 全国每人每天的固定支出）。'
      + '分母两项：① 住房＝当地住宅均价 × 人均 40㎡ ÷（30 年 × 365 天），不计利息与税费；② 日常开销＝统计局「居民人均消费支出」扣掉居住类 23% 后 × 12 ÷ 365（不扣会和①重复），查不到的城市只按住房算。'
      + `右轴上标的 1.00 是定义出来的全国基准——一个拿全国平均工资的人，在全国平均的房价与开销下倍数就是 1。分母（全国房价 ＋ 全国日常开销）只有一套，所以把分子换成非私营工资就是另一条线 ${(NATIONAL_WAGE_NP / NATIONAL_WAGE).toFixed(2)}，两条线的间距就是工资口径差。各数的取数口径（都是国家统计局 2024，都取城镇口径）：工资＝城镇私营单位平均工资 ${NAT_VALUE.annualWage} 元/年（非私营 ${NATIONAL_WAGE_NP}）；房价＝全国商品房均价 ${NAT_VALUE.housePrice} 元/㎡（销售额 ÷ 销售面积，不是只覆盖 100 个城市的「百城均价」）；消费＝城镇居民人均消费支出扣掉居住类 23% 后 ≈ ${NAT_VALUE.livingCost} 元/月。城市数据联网采集，仅供参考。`
      + '另一条线「收支平衡」＝年收入刚好盖住年支出，换算到这个倍数上就是线上标的数——低于它等于白干。'
      + '分母里住房占大头（一线约六成），所以性价比衡量的是「在当地买房 ＋ 过日子撑不撑得住」，不是「这份工作值不值得去」——一线城市房价高，倍数天然低于小城市。'
      + '没有城市数据（查不到房价）的岗位只画柱子、没有圆点；没读到薪资的岗位两个口径都进不来。',
    growthrank: '口径：横轴＝工作价值高度 r₂（√(P50 · P80) ÷ c），纵轴＝薪资成长空间 r₁（(P80 − P20) ÷ c），两轴都是对数刻度。'
      + '两个因子相乘＝发展潜力：斜带是 10 个档位，底纹越深＝这一档的职业越多。'
      + '灰点＝该城官方职业库（只作参考），黑点＝你分析过的岗位（按落档位置画）。'
      + '点一下点上选中（可多选），选中的按顺序竖排列在图下，再点一下取消。',
    growthstep: '一个岗位一行：浅灰条＝这个职业「普通人水平 → 天花板」的跨度，深灰条＝这份 JD 的报价。'
      + '梯度优先取官方工资价位表，查不到就用招聘数据拟合。'
      + '行按涨幅空间（从这份 JD 的最低点到「统计天花板、这份 JD 最高点」里更高的那个）从大到小排，'
      + '可切换成按底薪（这份 JD 报价的下沿，只看 JD 给的价）最高排。'
      + '竖线＝本城社平的 1 / 2 / 3 倍与全国平均（全是虚线）；点线上的字可以收起这条线，再点回来。'
      + '横轴是税前月当量（元/月），一行一个岗位，鼠标扫到哪一行就在图下看哪一行的详情。',
    growthmap: '横轴＝这份 JD 报的税前月薪（没读到报价的岗位不进这张图），纵轴＝这个职业的发展潜力分（0-10）。'
      + '点＝你分析过的岗位：所有做过分析、数据齐的岗位默认都在图上；点一下选中（可多选），选中的竖排列在图下，再点一下取消。'
      + '两条竖线＝全国平均与本城社平（都是虚线）；点线上的字可以收起这条线，再点回来。',
  };

  // 长图上的注释：只留一行口径，够解释图上的数字怎么来的，不展开讲
  const CHART_SHARE_NOTES = {
    scatter: '口径：年薪＝月薪中位 × 薪数；年均休息日＝每周休息天数 × 52 ＋ 13 天法定节假日，JD 没写明双休与工时的按悲观口径估算；纵轴为对数刻度，等距离＝等比例，不是等差（轴上不标 0）；切到时薪时，时薪＝年薪 ÷（年工作天数 × 每日工作时长），每日时长按岗位分别估（原文明写 > 强度线索 + 行业水平）。',
    hourly: `口径：柱子＝时薪（左轴）＝年薪 ÷（年工作天数 × 每日工作时长），每日时长按岗位分别估，年工作天数＝365 − 年均休息日；圆点＝性价比倍数（右轴）＝（时薪 ÷ 当地每人每天固定支出）÷ 全国同口径比值，1.00＝全国平均（工资按城镇私营单位、房价按全国商品房均价、开销按城镇居民人均消费支出），另一条全国线是同样分母、工资换成非私营口径（${(NATIONAL_WAGE_NP / NATIONAL_WAGE).toFixed(2)}）；分母＝当地均价 × 人均 40㎡ ÷ 30 年 ＋ 居民人均日常开销 × 12 ÷ 365。`,
    scorevalue: '口径：横轴原始分＝岗位本身值多少分（薪资 30% ＋ 稳定性 25% ＋ 休息 25% ＋ 发展 20% 加权后的基础分，0-100），50 分＝各维度平均 5 分；纵轴性价比倍数＝（时薪 ÷ 当地每人每天固定支出）÷（全国平均工资 ÷ 全国每人每天固定支出），1.00＝全国平均（工资按城镇私营单位、房价按全国商品房均价、开销按城镇居民人均消费支出）。需要城市数据才算得出性价比。',
    compare: '口径：六个维度按 0-10 分制打分，取 2~3 个已分析岗位画在同一张雷达图上。',
    growthrank: '口径：柱子＝该城官方工资价位表全部职业按发展潜力的档位分布；点＝你分析过的岗位的档位（实心＝官方数据，空心＝招聘拟合，两条口径不是同一把尺）。',
    growthstep: '口径：浅灰条＝这个职业「普通人水平 → 天花板」的跨度（官方 P20→P80 / 拟合 P30→P87.5），深灰条＝这份 JD 的报价，虚线＝本城非私营社平的 1 / 2 / 3 倍。',
    growthmap: '口径：横轴＝这份 JD 的月薪，纵轴＝这个职业的发展潜力分；点＝你分析过的岗位。',
  };

  /* ---------- 城市 / 全国数据：随档案登记，统计全部是纯规则计算 ---------- */

  let regionBusy = false;
  const CITY_DATA_VERSION = 7;   // 与后端 /api/region-data 的 version 对应：不一致就重取（v6：房价只认权威来源；v7：区县归到市一级）

  // 城市名归一化：「广东深圳」「广东·深圳」统一成「深圳」，避免同一个城市被算成两个。
  // 再来一层：区/县/街道归到所属的市——房价、平均工资这些数据都是「市」一级公开发布的，
  // 带上区县去查基本查不到东西；而一条查不到房价的档案会被时薪、性价比分析与原始分、性价比分析整条剔除
  // （图上只会写「另有 N 条缺城市数据未计入」），表现就是"有的 JD 数据没被读到"。
  const PROVINCE_RE = /^(北京|上海|天津|重庆|广东|浙江|江苏|山东|福建|四川|湖北|湖南|河南|河北|安徽|江西|陕西|山西|辽宁|吉林|黑龙江|云南|贵州|广西|海南|甘肃|青海|宁夏|新疆|西藏|内蒙古|香港|澳门|台湾)(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)?/;

  // 直辖市：市名本身就是「城市级」，不能再当省份剥掉（「北京市朝阳区」要留「北京市」）
  const MUNICIPALITY_RE = /^(北京|上海|天津|重庆)(市)?/;

  function normalizeCity(c) {
    // 先按分隔符切开取第一段：「深圳 · 南山区」「深圳·龙岗区·坂田」这类写法，城市名就是第一段。
    // 不能先把分隔符抹掉再拼（旧写法就是这样）——「深圳 · 南山区」会拼成「深圳南山区」，
    // 拿去查房价查不到（没有这个城市），结果这条档案的性价比、原始分性价比图整条被剔除。
    const segs = String(c || '').split(/[·•\s/、]+/).map((s) => s.trim()).filter(Boolean);
    // 第一段只有省份（「广东 · 深圳」）时用下一段；但直辖市本身就是城市（「上海 · 青浦区」的城市名
    // 就是上海），要先认它，别被这条省份兜底换成下一段的区名
    let raw = segs[0] || '';
    if (segs.length > 1 && !MUNICIPALITY_RE.test(raw)
      && PROVINCE_RE.test(raw) && !raw.replace(PROVINCE_RE, '')) raw = segs[1];
    if (!raw) return '';
    if (MUNICIPALITY_RE.test(raw)) {
      const m = raw.match(MUNICIPALITY_RE);
      return m[0];
    }
    const stripped = raw.replace(PROVINCE_RE, '');
    const city = stripped || raw;
    // 「深圳市福田区」→「深圳市」；已经是市名（「深圳」「东莞市」）的原样返回
    const i = city.lastIndexOf('市');
    return i >= 0 && i < city.length - 1 ? city.slice(0, i + 1) : city;
  }

  function cityOf(rec) {
    return normalizeCity((rec && rec.data && rec.data.source && rec.data.source.job && rec.data.source.job.city)
      || (rec && rec.job && rec.job.city) || '');
  }

  // 缺房价的城市数据＝没查全：房价是性价比分母的主项，缺它的档案会被时薪、性价比与
  // 「原始分、性价比分析」整条剔除。一次搜索没命中（或当时城市名带区县查错了）不该把这条钉死，
  // 隔一段时间（REGION_RETRY_GAP）允许再补一次；同一次会话里每条最多试一遍，避免反复联网。
  const REGION_RETRY_GAP = 6 * 60 * 60 * 1000;
  const regionTried = new Set();

  // 发现哪条档案还没登记城市数据（或登记得不全）就联网补一次（一次补一条，异步不挡操作）
  async function ensureRegionData() {
    if (regionBusy) return;
    const need = loadHistory().find((r) => {
      const city = cityOf(r);
      if (!city || regionTried.has(r.id)) return false;
      const cd = (r.data && r.data.reference.cityData) || null;
      if (!cd) return true;                                   // 还没登过
      if (cd.city !== city || cd.version !== CITY_DATA_VERSION) return true;   // 城市名 / 取数口径变了
      if (!cd.housePrice) return Date.now() - (Number(cd.at) || 0) > REGION_RETRY_GAP;   // 没查到房价：隔一阵再试
      return false;
    });
    if (!need) return;
    regionBusy = true;
    regionTried.add(need.id);
    const prev = (need.data && need.data.reference && need.data.reference.cityData) || {};
    let merged = null;
    try {
      const r = await postJson('/api/region-data', { city: cityOf(need) });
      // 补采回来的空字段不要盖掉已有的好值（一次只查到一半是常事）：
      // 哪一项这次没拿到、旧的有，就留着旧值与它的来源
      merged = { ...prev, ...r };
      const srcs = { ...(prev.sources || {}), ...(r.sources || {}) };
      for (const k of ['housePrice', 'avgWage', 'livingCost', 'weeklyHours']) {
        if (r[k] == null && prev[k] != null) {
          merged[k] = prev[k];
          if (prev.sources && prev.sources[k]) srcs[k] = prev.sources[k];
        }
      }
      merged.sources = srcs;
    } catch (e) {
      // 查不到就先放着，下次进页面再试
    }
    // 先松手再落盘：下面的重画会再触发一次补采，把还没补的档案接着补完（每条只会试一遍）
    regionBusy = false;
    if (!merged) return;
    const list = loadHistory().map((x) => (x.id === need.id
      ? {
        ...x,
        data: {
          ...(x.data || {}),
          reference: { ...((x.data && x.data.reference) || {}), cityData: { ...merged, at: Date.now() } },
        },
      }
      : x));
    saveHistory(list);
    renderHistory();
    renderDataAnalysis();
    // 城市数据是报告出来之后才异步补的：报告页正开着就重画一次。
    // 重画只换内容、不动显隐（显隐归 revealReportChart 管）——城市数据常常有缓存、秒回，
    // 提前画也只是画在还没露面的容器里，不会让数据分析图在雷达还在生长时就冒出来。
    if (!viewReport.hidden) renderReportChart();
  }

  // 工资参考线：固定画全国两条（非私营 / 私营），各自标名——两者差 1.8 倍，混成一个「全国平均」
  // 会让同一条岗位线看着忽高忽低。都按「双休」248 个工作日折算，保证可比。
  // 城市线只在把象限参考切到那座城市时才画（联网查到的是城镇非私营口径，标签里写明），
  // 否则几座城市的线会挤在一起，谁也看不清。
  function wageRefsOf(pts, metric, cityOnly = '') {
    let cityWage = null;
    for (const p of pts) {
      const cd = (p.rec.data && p.rec.data.reference.cityData) || null;
      if (!cd) continue;
      if (cityOnly && cityWage == null && cd.avgWage
        && (cd.city || cityOf(p.rec)) === cityOnly) cityWage = cd.avgWage;
    }
    const WORK_DAYS = 365 - (2 * WEEK_PER_YEAR + STATUTORY_HOLIDAYS);
    const toVal = (annual) => (metric === 'hourly'
      ? Math.round(annual / (WORK_DAYS * 8))
      : Math.round(annual));
    const out = [
      { value: toVal(NATIONAL_WAGE_NP), label: '全国非私营平均' },
      { value: toVal(NATIONAL_WAGE), label: '全国私营平均' },
    ];
    if (cityWage != null) out.push({ value: toVal(cityWage * 12), label: `${cityOnly}非私营平均` });
    return out;
  }

  // 数据不够画图时：整块只留一句居中的提示，图例、口径、象限参考这些补充一律不出现
  function chartTooFew(host, msg) {
    const box = document.createElement('div');
    box.className = 'chart-empty';
    box.textContent = msg;
    host.appendChild(box);
  }

  /* ---------- 图一：薪资 × 年均休息日（散点） ---------- */

  function renderScatterChart(host, ctx = {}) {
    const pts = analysisPoints();
    // 换象限参考 / 换纵轴口径后，就地重画当前这张图（报告页与职位对比页各自重画自己）
    const redraw = ctx.redraw || renderDataAnalysis;
    if (pts.length < MIN_SAMPLE) {
      // 说清门槛和还差几个：只写「太少」会让人以为是出错了
      chartTooFew(host, pts.length
        ? `已分析岗位 ${pts.length} 个，这张散点图要 ${MIN_SAMPLE} 个才成形——还差 ${MIN_SAMPLE - pts.length} 个，多分析几份就能画出来`
        : `一个带薪资的岗位都还没有，这张图要 ${MIN_SAMPLE} 个岗位才成形`);
      return;
    }
    // 象限参考要先算：下面的选择器与图都要用到
    const basis = quadBasisOf(pts);

    const wrap = document.createElement('div');
    wrap.className = 'quad-wrap';
    const svg = svgEl('svg', { class: 'quad', role: 'img', 'aria-label': '薪资与年均休息日分析图' });
    wrap.appendChild(svg);
    host.appendChild(wrap);
    // 详情固定显示在图下方（不再浮在图上遮挡数据）
    const tip = document.createElement('div');
    tip.className = 'chart-detail';
    host.appendChild(tip);

    // 本次分析的岗位（报告页正在看的那份）是最深的那一个点，收藏的次之：有才出现的那两条图例
    const hasCur = pts.some((p) => isCurrentRec(p.rec, reportHighlightUrl));
    const hasFav = pts.some((p) => isFavRec(p.rec));

    const legend = document.createElement('p');
    legend.className = 'quad-legend';
    legend.innerHTML = '<span><i class="lg lg-dot-solid"></i>实心点：休息信息有依据（JD 或本人补充）</span>'
      + '<span><i class="lg lg-dot-hollow"></i>空心点：休息为估算</span>'
      + '<span><i class="lg lg-dot-dash"></i>虚线空心点：休息来自网络参考</span>'
      + (hasCur ? '<span><i class="lg lg-dot-cur"></i>墨色点：本次分析的岗位</span>' : '')
      + (hasFav ? '<span><i class="lg lg-dot-fav"></i>墨色点：收藏的岗位</span>' : '');
    host.appendChild(legend);

    const explain = document.createElement('div');
    explain.className = 'quad-explain';
    explain.innerHTML = '<p><b>点＝预期年薪（按你的匹配度落位）× 休息取中</b>；点上的横线＝休息天数区间（左端最差），竖线＝薪资 / 时薪区间；纵轴为对数刻度，等距离＝等比例——低位那半段拉得更开，轴上不标 0，最低一档是最靠近轴底的那个整数刻度。</p>'
      + `<p>竖线＝单休 65 / 大小周 91 / 双休 117 天，横线＝全国平均工资，虚线＝${quadBasisMode === 'median' || !basis ? '这批岗位的中位数' : '该口径的平均值'}（年薪与休息各一条）。</p>`
      + '<p>点一下选中（可多选），再点取消；悬停或点选后在图下看详情。点线上的字可以收起这条线，再点回来。</p>';
    host.appendChild(explain);

    // 象限参考放在图外，可切换：中位数（和我自己比）/ 全国（和市场比）
    const basisBox = document.createElement('div');
    basisBox.className = 'basis-pick';
    const head = document.createElement('span');
    head.className = 'basis-label';
    head.textContent = '象限参考：';
    basisBox.appendChild(head);
    const mkBtn = (text, on, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `basis-btn${on ? ' on' : ''}`;
      b.textContent = text;
      b.addEventListener('click', fn);
      return b;
    };
    basisBox.appendChild(mkBtn('中位数（相对）', quadBasisMode === 'median', () => {
      quadBasisMode = 'median';
      redraw();
    }));
    basisBox.appendChild(mkBtn('全国', quadBasisMode === 'national', () => {
      quadBasisMode = 'national';
      redraw();
    }));
    host.insertBefore(basisBox, legend);

    // 当前参考口径的来源与含义，写在选择器下面
    if (basis && basis.source) {
      const srcLine = document.createElement('p');
      srcLine.className = 'basis-src';
      srcLine.textContent = `${basis.source}；${basis.restBasis}；纵轴＝该口径的平均年薪。都是平均数，只作参考。`;
      // 点一下复制的是「资料名」（basis.cite），不是上面这一整段说明——
      // 出处要拿去搜索框里查证，整段话粘进去搜不出东西
      const cite = basis.cite || basis.source;
      srcLine.title = `点击复制资料名：${cite}`;
      srcLine.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cite).then(
            () => toast(`已复制资料名：${cite}`),
            () => toast('复制失败，请手动选中复制', 3200),
          );
        } else {
          toast(`请手动复制资料名：${cite}`, 3600);
        }
      });
      host.insertBefore(srcLine, legend);
    }
    renderQuadrant(svg, pts, {
      h: 500,
      tipEl: tip,
      metric: payMetric,
      chart: 'scatter',
      redraw,
      // 参考线：全国两条（非私营 / 私营）；城市线只在参考切到城市时才画
      wageLines: wageRefsOf(pts, payMetric, quadBasisMode === 'city' ? quadBasisCity : ''),
      basis,
    });

    // 象限参考：中位数走默认（不给 basis）；全国用统计口径的固定基准
    //   横轴＝按「周平均工作时间」折算的年均休息日（都是平均数）；
    //   纵轴＝该口径的平均年薪。查不到就退回大小周 91 天兜底。
    function quadBasisOf(list) {
      if (quadBasisMode === 'median') return null;
      const restFromWeekly = (wh) => (wh > 20 && wh < 90
        ? Math.round((7 - wh / 8) * WEEK_PER_YEAR + STATUTORY_HOLIDAYS)
        : null);
      const FALLBACK = Math.round(1.5 * WEEK_PER_YEAR) + STATUTORY_HOLIDAYS;
      let yearly = null;
      let weekly = null;
      let srcText = '';
      // 出处那一行点一下复制的东西：资料名（能直接粘进搜索框查证），不是整段说明
      let cite = '';
      for (const p of list) {
        if (yearly) break;
        const cd = p.rec.data && p.rec.data.reference.cityData;
        if (!cd) continue;
        if (quadBasisMode === 'national' && cd.national) {
          // 年薪统一用公共口径那份常量（与工资参考线、性价比基准同一个数）；
          // 只有「周平均工作时间」还取自联网结果——它没法写成常量，查不到就退回大小周兜底。
          yearly = NATIONAL_WAGE;
          weekly = cd.national.weeklyHours;
          srcText = '国家统计局 2024（城镇私营单位平均工资）';
          cite = '国家统计局 2024 城镇私营单位就业人员平均工资';
          break;
        }
        if (quadBasisMode === 'city' && quadBasisCity
          && (cd.city || cityOf(p.rec)) === quadBasisCity && cd.avgWage) {
          yearly = cd.avgWage * 12;
          weekly = cd.weeklyHours;
          srcText = (cd.sources && cd.sources.avgWage) || '公开统计';
          cite = `${quadBasisCity}城镇单位就业人员平均工资`;
          break;
        }
      }
      if (!yearly) return null;
      const mx = restFromWeekly(weekly) || FALLBACK;
      const WORK_DAYS = 365 - mx;
      // 周工时的口径随模式走：只有「某城市」那条取的是当地工时，全国那条是全国口径
      const hoursWhere = quadBasisMode === 'city' ? '该地' : '全国口径';
      return {
        mx,
        my: payMetric === 'hourly' ? Math.round(yearly / (WORK_DAYS * 8)) : yearly,
        source: `AI 整理自${srcText}，仅供参考`,
        cite: cite || srcText,
        restBasis: weekly
          ? `休息分界 ${mx} 天（按${hoursWhere}周平均工作时间 ${weekly} 小时折算，是平均数）`
          : `休息分界 ${mx} 天（没查到${hoursWhere}平均工时，按大小周兜底）`,
      };
    }
  }

  /* ---------- 通用柱状图 ---------- */

  // 柱状图交互：划过即高亮，详情写到图下方的固定区域（不在图上浮动，避免遮挡）；点击钉住
  function bindBarTips(svg, detailEl, items, slot, L, groups) {
    let pin = null;
    let last = -2;
    const paint = (idx) => {
      groups.forEach((g, k) => g.classList.toggle('bar-on', k === idx));
      detailEl.textContent = '';
      const it = items[idx];
      if (!it) return;
      const t = document.createElement('p');
      t.className = 'quad-tip-title';
      t.textContent = it.label;
      detailEl.appendChild(t);
      const m = document.createElement('p');
      m.className = 'quad-tip-meta';
      m.textContent = it.meta || '';
      detailEl.appendChild(m);
      if (it.rangeText) {
        const r = document.createElement('p');
        r.className = 'quad-tip-meta';
        r.textContent = it.rangeText;
        detailEl.appendChild(r);
      }
      if (it.valueText) {
        const v = document.createElement('p');
        v.className = 'quad-tip-meta';
        v.textContent = it.valueText;
        detailEl.appendChild(v);
      }
    };
    const clear = () => {
      if (pin != null) return;
      groups.forEach((g) => g.classList.remove('bar-on'));
      detailEl.textContent = '';
    };
    const idxAt = (clientX) => {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      if (!box.width || !vb.width) return -1;
      const sx = ((clientX - box.left) / box.width) * vb.width;
      const i = Math.floor((sx - L) / slot);
      return i >= 0 && i < items.length ? i : -1;
    };
    svg.addEventListener('mousemove', (e) => {
      if (pin != null) return;
      const i = idxAt(e.clientX);
      if (i === last) return;
      last = i;
      if (i < 0) clear(); else paint(i);
    });
    svg.addEventListener('mouseleave', clear);
    svg.addEventListener('click', (e) => {
      const i = idxAt(e.clientX);
      if (i < 0) { pin = null; last = -2; clear(); return; }
      if (pin === i) { pin = null; last = -2; clear(); return; }
      pin = i;
      last = i;
      paint(i);
    });
    detailEl.addEventListener('click', () => {
      if (pin != null && items[pin] && items[pin].rec) openHistory(items[pin].rec);
    });
  }

  // items: [{ label, value, lo, hi, meta, rangeText, valueText, right, rec }]，调用方负责排序
  // value 是估计值；若给了 lo（更差情形），柱子顶部那段用浅色表示「可能达不到」
  // opts.right = { fmt, refLines } 时在右侧再立一条纵轴：每个岗位一颗圆点（带区间竖线）
  //   标出它的第二口径数值（如性价比倍数），两条轴的刻度各自独立——柱子的高矮与圆点的高低不必同向。
  // 参考线可收起：opts.chart ＋ 每条线的 name（＝ refLineOff 里的标识）＋ opts.redraw 构成一个开关，
  //   图上的行尾标注本身就是点击目标，点一下线不画了、标注变淡加删除线，再点回来。
  function buildBars(svg, items, opts = {}) {
    const H = opts.h || 460;
    const L = opts.leftPad || 64;
    // 右侧只留右轴刻度那几个字的位置——注释统一搬到图下，图内不再挂浮动文字。
    const R = QUAD_W - (opts.rightPad || 34);
    const T = 34;
    const B = H - 96;
    svg.setAttribute('viewBox', `0 0 ${QUAD_W} ${H}`);
    svg.innerHTML = '';
    if (!items.length) return;
    const fmt = opts.fmt || ((v) => String(Math.round(v)));
    // 本次分析的岗位（报告页正在看的那份）柱体加深最多，收藏过的次之，右轴那颗点也跟着落墨色：
    // 逐项先算档位（cur / fav / 空），画柱子与画点时都用同一份。
    const hUrl = opts.highlightUrl !== undefined ? opts.highlightUrl : reportHighlightUrl;
    const tones = items.map((it) => toneOf(it.rec, hUrl));
    // 上限只跟着数据走：这张图可能画时薪（几百），也可能画倍数（个位数），
    // 写死 1 会让「最大值不到 1」的倍数图被拉到一格高、柱子看着像没画完。
    // 参考线（全国 1.00 之类）也要留在视野里，否则「所有岗位都低于全国」时，那条最该被看见的线反而跑出画面
    const refPeak = Math.max(0, ...(opts.refLines || []).map((r) => (r.value > 0 ? r.value : 0)));
    const peak = Math.max(...items.map((i) => Math.max(i.value, i.hi || 0)), refPeak, 0);
    const yMax = (peak > 0 ? peak : 1) * 1.12;
    const Y = (v) => B - (v / yMax) * (B - T);
    const slot = (R - L) / items.length;
    // 右轴注释搬走后绘图区宽了一截，柱子放宽一点，别让图看着还是挤
    const bw = Math.max(12, Math.min(54, slot * 0.6));

    // 右轴（第二口径）：自己的上限（含右轴参考线），自己的刻度
    const right = opts.right || null;
    const rVals = right ? items.map((i) => i.right).filter(Boolean) : [];
    const rFmt = (right && right.fmt) || fmt;
    const rRefLines = (right && right.refLines) || [];
    const rPeak = Math.max(0, ...rRefLines.map((r) => (r.value > 0 ? r.value : 0)), ...rVals.map((v) => Math.max(v.value, v.hi || 0)));
    const rMax = right && rPeak > 0 ? rPeak * 1.12 : 0;
    const RY = (v) => B - (v / rMax) * (B - T);

    const add = (tag, attrs) => { const e = svgEl(tag, attrs); svg.appendChild(e); return e; };
    const txt = (x, y, s, o = {}) => {
      const e = svgEl('text', {
        x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 11, fill: o.fill || '#9b9a97',
        ...(o.rotate ? { transform: `rotate(${o.rotate} ${x} ${y})` } : {}),
        ...(o.weight ? { 'font-weight': o.weight } : {}),
      });
      e.textContent = s;
      svg.appendChild(e);
      return e;
    };

    // 坐标轴
    add('line', { x1: L, y1: B, x2: L, y2: T - 1, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${L - 3.6},${T - 1} ${L + 3.6},${T - 1} ${L},${T - 11}`, fill: '#191919' });
    add('line', { x1: L, y1: B, x2: R + 1, y2: B, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${R + 1},${B - 3.6} ${R + 1},${B + 3.6} ${R + 11},${B}`, fill: '#191919' });
    // 轴名与单位：刻度数字只说明大小，单位得写出来才读得懂（之前这两张柱状图只有数字，没有轴名）
    if (opts.yLabel) txt(15, (T + B) / 2, opts.yLabel, { size: 12, rotate: -90 });
    if (opts.xLabel) txt((L + R) / 2, B + 64, opts.xLabel, { size: 12 });
    // 右轴：只立一条细轴线 ＋ 必要刻度。轴名与参考线读数一律不写在这里——
    // 右侧原来挂了两列浮动标签，把柱子挤掉一截、还全是字；这些读数现在集中在图下一行小字里。
    if (right && rMax > 0) {
      add('line', { x1: R, y1: B, x2: R, y2: T - 1, stroke: '#c9c9c6', 'stroke-width': 1 });
      add('polygon', { points: `${R - 3.2},${T - 1} ${R + 3.2},${T - 1} ${R},${T - 9}`, fill: '#c9c9c6' });
    }

    // 参考线先画、最后再提到最上层（否则会被柱子挡住）
    const overlayEls = [];
    const chart = opts.chart || 'bar';     // 参考线开关的命名空间（各图互不干扰）
    const redraw = opts.redraw;

    // 横向参考线（时薪的全国平均这类）：画线 + 行尾一句小标注；标注点一下就收起这条线
    for (const r of opts.refLines || []) {
      if (!(r.value > 0) || r.value > yMax) continue;
      if (!isRefOff(chart, r.name)) {
        overlayEls.push(add('line', { x1: L, y1: Y(r.value), x2: R, y2: Y(r.value), stroke: '#dcdcda', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      }
      if (r.label) {
        const lab = txt(R + 8, Y(r.value) + 4, r.label, { anchor: 'start', size: 10.5, fill: '#9b9a97' });
        overlayEls.push(r.name ? markRefToggle(lab, chart, r.name, redraw) : lab);
      }
    }

    // 右轴的参考线（性价比的全国基准这类）：同样只画线
    for (const r of rRefLines) {
      if (!(r.value > 0) || r.value > rMax) continue;
      overlayEls.push(add('line', { x1: L, y1: RY(r.value), x2: R, y2: RY(r.value), stroke: '#dcdcda', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    }

    // 纵轴刻度
    for (const v of ticksOf(0, yMax, 4)) {
      if (v <= 0) continue;
      add('line', { x1: L - 4, y1: Y(v), x2: L, y2: Y(v), stroke: '#c9c9c6', 'stroke-width': 1 });
      txt(L - 8, Y(v) + 4, fmt(v), { anchor: 'end', size: 11 });
    }
    // 右轴刻度：只留两个数，字号小、颜色淡，够对齐读数就行
    if (right && rMax > 0) {
      for (const v of ticksOf(0, rMax, 2)) {
        if (v <= 0) continue;
        add('line', { x1: R, y1: RY(v), x2: R + 4, y2: RY(v), stroke: '#c9c9c6', 'stroke-width': 1 });
        txt(R + 7, RY(v) + 4, rFmt(v), { anchor: 'start', size: 10, fill: '#b9b8b5' });
      }
    }

    // 中位数线（可用 noMedian 关掉——有的图里中位数没有意义）。
    // opts.median 由调用方给出时用它的数，保证图上的线和图下那行小字是同一个数。
    if (!opts.noMedian) {
      const mid = opts.median != null ? opts.median : median(items.map((i) => i.value));
      if (!isRefOff(chart, opts.medianName || '中位线')) {
        overlayEls.push(add('line', { x1: L, y1: Y(mid), x2: R, y2: Y(mid), stroke: '#b9b8b5', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      }
      if (opts.medianLabel) {
        const lab = txt(R + 8, Y(mid) + 4, opts.medianLabel, { anchor: 'start', size: 10.5, fill: '#9b9a97' });
        overlayEls.push(markRefToggle(lab, chart, opts.medianName || '中位线', redraw));
      }
    }

    // 柱体
    const groups = [];
    items.forEach((it, i) => {
      const cx = L + slot * (i + 0.5);
      const y = Y(it.value);
      const g = svgEl('g', { class: 'bar-item' });
      const hasRange = it.lo != null && it.lo < it.value;
      const hasUp = it.hi != null && it.hi > it.value;
      const yLo = hasRange ? Y(it.lo) : y;
      // 上沿：薪资区间上沿 + 休息最乐观那一侧带来的可能上限
      if (hasUp) {
        g.appendChild(svgEl('rect', {
          x: (cx - bw / 2).toFixed(1), y: Y(it.hi).toFixed(1),
          width: bw.toFixed(1), height: Math.max(1, y - Y(it.hi)).toFixed(1), rx: 2, class: 'bar-uncertain',
        }));
      }
      // 下段：按最差情形也算得出来的部分
      g.appendChild(svgEl('rect', {
        x: (cx - bw / 2).toFixed(1), y: yLo.toFixed(1),
        width: bw.toFixed(1), height: Math.max(1, B - yLo).toFixed(1), rx: 2, class: 'bar-rect',
      }));
      // 本次分析的岗位与收藏过的岗位：在最差情形也站得住的那一段上压一层半透明的加深——
      // 颜色比别的柱子重得多，又比 hover 那层（CSS 里的 #191919）浅，鼠标扫过来仍看得出变化。
      // 只作标记，不参与命中；本次打开的那份再深一档，和收藏拉开距离。
      if (tones[i]) {
        g.appendChild(svgEl('rect', {
          x: (cx - bw / 2).toFixed(1), y: yLo.toFixed(1),
          width: bw.toFixed(1), height: Math.max(1, B - yLo).toFixed(1), rx: 2,
          fill: tones[i] === 'cur' ? 'rgba(25,25,25,0.85)' : 'rgba(25,25,25,0.62)', 'pointer-events': 'none',
        }));
      }
      // 上段：估算出来的、可能达不到的部分
      if (hasRange) {
        g.appendChild(svgEl('rect', {
          x: (cx - bw / 2).toFixed(1), y: y.toFixed(1),
          width: bw.toFixed(1), height: Math.max(1, yLo - y).toFixed(1), rx: 2, class: 'bar-uncertain',
        }));
      }
      /* 柱上的三个数（按口径排布，与柱体对齐）：
         上沿＝柱顶正上方（黑字，最好情形）；取中＝柱内取中线处（加粗黑字）；下沿＝深色柱内、浅色段下方（白字，保底）。
         数字画完所有线之后再统一切到最上层——中位线、参考线、性价比的线/点都从数字下面走（打架时数字在上）。 */
      const tx = Math.min(Math.max(cx, L + 18), R - 18);
      // 取中（加粗）：落在取中线下方（柱内浅色段，黑字）；那一段是深色时改白字（几乎不会发生）。
      const belowLight = it.lo != null && it.lo < it.value;
      const aboveLight = !belowLight && it.hi != null && it.hi > it.value;
      const midY = Math.max(T + 12, Math.min(B - 4, (aboveLight ? y - 5 : y + 4)));
      const val = svgEl('text', {
        x: tx.toFixed(1), y: midY.toFixed(1),
        'text-anchor': 'middle', 'font-size': 12, fill: (belowLight || aboveLight) ? '#191919' : '#ffffff', 'font-weight': 600,
        'paint-order': 'stroke', stroke: (belowLight || aboveLight) ? '#dfdfdf' : '#9e9e9e', 'stroke-width': 2.5, 'stroke-linejoin': 'round',
      });
      val.textContent = fmt(it.value);
      g.appendChild(val);

      // 上沿：柱顶正上方（黑字、居中）；离取中太近（<8px）就不标
      if (hasUp && Y(it.value) - Y(it.hi) >= 8) {
        const up = svgEl('text', {
          x: tx.toFixed(1), y: Math.max(T + 11, Y(it.hi) - 7).toFixed(1),
          'text-anchor': 'middle', 'font-size': 11, fill: '#191919',
        });
        up.textContent = fmt(it.hi);
        g.appendChild(up);
      }
      // 下沿：深色柱内、浅色段下方（白字）——它代表的高度就是深色段的顶；浅色下段太薄或深色段太矮就不标
      if (hasRange && yLo - Y(it.value) >= 16 && B - yLo >= 22) {
        const dn = svgEl('text', {
          x: tx.toFixed(1), y: (yLo + 13).toFixed(1),
          'text-anchor': 'middle', 'font-size': 11, fill: '#ffffff',
          'paint-order': 'stroke', stroke: '#9e9e9e', 'stroke-width': 2.5, 'stroke-linejoin': 'round',
        });
        dn.textContent = fmt(it.lo);
        g.appendChild(dn);
      }
      const ty = B + 14;
      const name = svgEl('text', {
        x: cx.toFixed(1), y: ty, 'text-anchor': 'end', 'font-size': 11, fill: '#9b9a97',
        transform: `rotate(-32 ${cx.toFixed(1)} ${ty})`,
      });
      name.textContent = it.label.length > 10 ? `${it.label.slice(0, 10)}…` : it.label;
      g.appendChild(name);
      svg.appendChild(g);
      groups.push(g);
    });

    // 右轴的点：每个岗位一颗圆点（带区间竖线），画在柱子中间（柱心）——
    // 柱子高矮按左轴、圆点高低按右轴，两者不必同向，这正是这张图要说的事。
    if (right && rMax > 0) {
      items.forEach((it, i) => {
        if (!it.right) return;
        const cx = L + slot * (i + 0.5);
        const rv = it.right;
        if (rv.lo != null && rv.hi != null && rv.hi > rv.lo) {
          svg.appendChild(svgEl('line', {
            x1: cx.toFixed(1),
            y1: RY(Math.min(rv.hi, rMax)).toFixed(1),
            x2: cx.toFixed(1),
            y2: RY(Math.max(rv.lo, 0)).toFixed(1),
            class: 'val-range',
          }));
        }
        svg.appendChild(svgEl('circle', {
          cx: cx.toFixed(1), cy: RY(Math.min(Math.max(rv.value, 0), rMax)).toFixed(1), r: 2.6, class: 'val-dot',
          ...(tones[i] ? { style: 'fill:#191919' } : {}),
        }));
      });
    }

    // 收藏与本次分析的岗位都只靠颜色区分：柱体那层加深 ＋ 右轴那颗点填墨色，不在柱顶压记号
    // （柱顶本来就有数字，再压一个反而跟读数抢位置）。

    // 参考线 / 中位线提到最上层，避免被柱子挡住
    for (const el of overlayEls) svg.appendChild(el);

    // 柱上的三个数与岗位名最后再提一次：和数字打架时，线从数字下面走（数字在上）
    for (const t of [...svg.querySelectorAll('g.bar-item > text')]) svg.appendChild(t);

    if (opts.detailEl) bindBarTips(svg, opts.detailEl, items, slot, L, groups);
  }

  // 柱状图外壳：说明行 + 图 + 图下方固定详情区 + 读法说明。
  // 读法必须按图给：同一套通用文案套到不同图上，会写出图上根本没有的东西（现在只有「时薪、性价比」用它）。
  function barChartShell(host, explains) {
    const sub = document.createElement('p');
    sub.className = 'analysis-sub';
    host.appendChild(sub);
    const wrap = document.createElement('div');
    wrap.className = 'quad-wrap';
    const svg = svgEl('svg', { class: 'quad', role: 'img', 'aria-label': '柱状对比图' });
    wrap.appendChild(svg);
    host.appendChild(wrap);
    const detail = document.createElement('div');
    detail.className = 'chart-detail';
    host.appendChild(detail);
    const explain = document.createElement('div');
    explain.className = 'quad-explain';
    explain.innerHTML = (explains || []).join('');
    host.appendChild(explain);
    return { sub, wrap, svg, detail, explain };
  }

  /* ---------- 图二：时薪 × 性价比（一张图两条轴） ----------

     原来时薪、性价比是两张柱状图，各占一个槽位、还要来回切；合并成一张：
     柱子＝时薪（左轴），圆点＝性价比倍数（右轴），同一个岗位的两面一次看完。
     排序按左轴（时薪）——圆点落在哪不跟着排，正好把「时薪高不等于性价比高」摆出来。 */

  function renderHourlyChart(host, ctx = {}) {
    const redraw = ctx.redraw || renderDataAnalysis;
    const pts = analysisPoints().filter((p) => p.hourly != null);
    if (pts.length < 2) {
      chartTooFew(host, '读到薪资的岗位太少，暂时画不出时薪、性价比对比');
      return;
    }
    // 性价比那一套算法原样复用（原始分、性价比分析也用它），只是把结果挂到右轴上。
    // 两次取数各跑一遍 loadHistory()，对象不是同一份，所以按 id（老档案没有 id 时退回 url）配对。
    const { items: valueItems, missing } = valueIndexPoints();
    const keyOf = (rec) => ((rec && (rec.id || rec.url)) || '');
    const valueOf = new Map(valueItems.map((it) => [keyOf(it.rec), it]));
    // 读法最多三句：原来是五段加一整段口径铺在下面，没人看得完。
    const shell = barChartShell(host, [
      '<p><b>柱＝时薪（读左轴）</b>：深色是保底（最差情形也算得出来的部分），浅色是可能够不到的浮动；<b>柱上三个数</b>——柱顶上方＝上沿（最好情形），加粗＝取中，深色柱里的白字＝下沿（保底）。</p>',
      '<p><b>点＝性价比倍数（读右轴）</b>：竖线是它的区间，1.00 ＝ 全国平均。</p>',
      '<p>时薪 ＝ 年薪 ÷（年工作天数 × 每日工时），工时按岗位分别估；全国平均线取国家统计局 2024（私营工资口径）。</p>',
    ]);

    const items = pts
      .map((p) => {
        const rr = p.restRange;
        const srcLabel = REST_SOURCE_LABEL[rr.source] || '估算';
        const vin = valueOf.get(keyOf(p.rec)) || null;
        return {
          label: p.title,
          value: p.hourly,
          lo: p.hourlyLo,
          hi: p.hourlyHi,
          meta: `年薪区间 ${fmtWan(p.payLo)}~${fmtWan(p.payHi)} 万（取中 ${fmtWan(p.pay)} 万）· 休息 ${rr.lo}~${rr.est} 天（${srcLabel}，偏离度 -${Math.round(rr.dev * 100)}%）· ${hoursBriefOf(p.hours)} · 时薪取中 ${p.hourly} 元/小时`,
          rangeText: `时薪区间 ${p.hourlyLo}~${p.hourlyHi} 元/小时（取中 ${p.hourly}）`,
          valueText: vin
            ? `性价比倍数 ${vin.lo.toFixed(2)}~${vin.hi.toFixed(2)}（取中 ${vin.value.toFixed(2)}，1.00＝全国平均）`
            : `这座城市还没有房价数据（联网查不到），算不出性价比，右轴上是空的。`,
          right: vin ? { value: vin.value, lo: vin.lo, hi: vin.hi } : null,
          rec: p.rec,
        };
      })
      .sort((a, b) => b.value - a.value);
    const onlyHouse = items.filter((it) => it.right && (valueOf.get(keyOf(it.rec)) || {}).onlyHouse).length;
    const noValue = items.filter((it) => !it.right).length;
    shell.sub.textContent = `共 ${items.length} 个岗位 · 按时薪由高到低`
      + (missing ? ` · ${missing} 条缺城市数据` : '')
      + (noValue ? ` · ${noValue} 条查不到房价，没有点` : '')
      + (onlyHouse ? ` · ${onlyHouse} 条只按住房算` : '');

    // 图上的记号（柱 / 点）一行说清；报告页打开的那份 JD、收藏过的岗位各多一条图例
    const legend = document.createElement('p');
    legend.className = 'quad-legend';
    legend.innerHTML = '<span><i class="lg lg-bar"></i>柱＝时薪（读左轴）</span>'
      + '<span><i class="lg lg-dot"></i>点＝性价比倍数（读右轴）</span>'
      + (items.some((it) => isCurrentRec(it.rec, reportHighlightUrl)) ? '<span><i class="lg lg-bar-cur"></i>深色柱：本次分析的岗位</span>' : '')
      + (items.some((it) => isFavRec(it.rec)) ? '<span><i class="lg lg-bar-fav"></i>深色柱：收藏的岗位</span>' : '');
    host.insertBefore(legend, shell.explain);

    // 参考线的读数集中成图下这一行小字——图上原来挂在右侧的两列浮动标签全部撤掉，不再压住柱子。
    // 每个读数做成一粒可点的小按钮：点一下收起那条线（线不画，读数变淡加删除线），再点回来。
    const MEDIAN_NAME = '时薪中位数';   // 这条线的标识：图上的行尾标注与图下的小按钮共用同一个 key
    const mid = median(items.map((it) => it.value));
    // 横向参考线只留两条重要的：你自己的中位数 + 全国平均（私营工资，即性价比 1.00 那条）——
    // 原先的非私营、收支平衡线全撤掉；保留的两条都带行尾标注，图上不再一堆虚线。
    const natLine = wageRefsOf(pts, 'hourly').find((r) => r.label === '全国私营平均') || null;
    const wageRefs = natLine ? [{ ...natLine, name: '全国平均', label: `全国平均 ${Math.round(natLine.value)}` }] : [];
    const refs = document.createElement('p');
    refs.className = 'chart-refs';
    const refsHead = document.createElement('span');
    refsHead.textContent = '横线：';
    refs.appendChild(refsHead);
    refs.appendChild(refButton('hourly', MEDIAN_NAME, `时薪中位数 ${Math.round(mid)}`, redraw));
    if (natLine) {
      refs.appendChild(document.createTextNode(' · '));
      refs.appendChild(refButton('hourly', '全国平均', `全国平均 ${Math.round(natLine.value)} 元/时`, redraw));
      const tail = document.createElement('span');
      tail.textContent = '（全国平均＝性价比 1.00，读右轴）';
      refs.appendChild(tail);
    }
    const hint = document.createElement('span');
    hint.className = 'ref-hint';
    hint.textContent = '点线上的字可以收起这条线，再点回来';
    refs.appendChild(hint);
    host.insertBefore(refs, shell.explain);

    buildBars(shell.svg, items, {
      h: 520,
      detailEl: shell.detail,
      fmt: (v) => String(Math.round(v)),
      yLabel: '时薪（元/小时）',
      xLabel: '岗位',
      chart: 'hourly',
      redraw,
      refLines: wageRefs,
      rightPad: 104,  // 留出右侧两条参考线行尾标注的位置
      median: mid,    // 图下的「横线」那行用的是同一个数
      medianName: MEDIAN_NAME,
      medianLabel: `时薪中位数 ${Math.round(mid)}`,
      right: {
        fmt: (v) => v.toFixed(2),
      },
    });
  }

  /* ---------- 性价比的取数：单列出来，原始分、性价比分析也复用 ---------- */

  function valueIndexPoints() {
    const items = [];
    let missing = 0;
    for (const p of analysisPoints()) {
      const cd = (p.rec.data && p.rec.data.reference.cityData) || null;
      // 房价是必需的（它就是分母的主项，拿不到就没法比）；日常开销查不到不等于这条不能算——
      // 不编估算值，直接按「只算住房」处理，并在图上标明这一条少算了一项。
      if (p.hourly == null || !cd || !cd.housePrice) { missing++; continue; }
      const dailyHouse = (cd.housePrice * SQM_PER_PERSON) / (30 * 365);
      const dailyLife = cd.livingCost ? (cd.livingCost * 12) / 365 : 0;
      const denom = dailyHouse + dailyLife;
      if (!(denom > 0)) { missing++; continue; }
      const lifeText = cd.livingCost
        ? `居住 ${dailyHouse.toFixed(1)} ＋ 生活 ${dailyLife.toFixed(1)} 元/天`
        : `只算住房 ${dailyHouse.toFixed(1)} 元/天（这座城市没查到居民人均日常开销）`;
      const rr = p.restRange;
      const srcLabel = REST_SOURCE_LABEL[rr.source] || '估算';
      const absHi = p.hourlyHi / denom;
      const absLo = p.hourlyLo / denom;
      const absMid = p.hourly / denom;
      // 当地指数 ÷ 全国基准指数 → 倍数（全国 = 1.00）
      const toMult = (v) => (NATIONAL_BASE_INDEX > 0 ? Math.round((v / NATIONAL_BASE_INDEX) * 100) / 100 : 0);
      items.push({
        label: p.title,
        value: toMult(absMid),
        lo: toMult(absLo),
        hi: toMult(absHi),
        meta: `时薪 ${p.hourlyLo}~${p.hourlyHi}（取中 ${p.hourly}）÷（${lifeText}）＝ 当地指数 ${absMid.toFixed(2)}；全国基准 ${NATIONAL_BASE_INDEX.toFixed(2)} → 倍数 ${toMult(absMid).toFixed(2)}`,
        rangeText: `倍数区间 ${toMult(absLo).toFixed(2)}~${toMult(absHi).toFixed(2)}，取中 ${toMult(absMid).toFixed(2)}——上沿来自薪资上沿 + 休息最好情形，下沿来自薪资下沿 + 休息最差情形（${srcLabel}，偏离度 -${Math.round(rr.dev * 100)}%）。`
          + (cd.livingCost ? '' : '注意：这座城市的居民人均日常开销没查到，这条只按住房算，分母比别的小一截，跟其他城市不严格可比。'),
        onlyHouse: !cd.livingCost,
        rec: p.rec,
      });
    }
    return { items, missing };
  }

  // 人均住房建筑面积：分母里的「居住」是**一个人**要摊的住房，不是一整套房——
  // 一套房是整个家庭在住，把 90㎡ 压在一个人工资上等于让单身者独自扛三居室。
  // 取值与依据写在 public/score.js，页面、长图、导出 md 三处共用。
  const SQM_PER_PERSON = (ScoreModel && ScoreModel.HOUSE_SQM_PER_PERSON) || 40;

  // 全国基准（图上的 1.00）：常量写在 public/score.js 里，页面、长图、导出的 md 都读同一份，
  // 免得三处各写一个数。这里保留一套等价的兜底实现，只为公共口径模块没加载上时图还能画出来。
  const NATIONAL_BASE_DATA = (ScoreModel && ScoreModel.NATIONAL_VALUE_DATA)
    || { annualWage: 69476, housePrice: 17084, livingCost: 1811 };

  // 全国每人每天的固定支出与全国时薪 → 全国基准指数。所有岗位的性价比都除以它，换算成「全国 = 1」的倍数，
  // 这样跨城市、跨时间都能直接比。分母口径与单个岗位完全一致。
  function nationalBaseIndexOf(d) {
    const WORK_DAYS = 365 - (2 * WEEK_PER_YEAR + STATUTORY_HOLIDAYS);
    const denom = (d.housePrice * SQM_PER_PERSON) / (30 * 365) + (d.livingCost * 12) / 365;
    if (!(denom > 0)) return 0;
    return (d.annualWage / (WORK_DAYS * 8)) / denom;
  }
  const NATIONAL_BASE_INDEX = (ScoreModel && ScoreModel.NATIONAL_VALUE_INDEX)
    || nationalBaseIndexOf(NATIONAL_BASE_DATA);

  // 收支平衡线：年收入刚好等于年支出时的性价比指数
  //   时薪 × 年工作小时 = 日均成本 × 365  →  指数 = 365 ÷（年工作天数 × 8）
  //   按双休 248 个工作日算 = 0.18（若按单休 300 天则是 0.15，越少休门槛越低）
  const BREAK_EVEN_INDEX = 0.18;

  /* 性价比的参考线，都换算成「全国 = 1」的倍数。
     ① 全国平均（私营工资）＝1.00：这是**定义出来的基准**，不是某个观测值——一个拿全国平均工资的人，
        在全国平均的房价与日常开销下，倍数就是 1.00。分母（全国房价 ＋ 全国日常开销）是同一套，
        所以第二条线只要把分子换成非私营工资就是它的倍数：124,110 ÷ 69,476 ≈ 1.79。
     ② 全国平均（非私营工资）≈ 1.79：同一套分母、工资换成含国企/机关/事业单位的口径。
        两条线的间距就是口径差本身，摆在图上比写一句话解释有用。
     ③ 收支平衡＝0.18 ÷ 全国基准：年收入刚好盖住年支出，换算到全国倍数上就是这条线。
     标签一律带口径名：光写「全国参考」等于什么都没说（工资私营还是非私营，差 1.8 倍）。 */
  function valueBenchmarks() {
    const out = [{ value: 1, label: '全国平均（私营工资）', strong: true }];
    if (NATIONAL_WAGE > 0) {
      out.push({
        value: Math.round((NATIONAL_WAGE_NP / NATIONAL_WAGE) * 100) / 100,
        label: '全国平均（非私营工资）',
        strong: true,
      });
    }
    if (NATIONAL_BASE_INDEX > 0) {
      out.push({ value: Math.round((BREAK_EVEN_INDEX / NATIONAL_BASE_INDEX) * 100) / 100, label: '收支平衡' });
    }
    return out;
  }

  /* ---------- 槽位：标题可点，展开列表换图 ---------- */

  /* ---------- 图四：雷达图对比（也作为一个可选图，占一个槽位） ---------- */

  /* 模板克隆出好几个节点（雷达、选择岗位、列表、对比表…），全部从「这一份克隆」里取：
     报告页与职位对比页各有一份克隆，用 $() 只会拿到文档里更靠前的那个（报告页），
     另一份就被挤成空的——列表里那颗心也就跟着看不见了。 */
  function compareCtxOf(host) {
    const q = (id) => ((host && host.querySelector) ? host.querySelector(`#${id}`) : null);
    return {
      list: q('compareList'),
      toggle: q('compareToggle'),
      radar: q('compareRadar'),
      table: q('compareTable'),
      empty: q('compareEmpty'),
    };
  }

  function renderCompareChart(host) {
    const tpl = $('compareTpl');
    if (!tpl) return;
    host.appendChild(tpl.content.cloneNode(true));
    const ctx = compareCtxOf(host);
    const toggle = ctx.toggle;
    const list = ctx.list;
    if (toggle && list) {
      // 默认就把档案列表摊开，一进这个图就能选岗位
      renderCompareList(ctx);
      list.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.addEventListener('click', () => {
        const open = list.hidden;
        if (open) {
          renderCompareList(ctx);
          list.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          list.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    renderCompare(ctx);
  }

  /* ---------- 图五：原始分 × 性价比（岗位值多少分 × 这份收入在当地扛不扛得住） ---------- */

  // 至少两个岗位才谈得上比较。这张图逐个岗位给位置，不是统计相关，
  // 所以门槛比散点图低——你自己的档案只有两条时也得画得出来。
  const MIN_SCOREVALUE_SAMPLE = 2;

  // 图上点：横轴原始分＝档案里算好的岗位基础分（analysis.baseScore），纵轴性价比倍数。
  // 性价比走「时薪、性价比分析」右轴那一套（valueIndexPoints），两份取数不是同一份对象，
  // 所以按记录 id（老档案退回 url）配对——与时薪图同样的 join 思路，保证同一份档案两张图上是同一个指数。
  function scoreValuePoints() {
    const { items: valueItems, missing } = valueIndexPoints();
    const keyOf = (rec) => ((rec && (rec.id || rec.url)) || '');
    const valueOf = new Map(valueItems.map((it) => [keyOf(it.rec), it]));
    const pts = [];
    let noScore = 0;
    for (const p of analysisPoints()) {
      const vin = valueOf.get(keyOf(p.rec));
      // 缺城市数据、算不出性价比的，已经在 valueIndexPoints 的 missing 里数过了
      if (!vin) continue;
      const a = (p.rec.data && p.rec.data.analysis) || {};
      const base = Number.isFinite(a.baseScore) ? a.baseScore : null;
      if (base == null) { noScore += 1; continue; }
      pts.push({
        rec: p.rec,
        base,
        value: vin.value,
        lo: vin.lo,
        hi: vin.hi,
        pay: p.pay,
        payLo: p.payLo,
        payHi: p.payHi,
        title: p.title,
        company: p.company,
        city: cityOf(p.rec),
      });
    }
    return { pts, missing, noScore };
  }

  // 四象限：横轴 50 分＝六维平均 5 分（原始分中性），纵轴 1.00＝全国平均（性价比中性）
  const SCOREVALUE_QUADS = {
    good_worth: '高分 · 划算',
    good_dear: '高分 · 不划算',
    low_worth: '低分 · 划算',
    low_dear: '低分 · 不划算',
  };
  // 原始分中性线：50 分＝六维平均 5 分（与评分口径一致），图上的竖分界线就画在它上面
  const POSITION_BASE_MID = 50;

  // 点位交互：点一下选中（可多选，选中的点各带一个方框），图下竖排依次列出每一份的详情，
  // 再点一次取消选择；点某一条详情就跳到那份档案。没选中任何点时，悬停只做预览。
  function bindPointTips(svg, tipEl, pts, metaOf) {
    const circles = [...svg.querySelectorAll('.quad-pt')];
    if (!circles.length) return;
    const coords = circles.map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
    const HIT = 16;    // 命中半径，单位是 SVG 用户坐标
    const PICK = 16;   // 选中方框的边长
    const picked = [];          // 选中的点，按点击顺序（可多选）
    const boxes = new Map();    // 选中点各自的方框：下标 → rect
    let hovered = null;         // 没选中任何点时，鼠标扫到的那个（预览用）
    const highlight = (list) => circles.forEach((el, k) => el.classList.toggle('quad-pt-on', list.includes(k)));
    const clusterAt = (x, y) => coords
      .map((c, i) => ({ i, d: Math.hypot(c.x - x, c.y - y) }))
      .filter((o) => o.d <= HIT)
      .sort((a, b) => a.d - b.d)
      .map((o) => o.i);

    // 选中 / 取消选中：框的颜色与详情前面的序号都按选中顺序排（取消一个，后面的往前挪）
    const repaintBoxes = () => {
      for (const [i, box] of boxes) box.style.stroke = pickColorOf(picked.indexOf(i));
    };
    const pick = (i) => {
      if (picked.includes(i)) return;
      picked.push(i);
      const c = coords[i];
      const box = pickBoxEl(c.x, c.y, PICK, picked.length - 1);
      svg.appendChild(box);
      boxes.set(i, box);
    };
    const unpick = (i) => {
      const at = picked.indexOf(i);
      if (at >= 0) picked.splice(at, 1);
      const box = boxes.get(i);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      boxes.delete(i);
      repaintBoxes();
    };

    const entryOf = (pi, order) => {
      const p = pts[pi];
      const item = document.createElement('div');
      item.className = 'quad-tip-item';
      const a = document.createElement('p');
      a.className = 'quad-tip-title';
      // 选中列表里每条前面挂一粒序号（颜色＝图上那个框的颜色）；悬停预览不挂
      if (order != null) a.appendChild(pickNoEl(order));
      a.appendChild(document.createTextNode(p.title + (p.company ? ` · ${p.company}` : '')));
      item.appendChild(a);
      const b = document.createElement('p');
      b.className = 'quad-tip-meta';
      b.textContent = metaOf(p);
      item.appendChild(b);
      item.addEventListener('mouseenter', () => highlight(picked.length ? picked : [pi]));
      item.addEventListener('mouseleave', () => highlight(picked));
      item.addEventListener('click', (e) => { e.stopPropagation(); openHistory(p.rec); });
      return item;
    };

    // 图下固定区域：选中的都列出来（按选中顺序竖排）；没选中时只预览鼠标扫到的那个
    const render = () => {
      tipEl.textContent = '';
      const list = picked.length ? picked.slice() : (hovered != null ? [hovered] : []);
      if (!list.length) {
        highlight([]);
        svg.style.cursor = '';
        return;
      }
      if (picked.length) {
        const hint = document.createElement('p');
        hint.className = 'quad-tip-hint';
        hint.textContent = `已选中 ${picked.length} 个岗位（再点一下图上的点取消选择）`;
        tipEl.appendChild(hint);
      }
      list.forEach((pi, k) => tipEl.appendChild(entryOf(pi, picked.length ? k : null)));
      highlight(hovered != null ? list.concat(hovered).filter((v, k, arr) => arr.indexOf(v) === k) : list);
      svg.style.cursor = 'pointer';
    };

    const at = (e) => {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      if (!box.width || !box.height || !vb.width || !vb.height) return null;
      return {
        x: ((e.clientX - box.left) / box.width) * vb.width,
        y: ((e.clientY - box.top) / box.height) * vb.height,
      };
    };
    svg.addEventListener('mousemove', (e) => {
      const p = at(e);
      if (!p) return;
      const list = clusterAt(p.x, p.y);
      const next = list.length ? list[0] : null;
      if (next === hovered) return;
      hovered = next;
      render();
    });
    svg.addEventListener('mouseleave', () => {
      if (hovered == null) return;
      hovered = null;
      render();               // 选中的留着，只撤掉悬停那一下的预览
    });
    svg.addEventListener('click', (e) => {
      const p = at(e);
      const list = p ? clusterAt(p.x, p.y) : [];
      if (!list.length) return;      // 点空白：选中的留着（要取消就再点那个点）
      // 重叠的点算一簇：都没选中就整簇选上，都选中了就整簇取消
      const allIn = list.every((i) => picked.includes(i));
      if (allIn) list.forEach(unpick); else list.forEach(pick);
      render();
    });
  }

  function renderScoreValueChart(host, ctx = {}) {
    const redraw = ctx.redraw || renderDataAnalysis;
    const { pts, missing, noScore } = scoreValuePoints();
    if (pts.length < MIN_SCOREVALUE_SAMPLE) {
      const why = [];
      if (missing) why.push(`${missing} 条缺城市数据、算不出性价比`);
      if (noScore) why.push(`${noScore} 条没有原始分`);
      chartTooFew(host, why.length
        ? `能进这张图的岗位太少（${why.join('；')}）`
        : '已分析岗位太少，暂时画不出原始分、性价比分析');
      return;
    }

    // 概况行只用中位数：只描述这批岗位的分布，不下关于人的结论
    const sub = document.createElement('p');
    sub.className = 'analysis-sub';
    const parts = [
      `原始分中位 ${Math.round(median(pts.map((p) => p.base)))}`,
      `性价比中位 ${median(pts.map((p) => p.value)).toFixed(2)}`,
    ];
    if (missing) parts.push(`${missing} 条缺城市数据`);
    if (noScore) parts.push(`另有 ${noScore} 条没有原始分`);
    sub.textContent = parts.join(' · ');
    host.appendChild(sub);

    const wrap = document.createElement('div');
    wrap.className = 'quad-wrap';
    const svg = svgEl('svg', { class: 'quad', role: 'img', 'aria-label': '原始分与性价比分析图' });
    wrap.appendChild(svg);
    host.appendChild(wrap);
    const detail = document.createElement('div');
    detail.className = 'chart-detail';
    host.appendChild(detail);

    const H = 500;
    const L = QUAD_L;
    const R = QUAD_W - QUAD_R;
    const T = QUAD_T;
    const B = H - QUAD_B;
    svg.setAttribute('viewBox', `0 0 ${QUAD_W} ${H}`);
    svg.innerHTML = '';
    const add = (tag, attrs) => { const e = svgEl(tag, attrs); svg.appendChild(e); return e; };
    const txt = (x, y, s, o = {}) => {
      const e = svgEl('text', {
        x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 11.5, fill: o.fill || '#9b9a97',
        ...(o.rotate ? { transform: `rotate(${o.rotate} ${x} ${y})` } : {}),
        ...(o.weight ? { 'font-weight': o.weight } : {}),
      });
      e.textContent = s;
      svg.appendChild(e);
      return e;
    };

    // 视野：按数据范围留余量，但两条中性线一定留在画面里（它们就是这张图的坐标含义）
    const mx = POSITION_BASE_MID;
    const my = 1;                        // 性价比倍数：1.00 ＝ 全国平均
    let x0 = Math.min(mx, ...pts.map((p) => p.base));
    let x1 = Math.max(mx, ...pts.map((p) => p.base));
    let y0 = Math.min(my, ...pts.map((p) => p.value));
    let y1 = Math.max(my, ...pts.map((p) => p.value));
    const xPad = Math.max((x1 - x0) * 0.2, 6);
    const yPad = Math.max((y1 - y0) * 0.25, 0.08);
    // 分数不会低过 0、高过满分，视野跟着夹住；倍数不会为负
    x0 = Math.max(0, x0 - xPad);
    x1 = Math.min(100, x1 + xPad);
    y0 = Math.max(0, y0 - yPad);
    y1 += yPad;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * (R - L);
    const Y = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);

    // 坐标轴框架
    add('line', { x1: L, y1: B, x2: L, y2: T - 1, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${L - 3.6},${T - 1} ${L + 3.6},${T - 1} ${L},${T - 11}`, fill: '#191919' });
    add('line', { x1: L, y1: B, x2: R + 1, y2: B, stroke: '#191919', 'stroke-width': 1.2 });
    add('polygon', { points: `${R + 1},${B - 3.6} ${R + 1},${B + 3.6} ${R + 11},${B}`, fill: '#191919' });
    txt((L + R) / 2, B + 42, '原始分（岗位本身值多少分，0-100）', { size: 12 });
    txt(16, (T + B) / 2, '性价比倍数（1.00 = 全国平均）', { size: 12, rotate: -90 });

    // 右上角＝岗位值钱且这份收入在当地扛得住，给一块淡底
    add('rect', {
      x: X(mx), y: T, width: Math.max(0, R - X(mx)), height: Math.max(0, Y(my) - T),
      fill: 'rgba(25,25,25,0.06)',
    });

    // 两条中性线：原始分 50＝各维度平均 5 分；性价比 1.00＝全国平均。
    // 线端那两个标签就是开关：点一下收起这条线（标签留原处，变淡加删除线），再点回来。
    if (!isRefOff('scorevalue', '原始分分界')) {
      add('line', { x1: X(mx), y1: T, x2: X(mx), y2: B, stroke: '#a9a8a4', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
    }
    if (!isRefOff('scorevalue', '全国平均')) {
      add('line', { x1: L, y1: Y(my), x2: R, y2: Y(my), stroke: '#a9a8a4', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
    }
    markRefToggle(txt(X(mx), T - 8, `原始分 ${mx}（各维度平均 ${mx / 10} 分）`, { size: 10.5 }), 'scorevalue', '原始分分界', redraw);
    markRefToggle(txt(R + 8, Y(my) + 4, '全国平均 1.00', { anchor: 'start', size: 10.5 }), 'scorevalue', '全国平均', redraw);

    // 横轴刻度：0-100 的分数
    for (const v of ticksOf(x0, x1, 5)) {
      if (v < 0 || v > 100 || Math.abs(X(v) - X(mx)) < 26) continue;
      add('line', { x1: X(v), y1: B, x2: X(v), y2: B + 4, stroke: '#c9c9c6', 'stroke-width': 1 });
      txt(X(v), B + 17, String(Math.round(v)), { size: 11 });
    }
    // 纵轴刻度：倍数一般落在 0.2~3 之间，步长取 0.05 / 0.1 / 0.2 / 0.5 这类整齐的值，
    // 免得刻度出现 0.275 被标成「0.28」这种线和数字对不上的情况；跟中性线挨太近的不标
    const ySpan = y1 - y0;
    const yStep = ySpan > 1.5 ? 0.5 : ySpan > 0.6 ? 0.2 : ySpan > 0.3 ? 0.1 : ySpan > 0.15 ? 0.05 : 0.02;
    let lastTickY = -999;
    for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1 + 1e-9; v += yStep) {
      const val = Math.round(v * 100) / 100;
      if (val <= 0 || Math.abs(Y(val) - Y(my)) < 22) continue;
      const y = Y(val);
      if (Math.abs(y - lastTickY) < 14) continue;
      lastTickY = y;
      add('line', { x1: L - 4, y1: y, x2: L, y2: y, stroke: '#c9c9c6', 'stroke-width': 1 });
      txt(L - 8, y + 4, val.toFixed(2), { anchor: 'end', size: 11 });
    }

    // 象限注解：横轴＝原始分（左右＝岗位值不值），纵轴＝性价比（上下＝这份收入在当地扛不扛得住）
    const inset = 12;
    const qo = { size: 12.5, fill: '#6f6e69', weight: 600 };
    txt(R - inset, T + 20, SCOREVALUE_QUADS.good_worth, { anchor: 'end', ...qo });   // 右上：高分 + 划算
    txt(L + inset, T + 20, SCOREVALUE_QUADS.low_worth, { anchor: 'start', ...qo });  // 左上：低分 + 划算
    txt(R - inset, B - 12, SCOREVALUE_QUADS.good_dear, { anchor: 'end', ...qo });    // 右下：高分 + 不划算
    txt(L + inset, B - 12, SCOREVALUE_QUADS.low_dear, { anchor: 'start', ...qo });   // 左下：低分 + 不划算

    // 本次打开的那份报告：画成颜色最深的那个点（半径也大一圈）；收藏过的用同一个墨色、常规半径。
    // 悬停坐标就是从每个 .quad-pt 的 cx / cy 上读的，所以深色的那个点自己也是命中目标。
    const hasCur = reportHighlightUrl ? pts.some((p) => isCurrentRec(p.rec, reportHighlightUrl)) : false;
    for (const p of pts) {
      const t = toneOf(p.rec, reportHighlightUrl);
      svg.appendChild(svgEl('circle', {
        cx: X(p.base).toFixed(1), cy: Y(p.value).toFixed(1), r: t === 'cur' ? 5.4 : 4.6,
        class: t === 'cur' ? 'quad-pt quad-pt-cur' : (t === 'fav' ? 'quad-pt quad-pt-fav' : 'quad-pt'),
      }));
    }

    bindPointTips(svg, detail, pts, (p) => `年薪区间 ${fmtWan(p.payLo)}~${fmtWan(p.payHi)} 万（取中 ${fmtWan(p.pay)} 万）`
      + ` · 原始分 ${p.base} · 性价比 ${p.value.toFixed(2)}（1.00＝全国平均）· ${p.city || '—'}`);

    const explain = document.createElement('div');
    explain.className = 'quad-explain';
    const lines = [
      `<b>横轴：原始分</b>——岗位本身值多少分（薪资 30% ＋ 稳定性 25% ＋ 休息 25% ＋ 发展 20%），${POSITION_BASE_MID} 分＝各维度平均 ${POSITION_BASE_MID / 10} 分，越靠右岗位越值钱。`,
      '<b>纵轴：性价比倍数</b>——这份收入在当地扛不扛得住＝时薪 ÷ 当地每人每天固定支出，再比全国同口径，1.00＝全国平均，越靠上越扛得住。',
      `<b>分界线</b>——竖线 ${POSITION_BASE_MID} 分、横线 1.00，右上淡底＝「高分 · 划算」，四角就是高低分 × 划不划算的四种组合。点线上的字可以收起这条线，再点回来。`,
    ];
    if (hasCur) lines.push('<b>最深色的那个点</b>——本次打开的那份报告，就落在这个点位上。');
    if (pts.some((p) => isFavRec(p.rec))) lines.push('<b>深色的那些点</b>——收藏过的岗位，在列表里点心就能加上。');
    for (const line of lines) {
      const p = document.createElement('p');
      p.innerHTML = line;
      explain.appendChild(p);
    }
    host.appendChild(explain);
  }

  /* ---------- 图七～九：发展潜力的横向对比（把已分析岗位摆到同一张图上） ----------

     三张图共用一份数据与一个岗位选择器：
       · 档位分析——你分析过的岗位落在本城 10 档的哪一档，柱子是本城官方职业库的分布
       · 薪资涨幅——每个岗位「普通人水平 → 天花板」的那条梯度，以及这份 JD 报价落在哪一段
       · 薪资 × 发展——横轴薪资、纵轴发展潜力分，点＝你分析过的岗位

     口径提醒：发展潜力有两条（官方工资价位 / 招聘拟合），两者的 10 档不是同一把尺，
     所以每个点都带口径标记（实心＝官方数据、空心＝拟合），图注里也写明。

     三张图都不再做「选择岗位」的勾选：所有做过 JD 分析、数据画得出来的档案一律进图
     （用户口径：默认全都在上面）。 */

  // 测试从这行开始抠出整段（见 test/growthcharts.test.js 的锚点）
  const GROWTH_CHARTS_MARK = true;

  // 「本次分析的岗位」＝报告页正在看的那份 JD：档案自身的 url 或它记的来源 url 对得上。
  // 各张分析图都用这一条判断，别让同一份报告在某张图上标了、在另一张图上没标。
  function isCurrentRec(rec, url) {
    return !!url && !!rec && (rec.url === url
      || (rec.data && rec.data.source && rec.data.source.url) === url);
  }

  // 图上深浅三档：本次打开的这份最深（cur），收藏过的次之（fav），其余保持淡色（空串）。
  // 点心之后各张图都改走这里取档，别一张图认收藏、另一张图不认。
  function toneOf(rec, curUrl) {
    if (isCurrentRec(rec, curUrl)) return 'cur';
    return isFavRec(rec) ? 'fav' : '';
  }

  // 图标题行里那句「深浅说明」：最深的一个＝本次打开的这份，其次深＝收藏过的
  function toneTitleTail(hasCur, hasFav) {
    return (hasCur ? '，最深色的那一个＝本次打开的这份' : '')
      + (hasFav ? (hasCur ? '，其次深的是收藏的岗位' : '，深色的那一个是收藏的岗位') : '');
  }

  /* 参考线（辅助线）的显示开关：各张分析图共用一套（散点 / 时薪 / 原始分 / 涨幅 / 薪资 × 发展）。
     key = `${图表 id}:${线的标识}`；点线上的字就收起这条线——线（含它的端点刻线）不画，
     标签留在原处变淡 + 加删除线，再点一下回来。状态只在内存里：换图、重画都还在，刷新回到全显示。
     这一小段必须待在本段里：test/growthcharts.test.js 会把从 GROWTH_CHARTS_MARK 到 CHART_RENDERERS 的整段
     抠出去在 Node 里单跑，段外的标识符在那种沙盒里够不着——挪出去那几条测试会直接报 ReferenceError。 */
  const refLineOff = new Set();
  const refKey = (chart, name) => `${chart}:${name}`;
  const isRefOff = (chart, name) => refLineOff.has(refKey(chart, name));
  const REF_TITLE = '点一下收起这条线，再点一下显示';
  function toggleRef(chart, name, redraw) {
    const k = refKey(chart, name);
    if (refLineOff.has(k)) refLineOff.delete(k); else refLineOff.add(k);
    if (typeof redraw === 'function') redraw();
  }

  // 图下那行小字里的读数：做成可点的小按钮（HTML 版）
  function refButton(chart, name, text, redraw) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ref-toggle';
    if (isRefOff(chart, name)) b.classList.add('ref-off');
    b.title = REF_TITLE;
    b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleRef(chart, name, redraw); });
    return b;
  }

  // 图上的标签（SVG 版）：提示写在 <title> 子元素里；点了不让事件冒到图上（否则会顺手选中一个点）
  function markRefToggle(el, chart, name, redraw) {
    el.classList.add('ref-toggle');
    if (isRefOff(chart, name)) el.classList.add('ref-off');
    const tip = svgEl('title', {});
    tip.textContent = REF_TITLE;
    el.appendChild(tip);
    el.addEventListener('click', (e) => { e.stopPropagation(); toggleRef(chart, name, redraw); });
    return el;
  }

  // 字符串拼出来的 SVG（薪资涨幅 / 薪资 × 发展潜力）：标签上写了 data-ref，插进 DOM 后统一挂点击
  function bindRefToggles(root, chart, redraw) {
    for (const el of root.querySelectorAll('svg .ref-toggle')) {
      el.addEventListener('click', (e) => { e.stopPropagation(); toggleRef(chart, el.dataset.ref, redraw); });
    }
  }

  /**
   * 历史档案 → 发展潜力图上的点。只有同时存了 growthCalc 与分数的记录才画得出来
   * （旧口径的档案在进页面时会自动按当前口径重算，重算后就有）。
   */
  /* 「已分析岗位」的数据源：首页示例轮播期间临时换成演示样本（DEMO_CASES），画完立刻换回来。
     三张分析图（散点 / 档位 / 涨幅）都从这里取数，真实档案不受影响。 */
  let demoPointsOn = false;
  const historySource = () => (demoPointsOn ? DEMO_CASES : loadHistory());

  function growthPointsOf() {
    const out = [];
    for (const rec of historySource()) {
      const data = rec.data || {};
      const a = data.analysis || {};
      const c = a.growthCalc;
      if (!c || typeof c !== 'object') continue;
      const d = (a.dimensions || []).find((x) => x.key === 'growth');
      if (!d || d.score == null) continue;
      const official = c.basis === 'official';
      const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
      const annual = annualRangeOf((data.source && data.source.job) || {}, restRangeOf(data).est);
      const jdMid = num(c.jdMid)
        || (num(c.jdLow) && num(c.jdHigh) ? (num(c.jdLow) + num(c.jdHigh)) / 2 : null);
      out.push({
        rec,
        id: rec.id,
        title: (rec.job && rec.job.title) || '未命名岗位',
        city: c.city || '',
        official,
        layer: c.layer === 'jd' ? 'jd' : 'occupation',
        score: Number(d.score),
        basisLabel: official
          ? `官方工资价位${c.job ? `·${c.job}` : ''}`
          : `招聘拟合${c.estimated === 'shape' ? '·借同类分布' : c.estimated === 'neutral' ? '·中性估算' : ''}`,
        pLo: num(official ? c.p20 : c.b),        // 普通人水平（元/月）
        pHi: num(official ? c.p80 : c.t),        // 天花板（元/月）
        jdLow: num(c.jdLow),
        jdHigh: num(c.jdHigh),
        jdMid,
        // 二维平面（k′ 那张图）用：落档那一层的两个因子、这一层的 K、以及职业层的 K
        r1Now: Number(c.r1), r2Now: Number(c.r2),
        Know: Number(c.K != null ? c.K : c.k),
        Kbase: Number(c.K1 != null ? c.K1 : c.k),
        pay: annual ? Math.round(annual.mid / 12) : null,
        avg: num(official ? c.c : c.nonpriv),    // 本城非私社平（尺子）
      });
    }
    return out;
  }

  // 三张图都用全量：做过 JD 分析、画得出来的档案都进图（不再做「选择岗位」的勾选）
  function growthDrawableOf(points) {
    return points.filter((p) => (p.jdMid || p.pay) && p.score != null);
  }

  // 这批岗位里出现最多的城市：柱子、社平线都按它取
  function growthCityOf(sel) {
    const cnt = {};
    for (const p of sel) if (p.city) cnt[p.city] = (cnt[p.city] || 0) + 1;
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
  }

  // 「这个职业的天花板」：官方口径按 P80，拟合口径按分布算出的 t；两者都没有就退回这份 JD 的报价
  function pHi(p) {
    return p.pHi || p.jdMid || p.pay || null;
  }

  // 传统坐标轴：从原点出发的两条带箭头的轴线（与象限图同一套画法，粗细颜色都对齐）
  function growthAxes(L, B, R, T) {
    return `<line x1="${L}" y1="${B}" x2="${L}" y2="${T - 1}" stroke="#191919" stroke-width="1.2"/>`
      + `<polygon points="${L - 3.6},${T - 1} ${L + 3.6},${T - 1} ${L},${T - 11}" fill="#191919"/>`
      + `<line x1="${L}" y1="${B}" x2="${R + 1}" y2="${B}" stroke="#191919" stroke-width="1.2"/>`
      + `<polygon points="${R + 1},${B - 3.6} ${R + 1},${B + 3.6} ${R + 11},${B}" fill="#191919"/>`;
  }

  // 一条都画不出来时：分清是「还没有档案」还是「有档案、但这一维没有分布依据」
  function growthEmptyMsg() {
    const all = loadHistory();
    if (!all.length) return '还没有可用的岗位：先去分析几个岗位吧';
    const dims = all.filter((r) => (((r.data || {}).analysis || {}).dimensions || [])
      .some((d) => d.key === 'growth' && d.score != null));
    if (!dims.length) return '已分析的报告里都没有发展潜力这一维，先去分析几个岗位吧';
    return `这 ${dims.length} 份档案是旧口径算的分，没有存下分布依据，画不进这张图——`
      + '重新分析一次就会有（旧档案打开时也会自动补一次，补不到就是那个职业还查不到分布）';
  }

  /* 图七·发展潜力档位分析：把 K 的两个因子摆成二维平面——横轴工作价值高度 r₂、纵轴薪资成长空间 r₁。
     两个因子相乘就是 K，所以「同一档」在这个平面上是一条条 45° 的斜带（底纹越深＝这一档人越多）。
     灰点＝本城官方职业库，深色点＝你分析过的岗位（本次打开的那份颜色最深）。
     鼠标移到点上出详情、点一下钉住、再点收起——与「预计年薪、年均休息日分析」共用同一套手感。 */
  function renderGrowthRankChart(host, opts = {}) {
    const sel = growthPointsOf();
    if (!sel.length) {
      chartTooFew(host, growthEmptyMsg());
      return;
    }
    const city = growthCityOf(sel);
    const L = ScoreModel && ScoreModel.growthLadderOf ? ScoreModel.growthLadderOf(city) : null;
    if (!L || !Array.isArray(L.lines)) {
      chartTooFew(host, `${city || '这批岗位的城市'}还没有官方工资价位表，画不出档位刻度——深圳已经有`);
      return;
    }
    const lines = L.lines;
    const cloud = (growthScatter && growthScatter[city]) || [];
    // 视野：两轴同一段对数区间（对角线成 45°），必须包住最外两条线——每条线离原点最近在 r＝√L 处
    const ratio = lines[1] / lines[0];
    const mins = sel.map((p) => Math.min(p.r1Now, p.r2Now)).concat(cloud.map((q) => Math.min(q[0], q[1])));
    const maxs = sel.map((p) => Math.max(p.r1Now, p.r2Now)).concat(cloud.map((q) => Math.max(q[0], q[1])));
    const lo0 = Math.min(...mins, Math.sqrt(lines[0]) * 0.7);
    const hi0 = Math.max(...maxs, Math.sqrt(lines[8]) * 1.3);
    const lo = 10 ** (Math.round((Math.log10(lo0) - 0.02) * 10) / 10);
    const hi = 10 ** (Math.round((Math.log10(hi0) + 0.02) * 10) / 10);
    const W = 720, H = 470, ML = 62, MR = 700, MT = 44, MB = 384;
    const X0 = Math.log10(lo), X1 = Math.log10(hi);
    const pxAt = (xLog) => ML + (xLog - X0) / (X1 - X0) * (MR - ML);
    const pyAt = (yLog) => MB - (yLog - X0) / (X1 - X0) * (MB - MT);
    const px = (v) => pxAt(Math.log10(v));
    const py = (v) => pyAt(Math.log10(v));
    const bandOf = (r1, r2) => 1 + lines.filter((x) => r1 * r2 >= x).length;

    // 每一层的人数：有参照云就用真实计数，没有就用「中间厚、两端薄」的理论形状兜底
    const cnt = Array(10).fill(0);
    for (const q of cloud) cnt[bandOf(q[0], q[1]) - 1]++;
    const maxCnt = Math.max(...cnt, 1);
    const shade = (i) => {
      const t = cloud.length ? cnt[i] / maxCnt : Math.max(0.08, 1 - Math.abs(i - 4.5) / 5.2);
      const g = Math.round(255 - t * 40);
      return `rgb(${g},${Math.min(255, g + 1)},${Math.min(255, g + 6)})`;
    };

    // 报告页打开的那份 JD 在图上颜色最深、收藏过的次之，标题行里说明一下
    const hasCur = sel.some((p) => isCurrentRec(p.rec, reportHighlightUrl));
    const hasFav = sel.some((p) => isFavRec(p.rec));

    let out = `<svg class="quad" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">`;
    // 标题排两行：一行写图怎么读，第二行写「谁最深」——排成一整行会在窄窗口下长出图框被切掉
    out += `<text x="0" y="18" font-size="11.5" fill="#5b6678">两个因子相乘＝发展潜力：斜带＝10 档，越靠右上越高；灰点＝${city || '本城'}官方职业库（参考）</text>`;
    out += `<text x="0" y="33" font-size="11.5" fill="#5b6678">黑点＝你分析过的岗位${toneTitleTail(hasCur, hasFav)}</text>`;
    out += '<defs>'
      + `<clipPath id="gp-clip"><rect x="${ML}" y="${MT}" width="${MR - ML}" height="${MB - MT}"/></clipPath>`
      + '<marker id="gp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
      + '<path d="M 0 0 L 10 5 L 0 10 z" fill="#191919"/></marker>'
      + '</defs>';
    out += `<rect x="${ML}" y="${MT}" width="${MR - ML}" height="${MB - MT}" fill="#ffffff" stroke="#e3e8f0"/>`;
    // 阶层底纹：把「两条斜线之间那条带」用矩形裁出来填灰
    out += '<g clip-path="url(#gp-clip)">';
    for (let i = 0; i < 10; i++) {
      const sLo = Math.log10(i === 0 ? 1e-9 : lines[i - 1]);
      const sHi = Math.log10(i === 9 ? 1e9 : lines[i]);
      let poly = [[X0, X0], [X1, X0], [X1, X1], [X0, X1]];
      poly = clipPoly(poly, (q) => (q[0] + q[1]) - sLo);
      if (poly.length >= 3) poly = clipPoly(poly, (q) => sHi - (q[0] + q[1]));
      if (poly.length < 3) continue;
      const pts = poly.map((q) => `${pxAt(q[0]).toFixed(1)},${pyAt(q[1]).toFixed(1)}`).join(' ');
      out += `<polygon points="${pts}" fill="${shade(i)}"/>`;
    }
    out += '</g>';
    // 对数网格（白线压在底纹上）
    for (let pw = Math.floor(Math.log10(lo)); pw <= Math.ceil(Math.log10(hi)); pw++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** pw;
        if (v < lo || v > hi) continue;
        out += `<line x1="${ML}" y1="${py(v).toFixed(1)}" x2="${MR}" y2="${py(v).toFixed(1)}" stroke="#ffffff" opacity="0.75"/>`;
        out += `<text x="${ML - 8}" y="${(py(v) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#aab4c4">${v}</text>`;
        out += `<line x1="${px(v).toFixed(1)}" y1="${MT}" x2="${px(v).toFixed(1)}" y2="${MB}" stroke="#ffffff" opacity="0.75"/>`;
        out += `<text x="${px(v).toFixed(1)}" y="${MB + 16}" text-anchor="middle" font-size="10" fill="#aab4c4">${v}</text>`;
      }
    }
    // 分档线：r₁ × r₂ ＝ 分界线，是一条 45° 的双曲线
    for (const Lv of lines) {
      const a = Math.max(0, (Math.log10(Lv) - X1 - X0) / (X1 - X0));
      const b = Math.min(1, (Math.log10(Lv) - X0 - X0) / (X1 - X0));
      if (!(b > a)) continue;
      const lx = (t) => pxAt(X0 + t * (X1 - X0));
      const ly = (t) => pyAt(Math.log10(Lv) - (X0 + t * (X1 - X0)));
      out += `<line x1="${lx(a).toFixed(1)}" y1="${ly(a).toFixed(1)}" x2="${lx(b).toFixed(1)}" y2="${ly(b).toFixed(1)}" stroke="#aab4c4" stroke-width="1" stroke-dasharray="5 4"/>`;
    }
    // 档号：沿对角线 r₁ ＝ r₂，每档取相邻两条线的几何中点
    for (let i = 0; i < 10; i++) {
      const loL = i === 0 ? lines[0] / ratio : lines[i - 1];
      const hiL = i === 9 ? lines[8] * ratio : lines[i];
      const r = (loL * hiL) ** 0.25;
      const cx = px(r);
      const cy = py(r);
      if (cx < ML + 6 || cx > MR - 6 || cy < MT + 6 || cy > MB - 6) continue;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="#ffffff" opacity="0.86"/>`;
      out += `<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#8a94a6">${i + 1}</text>`;
    }
    // 参考云：官方职业库，只当背景密度——画得又细又淡，别跟岗位点抢眼
    for (const q of cloud) {
      const cx = px(q[1]);
      const cy = py(q[0]);
      if (cx < ML || cx > MR || cy < MT || cy > MB) continue;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5" fill="#cdd7e4" opacity="0.55"/>`;
    }
    // 自己分析的岗位：带 quad-pt 类，点一下由 bindPointTips 选中（可多选、图下依次列详情，坐标也从这里读）。
    // 报告页打开的那份换成墨色点（.quad-pt-cur，半径大一圈），收藏过的是同一个墨色、常规半径；
    // 其余都是淡色点。
    for (const p of sel) {
      const cx = Math.min(Math.max(px(p.r2Now), ML + 8), MR - 8);
      const cy = Math.min(Math.max(py(p.r1Now), MT + 8), MB - 8);
      const t = toneOf(p.rec, reportHighlightUrl);
      out += `<circle class="quad-pt${t === 'cur' ? ' quad-pt-cur' : t === 'fav' ? ' quad-pt-fav' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${t === 'cur' ? 6.5 : 5.5}"/>`;
    }
    out += `<line x1="${ML}" y1="${MB}" x2="${ML}" y2="${MT - 2}" stroke="#191919" stroke-width="1.2" marker-end="url(#gp-arrow)"/>`;
    out += `<line x1="${ML}" y1="${MB}" x2="${MR + 2}" y2="${MB}" stroke="#191919" stroke-width="1.2" marker-end="url(#gp-arrow)"/>`;
    out += `<text x="${(ML + MR) / 2}" y="${MB + 40}" text-anchor="middle" font-size="11" fill="#5b6678">工作价值高度 r₂（越大＝这个职业的“顶”越高）</text>`;
    out += `<text x="16" y="${(MT + MB) / 2}" font-size="11" fill="#5b6678" transform="rotate(-90 16 ${(MT + MB) / 2})" text-anchor="middle">薪资成长空间 r₁（越大＝能涨的幅度越大）</text>`;
    out += '</svg>';
    const box = document.createElement('div');
    box.className = 'quad-wrap';
    box.innerHTML = out;
    host.appendChild(box);
    const detail = document.createElement('div');
    detail.className = 'chart-detail';
    host.appendChild(detail);
    bindPointTips(box.querySelector('svg'), detail, sel, (p) => `${p.city || '—'} · 发展潜力 ${p.score} 分 · ${p.basisLabel}`
      + ` · r₁ ${p.r1Now.toFixed(2)} × r₂ ${p.r2Now.toFixed(2)} ＝ k′ ${p.Know.toFixed(2)}`
      + `（这个职业 ${p.Kbase.toFixed(2)}）`);
    const note = document.createElement('p');
    note.className = 'analysis-note';
    note.textContent = CHART_NOTES.growthrank;
    host.appendChild(note);
    if (!growthScatter) {
      // 参照云是懒加载的：拿到之后交给外面那条重画路径（报告页 / 职位对比页各自会重新立起
      // 「正在看的那份」的上下文）——直接在这里重画会把「本次分析的岗位」的高亮丢掉。
      loadGrowthScatter().then(() => {
        if (!box.isConnected || typeof opts.redraw !== 'function') return;
        opts.redraw();
      });
    }
  }

  /* 薪资涨幅分析的行排序（图名旁边的开关，与参考线开关一样只存内存、刷新回默认）。
     两个口径都以这份 JD 自己给的价为起点 / 终点，职业 / 行业那一侧只当「天花板」用：
     growth（默认）＝涨幅空间最大幅度在前：从这份 JD 的最低点，到「统计天花板（这个职业在本城的
       天花板，浅灰条的右端）与这份 JD 的最高点（深灰条的右端）」里更高的那个；
     base ＝底薪最高在前：这份 JD 的最低点（报价下沿优先，只给一个数就用那个数 / 月当量）。
     缺这一项的行沉底（没有 JD 的价就没有起点），同值按存入时间新的在前——与历史列表同一套口径。 */
  let growthstepSort = 'growth';

  // 这份 JD 的最低点：报价下沿（档案里存过的 jdLow）优先，只有单值就用那个数（月当量，图上的点）
  function jdLowOf(p) {
    return p.jdLow || p.pay || 0;
  }

  function growthStepValueOf(p, mode) {
    if (mode === 'base') return jdLowOf(p);
    const lo = jdLowOf(p);
    const hi = Math.max(pHi(p) || 0, p.jdHigh || 0);   // 统计天花板 / 这份 JD 的最高点，取更高的那个
    return lo > 0 && hi > lo ? hi - lo : 0;
  }

  function growthStepSorted(sel, mode = growthstepSort) {
    return sel.slice().sort((a, b) => (growthStepValueOf(b, mode) - growthStepValueOf(a, mode))
      || ((Number(b.rec && b.rec.savedAt) || 0) - (Number(a.rec && a.rec.savedAt) || 0)));
  }

  /* 图八·薪资涨幅分析：一个岗位一行——浅灰条＝这个职业「普通人水平 → 天花板」的跨度，
     深灰条＝这份 JD 的报价；竖线是本城社平的 1 / 2 / 3 倍（虚线）与全国平均（实线）。
     全部岗位都画进来（不做岗位勾选）；鼠标扫到某一行出详情、点一下钉住、再点收起——
     与其余分析图同一套手感，只是命中判定从「点」换成「行」。 */
  function renderGrowthStepChart(host, ctx = {}) {
    const redraw = ctx.redraw || renderDataAnalysis;
    const all = growthPointsOf();
    // 排序先定下来：图上的行、行详情都按这一个顺序走（换排序时整段重画）
    const sel = growthStepSorted(all.filter((p) => p.pLo || p.pHi || p.jdMid || p.pay));
    if (!sel.length) {
      chartTooFew(host, all.length ? '已分析的报告里都读不到薪资，画不出涨幅对比' : growthEmptyMsg());
      return;
    }
    // 「共 N 个带薪资的岗位 · 一行一个」这行小字已按用户口径去掉：图上一眼就能看出有几个岗位

    const avg = sel.map((p) => p.avg).find((v) => v) || null;
    const natl = Math.round(NATIONAL_WAGE_NP / 12);
    const vals = [];
    for (const p of sel) {
      for (const v of [p.pLo, pHi(p), p.jdLow, p.jdHigh, p.pay]) if (v > 0) vals.push(v);
    }
    vals.push(natl);
    if (avg) vals.push(avg);
    const lo = Math.max(1000, Math.min(...vals) * 0.9);
    const hi = Math.max(...vals) * 1.1;
    // 岗位名斜排（-28°）后行高要放宽：左边距只留出纵轴的位置，剩下的字斜着往左下排。
    // ML 取 108 而不是 104：9 字＋省略号那条斜排后投影约 97px，108−4−97 ≈ +7，稳稳留在图框内。
    const W = 720, rowH = 56, TOP = 94, ML = 108, MR = 700;
    const AXIS = TOP + sel.length * rowH + 10;
    const H = AXIS + 66;
    const x = (v) => ML + ((v - lo) / (hi - lo)) * (MR - ML);
    const K = (v) => `${(v / 1000).toFixed(1)}K`;
    // 条尾那颗粒小心（收藏标记）：路径与历史列表里的心同一个，缩到约 11px、低饱和的红；
    // 右边放不下就贴回条内（不探出图框）
    const heartAt = (hx, cy) => {
      const s = 0.46;
      const px = Math.min(hx, MR - 24 * s);
      return `<g transform="translate(${Number(px).toFixed(1)} ${(cy - 12 * s).toFixed(1)}) scale(${s})">`
        + `<path fill="#c98a8a" d="${HEART_PATH}"/></g>`;
    };

    // 报告页打开的那份 JD：条体（或单值点）颜色最深、收藏的次之
    const hasCur = sel.some((p) => isCurrentRec(p.rec, reportHighlightUrl));
    const hasFav = sel.some((p) => isFavRec(p.rec));

    let out = `<svg class="quad" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">`;
    // 「谁最深」那行字按用户要求去掉：收藏的岗位改成条尾一颗小心（图例里说明），
    // 图上不再用一行字解释颜色；两条灰条分别代表什么改由图例（HTML）说清楚。
    // 参考线：本城社平的 1/2/3 倍与全国非私营平均都是虚线（辅助线一律虚线，用户口径）。
    // 两条线的标签挨太近就往上错一层——社平与全国平均撞在一起时，两行字会糊成一行。
    // 标签就是开关：点一下收起这条线（标签留原处，变淡加删除线），再点回来。
    const refs = [];
    if (avg) {
      for (const m of [1, 2, 3]) refs.push({ v: avg * m, name: m === 1 ? '本城社平' : `${m}×社平`, label: `${m === 1 ? '本城社平' : `${m}×社平`} ${K(avg * m)}`, dashed: true });
    }
    refs.push({ v: natl, name: '全国平均', label: `全国平均 ${K(natl)}`, dashed: true });
    const placedRefs = [];
    for (const r of refs) {
      if (!(r.v > lo) || !(r.v < hi)) continue;
      const rx = x(r.v);
      let level = 0;
      while (level < 2 && placedRefs.some((p) => p.level === level && Math.abs(p.x - rx) < 92)) level++;
      placedRefs.push({ x: rx, level });
      const off = isRefOff('growthstep', r.name);
      if (!off) {
        out += `<line x1="${rx.toFixed(1)}" y1="${TOP - 10}" x2="${rx.toFixed(1)}" y2="${AXIS}" stroke="${r.dashed ? '#c9d1dd' : '#aab4c4'}" stroke-width="1"${r.dashed ? ' stroke-dasharray="4 4"' : ''}/>`;
      }
      out += `<text class="ref-toggle${off ? ' ref-off' : ''}" data-ref="${r.name}" x="${rx.toFixed(1)}" y="${TOP - 16 - level * 14}" text-anchor="middle" font-size="10" fill="#8a94a6">`
        + `<title>${REF_TITLE}</title>${r.label}</text>`;
    }
    sel.forEach((p, i) => {
      const y = TOP + i * rowH;
      // 行内垂直居中：条形（高 18）按行高居中，行内文字都对着条形中线排；
      // 一行放不下、挪到第二行的字（右对齐的涨幅、没读到薪资那句）贴着行框下沿（y+rowH-8）上方 3px
      const barY = y + (rowH - 18) / 2;
      const midY = barY + 9;
      const line2Y = y + rowH - 11;
      // 整行一个组：鼠标扫到哪一行，这一行的底变浅灰（.step-row-on），指明详情对着谁
      out += `<g class="step-row">`;
      out += `<rect class="step-row-bg" x="${ML}" y="${y + 1}" width="${MR - ML}" height="${rowH - 8}" rx="4"/>`;
      const title = p.title.length > 8 ? `${p.title.slice(0, 8)}…` : p.title;
      // 锚点比旋转心右移 6px：8 字＋省略号是最长的一条，斜排后仍压在绘图区左边界以内，不探出图框
      out += `<text x="${ML - 4}" y="${y + 16}" text-anchor="end" font-size="11.5" fill="#5b6678" transform="rotate(-28 ${ML - 10} ${y + 16})">${title}</text>`;
      const a = p.pLo;
      const b = pHi(p);
      const tone = toneOf(p.rec, reportHighlightUrl);
      const spans = [];
      if (a && b && b > a) spans.push([x(a), x(b)]);
      // 这份 JD 落在哪一段：有区间画深灰条，只有单个值画点
      if (p.jdLow && p.jdHigh && p.jdHigh > p.jdLow) spans.push([x(p.jdLow), x(p.jdHigh)]);
      else if (p.pay) spans.push([x(p.pay) - 6, x(p.pay) + 6]);
      if (a && b && b > a) {
        const s = spans[0];
        out += `<rect x="${s[0].toFixed(1)}" y="${barY}" width="${Math.max(2, s[1] - s[0]).toFixed(1)}" height="18" rx="9" fill="#e7ebf2" stroke="#ccd3de"/>`;
      }
      // 这份 JD 在图上占的那一段（深灰条 / 单值点）：没读到薪资就是空的，这一行也就没有深色条
      if (spans.length > 1) {
        // 收藏过的用中深灰、本次打开的那份用墨色——不用记号也挑得出来
        const s = spans[1];
        out += `<rect x="${s[0].toFixed(1)}" y="${barY}" width="${Math.max(2, s[1] - s[0]).toFixed(1)}" height="18" rx="9" fill="${tone === 'cur' ? '#191919' : tone === 'fav' ? '#414b59' : '#98a2b3'}"/>`;
        // 收藏的岗位：条尾挂一颗小心（原来那行「深色的是收藏」的字按用户要求去掉，
        // 改成记号本身说话——图例里有一颗同样的心）
        if (isFavRec(p.rec)) out += heartAt(s[1] + 4, midY);
      } else if (p.pay && !(p.jdLow && p.jdHigh && p.jdHigh > p.jdLow)) {
        out += `<circle class="step-jd-pt" cx="${x(p.pay).toFixed(1)}" cy="${midY}" r="5"${tone ? ` style="fill:${tone === 'cur' ? '#191919' : '#414b59'}"` : ''}/>`;
        if (isFavRec(p.rec)) out += heartAt(x(p.pay) + 8, midY);
      }
      // 涨幅文字最后画（不然会被条盖住），并且不许越过右边框。
      // 右边放不下时不要塞回左边的岗位名底下（会跟标题连成一行），改放到这一行的第二行、右对齐。
      if (a && b && b > a) {
        const right = Math.max(...spans.map((s) => s[1]));
        const txt = `涨 ${Math.round((b / a - 1) * 100)}%（${K(a)} → ${K(b)}）`;
        const est = txt.length * 6.2 + 4;
        const flip = right + 8 + est > MR;
        const tx = flip ? MR : right + 8;
        out += `<text x="${tx.toFixed(1)}" y="${flip ? line2Y : midY + 5}" text-anchor="${flip ? 'end' : 'start'}" font-size="10.5" fill="#8a94a6">${txt}</text>`;
      }
      // 这一行连一个 JD 自己的价都没有时才说「没读到」；只读到单值（画成点）的不算——
      // 那个点就是它的价，行详情里写着月当量是多少（底薪排序也拿这个数比）
      if (p.layer !== 'jd' && !p.pay) {
        out += `<text x="${ML}" y="${line2Y}" font-size="10" fill="#aab4c4">这份 JD 没读到薪资，深灰条位置留空</text>`;
      }
      out += `</g>`;
    });
    // 横轴（金额刻度，带箭头）：金额越大越靠右
    for (const t of ticksOf(lo, hi, 6)) {
      out += `<line x1="${x(t).toFixed(1)}" y1="${AXIS}" x2="${x(t).toFixed(1)}" y2="${AXIS + 4}" stroke="#c9c9c6"/>`;
      out += `<text x="${x(t).toFixed(1)}" y="${AXIS + 17}" text-anchor="middle" font-size="10" fill="#aab4c4">${K(t)}</text>`;
    }
    out += `<line x1="${ML}" y1="${AXIS}" x2="${MR + 1}" y2="${AXIS}" stroke="#191919" stroke-width="1.2"/>`;
    out += `<polygon points="${MR + 1},${AXIS - 3.6} ${MR + 1},${AXIS + 3.6} ${MR + 11},${AXIS}" fill="#191919"/>`;
    // 纵轴（一行一个岗位，带箭头）＋ 原点：两条轴在这里交汇
    out += `<line x1="${ML}" y1="${AXIS}" x2="${ML}" y2="${TOP - 24}" stroke="#191919" stroke-width="1.2"/>`;
    out += `<polygon points="${ML - 3.6},${TOP - 24} ${ML + 3.6},${TOP - 24} ${ML},${TOP - 34}" fill="#191919"/>`;
    out += `<circle cx="${ML}" cy="${AXIS}" r="3" fill="#191919"/>`;
    out += `<text x="${ML}" y="${TOP - 42}" text-anchor="middle" font-size="11" fill="#8a94a6">岗位</text>`;
    out += `<text x="${MR}" y="${AXIS + 46}" text-anchor="end" font-size="10.5" fill="#8a94a6">税前月当量（元/月）</text>`;
    out += '</svg>';
    const box = document.createElement('div');
    box.className = 'quad-wrap';
    box.innerHTML = out;
    // 图例（HTML，排在图上方面）：两条灰条各是什么、收藏那颗心是什么——用户看不懂的正是这两条，
    // 所以不塞进图注小字里，放到图的正上方
    const legend = document.createElement('p');
    legend.className = 'quad-legend';
    legend.innerHTML = '<span><i class="lg lg-bar-range"></i>浅灰条＝这个职业：普通人水平 → 天花板</span>'
      + '<span><i class="lg lg-bar-jd"></i>深色条＝这份 JD 的报价</span>'
      + (hasCur ? '<span><i class="lg lg-bar-cur"></i>墨色＝本次打开的这份</span>' : '')
      + (hasFav ? '<span><i class="lg lg-heart">♥</i>＝收藏的岗位</span>' : '');
    host.appendChild(legend);
    host.appendChild(box);
    bindRefToggles(box, 'growthstep', redraw);
    const detail = document.createElement('div');
    detail.className = 'chart-detail';
    host.appendChild(detail);

    // 行详情：这一行的两个口径（职业梯度 / 这份 JD 的报价）＋ 它落在哪
    const metaOf = (p) => {
      const parts = [`${p.city || '—'} · 发展潜力 ${p.score} 分 · ${p.basisLabel}`];
      const a = p.pLo;
      const b = pHi(p);
      if (a && b && b > a) {
        parts.push(`这个职业在本城：普通人水平 ${K(a)} → 天花板 ${K(b)}，涨幅 ${Math.round((b / a - 1) * 100)}%`);
      } else if (b) {
        parts.push(`这个职业在本城的天花板约 ${K(b)}`);
      }
      if (p.jdLow && p.jdHigh && p.jdHigh > p.jdLow) {
        parts.push(`这份 JD 报价 ${K(p.jdLow)} ~ ${K(p.jdHigh)}（取中 ${K((p.jdLow + p.jdHigh) / 2)}）`);
      } else if (p.pay) {
        parts.push(`这份 JD 的月当量约 ${moneyShort(p.pay)}`);
      } else {
        parts.push('这份 JD 没读到薪资，深灰条位置留空');
      }
      if (avg) parts.push(`本城非私营社平 ${K(avg)}`);
      return parts.join(' · ');
    };
    const svg = box.querySelector('svg');
    if (svg) bindStepTips(svg, detail, sel, TOP, rowH, AXIS, metaOf);
    const note = document.createElement('p');
    note.className = 'analysis-note';
    note.textContent = CHART_NOTES.growthstep;
    host.appendChild(note);
  }

  /* 行状图的交互：鼠标扫到哪一行就在图下方显示那一行的详情，点一下钉住、再点收起。
     与象限图 / 散点图的 bindPointTips 同一套手感，只是命中判定从「离点 16px」换成「落在第几行」。 */
  function bindStepTips(svg, tipEl, pts, TOP, rowH, AXIS, metaOf) {
    const rows = [...svg.querySelectorAll('.step-row')];
    if (!rows.length) return;
    const toSvgY = (evt) => {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      if (!box.height || !vb.height) return NaN;
      return ((evt.clientY - box.top) / box.height) * vb.height;
    };
    const idxAt = (evt) => {
      const y = toSvgY(evt);
      if (!Number.isFinite(y) || y < TOP || y > AXIS) return -1;
      const i = Math.floor((y - TOP) / rowH);
      return i >= 0 && i < pts.length ? i : -1;
    };
    const highlight = (i) => rows.forEach((el, k) => el.classList.toggle('step-row-on', k === i));
    let pin = null;
    let last = -2;
    const paint = (i) => {
      last = i;
      highlight(i);
      tipEl.textContent = '';
      const p = pts[i];
      if (!p) return;
      const item = document.createElement('div');
      item.className = 'quad-tip-item';
      const a = document.createElement('p');
      a.className = 'quad-tip-title';
      a.textContent = p.title + (p.city ? ` · ${p.city}` : '');
      item.appendChild(a);
      const b = document.createElement('p');
      b.className = 'quad-tip-meta';
      b.textContent = metaOf(p);
      item.appendChild(b);
      item.addEventListener('click', (e) => { e.stopPropagation(); openHistory(p.rec); });
      tipEl.appendChild(item);
      svg.style.cursor = 'pointer';
    };
    const clear = () => {
      last = -2;
      highlight(-1);
      tipEl.textContent = '';
      svg.style.cursor = '';
    };
    svg.addEventListener('mousemove', (e) => {
      if (pin != null) return;
      const i = idxAt(e);
      if (i === last) return;
      if (i < 0) clear(); else paint(i);
    });
    svg.addEventListener('mouseleave', () => { if (pin == null) clear(); });
    svg.addEventListener('click', (e) => {
      const i = idxAt(e);
      if (i < 0) { pin = null; clear(); return; }
      if (pin === i) { pin = null; clear(); return; }
      pin = i;
      paint(i);
    });
  }

  /* 图九·薪资 × 发展潜力：点＝你分析过的岗位（这份 JD 的薪资 × 它的发展潜力分），
     鼠标移到点上出详情。本城官方职业库那一片参照灰点不再画——太密，把岗位点压得看不清；
     所有做过 JD 分析、带薪资的档案默认都画上（不再有「选择岗位」）。 */
  function renderGrowthMapChart(host, ctx = {}) {
    const redraw = ctx.redraw || renderDataAnalysis;
    const all = growthPointsOf();
    const sel = growthDrawableOf(all);
    if (!sel.length) {
      chartTooFew(host, all.length ? '已分析的报告里都读不到薪资，画不出这张对比图' : growthEmptyMsg());
      return;
    }
    // 只画你分析过的岗位：官方职业库那一大片参照灰点不再画（太密，压得岗位点看不清）
    // 横轴跟着这几个岗位走，但兜住两条参考线——线跑到画外，这张图就没参照物了
    const natl = Math.round(NATIONAL_WAGE_NP / 12);
    const avg = sel.map((p) => p.avg).find((v) => v) || null;
    const xs = sel.map((p) => p.jdMid || p.pay).concat(avg ? [avg] : []);
    const lo = Math.max(1000, Math.min(...xs, natl) * 0.88);
    const hi = Math.max(...xs, natl) * 1.12;
    const W = 720, H = 380, ML = 60, MR = 700, MT = 52, MB = 306;
    const x = (v) => ML + ((v - lo) / (hi - lo)) * (MR - ML);
    const y = (s) => MB - (s / 10) * (MB - MT);
    const K = (v) => `${(v / 1000).toFixed(1)}K`;

    // 报告页打开的那份 JD 在图上颜色最深、收藏过的次之，标题行里说明一下
    const hasCur = sel.some((p) => isCurrentRec(p.rec, reportHighlightUrl));
    const hasFav = sel.some((p) => isFavRec(p.rec));

    let out = `<svg class="quad" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">`;
    // 标题排两行：一行写图怎么读，第二行写「谁最深」——排成一整行会在窄窗口下长出图框被切掉
    out += `<text x="0" y="18" font-size="11.5" fill="#5b6678">点＝你分析过的岗位：横轴＝这份 JD 报的月薪，纵轴＝这个职业的发展潜力分（0-10）</text>`;
    const mapTail = toneTitleTail(hasCur, hasFav).replace(/^，/, '');
    if (mapTail) out += `<text x="0" y="33" font-size="11.5" fill="#5b6678">${mapTail}</text>`;
    for (let s = 0; s <= 10; s += 2) {
      out += `<line x1="${ML}" y1="${y(s).toFixed(1)}" x2="${MR}" y2="${y(s).toFixed(1)}" stroke="#f0f2f6"/>`;
      out += `<text x="${ML - 8}" y="${(y(s) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#aab4c4">${s}</text>`;
    }
    // 全国参考线（实线）与本城社平（虚线）：标签一上一下，免得叠在一起。
    // 两个标签就是开关：点一下收起这条线（标签留原处，变淡加删除线），再点回来。
    if (natl > lo && natl < hi) {
      const off = isRefOff('growthmap', '全国平均');
      if (!off) out += `<line x1="${x(natl).toFixed(1)}" y1="${MT}" x2="${x(natl).toFixed(1)}" y2="${MB}" stroke="#aab4c4" stroke-dasharray="4 4"/>`;
      out += `<text class="ref-toggle${off ? ' ref-off' : ''}" data-ref="全国平均" x="${x(natl).toFixed(1)}" y="${MT - 8}" text-anchor="middle" font-size="10" fill="#8a94a6">`
        + `<title>${REF_TITLE}</title>全国平均 ${K(natl)}</text>`;
    }
    if (avg && avg > lo && avg < hi) {
      const off = isRefOff('growthmap', '本城社平');
      if (!off) out += `<line x1="${x(avg).toFixed(1)}" y1="${MT}" x2="${x(avg).toFixed(1)}" y2="${MB}" stroke="#c9d1dd" stroke-dasharray="4 4"/>`;
      out += `<text class="ref-toggle${off ? ' ref-off' : ''}" data-ref="本城社平" x="${x(avg).toFixed(1)}" y="${MB + 30}" text-anchor="middle" font-size="10" fill="#aab4c4">`
        + `<title>${REF_TITLE}</title>本城社平 ${K(avg)}</text>`;
    }
    // 报告页打开的那份 JD 换成墨色点（.quad-pt-cur，半径大一圈），收藏过的是同一个墨色、
    // 常规半径；其余都是淡色点。
    // 点带 quad-pt 类，悬停 / 点击的坐标就是从它的 cx / cy 上读的。
    for (const p of sel) {
      const cx = Math.min(Math.max(x(p.jdMid || p.pay), ML + 10), MR - 10);
      const cy = Math.min(Math.max(y(p.score), MT + 8), MB - 8);
      const t = toneOf(p.rec, reportHighlightUrl);
      out += `<circle class="quad-pt${t === 'cur' ? ' quad-pt-cur' : t === 'fav' ? ' quad-pt-fav' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${t === 'cur' ? 6.5 : 5.5}"/>`;
    }
    out += `<line x1="${ML}" y1="${MB}" x2="${ML}" y2="${MT - 2}" stroke="#191919" stroke-width="1.2" marker-end="url(#gm-arrow)"/>`;
    out += `<line x1="${ML}" y1="${MB}" x2="${MR + 2}" y2="${MB}" stroke="#191919" stroke-width="1.2" marker-end="url(#gm-arrow)"/>`;
    out += `<defs><marker id="gm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#191919"/></marker></defs>`;
    for (const t of ticksOf(lo, hi, 6)) {
      out += `<line x1="${x(t).toFixed(1)}" y1="${MB}" x2="${x(t).toFixed(1)}" y2="${MB + 4}" stroke="#c9c9c6"/>`;
      out += `<text x="${x(t).toFixed(1)}" y="${MB + 17}" text-anchor="middle" font-size="10" fill="#aab4c4">${K(t)}</text>`;
    }
    out += `<text x="${(ML + MR) / 2}" y="${MB + 46}" text-anchor="middle" font-size="10.5" fill="#8a94a6">税前月薪（元/月）</text>`;
    out += `<text x="16" y="${(MT + MB) / 2}" font-size="10.5" fill="#8a94a6" transform="rotate(-90 16 ${(MT + MB) / 2})" text-anchor="middle">发展潜力分（0-10）</text>`;
    out += '</svg>';
    const box = document.createElement('div');
    box.className = 'quad-wrap';
    box.innerHTML = out;
    host.appendChild(box);
    bindRefToggles(box, 'growthmap', redraw);
    const detail = document.createElement('div');
    detail.className = 'chart-detail';
    host.appendChild(detail);
    bindPointTips(box.querySelector('svg'), detail, sel, (p) => `${p.city || '—'} · 发展潜力 ${p.score} 分 · ${p.basisLabel}`
      + ` · 月薪 ${K(p.jdMid || p.pay)}（职业中位 ${p.pay ? K(p.pay) : '—'}）`);
    const note = document.createElement('p');
    note.className = 'analysis-note';
    note.textContent = CHART_NOTES.growthmap;
    host.appendChild(note);
  }

  const CHART_RENDERERS = {
    scatter: renderScatterChart,
    hourly: renderHourlyChart,
    scorevalue: renderScoreValueChart,
    compare: renderCompareChart,
    growthrank: renderGrowthRankChart,
    growthstep: renderGrowthStepChart,
    growthmap: renderGrowthMapChart,
  };

  function buildPayToggle(redraw) {
    const box = document.createElement('div');
    box.className = 'pay-toggle';
    for (const m of ['annual', 'hourly']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pay-toggle-btn${payMetric === m ? ' on' : ''}`;
      b.dataset.metric = m;
      b.textContent = m === 'annual' ? '年薪' : '时薪';
      b.addEventListener('click', () => {
        if (payMetric === m) return;
        payMetric = m;
        redraw();
      });
      box.appendChild(b);
    }
    return box;
  }

  // 薪资涨幅分析的排序开关：涨幅空间最大幅度 / 底薪最高（与「年薪 / 时薪」同一套手感）
  function buildGrowthStepSort(redraw) {
    const box = document.createElement('div');
    box.className = 'chart-sort';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', '排序方式');
    const modes = [
      ['growth', '涨幅空间', '按涨幅空间最大幅度排序：从这份 JD 的最低点，到「统计天花板 / 这份 JD 的最高点」里更高的那个'],
      ['base', '底薪最高', '按底薪最高排序：底薪＝这份 JD 报价的下沿（深灰条的左端；只给一个数就用那个数）'],
    ];
    for (const [m, text, title] of modes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chart-sort-btn${growthstepSort === m ? ' on' : ''}`;
      b.dataset.sort = m;
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', () => {
        if (growthstepSort === m) return;
        growthstepSort = m;
        redraw();
      });
      box.appendChild(b);
    }
    return box;
  }

  function renderChartSlot(i) {
    const host = $(`chartSlot${i}`);
    if (!host) return;
    host.innerHTML = '';
    const id = slotCharts[i];
    const redraw = renderDataAnalysis;

    const head = document.createElement('div');
    head.className = 'section-head';
    const title = document.createElement('h2');
    title.className = 'section-title chart-title';
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.textContent = chartTitleOf(id);
    const caret = document.createElement('span');
    caret.className = 'jd-caret';
    caret.setAttribute('aria-hidden', 'true');
    title.appendChild(caret);
    head.appendChild(title);
    if (id === 'scatter') head.appendChild(buildPayToggle(redraw));
    if (id === 'growthstep') head.appendChild(buildGrowthStepSort(redraw));
    host.appendChild(head);

    const menu = document.createElement('div');
    menu.className = 'chart-menu';
    menu.hidden = true;
    for (const key of Object.keys(CHART_TITLES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chart-menu-btn${key === id ? ' on' : ''}`;
      b.textContent = CHART_TITLES[key];
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        slotCharts[i] = key;
        renderChartSlot(i);
      });
      menu.appendChild(b);
    }
    host.appendChild(menu);

    const toggleMenu = () => {
      menu.hidden = !menu.hidden;
      if (!menu.hidden) {
        const off = (e) => {
          if (!head.contains(e.target) && !menu.contains(e.target)) {
            menu.hidden = true;
            document.removeEventListener('click', off);
          }
        };
        setTimeout(() => document.addEventListener('click', off), 0);
      }
    };
    title.addEventListener('click', toggleMenu);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(); }
    });

    const body = document.createElement('div');
    body.className = 'chart-body';
    host.appendChild(body);
    CHART_RENDERERS[id](body, { redraw });
  }

  /* ---------- 汇总渲染 ---------- */

  function renderDataAnalysis() {
    // 首页不再放象限图（那一块已从首页去掉）：这里只画「职位对比」页里的那个图槽
    for (let i = 0; i < slotCharts.length; i++) renderChartSlot(i);
    ensureRegionData();
  }

  function openAnalysisPage() {
    renderDataAnalysis();
    show(viewAnalysis);
    // 默认把图名列表展开：让人一眼看到「还有别的分析图可选」，点空白处自行收起；
    // 不靠文字提醒（那是更低级的手段）
    const t = $('chartSlot0') && $('chartSlot0').querySelector('.chart-title');
    if (t) t.click();
    history.pushState({ view: 'analysis' }, '');
    pushedState = true;
  }

  $('btnAnalysisTop').addEventListener('click', openAnalysisPage);

  /* ---------- 雷达图对比 ---------- */

  // 对比用色：低饱和度的红 / 蓝 / 绿 / 灰
  const COMPARE_COLORS = [
    { stroke: '#c98a8a', fill: 'rgba(201,138,138,0.16)' },
    { stroke: '#7f9ec0', fill: 'rgba(127,158,192,0.16)' },
    { stroke: '#86a986', fill: 'rgba(134,169,134,0.16)' },
    { stroke: '#9d9d9b', fill: 'rgba(157,157,155,0.16)' },
  ];
  const COMPARE_MAX = 3;   // 每次最多对比 3 个（雷达图与对比表都按这个上限）
  let compareSelected = [];
  // 对比表里展开过的维度行（key）——换选岗位重画表格后仍保持展开
  const compareOpenDims = new Set();

  function dimScoreOf(rec, key) {
    const d = ((rec && rec.dims) || []).find((x) => x.key === key);
    return d ? d.score : null;
  }

  // 选中岗位 → 对比槽位：0 个为空白；1 个补一个空槽（默认 2 个）；最多 3 个
  function compareSlots() {
    if (!compareSelected.length) return [];
    const slots = compareSelected
      .map((id) => loadHistory().find((r) => r.id === id))
      .filter(Boolean)
      .slice(0, COMPARE_MAX);
    if (slots.length === 1) slots.push(null);
    return slots;
  }

  function buildCompareRadar(svg) {
    svg.innerHTML = '';
    const frame = svgEl('g', { class: 'radar-frame' });
    svg.appendChild(frame);
    for (const s of [0, 2, 4, 6, 8, 10]) {
      const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const p = polar(i, rForScore(s));
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' ');
      frame.appendChild(svgEl('polygon', { points: pts, fill: 'none', stroke: s === 0 ? '#e4e4e1' : '#f0f0ee', 'stroke-width': 1 }));
    }
    frame.appendChild(svgEl('circle', { cx: RADAR.cx, cy: RADAR.cy, r: RADAR.hub, fill: '#fff', stroke: '#eeeeec' }));
    const scoreEls = [];
    for (let i = 0; i < 6; i++) {
      const p = polar(i, RADAR.r10);
      frame.appendChild(svgEl('line', { x1: RADAR.cx, y1: RADAR.cy, x2: p.x, y2: p.y, stroke: '#f0f0ee', 'stroke-width': 1 }));
      const lp = polar(i, RADAR.labelR);
      const name = svgEl('text', { x: lp.x, y: lp.y, 'text-anchor': 'middle', 'font-size': RADAR.nameFont, fill: '#9b9a97' });
      name.textContent = DIM_NAMES[DIM_KEYS[i]];
      svg.appendChild(name);
      // 维度名下面一行：各岗位在这一维的分数，一岗一色，和它的多边形同一个颜色
      const score = svgEl('text', {
        x: lp.x, y: lp.y + 21, 'text-anchor': 'middle',
        'font-size': 16, class: 'compare-dim-score',
      });
      svg.appendChild(score);
      scoreEls.push(score);
    }
    const layer = svgEl('g', { class: 'compare-series' });
    svg.appendChild(layer);
    return {
      setSeries(series) {
        layer.innerHTML = '';
        // 轴标签下的那行分数：只列有岗位的槽位，顺序＝选取顺序，颜色＝各自多边形的颜色；
        // 每一轴的最高分（同分并列都算）加粗并放大一号——一眼看出这一维谁更强
        const list = (series || []).filter((s) => s && s.values);
        scoreEls.forEach((el, i) => {
          el.textContent = '';
          const best = Math.max(...list.map((s) => (typeof s.values[i] === 'number' ? s.values[i] : -Infinity)));
          list.forEach((s, k) => {
            if (k) {
              const sep = svgEl('tspan', { fill: '#c9c9c6' });
              sep.textContent = ' · ';
              el.appendChild(sep);
            }
            const v = s.values[i];
            const t = svgEl('tspan', { fill: s.color.stroke });
            // 最高分：加粗 + 放大到和单岗位雷达同一档字号；「—」没有分，不放大
            if (Number.isFinite(best) && typeof v === 'number' && v === best) {
              t.setAttribute('font-weight', '700');
              t.setAttribute('font-size', RADAR.scoreFont);
            }
            t.textContent = v == null ? '—' : String(v);
            el.appendChild(t);
          });
        });
        for (const s of series || []) {
          if (!s || !s.values) continue;
          const pts = s.values.map((v, i) => {
            const p = polar(i, rForScore(v == null ? 0 : v));
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(' ');
          layer.appendChild(svgEl('polygon', {
            points: pts, fill: s.color.fill, stroke: s.color.stroke,
            'stroke-width': 1.4, 'stroke-linejoin': 'round',
          }));
        }
      },
    };
  }

  /* 城市单元格：JD 只写到省份（「广东」）时如实标出「只到省」，别让省份冒充城市；
     同一份档案有两个来源（JD 抄录的 city 与列表字段），其中一个到了市就用那个。 */
  function cityCellText(rec) {
    const a = normalizeCity((rec.data && rec.data.source && rec.data.source.job && rec.data.source.job.city) || '');
    const b = normalizeCity((rec.job && rec.job.city) || '');
    // 直辖市（北京/上海/天津/重庆）本身就是城市级，不算「只有省份」
    const provOnly = (v) => !!v && !MUNICIPALITY_RE.test(v) && PROVINCE_RE.test(v) && !v.replace(PROVINCE_RE, '');
    const pick = (!a || provOnly(a)) && b && !provOnly(b) ? b : (a || b);
    if (!pick) return '—';
    if (!provOnly(pick)) return pick;
    // 显示成「广东（只到省）」而不是「广东省（只到省）」：名字够了，后缀是多余的
    const m = pick.match(PROVINCE_RE);
    return `${(m && m[1]) || pick}（只到省）`;
  }

  function compareCellText(rec, key) {
    if (!rec) return '—';
    if (key === 'overall') return rec.overall == null ? '—' : String(rec.overall);   // v12：不给数字时显示「—」
    // 原始分：这份工作本身值多少（与你是谁无关）。老档案没存下 baseScore 就显示「—」，不拿 100 冒充
    if (key === 'base') {
      const b = Math.round(Number(rec.data && rec.data.analysis && rec.data.analysis.baseScore));
      return Number.isFinite(b) && b > 0 ? String(b) : '—';
    }
    // 薪资只给能读出来的月当量（「8–12K」「20–40K × 15」），JD 里那些「无责底薪…+绩效+提成」的
    // 文字描述按用户要求不带进来；读不出数字才退回原文
    if (key === 'salary') {
      const raw = (rec.job && rec.job.salary) || '';
      return salaryKText(raw) || raw || '—';
    }
    // 城市只显示到「市」一级（对比、社平、房价用的都是这一级），区/街道属于工作地点，不在这一行
    if (key === 'city') return cityCellText(rec);
    if (key === 'restDays') return `${restDaysOf(rec.data)} 天`;
    const s = dimScoreOf(rec, key);
    return s == null ? '—' : String(s);
  }

  /* ---------- 展开里的「同一张图」 ----------

     有图的维度在对比里只画一张共享图：一份 JD 一行、颜色跟表头一致。
     不按岗位各画一张——每栏只有三分之一宽，尺画进去字会小到看不清；
     而且只有摆在同一把尺上，几份报价才谈得上横向比较。 */

  // 图里用的岗位名：太长会把同一行的结论挤掉，截到 16 字
  function compareChartTitle(rec) {
    const t = (rec && rec.job && rec.job.title) || '未命名岗位';
    return t.length > 16 ? `${t.slice(0, 16)}…` : t;
  }

  /* 薪资刻度尺（对比版）：横轴＝月薪（元/月，对数刻度，工资分布是对数正态）。
     一份 JD 一行：行底的灰带＝这一份在本城的刻度带（各城的尺不一样，所以按行铺各自的本城刻度），
     虚线＝当地工资中位，实心条＝这份 JD 的报价区间（月当量），空心点＝计分取位。 */
  function payCompareChart(items) {
    const W = 720, ML = 8, MR = 712, TOP = 12, ROW = 58;
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const K = (v) => (v >= 10000 ? `${fmtWan(v)}万` : `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`);
    let vLo = Infinity, vHi = 0;
    for (const it of items) {
      vLo = Math.min(vLo, (it.L ? it.L.lines[1] : it.lo) * 0.9);
      vHi = Math.max(vHi, it.hi * 1.05, it.L ? it.L.lines[10] * 1.1 : 0);
    }
    const X = (v) => ML + ((Math.log(Math.max(v, vLo)) - Math.log(vLo)) / (Math.log(vHi) - Math.log(vLo))) * (MR - ML);
    const out = [];
    items.forEach((it, i) => {
      const y = TOP + i * ROW;
      const by = y + 14, bh = 16;
      out.push(`<circle cx="${ML + 5}" cy="${y + 5}" r="4.6" fill="${it.color}"/>`);
      out.push(`<text x="${ML + 15}" y="${y + 9}" font-size="11.5" font-weight="700" fill="${it.color}">${escapeHtml(it.label)}</text>`);
      out.push(`<text x="${MR}" y="${y + 9}" text-anchor="end" font-size="10.5" fill="#5b6678">${escapeHtml(it.note)}</text>`);
      if (it.L) {
        for (let k = 1; k <= 10; k++) {
          const x0 = X(it.L.lines[k]);
          const x1 = k < 10 ? X(it.L.lines[k + 1]) : MR;
          const on = k === it.band;
          out.push(`<rect x="${x0.toFixed(1)}" y="${by}" width="${Math.max(0.6, x1 - x0).toFixed(1)}" height="${bh}" rx="1.5"`
            + ` fill="${on ? it.color : (k % 2 ? '#f2f4f8' : '#e9edf4')}"${on ? ' fill-opacity="0.24"' : ''}`
            + `${on ? ` stroke="${it.color}" stroke-width="1"` : ''}/>`);
        }
        const xm = X(it.L.median);
        out.push(`<line x1="${xm.toFixed(1)}" y1="${by - 3}" x2="${xm.toFixed(1)}" y2="${by + bh + 3}" stroke="#b9b9b6" stroke-width="1" stroke-dasharray="3 3"/>`);
      } else {
        out.push(`<rect x="${ML}" y="${by}" width="${MR - ML}" height="${bh}" rx="2" fill="#f4f6f9"/>`);
      }
      const xr0 = X(it.lo);
      const xr1 = Math.max(X(it.hi), xr0 + 3);
      out.push(`<rect x="${xr0.toFixed(1)}" y="${(by + 3).toFixed(1)}" width="${(xr1 - xr0).toFixed(1)}" height="10" rx="5" fill="${it.color}"/>`);
      const xp = X(it.pick);
      out.push(`<circle cx="${xp.toFixed(1)}" cy="${(by + bh / 2).toFixed(1)}" r="4.2" fill="#fff" stroke="${it.color}" stroke-width="1.8"/>`);
      // 本城档线的刻度与数额：贴着这一行的刻度带下沿画（一行一组，各按各城的尺），挤不下就跳过
      if (it.L) {
        let lastX = -99;
        for (let k = 1; k <= 10; k++) {
          const x = X(it.L.lines[k]);
          if (x - lastX < 34) continue;
          lastX = x;
          out.push(`<line x1="${x.toFixed(1)}" y1="${by + bh}" x2="${x.toFixed(1)}" y2="${(by + bh + 3.5).toFixed(1)}" stroke="#c9c9c6"/>`);
          out.push(`<text x="${x.toFixed(1)}" y="${by + bh + 14}" text-anchor="middle" font-size="9.5" fill="#9b9a97">${K(it.L.lines[k])}</text>`);
        }
      }
    });
    const H = TOP + items.length * ROW;
    const box = document.createElement('div');
    box.className = 'cd-chart';
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">${out.join('')}</svg>`;
    return box;
  }

  /* 各记录的本城刻度表并成一张：一行一个档位，一列一份 JD，落档那一格用它的颜色铺底——
     同一座城市的几份 JD 落在同一列刻度上，不同城市各按各的尺算，横着能直接对。 */
  function payCompareLadder(items) {
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const pctOf = (L, k) => {
      const p = Array.isArray(L.percents) ? L.percents[k] : null;
      if (p == null) return '';
      return p >= 100 ? '起点' : `前 ${p}%`;
    };
    if (!items.some((it) => it.L)) return null;
    const table = document.createElement('table');
    table.className = 'dim-evidence-table compare-ladder';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = '分';
    trh.appendChild(th0);
    for (const it of items) {
      const th = document.createElement('th');
      const h = document.createElement('div');
      h.className = 'cd-ladder-h';
      const dot = document.createElement('span');
      dot.className = 'compare-dot';
      dot.style.background = it.color;
      const nm = document.createElement('span');
      nm.textContent = `${compareChartTitle(it.rec)}${it.city ? ` · ${it.city}` : ''}`;
      h.appendChild(dot);
      h.appendChild(nm);
      const sub = document.createElement('span');
      sub.className = 'cd-ladder-sub';
      sub.textContent = it.L
        ? `${PAY_BASIS_TEXT[it.L.basis] || '当地口径'}｜最低工资 ${money(it.L.minWage)} · 中位 ${money(it.L.median)}`
        : '本城没有该职业刻度';
      th.appendChild(h);
      th.appendChild(sub);
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let k = 0; k <= 10; k++) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      td0.textContent = `${k} 分`;
      tr.appendChild(td0);
      for (const it of items) {
        const td = document.createElement('td');
        const L = it.L;
        if (!L) {
          td.textContent = '—';
        } else if (k === 0 && !L.lines[0]) {
          td.textContent = '低于最低工资';
        } else {
          const lo = L.lines[k];
          const hi = k < 10 ? L.lines[k + 1] : null;
          td.textContent = hi ? `${money(lo)} – ${money(hi - 1)}` : `${money(lo)} 以上`;
          const p = pctOf(L, k);
          if (p) {
            const sp = document.createElement('span');
            sp.className = 'cd-ladder-pct';
            sp.textContent = p;
            td.appendChild(sp);
          }
        }
        if (it.L && k === it.band) {
          td.classList.add('cd-band-on');
          td.style.background = it.fill;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  function payCompareBlock(slots) {
    const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const items = [];
    slots.forEach((rec, i) => {
      if (!rec) return;
      const c = rec.data && rec.data.analysis && rec.data.analysis.payCalc;
      const low = Number(c && c.low);
      if (!(low > 0)) return;
      const L = c.ladder && Array.isArray(c.ladder.lines) && c.ladder.lines.length === 11 && Number(c.ladder.median) > 0
        ? c.ladder : null;
      const months = Number(c.months) > 0 ? Number(c.months) : 12;
      const lo = Math.round((low * months) / 12);
      const hi = Math.round((Math.max(Number(c.high) || low, low) * months) / 12);
      const pick = Number.isFinite(Number(c.monthly)) ? Number(c.monthly) : lo;
      const bandAt = (v) => {
        let b = 0;
        if (L) for (let k = 0; k < L.lines.length; k++) if (v >= L.lines[k]) b = k;
        return b;
      };
      const bLo = bandAt(lo);
      const bHi = bandAt(hi);
      const band = Number.isFinite(Number(c.band)) ? Number(c.band) : bLo;
      const city = cityOf(rec);
      const note = [
        `${money(lo)}–${money(hi)} 元/月`,
        bLo === bHi ? `第 ${bLo} 档` : `第 ${bLo}–${bHi} 档`,
        `计分取${PAY_POS_TEXT[c.position] || PAY_POS_TEXT.low} ${money(pick)} → ${band} 分`,
        L ? `相当于当地中位 ${(pick / L.median).toFixed(1)}×` : '本城没有该职业刻度',
      ].join(' · ');
      items.push({
        rec, c, L, lo, hi, pick, band, city, note,
        label: `${compareChartTitle(rec)}（${city || '城市未读到'}）`,
        color: COMPARE_COLORS[i % COMPARE_COLORS.length].stroke,
        fill: COMPARE_COLORS[i % COMPARE_COLORS.length].fill,
      });
    });
    if (!items.length) return null;
    const box = document.createElement('div');
    box.className = 'cd-chart-block';
    const cap = document.createElement('p');
    cap.className = 'cd-chart-cap';
    cap.textContent = '同一把尺：每份 JD 一行，颜色与上方岗位一致；灰带＝这一份在本城的刻度带（10 档），'
      + '虚线＝当地工资中位，实心条＝这份 JD 的报价区间（月当量），空心点＝计分取位。';
    box.appendChild(cap);
    box.appendChild(payCompareChart(items));
    const ladder = payCompareLadder(items);
    if (ladder) box.appendChild(ladder);
    return box;
  }

  /* 发展潜力量表（对比版）：1–10 档画成同一张量表，一份工作一行——
     空心点＝这个职业（K₁）落在哪一档，实心点＝这份 JD（K₂），落档那一格用它的颜色铺底。 */
  function growthCompareChart(items) {
    const W = 720, ML = 8, MR = 712, TOP = 22, ROW = 44, NL = 10;
    const cw = (MR - ML) / NL;
    const cellX = (b) => ML + (Math.min(Math.max(b, 1), NL) - 1) * cw;
    const out = [];
    for (let k = 0; k < NL; k++) {
      out.push(`<rect x="${(ML + k * cw).toFixed(1)}" y="${TOP - 17}" width="${cw.toFixed(1)}" height="15" rx="1.5" fill="${k % 2 ? '#f2f4f8' : '#e9edf4'}"/>`);
      out.push(`<text x="${(ML + k * cw + cw / 2).toFixed(1)}" y="${TOP - 5.5}" text-anchor="middle" font-size="9.5" fill="#5b6678">${k + 1}</text>`);
    }
    items.forEach((it, i) => {
      const y = TOP + i * ROW;
      const sy = y + 18, sh = 16;
      const cy = sy + sh / 2;
      out.push(`<circle cx="${ML + 5}" cy="${y + 5}" r="4.6" fill="${it.color}"/>`);
      out.push(`<text x="${ML + 15}" y="${y + 9}" font-size="11.5" font-weight="700" fill="${it.color}">${escapeHtml(it.label)}</text>`);
      out.push(`<text x="${MR}" y="${y + 9}" text-anchor="end" font-size="10.5" fill="#5b6678">${escapeHtml(it.note)}</text>`);
      for (let k = 0; k < NL; k++) {
        out.push(`<rect x="${(ML + k * cw).toFixed(1)}" y="${sy}" width="${cw.toFixed(1)}" height="${sh}" rx="1.5" fill="${k % 2 ? '#f2f4f8' : '#e9edf4'}"/>`);
      }
      const bx = cellX(it.band);
      const cx = bx + cw / 2;
      out.push(`<rect x="${bx.toFixed(1)}" y="${sy}" width="${cw.toFixed(1)}" height="${sh}" rx="1.5" fill="${it.color}" fill-opacity="0.22" stroke="${it.color}" stroke-width="1"/>`);
      // 两层都有的（这份 JD 读到了报价）：空心＝职业层 K₁，实心＝这一份 K₂；
      // 只有职业层（没报价／旧档案）：只画空心那一个，不画一个自己跟自己的实心点
      const k1 = it.k1Band;
      const dots = [];
      if (it.two) {
        if (k1 != null && k1 !== it.band) dots.push({ b: k1, hollow: true });
        if (k1 != null && k1 === it.band) dots.push({ b: k1, hollow: true, dx: -8 });
        dots.push({ b: it.band, hollow: false, dx: k1 === it.band ? 8 : 0 });
      } else if (k1 != null) {
        dots.push({ b: k1, hollow: true });
      } else {
        dots.push({ b: it.band, hollow: false });
      }
      for (const d of dots) {
        const x = cellX(d.b) + cw / 2 + (d.dx || 0);
        out.push(`<circle cx="${x.toFixed(1)}" cy="${cy.toFixed(1)}" r="${d.hollow ? 4.2 : 4.6}"`
          + ` fill="${d.hollow ? '#fff' : it.color}"${d.hollow ? ` stroke="${it.color}" stroke-width="1.8"` : ''}/>`);
      }
    });
    const H = TOP + items.length * ROW;
    const box = document.createElement('div');
    box.className = 'cd-chart';
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg" font-family="'Microsoft YaHei',sans-serif">${out.join('')}</svg>`;
    return box;
  }

  function growthCompareBlock(slots) {
    const items = [];
    slots.forEach((rec, i) => {
      if (!rec) return;
      const c = rec.data && rec.data.analysis && rec.data.analysis.growthCalc;
      if (!c || typeof c !== 'object' || !ScoreModel) return;
      const official = c.basis === 'official';
      const ladder = official ? ScoreModel.growthLadderOf(c.city) : null;
      const lines = official ? ((ladder || {}).lines || null) : (ScoreModel.GROWTH_SPACE_LINES || null);
      if (!Array.isArray(lines) || lines.length !== 9) return;
      const bandOf = (v) => (Number(v) > 0 ? 1 + lines.filter((x) => Number(v) >= x).length : null);
      const k1v = Number(c.K1 != null ? c.K1 : c.k);
      const k1Band = bandOf(k1v);
      const band = Number.isFinite(Number(c.score)) ? Math.max(1, Math.min(10, Number(c.score))) : k1Band;
      if (band == null) return;
      const city = cityOf(rec);
      const two = c.layer === 'jd' && Number(c.K2) > 0;
      const parts = [];
      if (two) {
        if (k1Band != null) parts.push(`K₁ ${k1v.toFixed(2)}（第 ${k1Band} 档）`);
        parts.push(`K₂ ${Number(c.K2).toFixed(2)}（第 ${band} 档）`);
      } else if (Number.isFinite(k1v)) {
        parts.push(`K₁ ${k1v.toFixed(2)}（第 ${band} 档）· 没有读到这份 JD 的报价`);
      } else {
        parts.push(`第 ${band} 档`);
      }
      items.push({
        rec, city, k1Band, band, two,
        label: `${compareChartTitle(rec)}（${city || '城市未读到'}）· ${official ? '官方量表' : '拟合量表'}`,
        note: parts.join(' · '),
        color: COMPARE_COLORS[i % COMPARE_COLORS.length].stroke,
      });
    });
    if (!items.length) return null;
    const box = document.createElement('div');
    box.className = 'cd-chart-block';
    const cap = document.createElement('p');
    cap.className = 'cd-chart-cap';
    cap.textContent = '同一张量表：每份工作一行，颜色与上方岗位一致；空心点＝这个职业（K₁），'
      + '实心点＝这份 JD（K₂），落档那一格用它的颜色铺底。';
    box.appendChild(cap);
    box.appendChild(growthCompareChart(items));
    return box;
  }

  function buildCompareDimChart(key, slots) {
    if (key === 'pay') return payCompareBlock(slots);
    if (key === 'growth') return growthCompareBlock(slots);
    return null;
  }

  /* 评分规则（对比版）：规则是维度级的、跟选了哪几个岗位无关，所以整行只放一份（默认收起）——
     内容与报告页同一份 DIM_RULES，含规则条文与它的表；要展开时点一下就好。 */
  function compareRuleBlock(key) {
    const spec = DIM_RULES[key];
    if (!spec) return null;
    const box = document.createElement('div');
    box.className = 'dim-rule compare-rule';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dim-rule-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    const label = document.createElement('span');
    label.textContent = spec.weight ? `评分规则 · ${spec.weight}` : '评分规则';
    const caret = document.createElement('span');
    caret.className = 'jd-caret';
    caret.setAttribute('aria-hidden', 'true');
    toggle.appendChild(label);
    toggle.appendChild(caret);
    const body = document.createElement('div');
    body.className = 'dim-rule-body';
    body.hidden = true;
    for (const line of spec.rule || []) {
      const p = document.createElement('p');
      p.className = 'dim-rule-line';
      p.textContent = line;
      body.appendChild(p);
    }
    const tables = Array.isArray(spec.tables) && spec.tables.length
      ? spec.tables
      : [{ head: spec.head, rows: spec.rows, caption: '' }];
    for (const t of tables) {
      if (!t || !Array.isArray(t.head) || !Array.isArray(t.rows)) continue;
      if (t.caption) {
        const cap = document.createElement('p');
        cap.className = 'dim-rule-caption';
        cap.textContent = t.caption;
        body.appendChild(cap);
      }
      const table = document.createElement('table');
      table.className = 'dim-rule-table';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      for (const h of t.head) {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const row of t.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      body.appendChild(table);
    }
    toggle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      box.classList.toggle('open', !body.hidden);
    });
    box.appendChild(toggle);
    box.appendChild(body);
    return box;
  }

  function renderCompareTable(ctx, slots) {
    const host = ctx && ctx.table;
    if (!host) return;
    host.innerHTML = '';
    if (!slots.length) return;
    const table = document.createElement('table');
    table.className = 'compare-table-inner';
    // 指标列固定宽（与 CSS 的 92px 保持一致），其余列等分（table-layout: fixed）；窄屏下整体横向滚动
    table.style.minWidth = `${92 + slots.length * 92}px`;

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    // 左上角：上面那一行是「岗位名」，左边那一列是「指标」——两个方向各标一次，
    // 省得读者猜哪一维是岗位、哪一维是指标
    const th0 = document.createElement('th');
    th0.className = 'compare-corner';
    const cornerCol = document.createElement('span');
    cornerCol.className = 'compare-corner-col';
    cornerCol.textContent = '岗位名';
    const cornerRow = document.createElement('span');
    cornerRow.className = 'compare-corner-row';
    cornerRow.textContent = '指标';
    th0.appendChild(cornerCol);
    th0.appendChild(cornerRow);
    hr.appendChild(th0);
    slots.forEach((rec, i) => {
      const th = document.createElement('th');
      const box = document.createElement('span');
      box.className = 'compare-th';
      const dot = document.createElement('span');
      dot.className = 'compare-dot';
      dot.style.background = COMPARE_COLORS[i % COMPARE_COLORS.length].stroke;
      const name = document.createElement('span');
      name.className = 'compare-th-name';
      name.textContent = rec ? ((rec.job && rec.job.title) || '未命名岗位') : '待选择';
      box.appendChild(dot);
      box.appendChild(name);
      th.appendChild(box);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    /* 展开栏里的「完整分析」：与报告页维度面板同一套内容——
       岗位头 → 一句话评价 → 该维专属块（薪资：小结＋本次计算；双休：偏离度）→ 分析正文 → 依据。
       交互项（补薪资 ?、重采 ?、评分规则）留在报告页，不进对比。
       图和表（薪资的刻度尺＋刻度表、发展潜力的量表）不在这里、也不按岗位各画一张——
       它们进上面那条「同一张图」的共享行：一岗一栏只有三分之一宽，尺和表挤进来会读到看不清，
       而且只有摆在同一把尺上，几份 JD 才谈得上横向比较。 */
    const evidenceTableEl = (t) => {
      const table = document.createElement('table');
      table.className = 'dim-evidence-table';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      for (const h of t.head || []) {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const row of t.rows || []) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      return table;
    };
    // evidenceOnly：只给「这一维的数是怎么来的」（偏离度＋依据），不带评价与正文——
    // 年均休息日那一行点开用它，免得和双休假期那一行一字不差地重复
    const buildCompareDimContent = (rec, key, color, evidenceOnly) => {
      const a = (rec && rec.data && rec.data.analysis) || {};
      const box = document.createElement('div');
      box.className = 'cd-content';
      const head = document.createElement('p');
      head.className = 'cd-head';
      const dot = document.createElement('span');
      dot.className = 'compare-dot';
      dot.style.background = color;
      const nm = document.createElement('span');
      nm.textContent = (rec.job && rec.job.title) || '未命名岗位';
      head.appendChild(dot);
      head.appendChild(nm);
      box.appendChild(head);
      // ① 一句话评价（与报告页同一份 verdictOf）
      const verdict = evidenceOnly ? '' : verdictOf(key, rec.data);
      if (verdict) {
        const p = document.createElement('p');
        p.className = 'dim-verdict';
        p.textContent = verdict;
        box.appendChild(p);
      }
      // ② 薪资：小结（预计月薪/税后/年收）+ 本次计算（刻度尺与刻度表在上面那条共享行）
      if (key === 'pay' && a.payCalc) {
        const est = payEstBlock(a.payCalc, a);
        if (est) box.appendChild(est);
        if (Number.isFinite(a.payCalc.low)) {
          const note = document.createElement('p');
          note.className = 'dim-note pay-note';
          note.textContent = payCalcNote(a.payCalc);
          box.appendChild(note);
        }
      }
      // ③ 双休：偏离度说明（与报告页同一句）
      if (key === 'rest') {
        const rr = restRangeOf(rec.data);
        const label = REST_SOURCE_LABEL[rr.source] || '估算';
        const line = document.createElement('p');
        line.className = 'dim-note';
        line.textContent = rr.dev > 0
          ? `偏离度 ${(rr.dev * 100).toFixed(0)}%：休息天数按${label}算 ${rr.est} 天，最差可能只有 ${rr.lo} 天。`
          : `休息天数来自${label}（${rr.est} 天），有明确依据，不打折。`;
        box.appendChild(line);
      }
      // ④ 分析正文（与报告页同一渲染：引号高亮、逐条扣分点一行一条）；evidenceOnly 时不要正文
      if (!evidenceOnly) {
        const text = document.createElement('div');
        text.className = 'cd-analysis';
        const dim = (Array.isArray(a.dimensions) ? a.dimensions : []).find((x) => x.key === key);
        const analysisText = (dim && dim.analysis) || '';
        if (analysisText.trim()) {
          renderAnalysis(text, analysisText);
        } else {
          const p = document.createElement('p');
          p.className = 'analysis-line';
          p.textContent = '这一维没有留下分析文本。';
          text.appendChild(p);
        }
        box.appendChild(text);
      }
      // ⑤ 依据（可含小表格：发展潜力的成色系数）
      const evLines = evidenceLinesOf(key, rec.data);
      if (evLines.length) {
        const evBox = document.createElement('div');
        evBox.className = 'dim-evidence';
        for (const line of evLines) {
          if (line && typeof line === 'object' && line.table) {
            const t = line.table;
            if (t.caption) {
              const cap = document.createElement('p');
              cap.className = 'dim-evidence-caption';
              cap.textContent = t.caption;
              evBox.appendChild(cap);
            }
            evBox.appendChild(evidenceTableEl(t));
            continue;
          }
          const p = document.createElement('p');
          p.className = 'dim-evidence-line';
          p.textContent = line;
          evBox.appendChild(p);
        }
        box.appendChild(evBox);
      }
      return box;
    };
    const rows = [
      { label: '总分', key: 'overall', score: true },
      // 原始分：这份工作本身值多少（总分 = 原始分 × 匹配度系数 × 极化系数）——两个数摆在一起才看得出
      // 匹配度到底在帮还是拖
      { label: '原始分', key: 'base', score: true },
      { label: '薪资', key: 'salary' },
      { label: '城市', key: 'city' },
      // 年均休息日：点开看这一天的数是怎么算出来的（与双休假期同一套依据，但不要那段评价与正文）
      { label: '年均休息日', key: 'restDays', dim: true, dimKey: 'rest', evidenceOnly: true },
      ...DIM_KEYS.map((k) => ({ label: DIM_NAMES[k], key: k, score: true, dim: true })),
    ];
    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      if (row.dim) {
        // 六个维度行：整行可点，展开各岗位在这一维的分析（展开状态记在 compareOpenDims，重画不丢）
        const open = compareOpenDims.has(row.key);
        tr.className = 'compare-dim-row' + (open ? ' open' : '');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'compare-dim-btn';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        const lab = document.createElement('span');
        lab.textContent = row.label;
        const caret = document.createElement('span');
        caret.className = 'jd-caret';
        caret.setAttribute('aria-hidden', 'true');
        btn.appendChild(lab);
        btn.appendChild(caret);
        td0.appendChild(btn);
      } else {
        td0.textContent = row.label;
      }
      tr.appendChild(td0);
      const texts = slots.map((rec) => compareCellText(rec, row.key));
      // 分数行：至少有两项可比时，最高分加粗突出
      const nums = texts.map((t) => (/^\d+$/.test(t) ? Number(t) : null));
      const present = nums.filter((n) => n != null);
      const top = row.score && present.length >= 2 ? Math.max(...present) : null;
      texts.forEach((t, i) => {
        const td = document.createElement('td');
        td.textContent = t;
        if (top != null && nums[i] === top) td.classList.add('compare-hi');
        tr.appendChild(td);
      });
      if (row.dim) {
        tr.addEventListener('click', () => {
          if (compareOpenDims.has(row.key)) compareOpenDims.delete(row.key);
          else compareOpenDims.add(row.key);
          renderCompareTable(ctx, slots);
        });
      }
      tbody.appendChild(tr);
      if (row.dim && compareOpenDims.has(row.key)) {
        // 展开分两行：先「同一张图」——有图的维度（薪资的刻度尺、发展潜力的量表）画成一条共享图，
        // 一份一行、各用自己的颜色；再一岗一栏排这一维的文字（与表头列对齐）
        const dimKey = row.dimKey || row.key;
        const chart = buildCompareDimChart(dimKey, slots);
        if (chart) {
          const ctr = document.createElement('tr');
          ctr.className = 'compare-dim-detail compare-dim-chartrow';
          const ctd = document.createElement('td');
          ctd.colSpan = 1 + slots.length;
          ctd.appendChild(chart);
          ctr.appendChild(ctd);
          tbody.appendChild(ctr);
        }
        const dtr = document.createElement('tr');
        dtr.className = 'compare-dim-detail';
        dtr.appendChild(document.createElement('td'));   // 指标列留空，文字从各岗位那一栏开始
        slots.forEach((rec, i) => {
          const td = document.createElement('td');
          td.className = 'cd-cell';
          if (rec) td.appendChild(buildCompareDimContent(rec, dimKey, COMPARE_COLORS[i % COMPARE_COLORS.length].stroke, row.evidenceOnly));
          dtr.appendChild(td);
        });
        tbody.appendChild(dtr);
        // 评分规则：维度级的一份（与报告页同一份），整行收在最后、默认收起；
        // 年均休息日那一行借的是双休假期那套规则，也一起给
        const rule = compareRuleBlock(dimKey);
        if (rule) {
          const rtr = document.createElement('tr');
          rtr.className = 'compare-dim-detail compare-dim-rulerow';
          const rtd = document.createElement('td');
          rtd.colSpan = 1 + slots.length;
          rtd.appendChild(rule);
          rtr.appendChild(rtd);
          tbody.appendChild(rtr);
        }
      }
    }
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderCompare(ctx) {
    // 对比图只在被选进槽位时才存在（内容来自模板）
    const svg = ctx && ctx.radar;
    const emptyEl = ctx && ctx.empty;
    if (!svg || !emptyEl) return;
    const slots = compareSlots();
    const radar = buildCompareRadar(svg);
    radar.setSeries(slots.map((rec, i) => (rec ? {
      values: DIM_KEYS.map((k) => dimScoreOf(rec, k)),
      color: COMPARE_COLORS[i % COMPARE_COLORS.length],
    } : null)));
    emptyEl.hidden = slots.length > 0;
    renderCompareTable(ctx, slots);
  }

  // 收藏一变，图上的深浅就变了：当前页面上已经画出来的图立刻重画（两页各有一套入口）
  function refreshToneCharts() {
    if (!viewAnalysis.hidden) renderDataAnalysis();
    if (!viewReport.hidden) renderReportChart();
  }

  function renderCompareList(ctx) {
    const compareList = ctx && ctx.list;
    if (!compareList) return;
    const list = loadHistory();
    compareList.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'compare-list-empty';
      p.textContent = '还没有可对比的岗位，先去分析几个岗位吧。';
      compareList.appendChild(p);
      return;
    }
    const order = new Map(compareSelected.map((id, i) => [id, i]));
    list.forEach((rec) => {
      const idx = order.get(rec.id);
      // 整行就是一颗按钮：点它才是「选进雷达图对比 / 取消选择」
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'compare-item' + (idx != null ? ' on' : '');
      const dot = document.createElement('span');
      dot.className = 'compare-dot';
      if (idx != null) {
        dot.style.background = COMPARE_COLORS[idx % COMPARE_COLORS.length].stroke;
        dot.textContent = String(idx + 1);
      }
      // 一行只有「圆点 + 岗位名」：名字要显示全（不再省略号），工资 / 作息 / 城市 / 公司
      // 那一长串按用户要求从这一列去掉（想核对细节点进报告页看）
      const title = document.createElement('span');
      title.className = 'compare-item-title';
      title.textContent = (rec.job && rec.job.title) || '未命名岗位';
      row.appendChild(dot);
      row.appendChild(title);
      row.addEventListener('click', () => {
        const i = compareSelected.indexOf(rec.id);
        if (i >= 0) {
          compareSelected.splice(i, 1);
        } else {
          if (compareSelected.length >= COMPARE_MAX) { toast('最多对比 3 个岗位'); return; }
          compareSelected.push(rec.id);
        }
        renderCompareList(ctx);
        renderCompare(ctx);
      });
      compareList.appendChild(row);
    });
  }

  /* ---------- 示例报告 ---------- */

  async function openDemo() {
    demoPlaying = false;   // 进完整示例：首页那台轮播先停，别在后台继续跑动画
    demoToken++;
    startReport(true);
    stopWaitProgress();
    // 示例也走同一套：先只有居中的进度圈，第一个维度画出来才露出雷达图
    showReportLoading('正在生成分析…');
    loadingRing.setProgress(0.6);
    dimsData = DEMO_REPORT.analysis.dimensions;
    await runReportSequence(DEMO_REPORT, 0.6);
  }

  /* ---------- 首页产品演示 ----------
     一段连贯动画（不分屏、没有圆点）：雷达图生成 → 头顶冒出总分与评价 → 光标点开「发展潜力」
     → 详细分析与那张图展开 → 只留这张图（右上角「查看更多分析图」）→ 更多分析图的界面（向下滚动）
     → logo 收尾 → 循环。用的都是报告页那几个渲染函数与类名（示例即真实界面，不做另一套样式）。 */
  const demoStage = $('demoStage');
  const demoOpenBtn = $('demoOpen');
  let demoPlaying = false;
  let demoToken = 0;
  let demoInView = false;
  let demoHover = false;
  let demoRO = null;           // 舞台内容的尺寸观察器：高度始终跟着内容走

  function demoHead(title) {
    const head = document.createElement('div');
    head.className = 'section-head';
    const h = document.createElement('h2');
    h.className = 'section-title';
    h.textContent = title;
    head.appendChild(h);
    return head;
  }

  function demoEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function demoDimOf(key) {
    return (DEMO_ANALYSIS.dimensions || []).find((x) => x.key === key) || {};
  }

  // 六维雷达：与报告页同一个 buildRadar，只是不挂点击（示例不做维度跳转）
  function demoRadar(host) {
    const wrap = demoEl('div', 'radar-wrap');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 340');
    svg.setAttribute('aria-hidden', 'true');
    wrap.appendChild(svg);
    host.appendChild(wrap);
    const api = buildRadar(svg, DIM_KEYS.map((k) => DIM_NAMES[k]), { interactive: false });
    return api;
  }

  // 逐维分析用的面板：和报告页维度面板同一套类名与层次（名称 / 刻度 / 分数 / 一句话评价 / 分析）。
  // opts.chart = true 时把这一维的分析图（发展潜力的参照图）一并画进来——报告页里有，示例里也要有。
  function demoDimPanel(panel, key, opts = {}) {
    const d = demoDimOf(key);
    panel.innerHTML = '';
    panel.hidden = false;
    panel.classList.remove('swap');
    void panel.offsetWidth;
    panel.classList.add('swap');
    const head = demoEl('div', 'dim-panel-head');
    head.appendChild(demoEl('span', 'dim-panel-name', d.name || DIM_NAMES[key]));
    const meter = demoEl('span', 'dim-meter');
    for (let k = 0; k < 10; k++) {
      meter.appendChild(demoEl('span', `meter-cell${d.score != null && k < d.score ? ' on' : ''}`));
    }
    head.appendChild(meter);
    head.appendChild(demoEl('span', 'dim-panel-score', d.score == null ? '--' : String(d.score)));
    panel.appendChild(head);
    const verdict = verdictOf(key, DEMO_REPORT);
    if (verdict) panel.appendChild(demoEl('p', 'dim-verdict', verdict));
    if (opts.chart && key === 'growth') {
      const chart = growthScaleChart(DEMO_REPORT);
      if (chart) panel.appendChild(chart);
    }
    const text = demoEl('div', 'dim-panel-text');
    renderAnalysis(text, d.analysis);
    panel.appendChild(text);
  }

  async function demoWait(ms, alive) {
    let end = Date.now() + ms;
    while (Date.now() < end) {
      if (!alive()) return;
      // 鼠标停在演示上：这一拍停住不往下走，停留时间跟着一起往后推
      if (demoHover) { await sleep(200); end += 200; continue; }
      await sleep(Math.min(200, end - Date.now()));
    }
  }

  // 雷达图上第 i 个维度标签（顺序与 DIM_KEYS 一致）
  function demoLabelNode(host, i) {
    return host.querySelectorAll('.radar-label')[i] || null;
  }

  /* 假光标：演「鼠标移到目标上点一下」。它落在内容层（frame，position: relative）里，
     所以跟着内容一起滚动；坐标每次重新算（指尖落在目标右下角一点点，
     压在正中间会把维度名或分数挡住）。速度用缓出曲线，起手快、收手慢，接近真人的手感。 */
  function demoCursor(frame) {
    const el = demoEl('div', 'demo-cursor');
    el.innerHTML = '<svg viewBox="0 0 16 22" width="16" height="22" aria-hidden="true">'
      + '<path d="M1 1L1 17.5L5.2 13.6L8 20.4L10.6 19.3L7.8 12.7L13.4 12.2Z" fill="#191919" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'
      + '<span class="demo-ripple" aria-hidden="true"></span>';
    el.classList.add('gone');
    frame.appendChild(el);
    const place = (x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
    place(frame.clientWidth * 0.74, 90);
    return {
      async to(target, alive, ms = 620) {
        if (!target || !alive()) return;
        const s = frame.getBoundingClientRect();
        const r = target.getBoundingClientRect();
        const x = Math.max(6, Math.min(s.width - 20, r.left - s.left + r.width * 0.62));
        const y = Math.max(6, Math.min(s.height - 24, r.top - s.top + r.height * 0.78));
        el.style.transitionDuration = `${ms}ms`;
        place(x, y);
        await sleep(ms + 60);
      },
      async click(alive) {
        if (!alive()) return;
        await sleep(160);   // 移到目标后手腕会停一下，再按下去——人味就在这里
        el.classList.remove('clicking');
        void el.offsetWidth;
        el.classList.add('clicking');
        await sleep(340);
      },
      show() { el.classList.remove('gone'); },
      hide() { el.classList.add('gone'); },
    };
  }

  // ② 那一拍的总分卡：大数字 + 岗位信息 + 点评（与报告页同一套类名、同一个分数口径）
  function demoVerdictCard(host) {
    const job = DEMO_SOURCE.job || {};
    const pair = scorePairOf(DEMO_ANALYSIS);
    const card = demoEl('div', 'verdict demo-verdict');
    const left = demoEl('div', 'verdict-left');
    const label = demoEl('p', 'score-label', pair.label);
    const value = demoEl('p', 'score-value');
    const num = demoEl('span', null, '0');
    const unit = demoEl('span', 'score-unit', pair.sub == null ? '' : ` /${pair.sub}`);
    value.appendChild(num);
    value.appendChild(unit);
    left.appendChild(label);
    left.appendChild(value);
    card.appendChild(left);
    const right = demoEl('div', 'verdict-right');
    right.appendChild(demoEl('p', 'verdict-job', job.title || ''));
    right.appendChild(demoEl('p', 'verdict-meta', [job.salary, DEMO_ANALYSIS.restBrief, job.city].filter(Boolean).join(' · ')));
    const line = demoEl('p', 'verdict-line');
    right.appendChild(line);
    card.appendChild(right);
    host.appendChild(card);
    return { num, line, target: pair.main };
  }

  /* 演示的主线：一段连贯动画，不分屏。顺序按真实报告走一遍——
     雷达图生成 → 头顶冒出总分与评价 → 光标点开「发展潜力」→ 详细分析与那张图展开
     → 只留这张图（右上角出现「查看更多分析图」）→ 更多分析图的界面（向下滚动）→ logo 收尾 → 循环。
     所有元素都留在原地做展开/淡出，没有整块换屏，看起来就是一次操作流程。 */
  /* 演示的主线：像真人从头走一遍产品——
     开场（一分钟快速量化分析目标 JD）→ 首页上点「粘贴链接」→ 点「生成深度分析」
     → 与真实一致的加载进度圈 → 雷达图生成 → 头顶冒出总分与评价 → 点开「发展潜力」
     → 镜头对准那张分析图 → 点右上角「查看更多分析图」→ 更多分析图的界面（向下滚动）
     → logo 收尾 → 循环。
     内容装在一个「窗口」里，镜头（translateY）负责取景；光标按目标位置移动、带点击涟漪。
     所有元素都留在原地做展开/淡出，没有整块换屏，看起来就是一次连续的操作。 */
  // scrollHold 压到 0.25s：滚到底就迅速切到 logo 收尾，不拖一截
  /* 演示的主线：像真人从头走一遍产品——
     开场大字流式打出来 → 首页点「粘贴链接」→「生成深度分析」→ 真实的加载圈
     → 雷达图生成 → 头顶冒出总分与评价 → 点开「发展潜力」→ 聚焦那张分析图
     → 点「查看更多分析图」→ 一列分析图向下滚动 → 白幕 + logo → 循环。

     节奏原则（重做过一轮）：**停顿只留给"要看"的地方**——总分、详细分析、那张图、logo。
     其余地方没有固定等待：动作能重叠就重叠（交叉淡入、评价还没写完光标已经出发），
     光标走 0.6s、按下前停 0.16s，像人手而不是机器在走流程。 */
  const DEMO_T = {
    type: 100,        // 开场打字：每个字 0.1s
    fade: 280,        // 通用淡入淡出
    expand: 460,      // 展开 / 收起
    radarGap: 210,    // 雷达图每一维
    count: 820,       // 总分滚上去
    typeChar: 18,     // 评价逐字（每两个字约 18ms）
    move: 620,        // 光标移动
    settle: 160,      // 移到目标后、按下前的停顿（人会停一下）
    click: 340,       // 点击涟漪
    loading: 1500,    // 加载圈（与真实一致，规格要求）
    holdLogo: 500,    // 开场：字消失、logo 浮现后停 0.5s
    holdPanel: 1000,  // 详细分析停 1s（规格）
    holdChart: 1000,  // 对准那张图停 1s（规格）
    scroll: 1300,     // 向下滚动示意
    holdScroll: 200,  // 滚到底迅速切到收尾
    holdOutro: 2000,  // logo 停 2s（规格）
  };

  /* 舞台高度跟着内容走：长高时**立刻**跟上（不给过渡）——只要慢一帧，内容就被剪掉一截；
     收短时走 CSS 过渡，平滑收回。舞台本身没有边框和底色，所以长高用不用动画看不出来，
     看到的动画来自各插槽自己的高度过渡。 */
  function demoFit() {
    const scene = demoStage.firstElementChild;
    if (!scene) return;
    const need = Math.ceil(scene.getBoundingClientRect().height);
    const have = demoStage.getBoundingClientRect().height;
    if (need > have) {
      demoStage.style.transition = 'none';
      demoStage.style.height = `${need}px`;
      void demoStage.offsetHeight;
      demoStage.style.transition = '';
    } else {
      demoStage.style.height = `${need}px`;
    }
  }

  // 展开 / 收起：高度从 0 长到内容高（或反过来）
  function demoExpand(slot, ms = DEMO_T.expand) {
    slot.hidden = false;
    slot.style.overflow = 'hidden';
    const target = slot.scrollHeight;
    slot.style.transition = `height ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    slot.style.height = '0px';
    void slot.offsetHeight;
    slot.style.height = `${target}px`;
    // 展开完把高度交给内容自己（auto）并放开裁剪：之后内容再变高也不会被剪掉
    return sleep(ms + 40).then(() => {
      slot.style.height = 'auto';
      slot.style.overflow = 'visible';
    });
  }

  function demoCollapse(slot, ms = DEMO_T.expand) {
    if (!slot || slot.hidden) return Promise.resolve();
    slot.style.overflow = 'hidden';
    slot.style.height = `${slot.getBoundingClientRect().height}px`;
    void slot.offsetHeight;
    slot.style.transition = `height ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    slot.style.height = '0px';
    return sleep(ms + 40).then(() => { slot.hidden = true; slot.style.height = 'auto'; });
  }

  function demoFade(el, on, ms = DEMO_T.fade) {
    if (!el) return Promise.resolve();
    el.style.transition = `opacity ${ms}ms ease`;
    el.style.opacity = on ? '1' : '0';
    return sleep(ms);
  }

  /* 聚焦：不裁切、不出画面——把周围的段落压暗，要看的这张图轻轻推近。 */
  function demoDim(hosts, keep) {
    for (const host of hosts) {
      if (!host) continue;
      for (const child of Array.from(host.children)) {
        if (child === keep || (keep && child.contains(keep))) continue;
        child.classList.add('demo-dim');
      }
    }
    if (keep) keep.classList.add('demo-spot');
  }

  function demoUndim(hosts) {
    for (const host of hosts) {
      if (!host) continue;
      for (const child of Array.from(host.children)) child.classList.remove('demo-dim');
    }
  }

  // 与真实一致的加载块：居中的进度圈 + 阶段文案（阶段名与真实分析同一份）
  function demoLoadingBlock() {
    const box = demoEl('section', 'report-loading demo-loading');
    const ring = demoEl('span', 'progress-ring loading-ring');
    ring.innerHTML = '<svg viewBox="0 0 20 20" width="30" height="30">'
      + '<circle cx="10" cy="10" r="7.5" fill="none" stroke="#f1f1ef" stroke-width="2"/>'
      + '<circle class="demo-load-arc" cx="10" cy="10" r="7.5" fill="none" stroke="#191919" stroke-width="2"'
      + ' stroke-dasharray="47.12" stroke-dashoffset="47.12" transform="rotate(-90 10 10)"/>'
      + '<circle cx="10" cy="2.5" r="1.6" fill="#191919" opacity="1">'
      + '<animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite"/></circle>'
      + '</svg>';
    const label = demoEl('p', 'progress-label loading-label', JD_WAIT_STEPS[0]);
    box.appendChild(ring);
    box.appendChild(label);
    return { box, label, arc: ring.querySelector('.demo-load-arc') };
  }

  async function demoStory(alive) {
    demoStage.innerHTML = '';
    const scene = demoEl('div', 'demo-scene');
    demoStage.appendChild(scene);
    if (demoRO) demoRO.disconnect();
    demoRO = new ResizeObserver(() => demoFit());
    demoRO.observe(scene);

    const win = demoEl('div', 'demo-window');
    const screen = demoEl('div', 'demo-screen');
    win.appendChild(screen);
    scene.appendChild(win);
    const cursor = demoCursor(screen);
    cursor.hide();
    demoFit();

    // ① 开场：超大字号的一句话流式打出来（正在生成的下一个字用 _ 顶着），
    //    打完浮现产品 logo 停 1s，再与下一幕交叉淡出
    const intro = demoEl('section', 'demo-intro');
    const introTitle = demoEl('p', 'demo-intro-title');
    const introTyped = demoEl('span', 'demo-intro-typed');
    const introCaret = demoEl('span', 'demo-intro-caret', '_');
    introTitle.appendChild(introTyped);
    introTitle.appendChild(introCaret);
    const introLogo = demoEl('div', 'demo-intro-logo');
    const introMark = demoEl('span', 'brand-mark');
    introMark.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none">'
      + '<path d="M4 13.5L8 8.5L11 11.5L16 5.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M13 5.5H16V8.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    introLogo.appendChild(introMark);
    introLogo.appendChild(demoEl('span', 'demo-intro-logo-name', '智能JD分析'));
    introLogo.style.opacity = '0';
    intro.appendChild(introTitle);
    intro.appendChild(introLogo);
    screen.appendChild(intro);
    const INTRO_LINES = ['一分钟，帮你快速', '分析 JD'];
    const typed = ['', ''];
    const paintTyped = () => {
      introTyped.innerHTML = '';
      introTyped.appendChild(document.createTextNode(typed[0]));
      if (typed[0].length >= INTRO_LINES[0].length) {
        introTyped.appendChild(document.createElement('br'));
        introTyped.appendChild(document.createTextNode(typed[1]));
      }
    };
    for (let li = 0; li < INTRO_LINES.length; li++) {
      const chars = Array.from(INTRO_LINES[li]);
      for (let i = 0; i < chars.length; i++) {
        if (!alive()) return;
        typed[li] = chars.slice(0, i + 1).join('');
        paintTyped();
        await demoWait(DEMO_T.type, alive);   // 用 demoWait：鼠标停在演示上时逐字停住
      }
    }
    if (!alive()) return;
    await demoWait(220, alive);                     // 刚打完，_ 停一下
    introCaret.classList.add('gone');
    // 字消失、logo 从同一个位置浮现（两层都绝对居中，画面不动）
    await Promise.all([demoFade(introTitle, false, 280), demoFade(introLogo, true, 320)]);
    await demoWait(DEMO_T.holdLogo, alive);         // 停 0.5s
    if (!alive()) return;

    // ② 首页：光标点「粘贴链接」→ 按钮打勾、生成按钮出现 → 点「生成深度分析」
    const home = demoEl('section', 'demo-home');
    const homeTitle = demoEl('h2', 'demo-home-title');
    homeTitle.innerHTML = '粘贴 JD 链接，快速获得<br>全面可靠的分析报告';
    home.appendChild(homeTitle);
    const acts = demoEl('div', 'actions');
    const bPaste = demoEl('button', 'btn btn-outline', '粘贴链接');
    const bQr = demoEl('button', 'btn btn-outline', '上传二维码');
    const bShot = demoEl('button', 'btn btn-outline', '上传截图');
    for (const b of [bPaste, bQr, bShot]) { b.type = 'button'; acts.appendChild(b); }
    const cta = demoEl('div', 'cta-wrap');
    const bGo = demoEl('button', 'btn btn-solid', '生成深度分析');
    bGo.type = 'button';
    cta.appendChild(bGo);
    home.appendChild(acts);
    home.appendChild(cta);
    home.style.opacity = '0';
    screen.insertBefore(home, intro);
    // 交叉淡入：开场淡出与首页淡出同时，不等
    await Promise.all([demoFade(home, true, DEMO_T.fade), demoFade(intro, false, DEMO_T.fade)]);
    intro.hidden = true;
    demoFit();
    cursor.show();
    await cursor.to(bPaste, alive, DEMO_T.move);
    if (!alive()) return;
    await cursor.click(alive);                      // 内含"按下前停一下"
    bPaste.classList.add('done');                   // 与真实一致：粘上后按钮打勾
    cta.hidden = false;
    cta.style.opacity = '0';
    demoFade(cta, true, 240);                       // 生成按钮出现：不等它，光标直接出发
    await cursor.to(bGo, alive, DEMO_T.move * 0.85);
    if (!alive()) return;
    await cursor.click(alive);
    cursor.hide();

    // ③ 加载：与真实解析中一样的进度圈（1.5s）
    const load = demoLoadingBlock();
    load.box.hidden = false;
    load.box.style.opacity = '0';
    screen.insertBefore(load.box, home);
    await Promise.all([demoFade(home, false, DEMO_T.fade), demoFade(load.box, true, DEMO_T.fade)]);
    home.hidden = true;
    const tLoad = performance.now();
    await new Promise((resolve) => {
      const step = (t) => {
        if (!alive()) return resolve();
        const k = Math.min(1, (t - tLoad) / DEMO_T.loading);
        load.arc.setAttribute('stroke-dashoffset', String(47.12 * (1 - 0.92 * k)));
        load.label.textContent = k < 0.45 ? JD_WAIT_STEPS[0] : (k < 0.8 ? JD_WAIT_STEPS[2] : JD_WAIT_STEPS[3]);
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    if (!alive()) return;

    // 报告：总分卡（先空着）+ 雷达图 + 维度面板
    const report = demoEl('section', 'demo-report');
    const verdictSlot = demoEl('div', 'demo-slot');
    const radarSec = demoEl('div', 'demo-radar-sec');
    const panelSlot = demoEl('div', 'demo-slot');
    report.appendChild(verdictSlot);
    report.appendChild(radarSec);
    report.appendChild(panelSlot);
    verdictSlot.hidden = false;
    verdictSlot.style.height = '0px';
    verdictSlot.style.overflow = 'hidden';
    report.style.opacity = '0';
    screen.appendChild(report);

    // ④ 雷达图生成：与加载圈交叉（不等它淡完），六维依次长出来
    radarSec.appendChild(demoHead('雷达图'));
    const api = demoRadar(radarSec);
    Promise.all([demoFade(load.box, false, DEMO_T.fade), demoFade(report, true, DEMO_T.fade)]);
    for (let i = 0; i < DIM_KEYS.length; i++) {
      if (!alive()) return;
      const d = demoDimOf(DIM_KEYS[i]);
      api.showLabel(i, true);
      api.setScore(i, '·', true);
      growDim(api, i, d.score == null ? 0 : d.score, 230);
      if (d.score != null) api.setScore(i, String(d.score), false);
      await demoWait(DEMO_T.radarGap, alive);   // 逐维生长的间隔也随鼠标悬停停住
    }
    load.box.hidden = true;
    demoFit();
    if (!alive()) return;

    // ⑤ 总分、评价从雷达图头顶长出来：展开、数字滚动、逐字评价连成一串
    const card = demoVerdictCard(verdictSlot);
    verdictSlot.style.height = '0px';
    verdictSlot.style.overflow = 'hidden';
    demoExpand(verdictSlot, DEMO_T.expand);
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = (t) => {
        if (!alive()) return resolve();
        const k = Math.min(1, (t - t0) / DEMO_T.count);
        card.num.textContent = String(Math.round(card.target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    if (!alive()) return;
    const note = '休息安排全文未提，只能按默认的双休基线估；不定期海外出差、陪同客户会切走整块个人时间。'
      + (DEMO_ANALYSIS.personalNote || '');
    const chars = Array.from(note);
    // 评价写到七成时，光标已经朝「发展潜力」出发——两件事重叠，中间不空等
    const growthIdx = DIM_KEYS.indexOf('growth');
    const moveP = sleep(Math.round(chars.length * DEMO_T.typeChar * 0.7)).then(() => cursor.show());
    const typeP = (async () => {
      for (let i = 1; i <= chars.length; i++) {
        if (!alive()) return;
        card.line.textContent = chars.slice(0, i).join('');
        if (i % 2 === 0) await demoWait(DEMO_T.typeChar, alive);   // 逐字写也随悬停停住
      }
    })();
    await moveP;
    const goP = cursor.to(demoLabelNode(radarSec, growthIdx), alive, DEMO_T.move);
    await typeP;
    await goP;
    if (!alive()) return;

    // ⑥ 点开「发展潜力」，详细分析在雷达图下方展开（停 1s）
    await cursor.click(alive);
    api.setActive(growthIdx);
    const panel = demoEl('div', 'dim-panel');
    panelSlot.appendChild(panel);
    demoDimPanel(panel, 'growth', { chart: true });
    demoExpand(panelSlot, DEMO_T.expand);
    cursor.hide();
    await demoWait(DEMO_T.holdPanel, alive);
    if (!alive()) return;

    // ⑦ 聚焦那张分析图：周围压暗、图轻轻推近（停 1s，不裁切、不出画面）
    const chart = panel.querySelector('.dim-scale');
    demoDim([verdictSlot, radarSec, panel], chart);
    await demoWait(DEMO_T.holdChart, alive);
    if (!alive()) return;
    demoUndim([verdictSlot, radarSec, panel]);

    // ⑧ 点那张图右上角的「查看更多分析图」
    const more = demoEl('button', 'demo-more', '查看更多分析图 →');
    more.type = 'button';
    more.addEventListener('click', () => openAnalysisPage());
    const spot = demoEl('div', 'demo-spot-wrap');
    if (chart && chart.parentElement) {
      chart.parentElement.insertBefore(spot, chart);
      spot.appendChild(chart);
    } else {
      screen.appendChild(spot);
    }
    spot.appendChild(more);
    more.style.opacity = '0';
    demoFade(more, true, 240);
    cursor.show();
    await cursor.to(more, alive, DEMO_T.move * 0.8);
    if (!alive()) return;
    await cursor.click(alive);
    cursor.hide();

    // ⑨ 更多分析图的界面：一列分析图，向下滚动示意，滚到底迅速切到收尾
    const moreSeg = demoEl('section', 'demo-more-sec');
    moreSeg.appendChild(demoHead('职位对比'));
    const view = demoEl('div', 'demo-scroll');
    moreSeg.appendChild(view);
    for (const [id, name] of [['growthstep', '薪资涨幅分析'], ['scatter', '预计年薪、年均休息日分析'], ['hourly', '时薪、性价比分析'], ['growthrank', '发展潜力档位分析']]) {
      const item = demoEl('section', 'demo-scroll-item');
      item.appendChild(demoEl('p', 'demo-scroll-title', name));
      const body = demoEl('div', 'chart-body');
      item.appendChild(body);
      view.appendChild(item);
      if (id === 'growthrank') await loadGrowthScatter();
      if (!alive()) return;
      demoPointsOn = true;
      reportHighlightUrl = DEMO_CASES[0].url;
      try {
        CHART_RENDERERS[id](body, { redraw: () => {} });
      } finally {
        demoPointsOn = false;
        reportHighlightUrl = '';
      }
    }
    moreSeg.hidden = false;
    moreSeg.style.opacity = '0';
    screen.appendChild(moreSeg);
    // 旧的淡出与新的淡入同时；报告收掉，图表段铺开
    await Promise.all([
      demoFade(more, false, 220),
      demoFade(report, false, DEMO_T.fade),
      demoFade(moreSeg, true, DEMO_T.fade),
    ]);
    report.hidden = true;
    demoFit();
    const max = Math.max(0, view.scrollHeight - view.clientHeight);
    const t1 = performance.now();
    await new Promise((resolve) => {
      const step = (t) => {
        if (!alive()) return resolve();
        const k = Math.min(1, (t - t1) / DEMO_T.scroll);
        view.scrollTop = max * k;
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    await demoWait(DEMO_T.holdScroll, alive);   // 滚到底只停一下，立刻切收尾
    if (!alive()) return;

    // ⑩ 画面渐白，logo 从中间浮现（停 2s）→ 淡出，回到开场
    const veil = demoEl('div', 'demo-outro-veil');
    const outro = demoEl('div', 'demo-outro');
    const mark = demoEl('span', 'brand-mark');
    mark.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none">'
      + '<path d="M4 13.5L8 8.5L11 11.5L16 5.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M13 5.5H16V8.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    outro.appendChild(mark);
    outro.appendChild(demoEl('p', 'demo-outro-name', '智能JD分析'));
    outro.appendChild(demoEl('p', 'demo-outro-by', 'Designed by dvlin'));
    veil.appendChild(outro);
    win.appendChild(veil);
    veil.style.opacity = '0';
    outro.style.opacity = '0';
    outro.style.transform = 'scale(0.94)';
    await demoFade(veil, true, 460);            // 白幕盖住画面
    if (!alive()) return;
    outro.style.transition = 'opacity 620ms ease, transform 760ms cubic-bezier(0.22, 1, 0.36, 1)';
    outro.style.opacity = '1';
    outro.style.transform = 'scale(1)';
    await sleep(820);
    await demoWait(DEMO_T.holdOutro, alive);    // 停 2s（规格）
    if (!alive()) return;
    await demoFade(veil, false, 380);
  }
  function demoShouldRun() {
    return demoInView && !viewHome.hidden && !document.hidden;
  }

  async function demoLoop() {
    const token = ++demoToken;
    demoPlaying = true;
    const alive = () => demoPlaying && token === demoToken;
    while (alive()) {
      await demoStory(alive);
      if (!alive()) break;
      if (!demoShouldRun()) break;
    }
    demoPlaying = false;
    if (demoRO) { demoRO.disconnect(); demoRO = null; }
  }

  function demoKick() {
    if (demoPlaying || !demoShouldRun()) return;
    demoLoop();
  }

  demoOpenBtn.addEventListener('click', openDemo);
  demoStage.addEventListener('mouseenter', () => { demoHover = true; });
  demoStage.addEventListener('mouseleave', () => { demoHover = false; });
  window.addEventListener('resize', () => { if (demoPlaying) demoFit(); });
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((es) => {
      demoInView = es.some((e) => e.isIntersecting);
      if (demoShouldRun()) demoKick();
      else demoPlaying = false;
    }, { threshold: 0.25 });
    io.observe($('demoBlock'));
  } else {
    demoInView = true;
  }
  onViewShown = (view) => {
    if (view === viewHome) demoKick();
    else demoPlaying = false;
  };
  demoKick();

  /* ---------- 设置：分数口径 ----------
     total（默认）＝大数字给加权分（按你的条件修正后的总分）；
     base         ＝大数字给原始分（这份工作本身值多少）。
     胶囊里两个词：前一个＝当前口径（深色加粗），后一个＝另一档（灰字）；点一下两个词对调。
     两个词的说法放进 title（悬停可见），面板里不再留那行小字。
     切换立即生效：报告页与历史列表都重新画一遍（口径存在本地，下次打开还是这个选择）。 */
  const btnSettings = $('btnSettings');
  const scoreModeToggle = $('scoreModeToggle');
  const SCORE_WORD = { total: '加权分', base: '原始分' };
  const SCORE_PILL_TITLE = '加权分＝大数字按你的条件修正后的总分；原始分＝这份工作本身值多少。点一下切换。';

  function paintScoreModeButtons() {
    const on = SCORE_WORD[scoreMode] || SCORE_WORD.total;
    const off = scoreMode === 'base' ? SCORE_WORD.total : SCORE_WORD.base;
    $('scoreModeOn').textContent = on;
    $('scoreModeOff').textContent = off;
    scoreModeToggle.title = SCORE_PILL_TITLE;
    scoreModeToggle.setAttribute('aria-pressed', String(scoreMode === 'base'));
    scoreModeToggle.setAttribute('aria-label', `分数：大数字＝${on}，点一下切成${off}`);
    // 示意图跟着口径走：当前给大数字的那一块涂成墨色（另一块浅色）
    $('setFigBase').classList.toggle('on', scoreMode === 'base');
    $('setFigWeighted').classList.toggle('on', scoreMode !== 'base');
    $('setScoreNote').textContent = `大数字显示「${on}」。点上面的胶囊，两个词对调。`;
  }

  function applyScoreMode(mode) {
    if (mode !== 'base' && mode !== 'total') return;
    scoreMode = mode;
    try { localStorage.setItem(SCORE_MODE_KEY, mode); } catch { /* 隐私模式下只在本次会话生效 */ }
    paintScoreModeButtons();
    if (lastReportData && lastReportData.analysis) paintScorePair(lastReportData.analysis);
    renderHistory();
  }

  // 设置是独立一页（原来挂在导航下的小面板已撤掉）：点导航进页面，与「历史档案」「我的简历」同一条路径
  function openSettingsPage() {
    loadModelInfo();          // 模型那一行每次进页面都取最新的（在弹层里换完再回来也是对的）
    show(viewSettings);
    history.pushState({ view: 'settings' }, '');
    pushedState = true;
  }
  btnSettings.addEventListener('click', openSettingsPage);
  // 切换后不跳走，好让人看着两个词对调、图跟着换边
  scoreModeToggle.addEventListener('click', () => {
    applyScoreMode(scoreMode === 'base' ? 'total' : 'base');
  });
  paintScoreModeButtons();

  /* ---------- 设置：模型接入（换服务商 / 填 key / 测连通） ----------
     优先级由后端 lib/modelcfg 说了算：面板保存的 config.local.json > 环境变量 > config.local.js > 内置默认。
     这里干三件事：把当前配置画成设置面板那一行；弹层里改完 POST 回去（保存即生效，不用重启）；
     测试连接打一次 /api/model-test，成功/失败都显示在弹层那行状态里。 */
  const modelModal = $('modelModal');
  const modelRow = $('modelRow');
  const modelCurName = $('modelCurName');
  const modelCurTag = $('modelCurTag');
  const modelSeg = $('modelSeg');
  const modelKeyInput = $('modelKeyInput');
  const modelEndpointInput = $('modelEndpointInput');
  const modelModelInput = $('modelModelInput');
  const modelSourceLine = $('modelSourceLine');
  const modelResult = $('modelResult');
  const btnModelTest = $('modelTest');
  const btnModelSave = $('modelSave');
  const modelKeyPaste = $('modelKeyPaste');
  const modelModelSelect = $('modelModelSelect');
  const modelSpecLine = $('modelSpecLine');
  const modelSpecNote = $('modelSpecNote');
  const modelAdvToggle = $('modelAdvToggle');
  const modelAdv = $('modelAdv');
  const modelMaxTokensInput = $('modelMaxTokensInput');
  const modelTempInput = $('modelTempInput');
  const modelSavedList = $('modelSavedList');
  const modelThinkSeg = $('modelThinkSeg');
  const modelThinkNow = $('modelThinkNow');
  // 下拉里「其他（自己填）」那一项的 value：没有目录（自定义服务商 / 目录外的型号）就落在这儿
  const MODEL_OTHER = '';
  // 思考模式三态（与后端 lib/modelcfg 的 THINKING_MODES 一一对应）
  const MODEL_THINKING = ['auto', 'on', 'off'];
  // 设置面板里模型后面那个 2 字小标：模型走哪儿（key 走哪儿放在整行的 title 里，2 字说不下）
  const MODEL_TAG = { panel: '面板', env: '环境', file: '文件', default: '默认' };
  const MODEL_WHERE = { panel: '面板保存', env: '环境变量', file: '本地文件', default: '内置默认' };
  const MODEL_KEY_WHERE = { panel: '面板', env: '环境变量', file: '本地文件', none: '还没配' };

  let modelInfo = null;        // GET /api/model-config 的最新一份；null＝还没读到
  let modelLoadError = '';     // 读不到时给用户看的原因（多半是服务还没重启）
  let modelProvider = 'deepseek';
  let modelThinking = 'auto';  // 弹层里「思考模式」选中的那颗胶囊

  // 设置面板里模型那一行的 title：模型走哪儿 + key 从哪儿来——两样可能不是同一处
  function modelRowTitle(info) {
    const where = MODEL_WHERE[info.source.provider] || MODEL_WHERE.default;
    const key = MODEL_KEY_WHERE[info.source.apiKey] || MODEL_KEY_WHERE.none;
    return `模型：${where} · key：${key}`;
  }

  // 弹层里的常驻状态行：来源 + 环境变量里还有一把 key 的提醒 + 落盘路径
  function modelSourceText(info) {
    const short = { panel: '面板', env: '环境变量', file: '本地文件', default: '默认' };
    const s = info.source;
    const key = s.apiKey === 'none' ? 'key 还没配' : `key 来自${short[s.apiKey]}`;
    // 环境变量里有 key 就提醒一句：面板一保存就以面板为准，用户才知道该改哪儿
    const extra = info.env.hasApiKey
      ? `环境变量里还有一把：${info.env.apiKeyMasked}（面板保存后以面板为准）`
      : '';
    const store = `配置文件 config.local.json${info.store.exists ? '' : '（还没生成）'}`;
    // 降级目标：主模型因「这家用不了」（余额/限流/网络）失败时，会自动改用它再调一次
    const fb = info.fallback
      ? `降级：主模型失败时自动切到 ${info.fallback.providerLabel} · ${info.fallback.model}`
      : '降级：没有可用的备用模型（在下面存一条别家的 key 就会自动启用）';
    return [`当前生效：${short[s.provider]} · ${key}`, fb, extra, store].filter(Boolean).join(' · ');
  }

  function paintModelRow() {
    const fig = $('setFigProvider');   // 示意图右侧那块：当前服务商
    if (!modelInfo) {
      modelCurName.textContent = '读取失败';
      modelCurName.title = modelLoadError || '';
      modelCurTag.hidden = true;
      modelRow.title = modelLoadError || '';
      if (fig) fig.textContent = '读取失败';
      return;
    }
    const name = `${modelInfo.active.providerLabel} · ${modelInfo.active.model}`;
    modelCurName.textContent = name;
    modelCurName.title = name;   // 名字被省略号截了的时候，鼠标停一下能看全
    modelCurTag.textContent = MODEL_TAG[modelInfo.source.provider] || MODEL_TAG.default;
    modelCurTag.hidden = false;
    modelRow.title = modelRowTitle(modelInfo);
    if (fig) fig.textContent = modelInfo.active.providerLabel;
  }

  async function loadModelInfo() {
    try {
      const r = await fetch('/api/model-config', { cache: 'no-store', headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        throw new Error(data.error
          ? `${data.error}${r.status === 404 ? '：服务要重启一次，新接口才会生效' : ''}`
          : `读取模型配置失败（HTTP ${r.status}）`);
      }
      modelInfo = data;
      modelLoadError = '';
    } catch (e) {
      modelInfo = null;
      modelLoadError = e.message;
    }
    paintModelRow();
    return modelInfo;
  }

  // 这家的型号目录（服务商没配 models 或还没读到配置时给空数组）
  function modelCatalog(provider) {
    const preset = modelInfo && modelInfo.presets ? modelInfo.presets[provider] : null;
    return preset && Array.isArray(preset.models) ? preset.models : [];
  }

  // 服务端有没有带型号目录。没带＝后端还是老代码（本次改动要重启才生效）：
  // 这时退回老行为——按预设的 model 字段填手填框，别让人对着空下拉发呆
  function hasModelCatalog(provider) {
    const preset = modelInfo && modelInfo.presets ? modelInfo.presets[provider] : null;
    return !!(preset && Array.isArray(preset.models));
  }

  // 目录里的一条型号（手填的型号、自定义服务商都找不到 → null＝「其他」）
  function modelSpecOf(provider, model) {
    return modelCatalog(provider).find((m) => m.id === model) || null;
  }

  // 输出上限写成人能一眼读的量级：384000 → 38.4万、131072 → 13.1万、32768 → 3.3万
  function humanTokens(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    return n >= 10000 ? `${Math.round(n / 1000) / 10}万` : String(n);
  }

  // 画型号下拉：这家的目录 + 末尾一项「其他（自己填）」；model 不在目录里就落到「其他」，
  // 并把文本框露出来让用户手打（文本框始终留着生效的型号名，保存时读它就行）
  function paintModelOptions(provider, model) {
    const list = modelCatalog(provider);
    modelModelSelect.textContent = '';
    for (const m of list) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label || m.id;
      modelModelSelect.appendChild(opt);
    }
    const other = document.createElement('option');
    other.value = MODEL_OTHER;
    other.textContent = '其他（自己填）';
    modelModelSelect.appendChild(other);

    const hit = list.find((m) => m.id === model);
    modelModelSelect.value = hit ? model : MODEL_OTHER;
    modelModelInput.value = model || '';
    modelModelInput.hidden = !!hit;
    paintModelSpec(provider, modelModelSelect.value);
  }

  // 规格小字：上下文 + 输出上限一行，型号的说明另起一行；手填的型号只给一句「按服务商文档」
  function paintModelSpec(provider, model) {
    const hit = modelSpecOf(provider, model);
    if (!hit) {
      modelSpecLine.textContent = '按服务商文档';
      modelSpecNote.textContent = '';
      return;
    }
    const parts = [];
    if (hit.context) parts.push(`上下文 ${hit.context}`);
    if (Number.isFinite(hit.maxOutput)) parts.push(`输出上限 ${humanTokens(hit.maxOutput)}`);
    modelSpecLine.textContent = parts.join(' · ') || '按服务商文档';
    modelSpecNote.textContent = hit.note || '';
  }

  // 选中型号后，把「单次输出上限」默认填成这个型号的上限（用户可以改，留空＝用默认）
  function fillMaxTokens(provider, model) {
    const hit = modelSpecOf(provider, model);
    modelMaxTokensInput.value = hit && Number.isFinite(hit.maxOutput) ? String(hit.maxOutput) : '';
  }

  // 当前生效的型号名：下拉选了目录里的型号就用它，选「其他」就用手填那个框
  function currentModelId() {
    return modelModelSelect.value || modelModelInput.value.trim();
  }

  function setModelAdvOpen(open) {
    modelAdv.hidden = !open;
    modelAdvToggle.setAttribute('aria-expanded', String(open));
    modelAdvToggle.classList.toggle('on', open);
  }

  // 选中某个服务商：fill＝按预设把地址/型号填一遍（自定义的预设是空的，等于清空重填）；
  // 型号下拉与规格行每次都跟着这家重画
  function pickModelProvider(provider, fill) {
    modelProvider = modelInfo && modelInfo.presets[provider] ? provider : 'deepseek';
    for (const btn of modelSeg.querySelectorAll('.model-seg-btn')) {
      btn.classList.toggle('on', btn.dataset.provider === modelProvider);
    }
    const preset = modelInfo && modelInfo.presets[modelProvider];
    if (fill && preset) modelEndpointInput.value = preset.endpoint || '';
    const first = modelCatalog(modelProvider)[0];
    // 老服务端（presets 里没有 models）退回 preset.model 那个字段，行为跟改之前一样
    const legacy = !hasModelCatalog(modelProvider) && preset ? (preset.model || '') : MODEL_OTHER;
    const want = fill ? (first ? first.id : legacy) : ((modelInfo && modelInfo.active.model) || '');
    paintModelOptions(modelProvider, want);
    if (fill) fillMaxTokens(modelProvider, modelModelSelect.value);
  }

  function setModelResult(text, tone) {
    modelResult.className = tone ? `model-result ${tone}` : 'model-result';
    modelResult.textContent = text || '';
  }

  // 思考模式：三颗胶囊谁被选中 + 标签后面那行「当前：思考开 / 思考关」
  function paintThinkSeg() {
    for (const btn of modelThinkSeg.querySelectorAll('.model-seg-btn')) {
      btn.classList.toggle('on', btn.dataset.thinking === modelThinking);
    }
    modelThinkNow.textContent = modelInfo && modelInfo.active
      ? `当前：思考${modelInfo.active.thinkingNow ? '开' : '关'}`
      : '';
  }

  /* 已保存的模型列表：每行「服务商 · 型号 + 打码 key + 用这个 / ×」。
     永远不显示明文 key（后端也只回 apiKeyMasked）；当前生效那行加 .on 高亮与「正在用」小标。 */
  function paintSavedList() {
    const known = Array.isArray(modelInfo && modelInfo.saved);
    const list = known ? modelInfo.saved : [];
    modelSavedList.textContent = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'model-saved-empty';
      empty.textContent = known
        ? '保存过的模型会出现在这里，点一下就能切换'
        : '保存过的模型会出现在这里，点一下就能切换（服务端还是旧版本：重启一次就会出现）';
      modelSavedList.appendChild(empty);
      return;
    }
    for (const item of list) {
      const row = document.createElement('div');
      row.className = item.isActive ? 'model-saved-row on' : 'model-saved-row';
      row.dataset.id = item.id;
      // 整行可点＝切到这一套（等同点「用这个」）；当前生效那行点了只给个提示
      if (!item.isActive) row.title = '点击切换到这一套';

      const main = document.createElement('div');
      main.className = 'model-saved-main';
      const name = document.createElement('span');
      name.className = 'model-saved-name';
      name.textContent = item.label || `${item.providerLabel} · ${item.model}`;
      name.title = name.textContent;
      main.appendChild(name);
      if (item.isActive) {
        const badge = document.createElement('span');
        badge.className = 'model-saved-badge';
        badge.textContent = '正在用';
        main.appendChild(badge);
      }
      row.appendChild(main);

      if (item.apiKeyMasked) {
        const key = document.createElement('span');
        key.className = 'model-saved-key';
        // 不再写「key 」这个前缀：省下的宽度留给名字末尾的思考档，省得被省略号裁掉
        key.textContent = item.apiKeyMasked;
        key.title = `key ${item.apiKeyMasked}`;
        row.appendChild(key);
      }

      // 当前生效那行不再摆「用这个」：整行已经能点，旁边只留「正在用」小标免得重复
      if (!item.isActive) {
        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'model-saved-use';
        useBtn.textContent = '用这个';
        useBtn.dataset.act = 'use';
        row.appendChild(useBtn);
      }

      const xBtn = document.createElement('button');
      xBtn.type = 'button';
      xBtn.className = 'model-saved-x';
      xBtn.textContent = '×';
      xBtn.dataset.act = 'forget';
      xBtn.setAttribute('aria-label', `从列表移除 ${name.textContent}`);
      row.appendChild(xBtn);

      modelSavedList.appendChild(row);
    }
  }

  // 把表单刷成「当前生效」那一套（打开弹层、切换已保存的模型之后都走这里）
  function fillModelForm() {
    pickModelProvider(modelInfo.active.provider, false);
    modelKeyInput.value = '';
    modelKeyInput.placeholder = modelInfo.active.apiKeyMasked || 'sk-…';
    modelEndpointInput.value = modelInfo.active.endpoint;
    // 高级项：默认填当前生效的那套（不是型号的上限——不动它就别让它在保存时悄悄变大）
    modelMaxTokensInput.value = modelInfo.active.maxTokens === undefined ? '' : String(modelInfo.active.maxTokens);
    modelTempInput.value = modelInfo.active.temperature === undefined ? '' : String(modelInfo.active.temperature);
    modelThinking = MODEL_THINKING.includes(modelInfo.active.thinking) ? modelInfo.active.thinking : 'auto';
    paintThinkSeg();
    modelSourceLine.textContent = modelSourceText(modelInfo);
  }

  function closeModelModal() {
    modelModal.hidden = true;
  }

  async function openModelModal() {
    if (!modelInfo) await loadModelInfo();
    if (!modelInfo) {
      toast(modelLoadError || '模型配置读取失败，稍后再试', 4200);
      return;
    }
    fillModelForm();
    paintSavedList();
    setModelAdvOpen(false);
    setModelResult('');
    modelModal.hidden = false;
  }

  $('btnModelEdit').addEventListener('click', () => { openModelModal(); });
  $('modelClose').addEventListener('click', closeModelModal);
  $('modelBackdrop').addEventListener('click', closeModelModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modelModal.hidden) closeModelModal();
  });
  // 每次进设置页都问一次：配置可能刚在别的地方改过（openSettingsPage 里已经接了 loadModelInfo）

  modelSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.model-seg-btn');
    if (!btn) return;
    pickModelProvider(btn.dataset.provider, true);
    setModelResult('');
  });

  // 换型号：规格行跟着换、输出上限回到这个型号的默认值；选「其他」就把文本框露出来
  modelModelSelect.addEventListener('change', () => {
    const hit = modelSpecOf(modelProvider, modelModelSelect.value);
    modelModelInput.value = hit ? hit.id : '';
    modelModelInput.hidden = !!hit;
    if (!hit) modelModelInput.focus();
    paintModelSpec(modelProvider, modelModelSelect.value);
    fillMaxTokens(modelProvider, modelModelSelect.value);
    setModelResult('');
  });

  modelAdvToggle.addEventListener('click', () => setModelAdvOpen(modelAdv.hidden));

  // 「粘贴」按钮：给 Ctrl+V 再加一道保险。读剪贴板要页面在焦点上 + 用户授权（localhost 算安全上下文），
  // 读不到就直说走 Ctrl+V，别让人对着没反应的按钮猜
  modelKeyPaste.addEventListener('click', async () => {
    try {
      const text = String(await navigator.clipboard.readText()).trim();
      if (!text) throw new Error('剪贴板里没有文本');
      modelKeyInput.value = text;
      modelKeyInput.focus();
      setModelResult('');
    } catch (e) {
      toast('粘贴失败，请用 Ctrl+V', 3200);
    }
  });

  btnModelTest.addEventListener('click', async () => {
    // 还没配 key 就先别去打接口：第一次用的人会拿到一句 401 的英文报错，看着像程序坏了。
    // 面板里已保存的 key 和环境变量里那把都算「已配」；两边都没有时提示他先粘一把。
    const typed = (modelKeyInput.value || '').trim();
    const saved = !!(modelInfo && modelInfo.source && modelInfo.source.apiKey !== 'none');
    if (!typed && !saved) {
      setModelResult('还没配置 API Key：把服务商给你的 key 粘到上面的输入框，点「保存」后再测。', 'err');
      modelKeyInput.focus();
      return;
    }
    const old = btnModelTest.textContent;
    btnModelTest.disabled = true;
    btnModelTest.textContent = '测试中…';
    setModelResult('正在用已保存的配置发一条最小请求…');
    try {
      const r = await fetch('/api/model-test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      if (data.ok) setModelResult(`✓ 通 ${(data.ms / 1000).toFixed(1)}s · ${data.model}`, 'ok');
      else setModelResult(data.error || `测试失败（HTTP ${r.status}）`, 'err');
    } catch (e) {
      setModelResult(`测试请求发不出去：${e.message}`, 'err');
    } finally {
      btnModelTest.disabled = false;
      btnModelTest.textContent = old;
    }
  });

  btnModelSave.addEventListener('click', async () => {
    const body = {
      provider: modelProvider,
      endpoint: modelEndpointInput.value.trim(),
      model: currentModelId(),
      thinking: modelThinking,
    };
    // 留空＝不改已保存的 key（后端也是这个口径）
    const key = modelKeyInput.value.trim();
    if (key) body.apiKey = key;
    // 高级项：两个都留空＝不覆盖，后端继续用当前生效的值
    const maxTokens = modelMaxTokensInput.value.trim();
    if (maxTokens) body.maxTokens = Number(maxTokens);
    const temperature = modelTempInput.value.trim();
    if (temperature) body.temperature = Number(temperature);
    const old = btnModelSave.textContent;
    btnModelSave.disabled = true;
    btnModelSave.textContent = '保存中…';
    try {
      const r = await fetch('/api/model-config', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || `保存失败（HTTP ${r.status}）`);
      modelKeyInput.value = '';
      await loadModelInfo();
      if (modelInfo) {
        // 表单不再整份重填（用户可能刚改过地址/型号），只刷与「当前生效」有关的几处：
        // key 打码占位、来源行、思考胶囊的实际状态、已保存列表
        modelKeyInput.placeholder = modelInfo.active.apiKeyMasked || 'sk-…';
        modelSourceLine.textContent = modelSourceText(modelInfo);
        modelThinking = MODEL_THINKING.includes(modelInfo.active.thinking) ? modelInfo.active.thinking : modelThinking;
        paintThinkSeg();
        paintSavedList();
      }
      toast(data.note || '模型配置已保存，立即生效', 3200);
    } catch (e) {
      setModelResult(e.message, 'err');
    } finally {
      btnModelSave.disabled = false;
      btnModelSave.textContent = old;
    }
  });

  // 思考模式三选一：只改弹层里的选中态，保存时随表单一起 POST
  modelThinkSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.model-seg-btn');
    if (!btn || !MODEL_THINKING.includes(btn.dataset.thinking)) return;
    modelThinking = btn.dataset.thinking;
    paintThinkSeg();
    setModelResult('');
  });

  /* 已保存的模型：点整行（或点「用这个」）＝切过去（后端把它写成当前生效那套，立即生效），
     点「×」＝从列表移除（正在用的那套只会从列表消失，配置不动）。
     两个接口回的都是 GET 同形的那一份，直接顶上就不用再多打一次 GET。 */
  modelSavedList.addEventListener('click', async (e) => {
    const xBtn = e.target.closest('.model-saved-x');
    const row = e.target.closest('.model-saved-row');
    const id = row && row.dataset.id;
    if (!id) return;
    // × 只删记录，绝不能被当成「切到这一套」
    if (xBtn) e.stopPropagation();
    const act = xBtn ? 'forget' : 'use';
    const btn = xBtn || row.querySelector('.model-saved-use');
    if (act === 'use' && !btn) {   // 当前生效那行没有「用这个」：说明点的就是它自己
      toast('已经在用这一套');
      return;
    }
    const old = btn.textContent;
    btn.disabled = true;
    if (act === 'use') btn.textContent = '切换中…';
    try {
      const r = await fetch(`/api/model-config/${act}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || `操作失败（HTTP ${r.status}）`);
      if (data.active && Array.isArray(data.saved)) {
        modelInfo = data;
        paintModelRow();
      } else {
        await loadModelInfo();
      }
      paintSavedList();
      if (act === 'use') {
        fillModelForm();   // 表单跟着刷成新那套，免得显示的还是旧配置
        // 提示里带上思考档（用列表那条 label）：同一型号存了开/关两条时，光说型号分不清切到了哪条
        const hit = (data.saved || []).find((s) => s.id === id);
        const label = (hit && hit.label) || `${data.active.providerLabel} · ${data.active.model}`;
        toast(`已切到 ${label}`, 3200);
      } else {
        toast(data.note || '已从列表移除', 3600);
      }
      setModelResult('');
    } catch (err) {
      toast(err.message, 4200);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  // 返回：取消进行中的分析任务，并把首页恢复到"还没粘贴链接"的预备状态
  let inflight = null;

  function cancelAnalysis() {
    aborted = true;
    stopWaitProgress();
    if (inflight) {
      try { inflight.abort(); } catch (e) { /* 已结束则忽略 */ }
      inflight = null;
    }
    clearInput();
    setInputReady(false);
  }

  window.addEventListener('popstate', (e) => {
    pushedState = false;
    const v = (e.state && e.state.view) || 'home';
    if (v === 'analysis') { renderDataAnalysis(); show(viewAnalysis); return; }
    if (v === 'resume') { renderResumePage(); show(viewResume); return; }
    if (v === 'history') { renderHistory(); show(viewHistory); return; }
    if (v === 'settings') { show(viewSettings); return; }
    // 成果预览：草稿可能已经被分析掉（进了历史档案），那就按默认路径退回首页
    if (v === 'self' && renderSelfPreview()) { show(viewSelf); return; }
    cancelAnalysis();
    show(viewHome);
  });

  // 回首页：就地切视图，不受历史栈影响。品牌位、历史空态等「回首页」入口共用。
  // 不能走 history.back()——那退的是「上一页」，而上一页不一定是首页：从历史档案点进
  // 一条报告再点品牌，back 会退回历史档案（用户报的 bug 就是这个）。
  function goHome() {
    if (!viewHome.hidden) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!viewReport.hidden) cancelAnalysis();
    show(viewHome);
    // 把当前这条历史记录改写为「首页」，避免浏览器前进/后退时回到已经离开的页面
    history.replaceState({ view: 'home' }, '');
    pushedState = true;
  }

  // 品牌位＝回首页入口：已在首页就滚到顶；其它页面一律回首页
  $('brandHome').addEventListener('click', goHome);

  /* ---------- 首页示例雷达（静态） ---------- */

  refreshResumeEntries();
  // 主副本被外部清空时先从备份恢复，再渲染（恢复的条数会提示一次）
  const restoredCount = restoreHistoryFromBackup();
  // 评分口径升号、或这条记录里没存过版本号：进页面时先把历史档案的分数补算一遍（纯本地，不联网）
  const rescoredCount = refreshArchiveScores();
  /* 首次打开（一条档案都没有）时先把内置参照档案铺上，再画列表与图：六张分析图要几条档案才成得了形
     （散点图的成形门槛是 5 条），空历史时它们根本画不出来。放在 renderHistory() 之前是为了首屏不闪
     一下空态；只有真没档案时才等这一次本地 fetch，取不到就静默跳过，不挡其它初始化。 */
  /* 刷新后回到刷新前浏览的页面：读 rememberView 登记的视图备忘——
     历史 / 职位对比 / 我的简历 直接还原；报告页把当时打开的那一份档案找出来重新打开；
     草稿预览（self）草稿还在就还原；首页默认什么都不做。
     启动参数（自述问卷的两个出口）已经导航过的（首页被换掉了）就尊重它，不再抢。 */
  function restoreLastView() {
    if (viewHome.hidden) return;   // 已经有别的流程把页面导航走了
    let memo = null;
    try { memo = JSON.parse(localStorage.getItem(VIEW_MEMO_KEY) || 'null'); } catch { /* 忽略 */ }
    if (!memo || !memo.view || memo.view === 'home') return;
    if (memo.view === 'history') {
      renderHistory(); show(viewHistory);
      history.replaceState({ view: 'history' }, '');
      return;
    }
    if (memo.view === 'analysis') {
      renderDataAnalysis(); show(viewAnalysis);
      history.replaceState({ view: 'analysis' }, '');
      return;
    }
    if (memo.view === 'resume') {
      renderResumePage(); show(viewResume);
      history.replaceState({ view: 'resume' }, '');
      return;
    }
    if (memo.view === 'settings') {
      openSettingsPage();                       // 顺手把模型那一行问一次
      history.replaceState({ view: 'settings' }, '');
      return;
    }
    if (memo.view === 'self' && memo.selfId && selfPendingById(memo.selfId)) {
      openSelfPreview(memo.selfId, { noPush: true });
      return;
    }
    if (memo.view === 'report') {
      const list = loadHistory();
      const rec = list.find((r) => (memo.recId && r.id === memo.recId)
        || (memo.recUrl && (r.url === memo.recUrl || (r.data && r.data.source && r.data.source.url) === memo.recUrl)));
      if (rec) {
        reportMemo = { recUrl: memo.recUrl || '', recId: rec.id || '' };
        openHistory(rec);   // openHistory 自己会压一条 report 的历史记录
        return;
      }
      // 档案被删了：安安静静回首页（顺手把备忘改成 home）
      rememberView('home');
    }
  }

  /* 首屏也是一次「视图进入」：首页默认就是可见的、不经过 show()，启动收尾时补记一条。
     名称口径与 show() 里一致；如果上面 restoreLastView 已经导航到别的视图，
     Track.view 认到同一个名字会直接跳过（不会重复记）。 */
  function trackCurrentView() {
    const views = [viewReport, viewHistory, viewResume, viewAnalysis, viewSettings, viewSelf];
    const shown = viewHome.hidden ? views.find((v) => !v.hidden) : viewHome;
    T.view(shown === viewReport ? 'report' : nameOfView(shown || viewHome));
  }

  /* ---------- 启动前的访问口令检查（仅公网部署才有这一步）----------
     服务端没设 ACCESS_TOKEN 时 needToken() 直接返回 false，这里什么都不做，
     与从前完全一致。本机（localhost）服务端也返回 false，不打扰。
     设了口令且当前设备还没有：先要口令，拿到再启动应用；取消则什么都不做，
     免得在半授权状态下把一堆 401 错误刷到控制台。 */
  needToken().then((needs) => {
    if (!needs) return start();
    return promptToken().then((ok) => { if (ok) start(); });
  });

  function start() {
  seedFirstRunHistory().then(() => {
    renderHistory();
    // 首屏也镜像一次：不趁这次把已有档案收上去的话，要等下一次档案变动才会同步
    mirrorHistory();
    renderDataAnalysis();
    // 旧档案缺 growthCalc 的，问一次后端把分布依据补上（不联网，纯查库）
    healGrowthCalcs();
    restoreLastView();
    trackCurrentView();
  });
  if (restoredCount) toast(`已从本地备份恢复最近 ${restoredCount} 条历史报告`, 4200);
  if (rescoredCount) toast(`已按最新评分口径更新 ${rescoredCount} 条历史报告的分数`, 4200);

  /* ---------- 启动参数：自述问卷的两个出口 ----------
     问卷答完跳回来自带 ?self=<草稿 id>：go=1 立刻分析、saved=1 只存着、什么都不带就开成果预览。
     query 是一次性指令，用完立刻从地址栏清掉——留着的话刷新一次就重放一遍（重复分析、重复提示）。 */
  (function handleSelfParams() {
    const q = new URLSearchParams(location.search);
    const id = q.get('self');
    if (!id) return;
    // 不管走哪条路，query 都先清掉：留着的话刷新一次就重放一遍
    const clearQuery = () => history.replaceState(history.state, '', '/');
    if (!selfPendingById(id)) {
      clearQuery();
      toast('这份草稿找不到了');
      return;
    }
    // 使用记录：问卷页把草稿存好之后带着 ?self=<id> 回来（go=1 立刻分析 / saved=1 先存着）
    T.event('self_survey_saved', { id, go: q.get('go') === '1' });
    if (q.get('go') === '1') {
      // 「现在进行分析」：预览先铺上（不压历史记录——报告马上就接管这一屏），紧接着就跑
      clearQuery();
      openSelfPreview(id, { noPush: true });
      startSelfAnalyze();
      return;
    }
    if (q.get('saved') === '1') {
      clearQuery();
      toast('已存进历史档案，随时可以开始分析');
      return;
    }
    clearQuery();
    openSelfPreview(id);
  })();

  } /* end start() */
})();
