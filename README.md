# 林政豪 · 在线简历（作品导向）

静态 H5 作品集，纯 HTML/CSS/JS，无构建步骤。面向 AI 产品经理求职（HR / 产品总监），作品当主角，每个已落地项目配可交互 demo。

## 本地预览

```bash
cd "C:/Users/linzhenghao/Desktop/GITHUB在线静态简历"
python -m http.server 8080
# 打开 http://localhost:8080
```

## 目录结构

```
├── index.html                  首页（作品为导向）
├── resume.pdf                  可下载简历
├── projects/
│   ├── cs-agent/index.html     智能客服 Agent · 静态演示（单文件，双击可开）
│   ├── ecom-agent.html         电商运营 Agent · 可交互 demo
│   ├── jd-analysis/            智能 JD 分析 · 静态演示（多文件，界面与原项目一致）
│   └── video-companion/demo/   视频平台陪伴 Bot · 产品方案与 C 端交互原型
├── apps/cs-agent-demo/         客服 demo 源码（React + Vite，本地 mock）
├── assets/
│   ├── css/style.css           首页样式（editorial 高级感 / 明暗主题）
│   ├── js/main.js              首页交互（揭示动画 / 主题切换 / 进度条 / 作品定位）
│   └── img/avatar.jpg          职业照
└── PLAN.md                     规划与模板候选
```

## 设计说明

- 风格：暖白纸感 + 墨黑 + 单一陶土 accent；衬线大标题（Instrument Serif / Noto Serif SC）+ 等宽字体（JetBrains Mono）做编号与标签。
- 作品区：每个项目是一张完整的整屏卡（`.project-card`），卡内集中呈现背景、我做了什么、成果、技术栈与 Demo 入口，不再拆成多个悬浮模块。滚动使用 `scroll-snap-type: y proximity`，滑到项目时自动对齐到卡片顶部；右侧圆点导航可快速定位当前作品。窄屏（≤980px）关闭吸附，内容自然流式排布。
- 客服卡使用可复用的 `.project-card--pm` 叙事模板：业务问题与目标 → 我的方案与关键决策 → 结果与验证 → 技术栈；成果数字为主视觉，Demo 收敛为头部单按钮。其他项目暂未套用。
- 高级感手法：大留白、发丝分隔线、easeOutExpo 揭示动画、hover 下划线绘制（不缩放）、明暗双主题。
- 数据真实性：成果数字取自简历 PDF 与项目记录；demo 内为演示数据，页面已标注「静态演示 · 示例数据」。JD Demo 的「26 份分析记录」是固定示例值，不随时间增长，也不作为真实用户量。
- 客服 Demo：聚焦「退款链路」与「业务授权」两条可点击流程，复用真实项目的 Seed 业务数据、权限设计与 Agent 主链；支持逐步发送、自动播放、卡内确认按钮与脚本断言。授权演示明确区分 L0 查询、L2 建单与 L3 人工专属，不将提交申请包装成直接退款。评测中心为静态规则回放，不调用 Agent / 裁判模型，不将回放结果标为实测。
- 智能客服 Demo（`projects/cs-agent/index.html`，源码在 `apps/cs-agent-demo/`）是**静态演示**：基于真实项目的界面与数据做成可点击的静态页面，请求层换成本地 mock（`src/mock/mockApi.ts`，数据存 localStorage），不连任何后端。导航、字段、按钮、弹窗齐全，可看到完整框架。
- 智能 JD 分析 Demo（`projects/jd-analysis/`）是**静态演示**：界面文件（`index.html` / `styles.css` / `app.js` / `score.js` / `archive.js` / `share.js` / `track.js` / `vendor/jsQR.js`）从原项目 `public/` 逐字复制，只多了两层：`mock.js` 把前端原本发给 Express 的请求就地应答（分析、补薪资、补休息、城市数据、简历解析、模型配置等），`mock-data.js` 内联项目自带的样本数据（示例报告、示例 JD、示例简历、11 条参照档案、薪资分布散点、城市社平工资）。浏览器扩展那条路用示例 JD 顶替——演示里「粘贴链接」「上传截图」都能跑出完整报告（总分 85）。不连任何后端、不联网、不调用模型。演示数据来源与生成脚本见 `.workbuddy/gen-jd-mock-data.js`。
- 单文件构建：JS/CSS 全部内联进 `index.html`，双击（`file://`）即可打开，无需本地服务器。若改了源码需重新 `npm run build`。
- Studio 可见逐节点提示词正文与版本，Evaluator 点击卡片可查看判定口径/判据/反馈键/挂载数据集，Observe 与 Review 为会话观察与人工评审页。数据口径：Dataset/Example 用真实 Seed（5 集 / 20 例），会话与信号来自真实 Seed，评测运行为本地静态回放（不调用模型、不伪造实测分数）。

## 修改

- 文案改 `index.html`；配色改 `assets/css/style.css` 顶部 `:root` 与 `[data-theme="dark"]` 变量。
- 智能 JD 分析已按客服卡片的 `.project-card--pm` 模板改写完毕（真实成果数字：175 例回归用例、188 条黑话库、n=38 问卷），演示入口在 `projects/jd-analysis/`。
- 视频平台陪伴 Bot：首页入口指向 `projects/video-companion/demo/index.html`，内嵌横屏互动原型；该页为概念方案，明确标注 Mock 数据与待验证假设。

## 部署到 GitHub Pages

本仓库是静态站，发布源为 `main` 分支根目录。`.gitignore` 采用发布白名单：只提交 `index.html`、`resume.pdf`、`assets/`、`projects/`、`README.md` 与 `/.nojekyll`；`.workbuddy/`、`node_modules/`、内部规划文档和重复 PDF 不进入仓库。

```bash
git init
git add . && git commit -m "portfolio site"
git branch -M main
git remote add origin https://github.com/<username>/<username>.github.io.git
git push -u origin main
# 仓库 Settings → Pages → Source: main / root
```

访问 `https://<username>.github.io`。demo 页面随主站一起部署（相对路径，无需额外配置）。
