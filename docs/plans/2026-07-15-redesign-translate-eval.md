---
title: 翻译评估与主动学习流程实施计划
related-issue: docs/issues/2026-07-15-redesign-translate-eval.md
---

# 翻译评估与主动学习流程实施计划

## 计划目的

本计划实现 `docs/issues/2026-07-15-redesign-translate-eval.md`，将现有静态翻译评价替换为当前标签页内可恢复的主动学习流程，并把 Note 统一为 FSRS 调度单元。

实施必须先完成独立视觉 demo，并由产品负责人明确审查通过。视觉审查通过前，不得开始数据库迁移、正式 LLM 协议或业务路由接入。

## 当前基线

现有实现的关键约束：

- `src/routes/(app)/translate/[id]/+page.svelte` 同时承载作答、提交和静态评价；
- `src/routes/(app)/translate/[id]/+page.server.ts` 在 submit action 中同步调用评价；
- `src/lib/server/translation.ts` 的评价结果只有总体 A/B/C、段落反馈和 rewrite suggestion；
- 当前评价 prompt 已包含两个 few-shot，但示例较简单，不能证明复杂反馈覆盖率；
- `src/lib/server/llm.ts` 的 `chatJson` 只做文本 JSON 抽取、Zod parse 和一次原样重试，不返回 raw content、finish reason 或 usage；
- `translationAttempt` 只有 `draft/submitted/evaluated`，且 `(user_id, source_set_id)` 唯一，不能 retake；
- Note 与 ReviewCard 分离，创建 Note 后还需单独生成 ReviewCard；
- 项目已有 Svelte transition 和 `tw-animate-css`，没有适合多元素时间线与 SVG path drawing 的通用动画包。

## 已确定的技术决策

### 1. 卡片定位

- 不建立 token、offset、sentence index 或模型引用 ID。
- Generation 1 直接返回 `sourceText` 和 `originalAnswer`。
- 服务端只执行 exact containment 校验，不尝试模糊匹配或猜测位置。
- containment 或参考 Diff 校验失败不否决整份评价，而是产生服务端派生的 warning。
- 总体页只高亮能够精确匹配的 `originalAnswer`。

### 2. Generation 1

- 评价、评分、全部卡片和参考 Diff 保持一次逻辑生成。
- 结构/评分/截断错误是致命错误；文本匹配或单卡参考 Diff 错误是非致命 warning。
- 允许带错误反馈的有界 repair，但不把正常生成拆成多次业务调用。
- Prompt 方案必须用真实模型比较 shape-only 与 representative few-shot，不能凭主观选择。

### 3. 动态验证

- 每张卡最多两次教学尝试，无 Ignore。
- 对比“只提供当前 card、排除参考答案”和“复用完整 Generation 1 历史”两种上下文，按严格性、缓存收益与答案泄露实测选择。
- reject 只返回对本次尝试的 `feedback`；accept 只返回 `acceptedDiff`。
- provider、配额、解析和 Diff 重建错误不消耗教学尝试次数。

### 4. Diff

- 模型生成受限类 XML；服务端解析为 AST 并重建 old/new 文本。
- Generation 1 每张卡同时产出 `minimalDiff`、`referenceDiff` 与 `teachersNote`（母语讲解本句问题与语言点）。
- Prompt/few-shot 要求**语块级** Diff（可迁移短语/搭配），禁止逐词碎拆，也避免几乎整句单一 replace。
- UI 不使用 `{@html}` 渲染模型标记；无 “Suggested revisions” 装饰总标题；`teachersNote` 与 Diff 同区展示。
- accept 态只展示 accepted Diff + reference Diff + teachersNote，不展示 Your revision 纯文本；窄屏纵向堆叠。
- second reject 先 minimal Diff 再 reference Diff，并展示 teachersNote；任一非法 Diff 对应纯文本降级。accepted Diff 无效时不确认教学结果，保留输入供原样重试。
- 迁移练习揭示前不展示 targetPattern。
- 二稿底部只展示模型 commentary（无固定 resolved/unresolved 文案），带平滑进入动画。
- 所有会调用 LLM 的交互在 demo 中用约 2s 固定等待态演示（正式实现仍以真实请求时长为准，动画为 indeterminate）。

### 5. Note

- Note 直接持有 FSRS state。
- 模型内容只有单个 `targetPattern`、`explanation` 和四个 exercises。
- exercises 作为子记录；Review log 直接引用 Note。
- 所有 Note 写入来源一次性切换到完整统一 contract，不保留“先 Note、后 ReviewCard”的新写入路径。

### 6. 动画

- 新增 `motion` 包。
- `motion` 负责 SVG pathLength、跨元素时间线、提示替换和阶段级编排。
- 简单 enter/exit 继续使用 Svelte 原生 transition。
- 不引入 `svelte-motion`；除非视觉 demo 证明 Motion 无法满足已批准效果，否则不引入 GSAP。

### 7. 最小持久化与显式 Generation 2

- 数据库只保存首稿、结构化 Generation 1、最终 Notes/variants、`practiceGeneratedAt` 和 `completedAt`。
- 卡片进度、二稿和 overview gate 只保存在一个 versioned `sessionStorage` snapshot。
- 不新增 evaluation/card/second-draft/job 过程表，也不建立 workflow phase 状态机。
- Generation 2 由浏览器进入全文二稿时显式调用普通 server action；右上角胶囊持有 generating/failed/ready 状态。
- 不实现轮询、后台 runner、heartbeat、stale reclaim、请求池或 Finish for now。

---

# 一、目标模块划分

以下为计划中的职责边界，实际文件可在实现时按现有结构微调，但不得重新形成单个超大 page/service 文件。

## 客户端与组件

```text
src/lib/components/translate-evaluation/
  EvaluationWaiting.svelte
  EvaluationOverview.svelte
  CorrectionCard.svelte
  CorrectionResult.svelte
  DiffView.svelte
  SecondDraft.svelte
  TransferPractice.svelte
  motion.ts
  types.ts

src/lib/client/
  translation-feedback-snapshot.ts
  translation-highlight.ts

src/routes/(app)/translate-eval-demo/
  +page.server.ts
  +page.svelte
  fixtures.ts
```

`translate-eval-demo` 必须 dev-only；生产环境 load 返回 404。该路由保留为后续视觉回归和状态审查入口，不进入正常导航。

## 服务端

```text
src/lib/server/translation.ts
  保留 source set、candidate 和 attempt 创建职责

src/lib/server/translation-evaluation/
  schema.ts
  prompt.ts
  diff.ts
  generation.ts
  validation.ts
  verifier.ts
  practice-generation.ts
```

若实现中发现目录拆分导致循环依赖，可按 `generation / verifier / diff` 三个稳定边界收敛，但 LLM prompt、Diff parser 和数据库写入不得继续堆入 route action。

## 数据层

计划新增或重构：

- `translationAttempt`；
- unified `note`；
- `noteExerciseVariant`；
- 直接引用 Note 的 `reviewLog`。

明确不新增 `translationEvaluation`、`translationCorrectionCard`、`translationSecondDraftAnswer`、`translationNoteJob` 或 `noteSourceCorrectionCard`。Generation 1 继续作为 JSON 保存在 `translationAttempt.evaluation`；card ordinals 只在生成结果校验时使用。

---

# 二、数据与状态设计

## 2.1 数据库中的最小 attempt 状态

复用现有 `translationAttempt.status`：

- `draft`：首稿未提交；
- `submitted`：首稿已保存，Generation 1 尚未成功；
- `evaluated`：结构化 Generation 1 已保存。

不增加 feedback workflow phase。`translationAttempt` 只新增或保留：

- `evaluation` JSON；
- `submittedAt`；
- `evaluatedAt`，同时作为评价版本；
- `practiceGeneratedAt`；
- `completedAt`；
- `updatedAt`。

数据库不保存 Generation 1 error/running、overview gate、card index/attempt/result、second draft 或 Generation 2 loading/error。

删除当前 `(user_id, source_set_id)` 永久唯一约束，改为只约束 `(user_id, source_set_id) WHERE completed_at IS NULL`。历史 completed attempts 可并存；未完成 attempt 不能 abandon 后新建。

## 2.2 Generation 1 JSON

`translationAttempt.evaluation` 保存最终通过致命校验的完整结果：

- `overallCommentary`；
- 六项 ratings；
- cards；
- 每张卡的服务端派生 validation warnings。

raw request messages、raw assistant content、usage 和 provider metadata 只用于当前请求的校验、repair 和日志，不写数据库。

整体重新生成在事务外完成。新结果通过致命校验后，用一次 update 替换 `evaluation` 并更新 `evaluatedAt`；失败时旧 JSON 和旧 `evaluatedAt` 不变。`practiceGeneratedAt` 已存在时拒绝重新生成，避免 Notes 与评价版本失配。

## 2.3 当前标签页 snapshot

建立一个 versioned、attempt-scoped `sessionStorage` snapshot：

```ts
type TranslationFeedbackSnapshot = {
	schemaVersion: number;
	attemptId: number;
	evaluatedAt: string;
	step: "overview" | "cards" | "second-draft" | "transfer";
	overviewConfirmed: boolean;
	currentCardIndex: number;
	cards: LocalCorrectionState[];
	secondDraft: LocalSecondDraftState;
	transfer: LocalTransferState;
};
```

实现时为 nested state 定义最小 Zod schema，并限制字符串/数组长度。每次被接受的 verifier 结果、card navigation、二稿编辑/验证和迁移 rating 成功后更新 snapshot。

加载规则：

1. key 按 attempt ID 隔离；
2. schemaVersion、attemptId 和 `evaluatedAt` 必须匹配；
3. card 数量/索引必须与当前 evaluation 相容；
4. 解析或校验失败时删除 snapshot，从 overview 开始；
5. 整体重新生成成功时删除旧 snapshot；
6. completed 后删除 feedback snapshot。

新标签页、跨设备或 storage 被清理时没有恢复保证，复用已保存 evaluation 并从 overview 开始。

## 2.4 普通 verifier action

correction verifier 不写教学进度表。请求提供 attempt ID、`evaluatedAt`、card ordinal、当前本地 attempt number 和用户输入。

服务端：

1. 验证所有权、attempt 为 evaluated、评价版本和 card ordinal；
2. 从 evaluation JSON 读取 card，不接受客户端回传 source/hint/reference；
3. 事务外调用 LLM；
4. 返回经过 schema 与 Diff 校验的 accept/reject；
5. 不保存输入、feedback、accepted Diff 或 attempt count。

页面只有在收到有效结果后才更新本地 attempt count 和 snapshot。请求中断或 provider/parse 错误时本地状态不前进。重复请求可能增加一次模型调用，但没有重复数据库副作用。

## 2.5 显式 Generation 2 action

进入二稿时，浏览器自动调用 `generatePractice`，而不是创建 job。

服务端流程：

1. 验证 attempt 所有权和 evaluated 状态；
2. 若 `practiceGeneratedAt` 已存在，直接读取并返回已有 Notes；
3. 读取 evaluation JSON 和开始时的 `evaluatedAt`；
4. 事务外调用 LLM 并校验全卡 coverage、Note 和四 variants；
5. 短事务中条件更新 `practiceGeneratedAt`：要求其仍为 NULL 且 `evaluatedAt` 未变化；
6. 同一事务插入 Notes、variants 和 attempt source；失败全部回滚；
7. 条件未命中时区分“其他请求已成功”和“评价已变化”，分别返回已有结果或 409。

生成中的 Promise、error 和 Retry 状态只存在于右上角胶囊。没有 polling、runner、heartbeat、claim table 或 persisted failure。

## 2.6 完成与 retake

迁移练习完成后由普通 action 设置 `completedAt`。无 cards 时，总体评价 Continue 直接设置 `completedAt`。只有 completed attempt 可创建 retake；每个 user/source set 最多一个未完成 attempt。

---

# 三、LLM 与解析设计

## 3.1 LLM 返回元数据

在 `src/lib/server/llm.ts` 增加不破坏现有调用者的 detailed JSON 接口，返回：

```ts
type StructuredChatResult<T> = {
	value: T;
	rawContent: string;
	finishReason: string | null;
	model: string;
	usage: unknown;
	quota?: TrialQuotaStatus;
};
```

现有 `chatJson` 可以继续返回 `value`，但其实现应复用 detailed path。

## 3.2 Repair

初始输出依次经过：

1. JSON 提取；
2. Zod schema；
3. ratings、重复卡片、Diff 重建等领域校验。

致命错误时最多执行有界 repair。repair messages 必须附加：

- 原始 assistant 输出；
- 机器可读或逐条列出的错误；
- “返回完整修复对象，不返回 patch/解释”的指令。

不得原样重发同一请求。`finish_reason: length` 不进入 repair，直接作为完整生成失败处理。

非致命 containment/Diff warning 不触发自动 repair，以免一次匹配问题导致模型悄悄改写整份评价。用户在总体页决定整体重新生成或继续。

## 3.3 Structured output 兼容

文本 JSON + 本地校验是所有 provider 的 correctness baseline。

如果后续配置能够明确声明 provider/model 支持 JSON Schema response format，可以在 detailed path 中启用；本 issue 不做不透明的自动能力探测，也不让 correctness 依赖该参数。遇到不支持 structured output 的 BYOK provider 时不应失败。

## 3.4 Generation 1 prompt

Prompt 分为：

1. tutor 角色、语言方向和评价标准；
2. 卡片选择原则；
3. 两级提示防泄露规则；
4. Diff 语法；
5. 最小 JSON contract；
6. representative few-shot；
7. real task 数据。

Few-shot 至少包含：

- 一份高密度但不人为拆碎的问题译文；
- 一份无需改错卡的高质量译文；
- 正确复制 `sourceText/originalAnswer` 的示范；
- 合并同一句中 minor 与主要问题的示范；
- 合法 reference Diff。

真实样例 `docs/references/2026-07-15.md` 用于评测，不直接整份塞入生产 few-shot，以免固定 token 成本过高。

## 3.5 Verifier prompt

使用真实模型比较两种上下文：

- 方案 A：只发送当前 card 的必要字段、已展示提示、用户尝试、语境和语言方向；
- 方案 B：复用完整 Generation 1 message history，再增加 verifier system instruction 和用户尝试，以评估 prefix cache、判断质量和泄露风险。

两种方案都必须正确区分 system/user/assistant role。评测记录 accept/reject 准确性、自然度严格性、答案泄露、延迟和 token；最终方案由结果决定，不在实现前假定完整历史一定更优。

Few-shot 覆盖：

- 接受与参考答案不同的自然同义表达；
- 拒绝仍然改变原意的尝试；
- 拒绝 feedback 说明“实际表达了什么”，但不给正确句子；
- 新引入明显语法/语义错误；
- accept 时生成可重建 accepted Diff。

## 3.6 Diff parser

实现手写、单遍、长度受限的 parser，不引入完整 XML/HTML parser。输出 AST：

```ts
type DiffPart =
	| { type: "unchanged"; text: string }
	| { type: "delete"; text: string }
	| { type: "add"; text: string }
	| { type: "replace"; from: string; to: string };
```

Parser 必须：

- 只接受 issue 指定标签；
- 正确 decode 允许的 XML entities；
- 拒绝属性、未知标签、错误嵌套、缺失 closing tag 和超长内容；
- 同时返回 reconstructed old/new；
- 不依赖正则处理任意嵌套；
- 不输出 HTML。

---

# 四、分阶段实施

## 阶段 0：建立基线与保护边界

### 工作

- 运行现有 `pnpm check`、`pnpm test`，记录基线。
- 补齐当前 translation submit/retry/ownership 的缺失回归测试，确保重构期间不会重复保存首稿或 candidate vote。
- 列出所有 Note、ReviewCard、ReviewLog 的读写入口，形成迁移清单。
- 确认真实 LLM 评测只在显式命令下运行，不进入默认 CI。

### 退出条件

- 现有测试通过；
- 全局 Note/ReviewCard 调用点清单完整；
- 没有开始数据库或正式工作流修改。

## 阶段 1：独立可交互视觉 demo（硬门槛）

### 工作

- 安装 `motion`，更新 `package.json` 和 lockfile。
- 建立 dev-only `/translate-eval-demo`。
- 使用固定 fixtures 和状态切换器实现：
  - evaluating；
  - evaluated 两栏布局；
  - 全部匹配；
  - 部分匹配失败 + 整体重新生成；
  - card initial；
  - first reject；
  - accept dual diff；
  - second reject reference diff；
  - provider error；
  - no cards；
  - second draft + 右上角生成胶囊；
  - 胶囊 generating、failed/retry、ready；
  - 二稿已完成但迁移练习尚未 ready；
  - desktop/mobile/reduced-motion。
- 使用真实项目字体、颜色、Button 和 i18n 风格，不做脱离项目设计系统的概念稿。
- 提供隐藏/显示开发状态切换器的能力，方便纯视觉审查。
- 检查动画中断、快速切换状态和组件销毁后的 cleanup。

### 动效实现边界

- Motion：SVG `pathLength`、阶段 timeline、荧光笔 reveal、提示/结果容器编排。
- Svelte transition：局部 fade/slide 和简单 keyed 内容替换。
- 所有 Motion controls 在 `$effect` cleanup/onDestroy 中取消。
- reduced-motion 不启动循环 timeline，不只把 duration 设得极短。
- 生成胶囊在桌面端固定于右上安全区，移动端位于 header 下方且不遮挡输入；reduced-motion 使用静态分段环和 live text，不旋转。

### 审查材料

- 桌面视口完整流程；
- 约 390px 移动视口完整流程；
- reduced-motion；
- 匹配 warning；
- accept/reject 两条路径；
- 迁移练习胶囊的 generating/failed/ready 和二稿等待状态；
- 动效 timing/easing 清单。

### 退出条件

- `pnpm check`、`pnpm test` 通过；
- 产品负责人明确回复视觉 demo 通过；
- 未获批准时，本计划停在此阶段，不得进入阶段 2。

## 阶段 2：LLM 协议、Diff parser 与真实模型 A/B

### 工作

- 实现 detailed JSON result 和定向 repair。
- 定义 Generation 1、verifier、Generation 2 schema。
- 实现 Diff parser、AST、重建校验和 safe renderer contract。
- 为 Generation 1 制作 shape-only 与 few-shot 两种 prompt 版本。
- 新增显式 live-eval harness，使用 `.env` 模型和 `docs/references/2026-07-15.md`。
- 每个 prompt 版本至少重复运行三次；记录：
  - parse 成功；
  - fatal validation；
  - warning 数量；
  - 高价值问题覆盖；
  - 是否过度拆卡；
  - 无问题句误报；
  - 输出语言；
  - token/延迟。
- 根据结果，分别不断调整迭代各提示词，最终根据结果比较确定生产 prompt；评测结论写入计划实施记录。

### 测试

- JSON 提取和 repair 单元测试；
- finish reason/usage/raw content 测试；
- Diff entity、未知标签、错误嵌套、超长输入和 reconstruction 测试；
- schema 与 fatal/warning 分类测试；
- prompt message 结构测试；
- live harness 不在默认 `pnpm test` 中调用外部模型。

### 退出条件

- parser/validator 单元测试通过；
- 真实模型 A/B 有可复查结果；
- 选定 prompt 在重复运行中满足 issue 的解析和教学覆盖要求。

## 阶段 3：核心数据库与 workflow service

### 工作

- 修改 `translationAttempt.evaluation` JSON contract，并新增 `practiceGeneratedAt`、`completedAt`。
- 修改 attempt 唯一约束以支持 retake。
- 使用 `pnpm db:generate --name redesign_translation_evaluation` 生成迁移，不手写绕过 schema。
- 复用 `draft/submitted/evaluated`；不实现新 phase 状态机或过程表。
- 实现同步 Generation 1 submit/retry：失败保持 submitted，成功写 evaluation/evaluatedAt。
- 实现整体 regenerate 的“保留旧结果直到新结果成功”语义。
- `practiceGeneratedAt` 已存在时拒绝 regenerate。
- 更新 Translate 列表和 Archive：`evaluated` 且 `completedAt` 为空表示“继续反馈”，只有 `completedAt` 非空才表示已完成并允许 retake。
- 将 route action 保持为解析输入、鉴权、调用 service 和映射错误的薄层。

### 测试

- 所有权和模板边界；
- submit 幂等；
- Generation 1 failure/retry；
- fatal result 不落部分数据；
- warning result 正常落库；
- regenerate 成功/失败和旧结果保留；
- Notes 已生成后 regenerate 409；
- 仅一个 unfinished attempt，completed 可 retake。
- Translate 列表/Archive 不把仅完成 Generation 1 的 attempt 误标为整套流程已完成。

### 退出条件

- migration 可应用到空开发数据库；
- service 测试覆盖 submit/evaluate/regenerate/complete 边界；
- schema 中不存在本计划明确排除的过程表和 phase 字段。

## 阶段 4：评估等待页与总体评价正式接入

### 工作

- submit 发起普通显式请求并进入独立 waiting UI，不再停留在作答表单。
- 请求失败后 attempt 保持 submitted，页面展示 Retry；不接入 polling。
- 把批准的 EvaluationWaiting/EvaluationOverview 组件接入正式 translate route。
- 实现 exact-match highlight interval 合并；不做模糊匹配。
- 实现 warning、整体 regenerate、本地 Continue gate 和 no-cards completion。
- 建立 versioned session snapshot；校验失败或 evaluation version 变化时回到 overview。
- 所有静态 copy 加入 `src/lib/i18n.ts`。

### 测试

- route load 能区分 draft/submitted/evaluated；
- highlight 对重复、重叠、无法匹配文本的行为确定；
- warning 与 regenerate action；
- snapshot schema/version/损坏/过期清理；
- no-cards；
- focus movement、live region 和 reduced-motion helper。

### 退出条件

- 正式页面与已批准 demo 在布局、颜色和 motion token 上一致；
- 刷新 submitted 状态不回到可编辑首稿；evaluated 状态按有效 snapshot 恢复或回到 overview。

## 阶段 5：改错卡片与动态 verifier

### 工作

- 接入 CorrectionCard/CorrectionResult/DiffView。
- 实现空输入初始态、两次尝试、提示替换和 provider retry。
- verifier action 按 attempt ID、evaluatedAt 和 card ordinal 从 evaluation JSON 取上下文。
- accept 时验证 accepted Diff，再更新内存和 session snapshot。
- first reject/second reject 只更新内存和 session snapshot。
- second reject 先揭示 minimal Diff 再 reference Diff；非法时分别纯文本降级。
- accept 态仅双 Diff，无 Your revision 纯文本块；窄屏堆叠布局。
- 所有卡完成后进入二稿，并由浏览器立即调用 Generation 2 action。

### 测试

- verifier 两种上下文方案的真实模型质量与泄露 A/B；
- accepted synonym；
- first reject；
- second reject/reveal；
- provider/parse error 不计数；
- reload 从 snapshot 恢复输入 gate、feedback 和结果；
- evaluatedAt 不匹配返回 409 并清理旧 snapshot；
- DiffView 无 `{@html}`，可访问文本完整。

### 退出条件

- 两条主要路径（accept、两次 reject）均有可证实的服务端状态测试和浏览器验证；
- card 内容不信任客户端回传，但 attempt count/passed/revealed 明确属于本地教学状态。

## 阶段 6：统一 Note/FSRS 全局切换

### 工作

- 重构 `note` 为 targetPattern/explanation + FSRS state。
- 新增四个 exercise variants 和 source relations。
- review log 改为直接引用 Note。
- 更新所有 Note 生成 schema 和 prompt，使其一次返回完整 Note + 4 variants。
- 更新沉浸式反馈、selection save、tutor Q&A 等所有写入路径。
- 更新 Archive、Review、cards management/API/stats/source deletion。
- 删除独立 create-card generation action 和旧 ReviewCard 表/服务。
- 翻译 Note 只关联 attempt；不新增 correction-card provenance 表。
- 模型调用和校验在事务外，完整写入在短事务内。

### 测试

- 每个来源：零 Note 和完整 Note 两条路径；
- 四 variants、ordinal 唯一和 source exactly-one；
- 模型失败不产生半成品；
- FSRS update + review log 同事务；
- Archive/Review/API/stats 使用 Note；
- 来源删除 cascade；
- 编辑 Note 不重置 FSRS。

### 退出条件

- `rg` 不再发现生产代码写入旧 ReviewCard；
- 全部 Note 来源都满足统一 contract；
- 旧开发数据可清空后完整启动应用。

## 阶段 7：Generation 2 与全文二稿

### 工作

- 实现 Generation 2 prompt、全卡 coverage 校验和 Note consolidation。
- 实现普通 `generatePractice` server action 和条件原子 Note 写入。
- 进入二稿时由浏览器自动发起 action；不使用后台 runner 或 polling。
- 实现右上角胶囊的 generating、failed/retry 和 ready 状态；环形动画明确为 indeterminate。
- 接入全文二稿，从不可变首稿初始化。
- 实现 second draft verifier（完整 Generation 1 history + system 指令 + 用户二稿；返回 per-card resolved + commentary）、unresolved 标记、重交和 confirmed skip，并写入 session snapshot。
- pass/unresolved/commentary UI 放在底部提交区上方；二稿 textarea 最小高度 + 随内容自动增高。
- 二稿与 Generation 2 请求并行；二稿完成但 Notes 未 ready 时禁用 Continue，要求等待或从胶囊 Retry。
- 组件销毁时 abort 浏览器请求；服务端即使完成也可由下一次 action 识别并返回已有 Notes。

### 测试

- sourceCardOrdinals 完整、无重复、无遗漏；
- 每个 Note 恰好四 variants；
- 已有 `practiceGeneratedAt` 时不重复调用模型；
- 两个并发 action 最多一份结果落库；
- generation 期间 `evaluatedAt` 变化时旧结果不落库；
- failed 状态可从胶囊重试，错误不写数据库；
- reload 后若 Notes 已提交则直接 ready，否则恢复二稿时重新发起 action；
- model call 不持有事务；
- 二稿检查 passed + revealed 全部 cards；
- 二稿 provider error 与 pedagogical failure 分离；
- 二稿 snapshot 恢复和损坏降级；
- 二稿完成但生成未 ready 时不能进入迁移练习。

### 退出条件

- 代码中没有 Generation 2 job、polling、runner、heartbeat 或 stale reclaim；
- 用户可在编辑二稿时观察生成状态，并能从胶囊显式重试；
- 请求中断、重复请求和评价版本竞争都有确定行为。

## 阶段 8：迁移练习与普通 Review variant rotation

### 工作

- 实现 attempt-scoped `sessionStorage` transfer queue。
- typed answer 后才能 reveal。
- Incorrect/Pass 映射 Again/Hard。
- 失败 Note 使用未见 variant 回队尾，四次 Incorrect 后 deferred。
- 普通 Review 实现持久化 shuffle bag 和避免立即重复。

### 测试

- sessionStorage parse/version/损坏降级；
- typed-before-reveal gate；
- pending request 禁用 rating；
- request failure 不前进；
- 四次 Incorrect deferred；
- Pass 立即完成；
- normal review 四 variants 轮换；
- FSRS transaction 正确。

### 退出条件

- transfer 不新增数据库 session/queue 表；
- 所有 rating 都有事务测试；
- pending rating request、failed request 和 deferred 不出现空白页。

## 阶段 9：整体验证、清理与交付

### 工作

- 使用 `docs/references/2026-07-15.md` 的例子完整测试一遍全流程，而三阶段中多测试几种用户的输入情况，确保提示词设计足够良好，使得模型能给予足够严格的和内容丰富的评价。
- 删除被新流程替代的静态评价组件、旧 action、旧 schema 和死代码。
- 检查所有临时 flag、mock 数据和调试日志。
- 完成本地化四种 UI 语言。
- 浏览器检查 desktop/mobile、键盘、screen reader 语义和 reduced-motion。
- 对真实参考样例再次运行最终 prompt，确认实现后没有质量回退。
- 更新项目本地 `AGENTS.md`，只记录真正影响未来开发的最终架构事实。
- 向用户申请移除 dev-only demo。

### 最终验证

```sh
pnpm check
pnpm test
pnpm build
```

另行执行显式 live LLM eval，不把外部调用混入默认测试。

### 退出条件

- issue 验收标准全部有对应测试或人工验证证据；
- 默认测试、类型检查和 production build 通过；
- 没有未使用依赖、旧 ReviewCard 写入、临时服务或遗留的后台 generation 状态；
- 视觉实现与已批准 demo 一致。

---

# 五、测试矩阵

| 层级        | 重点                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| 纯函数      | Diff parser/reconstruction、highlight interval、sessionStorage、ratings/schema           |
| LLM adapter | raw metadata、finish reason、repair messages、quota、BYOK fallback                       |
| Service     | ownership、evaluation version、warning/fatal、regenerate、显式生成并发、FSRS transaction |
| Route       | form validation、错误状态映射、snapshot 恢复/降级、no-card                               |
| Component   | 所有 demo 状态、Diff accessibility、focus、reduced-motion                                |
| Live LLM    | parse 稳定性、参考问题覆盖、few-shot A/B、语言方向、泄露检查                             |
| Browser     | desktop/mobile、快速交互、动画 cleanup、键盘、生产 demo 404                              |

时间相关测试使用固定日期，不使用运行时 `new Date()` 作为断言边界。数据库测试按项目约定 mock `$lib/server/db`，迁移和约束另用可控开发数据库验证。

---

# 六、风险与控制

## 模型复制文本不精确

控制：exact containment 只产生 warning；总体页明确提示、允许整体重新生成；Continue 后不再改变学习内容；不做模糊猜测。

## 不设卡片数量上限导致输出过长

控制：应用限制总输入长度；使用足够 completion budget；检查 finish reason；截断视为致命失败；prompt 要求只生成真正需要改进的句级卡片并合并同句问题。

## verifier 上下文在判断质量、缓存与答案泄露之间存在取舍

控制：真实模型比较局部 card 上下文和完整 Generation 1 历史；同时记录严格性、同义 accept、答案泄露、token 和延迟，不以字符串相等或单次主观结果选择方案。

## 单次 Generation 1 输出复杂

控制：最小字段、代表性 few-shot、Zod、领域校验、定向 repair、raw/finish metadata；取消 token ranges、issue refs 和多层说明字段。

## 显式 Generation 2 请求被刷新或断网中断

控制：生成状态只属于当前 Promise；重新进入二稿时普通 action 先检查 `practiceGeneratedAt`；最终写入比较 `evaluatedAt` 并使用条件更新，允许重复模型调用但最多写入一份结果。

## 全局 Note 切换范围大

控制：先建立统一 schema/service，再逐一切换生产读写点；通过 `rg` 清单和测试证明没有旧写入后才删除旧表。

## 动画残留或降低可访问性

控制：Motion controls cleanup；reduced-motion 分支不启动循环；批准 demo 作为正式实现基线；focus/live region 独立于动画完成回调保证。

---

# 进度追踪和实施记录

## 阶段 1

- Demo 路由：`/translate-eval-demo`（仅开发环境；生产 load 返回 404）
- 组件目录：`src/lib/components/translate-evaluation/`
- 覆盖场景：evaluating / evaluating-failed / evaluated match / warning+regenerate / no-cards / card initial / first reject / accept dual-diff（无 Your revision 纯文本） / second reject minimal+reference Diff / provider error / second draft capsule generating·failed·ready / draft done waiting practice / transfer / complete；侧栏可切换 390px 与 reduced-motion
- 产品复审反馈（已写入 issue）：句级高亮、accept 仅双 Diff、second reject minimal Diff、细粒度 Diff、二稿底部 status + history/commentary verifier、textarea 自动增高
- 动效：`motion` 编排等待页 SVG pathLength 循环与 overview 入场/荧光笔；局部 enter/exit 用 Svelte transition；Motion controls 在 `$effect` cleanup 中 stop

用户审查：经若干轮修改，通过
