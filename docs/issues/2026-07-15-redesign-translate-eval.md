---
title: 重设计翻译评估与主动学习流程
type: feature
status: done
link: https://github.com/Mapleshade20/libiamo-fullstack/issues/72#issuecomment-4972196146
---

# 重设计翻译评估与主动学习流程

## 背景

当前翻译任务已经具备按段展示原文提示和目标语言输入的作答界面，但提交后的体验仍然是一份静态报告。学习者只需阅读模型给出的评价和改写，不需要主动修正、重新组织全文，也不会自然进入后续复习。

上一版设计试图通过 uncertainty/confidence 标记、canonical token stream、token range、实时 token diff 和多级 reveal gate 精确定位每一个问题。实际验证表明，这套协议过重：

- 模型需要同时生成复杂 JSON、token 范围、问题层级和多组说明，结构与语义校验经常失败；
- token 级定位和实时 diff 的工程成本很高，但对句级改写练习帮助有限；
- confidence 标记没有形成足够明确的教学价值；
- `title`、`summary`、多组近义说明字段缺乏清晰展示位置；
- UI 状态和字段数量过多，使视觉实现退化为普通表单切换，难以形成连续、克制且具有编辑感的体验。

本 issue 改为以“句级改错卡片”为核心的主动学习流程。模型直接生成卡片需要展示的原文、用户原始作答、两级提示、参考译文和最小改动 LLM Diff。系统不再建立 token 定位协议，不再让学习者标记 confidence，也不再计算实时 diff。

本 issue 同时保留全文二稿、Note 生成、迁移练习、**服务端 `workflowPhase` 粗粒度续做**、改错阶段内细进度的标签页 snapshot，以及全局统一 Note/FSRS 模型。路由对齐沉浸式任务：详情页 → 作答 / 评估分页面。

### 设计拍板（grill 共识）

| 主题 | 决定 |
| --- | --- |
| Gen1 history | 成功 Gen1 的 request messages + assistant raw 落库；二稿通过/确认跳过并进入 `transfer` 时清空；无卡直接完成时同事务清空；放弃时随 attempt 删除 |
| Verifier 上下文 | Correction Verifier 仅发送当前 card trusted context；Second Draft Verifier 拼 DB 中成功 Gen1 history + 本轮新消息；verifier 对话本身不持久化 |
| Diff | 信任 LLM 输出；受限 parser 防注入，非法则纯文本降级；**不做** old/new 与原文的恒等重建核验 |
| 阶段 | 单一 `workflowPhase`：`draft` → `submitted` → `correction` → `second_draft` → `transfer` → `completed`；总览是 correction 内首个 UI step，不是独立 phase |
| 细进度 | correction 内总览 gate、卡片位置/尝试/输入/feedback/Diff，二稿正文、迁移队列 → `sessionStorage` only；无 snapshot 的 correction 恢复到总览 |
| 路由 | `/translate/[id]` 详情；`/translate/[id]/attempt` 作答；`/translate/[id]/feedback` 评估；当前母语范围内优先唯一未完成 attempt，否则取最新 completed；不提供旧 completed 完整反馈入口 |
| Retake | 未完成也可在**详情页**确认后放弃；物理删除 attempt 并 cascade Notes；评估页刷新不弹选择 |
| 迁移评分 | Incorrect → `Rating.Again`；Pass → `Rating.Good` |
| 改错 Skip | **禁止** Ignore/Skip，必须两次尝试或通过 |
| Note | 本 issue 内**所有**来源统一 `vocab` + 目标语释义 + 母语释义 + JSON 例句；Note 本身是 FSRS 单元，不再存在 exercise variant 子表或轮换游标 |
| 匹配 | `sourceText`/`originalAnswer` exact containment + 不重叠分配；失败 soft warning |
| 长度 | 不设固定字符数或卡片数产品上限；所有模型统一使用 40k token 调用预算，提交事务前预检，超限保持 `draft`；completion 截断 = 整次失败可 Retry |
| 反馈语言 | Profile 设置 `native` / `target`，默认 `native`；翻译评估与传统 task feedback 共用；每次反馈生成时解析并冻结具体语言 |

## 目标

- 将静态翻译报告改为“总体评价 → 句级主动改写 → 全文二稿 → 迁移练习”的学习流程。
- 让学习者在看到参考译文前最多进行两次自主修改。
- 模型拒绝修改时，只评价用户刚刚提交的尝试，不泄露或暗示标准答案。
- 使用 LLM 生成的受限类 XML 标记渲染 Diff；parser 保证安全渲染，不要求重建文本恒等。
- 只保留有明确展示位置、校验用途或调度用途的模型字段。
- 将 Note 直接作为 FSRS 调度单元；所有 Note 来源一次 LLM 写满词汇、双语词典释义和自然例句。
- 服务端 `workflowPhase` 支持从阶段起点恢复；改错细状态仅当前标签页 snapshot。
- 详情页提供继续评估 / 放弃重做；评估子路由内刷新只按 phase 恢复。
- 允许用户在 Profile 选择 LLM 教学反馈使用母语或任务目标语言，并统一应用于翻译评估、传统 task feedback 和对应追问。
- 提供 dev-only live review demo，使用 `docs/references/2026-07-15.md` 的完整样例真实调用固定 few-shot Gen1，并让产品直接审阅完整 prompt、原始响应和正式 UI 反馈。
- 业务实现前独立视觉 demo 已通过产品审查（阶段 1 完成）。

# 1. 完整工作流

## 1.1 路由

对齐 `/task/[id]` 模式：

| 路径 | 职责 |
| --- | --- |
| `/translate` | 大厅列表 |
| `/translate/[id]` | 模板/任务**详情页**（`id` = template id）。主 CTA 按 phase 导航到 attempt 或 feedback；可提供「放弃并重做」 |
| `/translate/[id]/attempt` | **作答**。仅 `draft`（及合法进入条件）；服务端自行解析当前用户对该 source set 的未完成 attempt，**URL 不含 attempt id** |
| `/translate/[id]/feedback` | **评估全流程**（waiting / correction〔总览+句级改错〕/ second_draft / transfer）。服务端按 phase 和可选 snapshot 渲染子视图；状态不对则 redirect 到正确路径 |

详情页进入按钮：

- 无 attempt 或 `draft` → `/attempt`
- `submitted` … `transfer` → `/feedback`（继续评估）
- `completed` → 可查看反馈（只读/回顾）或「再做一次」新建 attempt

**仅在详情页**对未完成 attempt 提供确认后的「放弃并重做」。在 `/attempt` 或 `/feedback` 内刷新**不**弹出 retake 选择，只按当前 phase 恢复。

服务端解析 attempt 时必须限定当前用户、template 和当前 `nativeLanguage` 对应的 source set：

1. 存在非 `completed` attempt 时选择该唯一记录；
2. 否则选择最新的 `completed` attempt；
3. source set 从选中的 attempt 反向解析，不先选择“最新 source set”；
4. 创建 retake 后，活动 attempt 覆盖之前 completed 的完整反馈入口；旧 completed 仅保留作统计/历史数据，本 issue 不提供旧反馈选择器。

## 1.2 `workflowPhase`

```text
draft
  ↓ submit first draft
submitted                    # Gen1 未成功；feedback 显示 Retry
  ↓ Gen1 success
correction                   # 起点是总览；Continue 后进入句级改错，细进度 sessionStorage
  ↓ last card terminal
second_draft                 # 进入时浏览器调用 generatePractice
  ↓ pass or confirmed skip
transfer                     # Notes 未 ready 则页内等待胶囊；不退回 second_draft
  ↓ transfer queue finished
completed
```

无改错卡时：correction 总览 Continue 直接 → `completed`（不进句级改错 / second_draft / transfer / Gen2），并在同一事务清空 `generation1Messages`。

## 1.3 阶段内 UI 流

```text
submitted: EVALUATION_PENDING / RUNNING | FAILED→RETRY
correction: EVALUATION_OVERVIEW
            ├ VALIDATION_WARNING → REGENERATE_WHOLE_EVALUATION
            └ CONTINUE → CORRECTION_CARDS | NO_CARDS → completed
            每张卡 INITIAL_HINT + EMPTY_INPUT
            ├ ACCEPT → DUAL_DIFF_RESULT
            └ FIRST_REJECT → FEEDBACK + DEEPER_HINT
                 ├ ACCEPT → DUAL_DIFF_RESULT
                 └ SECOND_REJECT → FEEDBACK + minimalDiff + referenceAnswer
second_draft: 并行 Gen2 胶囊；PASS | MODIFY_AND_RESUBMIT | CONFIRM_SKIP
transfer:     等待 Notes ready 后迁移；Incorrect/Pass
completed
```

---

# 2. 作答与提交

作答仅在 `/translate/[id]/attempt`。保留现有按段作答布局。

提交时：

1. 服务端验证 attempt 所有权和答案完整性；
2. 使用与实际 prompt 相同的数据估算调用 token；所有模型统一执行 **40,000 token 调用预算**。超限则返回字段/表单错误，attempt 保持 `draft`，用户可缩短首稿；
3. 解析用户反馈语言偏好并冻结为本 attempt 的具体 `feedbackLanguage`；
4. 在一个短事务中保存不可变首稿、所选 prompt candidate、`feedbackLanguage` 和提交时间；
5. 将 `workflowPhase` 设为 `submitted`；
6. 使用完整原文提示、用户首稿、真实参考文本、语境、语言方向和冻结的反馈语言发起 Generation 1；
7. Gen1 成功后写入结构化 evaluation、`evaluatedAt`、**generation1Messages（最终成功轮的 messages + assistant raw）**，phase → `correction`；该 phase 的初始 UI 为总览。

提交后的文本不得再被修改。未提交草稿仍可按 attempt 维度保存在 `sessionStorage`。

**不设**固定字符数或改错卡数量的产品硬上限。40k token 是统一的模型调用技术预算，不作为输入框字符计数器展示。模型应为所有确实值得修改的句生成卡片。通过提交前预检后，`finish_reason: length` 或任何 completion 截断仍视为生成失败，保持 `submitted` 可 Retry；用户也可回详情页放弃重做。

# 3. Generation 1：总体评价与改错卡

## 3.1 单次逻辑生成

Generation 1 是一次逻辑生成，必须同时返回总体评价和全部改错卡。

模型应直接决定句级卡片内容。逻辑结果只有以下字段：

```json
{
  "overallCommentary": "使用本 attempt 冻结的 feedbackLanguage 撰写的一段总体评价",
  "ratings": {
    "accuracy": "A",
    "naturalness": "B",
    "grammar": "B",
    "overall": "B"
  },
  "cards": [
    {
      "sourceText": "卡片展示的原文句子或必要的连续短句",
      "originalAnswer": "从用户不可变首稿复制的目标语言句子",
      "initialHint": "进入卡片时直接展示的初级提示",
      "deeperHint": "第一次尝试被拒绝后替换初级提示的第二级提示",
      "referenceAnswer": "自然、准确并符合语境的参考译文",
      "referenceMarked": "完整 referenceAnswer，仅用 <mark></mark> 标记值得学习且用户首稿未使用的表达",
      "minimalAnswer": "在 originalAnswer 上做较少修改后达到正确且自然度很高的目标语言句子",
      "minimalDiff": "minimalAnswer 相对于 originalAnswer 的受限类 XML Diff",
      "teacherNotes": [
        "一个条目完整讲解一个主要问题，并在同一条中整合原文意图、语言知识、相关表达和适用例子"
      ]
    }
  ]
}
```

## 3.2 字段展示映射

每个模型字段都必须有唯一、明确的展示位置：

| 字段                | 展示位置                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `overallCommentary` | 总体评价页右栏正文                                                                                           |
| `ratings.*`         | 总体评价页右栏评分区                                                                                         |
| `sourceText`        | 改错卡原文区                                                                                                 |
| `originalAnswer`    | 总体评价页左栏匹配高亮来源（应为一句或必要的连续短句，不得把整段作答当作一张卡的匹配串）；改错卡用户原始作答区 |
| `initialHint`       | 改错卡初始提示位                                                                                             |
| `deeperHint`        | 第一次拒绝后覆盖同一提示位                                                                                   |
| `referenceAnswer`   | accept 与二次拒绝结果中的完整参考译文；作为 referenceMarked 的逐字校验与非法标记降级文本，不生成 Diff             |
| `referenceMarked`   | Reference 块完整文本；值得学习且 originalAnswer 未使用的表达渲染为可点击的语义化 `<mark>`，暂不展开悬浮窗         |
| `minimalAnswer`     | minimalDiff 非法时的纯文本降级；第二次拒绝时与 minimalDiff 配套展示意图                                    |
| `minimalDiff`       | 第二次拒绝后的“最小改动” Diff（信任模型；非法则降级 minimalAnswer）                                            |
| `teacherNotes`      | 每个主要问题对应一条完整讲解；通过后或第二次拒绝揭示 Diff 时，以圆圈序号列表与 Diff 一同展示                 |

不得增加仅用于“让结果看起来完整”但没有展示或验证用途的模型字段。

## 3.3 卡片生成原则

- 改错单位通常是一个句子；拆句、并句或句界本身有问题时，`sourceText` 可以包含必要的连续短句。
- 同一个用户句子中的拼写、标点、搭配、语法、语义和语域问题应合并到一张综合卡，不建立 minor issue 子类型。
- Generation 1 必须按顺序审阅每个用户句子；只要存在明确的非标准形式、不地道结构、含义或关系表达不完整等值得主动改正的问题，就生成一张卡。不得因为句意勉强可懂、附近有更严重的问题或希望减少卡片数量而漏掉该句；输出前应逐句核对覆盖情况。
- 已经准确、自然且符合语境的句子不生成卡片。
- 不得把同一底层问题拆成多张近似卡片。
- `sourceText` 和 `originalAnswer` 必须原样复制输入内容，不得在所谓“原文”或“原始作答”中先行修正。
- 参考文本是有效译法的重要依据，但不是唯一标准；模型可以生成同样自然且更适合卡片上下文的参考答案。
- `initialHint` 与 `deeperHint` 必须覆盖该卡同一组全部主要问题，不得把不同错误拆成并列的两批提示。initial 可引用用户的错误片段来定位问题，但只能说明每个问题为何要改及语义/语法方向；不得给出确切替换词或短语、正确拼写或词形、目标语答案片段、可直接套用的结构模板，或包含当前答案的例句，也不得使用“应该用 X”“把 X 换成 Y”“应写成 X”等同义表述。deeper 针对 initial 中这些相同问题进一步解释，可逐项给出候选词、短语、搭配、正确短词形或结构框架，但仍不得直接给出完整正确分句或句子。
- 两级 hint 使用安全 Markdown renderer 展示，保留模型输出的段落、换行和有序/无序列表；不得把模型原始 HTML 直接传给 `{@html}`。
- `teacherNotes` 与该卡主要问题一一对应并保持 hint 的问题顺序。每条只讲一个问题，并在同一条内整合诊断、原文含义、语言/背景知识、关联表达、例子与迁移方式；不得把例句、背景或拓展单拆成独立条目，也不得把无关问题合并在一条。
- `teacherNotes` 必须采用 tutor 与用户直接交流的第二人称口吻，不得用「学习者」「学生」或对应反馈语言中的第三人称标签客观描述用户。

## 3.4 评分

评分只允许：

```text
A B C F
```

不得添加 `+` 或 `-` 修饰。只返回 `accuracy`、`naturalness`、`grammar`、`overall` 四项评分。`naturalness` 同时涵盖地道程度、语域、声音、语用效果和语境契合度，不再单列 `register` 与 `contextualFit`。总体评价需覆盖准确性、自然度、语法、主要优点和最值得改进的模式，不得只是评分字段的重复描述。

## 3.5 Prompt 与解析可靠性

简单展示 JSON shape 不足以约束本任务。Generation 1 必须同时使用：

1. 清晰且最小化的输出 contract；
2. 至少一个包含多个高价值问题的完整 few-shot；
3. 至少一个“译文已经合格、cards 为空”的 few-shot；
4. Zod 结构校验；
5. 非空字段、重复卡、评分枚举等轻量领域校验；
6. 携带原始无效输出和具体错误列表的定向 repair。

不得像当前 `chatJson` 一样在失败后原样重发同一请求而不告诉模型哪里无效。LLM 抽象必须能够在当前请求中返回 parsed value、raw assistant content、finish reason、model metadata 和 usage。

数据库：

- 保存最终通过致命校验的**结构化**评价 JSON；
- 额外保存**成功** Gen1 的 message history + assistant raw（仅供后续 Second Draft Verifier 拼接）；进入 `transfer` 或无卡直接完成时清空；
- 不保存 repair 中间轮次、usage 计费明细到业务表（日志可另记）。

OpenAI-compatible provider 若支持 JSON Schema structured output，可以将其作为提高成功率的能力使用；BYOK 不支持时必须回退到文本 JSON + 本地校验 + repair。正确性不得依赖 structured output 或 prompt cache。

Generation 1 固定使用 contract + multi-issue/no-card few-shot，不保留 shape-only variant 或自动 prompt 对比脚本。dev-only live review demo 必须使用 `.env` / BYOK 中配置的真实模型和 `docs/references/2026-07-15.md` 完整样例；页面展示完整 request messages、原始 assistant JSON、解析后的正式 UI、model/usage/finish reason，供产品人工检查值得学习的问题覆盖、拆卡质量、误报和反馈语言。

## 3.6 校验、警告与重新生成

服务端对每张卡执行：

- 所有展示用字段非空；
- `sourceText` 是否原样 **exact 包含**于发送给模型的原文；
- `originalAnswer` 是否原样 **exact 包含**于不可变首稿；
- 多卡匹配时对首稿做**长度降序、区间不重叠**分配；无法安全唯一分配 → soft warning，不高亮该卡；
- Diff 字符串经受限 parser：合法则出 AST，非法则该 Diff 标记为降级纯文本（不阻评价）；
- **不做** Diff 重建文本与 original/minimal 的恒等比对；
- 卡片是否完全重复。

JSON/schema 无法解析、总体评价缺失、评分非法或生成被截断 → 致命错误：不暴露部分评价，phase 保持 `submitted`，可 Retry。

containment 失败、重复卡、非法 Diff 降级 → 非致命 warning：评价可展示，卡片可标 `unverified`（服务端派生，非模型字段）。

存在任一 `unverified` 时：

- correction 总览显示说明 +「整体重新生成」；
- 用户可继续；
- 重新生成替换整份评价与全部卡；新结果成功写回前旧结果可用；
- Continue 只把当前标签页 snapshot 的 correction step 从 `overview` 推进到 `cards`，不改服务端 phase；本标签页此后不再展示重新生成；新标签页/无有效 snapshot 从 correction phase 起点，即总览恢复；
- 因总览 gate 不持久化，另一标签页可在 correction 总览重新生成；成功后更新 `evaluatedAt` 并清除该标签页 snapshot，其他标签页的旧 snapshot / verifier 请求因版本不一致返回 409；
- `practiceGeneratedAt` 已存在时服务端拒绝重新生成评价。

非法 Diff 揭示时渲染 escaped `minimalAnswer` / 用户最终句纯文本，不得 `{@html}` 原始模型标记。`referenceMarked` 仅允许无属性 `<mark>` 标签，去除标签后的文本必须逐字等于 `referenceAnswer`；页面通过安全 AST 渲染，非法时降级为普通 `referenceAnswer`。

# 4. 评估等待页

`phase=submitted` 时 `/feedback` 显示独立等待态，不再保留作答表单。

页面中心显示本地化的 `Evaluating`。装饰 SVG 使用声明式主题配置，按左上→左下→右下→右上→左上循环显影。不展示虚假百分比。

Generation 1 失败时 phase 保持 `submitted`，显示 Retry。刷新后仍 Retry。重试同一 attempt，不重复保存答案或 candidate vote；不新增 running/failed job 状态。

动画：`motion` 编排 SVG `pathLength` 与跨阶段时间线；简单淡入淡出用 Svelte transition。`prefers-reduced-motion` 下静态图 + 短 opacity。

---

# 5. 总体评价页

`phase=correction` 的首个 UI step。Gen1 成功后连续过渡：Evaluating→Evaluated，标题上移，左右栏展开；左栏不可变首稿，右栏总体评价 + 四项评分。

左栏按段展示完整首稿。对能 **exact 匹配且不重叠分配** 成功的 `originalAnswer` 浅红荧光笔高亮；失败不高亮、不猜测。

`unverified` 时显示说明、整体重新生成、Continue。无独立 issue summary。有卡时 Continue 只写当前标签页 snapshot 并进入 correction cards；无卡时服务端直接推进到 `completed`。移动端先作答后评价。焦点移到新主标题；reduced-motion 无大位移。

---

# 6. Stage 1：句级改错（phase=`correction` 的 cards step）

## 6.1 初始状态

每张卡：原文 `sourceText`、用户原始作答 `originalAnswer`、**空**输入框、默认展示的 `initialHint`。底栏 Continue/提交。

每张卡最多两次教学尝试。**没有** Ignore 或 Skip。

## 6.2–6.3 尝试与揭示

通过：snapshot 记 passed、最终内容、`acceptedDiff`（模型返回则展示；非法 parser → 纯文本最终句）；移除输入/提示；双 Diff 结果态。

第一次拒绝：snapshot 记尝试与 feedback；保留输入；展示本次评价；`deeperHint` 替换 `initialHint`。

第二次拒绝：snapshot 记 revealed；移除输入；评价 + `minimalDiff`，再展示带可学习表达标记的完整参考答案；禁止第三次输入。

通过或二次拒绝后底栏圆形右箭头，仅 `aria-label` 本地化。

最后一张卡进入终态后，服务端 phase → `second_draft`。

## 6.4 动态 verifier

provider/配额错误与教学拒绝分开；前者不增加尝试次数，展示 Retry。

**上下文（锁定）**：只发送当前 card 必要 trusted fields、已展示提示和本次用户改写，不附带其他 cards 或完整 Gen1 history。Second Draft Verifier 另按 6.7 的完整 history 策略执行。**不**把历次 verifier 对话写回 DB。

逻辑返回：

```json
{ "verdict": "reject", "checks": { "allCardIssuesResolved": false, "noNewErrors": true, "fullyNatural": false }, "feedback": "只评价本次尝试" }
```

或

```json
{ "verdict": "accept", "checks": { "allCardIssuesResolved": true, "noNewErrors": true, "fullyNatural": true }, "acceptedDiff": "相对 originalAnswer 的受限 XML Diff" }
```

拒绝反馈：只谈本次尝试；不得提标准/参考答案；不得复述或给出可复制完整正确句。

**信任模型 Diff**：accept 成立不依赖 Diff 重建核验；解析失败仅影响展示降级，不撤销 accept、不强制用户重交同一答案。

Correction Verifier 只维护当前 card 上下文这一条代码路径，并通过 live harness 人工抽查严格性、合理转述误拒和泄题。

## 6.5 通过后的双 Diff

不单独展示 “Your revision” 纯文本。只展示：

1. acceptedDiff（Your changes）
2. referenceMarked（Reference；完整参考答案，重点表达使用语义化 `<mark>`）

Reference 不使用 Diff；它安全解析 `referenceMarked`，把值得学习且用户首稿未使用的表达显示为与 Tutor Comments 相同的可点击荧光笔 `<mark>`，暂不展开悬浮窗。Your changes 与 Minimal changes 继续展示标准的前后对照。

桌面并列，窄屏纵向。通过后无提示/输入/文字评价（`teacherNotes` 与 Diff 同区展示，见字段表）。引导模型严格 accept，勿接受不自然近义。

---

# 7. 受限类 XML Diff

Diff 由 LLM 生成，只允许：

```xml
unchanged text
<delete>old</delete>
<add>new</add>
<replace><from>old</from><to>new</to></replace>
```

规则：标记外文本属双端；delete/add/replace 语义同前；禁止嵌套操作标签、属性、Markdown、其它 HTML；`&` `<` `>` 用 entity。

服务端手写单遍 parser → AST；渲染只消费 AST，禁用 `{@html}`。

**不做** old/new 与 expected 字符串的严格相等校验。非法整段 Diff → 对应答案的 escaped 纯文本。

### Diff 粒度

教学可读：语块/搭配级，禁止逐词碎拆，也避免整句单一 replace。prompt/few-shot 必须示范语块级。

视觉：delete 红+删除线；add 绿+下划线（矮开口盒竖线）；replace from/to 相邻；SR 可读出删/增/替换。

---

# 8. 持久化、阶段恢复、snapshot 与重做

## 8.1 数据库

`translationAttempt.workflowPhase`（或等价单一字段）为权威阶段。保留/新增：

- 不可变首稿、candidate、`submittedAt`；
- 结构化 `evaluation` JSON + 服务端 warnings；
- `evaluatedAt`（评价版本）；
- **`generation1Messages`**（成功 Gen1 messages + assistant raw；进入 `transfer` 或无卡直接完成时清空）；
- **`feedbackLanguage`**（提交时根据用户偏好解析出的具体语言代码；本 attempt 后续所有教学反馈保持一致）；
- `practiceGeneratedAt`；
- `completedAt`（进入 `completed` 时写入，便于列表/查询）；
- `updatedAt`。

**不**新建 evaluation/card/second-draft/job 表。**不**持久化：卡内尝试次数与正文、二稿正文、迁移队列、verifier 多轮、usage。

唯一性：同一 user+source set 最多一条 **非 completed** attempt；completed 可多条。放弃重做 = **物理删除**未完成 attempt（cascade answers；cascade 指向该 attempt 的 Notes/相关 review logs）。

## 8.2 服务端 phase 恢复

从大厅/详情进入 feedback 时，按 phase 打开对应阶段**起点**：

| phase | 恢复 |
| --- | --- |
| submitted | 等待/Retry Gen1 |
| correction | phase 级恢复始终以总览为起点；当前标签页有有效 snapshot 时可恢复总览 gate 或卡片细进度 |
| second_draft | 二稿；有 snapshot 恢复正文；并视需要重新触发/检查 Gen2；history 保留供 verifier 使用 |
| transfer | 迁移；Notes 未 ready 则等待；队列无 snapshot 则重建默认队列 |
| completed | 回顾/只读或引导 retake |

## 8.3 当前标签页 snapshot

versioned、attempt-scoped `sessionStorage`：

- schemaVersion、attemptId、evaluatedAt；
- correctionStep：`overview | cards`；
- currentCardIndex、每卡尝试/输入/feedback/passed/revealed/acceptedDiff；
- 二稿段落、commentary、pass/skip；
- 迁移队列、variant 使用、Incorrect 次数。

加载：版本/attempt/evaluatedAt 不一致或损坏 → 删 snapshot，按 phase 起点。整体 regenerate 成功 → 清 snapshot。completed → 清 snapshot。

## 8.4 边缘情况

| 情况 | 行为 |
| --- | --- |
| Gen1 失败 | phase=`submitted`；Retry |
| correction/二稿刷新 | 有效 snapshot 恢复细状态；correction 无有效 snapshot 时回总览，二稿无有效 snapshot 时回二稿起点 |
| verifier 中断 | 本地尝试次数不增加 |
| Gen2 刷新 | 已有 `practiceGeneratedAt` 则 ready；否则 second_draft/transfer 再调 action |
| Gen2 并发 | 条件更新只落一份 Notes |
| Gen2 期间 regenerate | 比较 `evaluatedAt`；版本变则丢弃旧 Gen2 结果 |
| 详情页放弃 | 确认后硬删未完成 attempt（及 Notes）+ 新 draft |
| 评估页刷新 | 不弹 retake |

## 8.5 重做

- **未完成**：详情页确认放弃 → 硬删 → 新 draft → `/attempt`。
- **已完成**：可新建另一 attempt（retake）；历史 completed 保留。
- 开发期旧数据可删，不要求迁移。

# 9. Stage 2：全文二稿（phase=`second_draft`）

全部改错卡终态后 phase → `second_draft`：

1. 浏览器可把 Stage 1 完成写入 snapshot；
2. 立即进入全文二稿 UI；
3. 浏览器显式调用 `generatePractice`；
4. 右上角迁移生成胶囊，不阻塞二稿编辑。

二稿复用按段布局，输入**初始化为不可变首稿**（非卡内通过句/参考句）。

「跳过全文二稿」需确认，confirmed skip 写 snapshot；服务端 phase → `transfer`，并在同一条件更新中清空 `generation1Messages`。

提交二稿后 verifier 检查全部 correction cards（passed + revealed）。

**上下文**：DB 中 Gen1 单轮 history + 追加 system（二稿任务/resolved 判定/contract）+ 用户全文二稿。不把 verifier 对话持久化。返回每卡 resolved + 使用冻结 `feedbackLanguage` 的 `commentary`。ordinal 完整无重复。

未全 resolved：标记相关片段但不给答案；底栏提交钮上方**只**展示模型 commentary（平滑过渡，无固定 pass/fail 文案）；可改后重交或确认跳过；provider 错误非教学失败。

全通过同样只展示 commentary。textarea 最小高度 + 随内容增高。

二稿 pass/skip 后 phase → `transfer`（即使 Notes 未 ready），并清空此后不再需要的 Gen1 history。Continue 进迁移；未 ready 则 transfer 页内等待/禁用开练；Gen2 失败从胶囊 Retry。无「Finish for now」。

无 cards 时不进入本阶段。

---

# 10. Generation 2：统一词汇 Note 与例句

处理本 attempt 全部 correction cards（passed 与 revealed 均覆盖）。每张 Note 学习的是从 `referenceAnswer` / `minimalAnswer` 的正确目标语表达中提取出的 `vocab`，而不是抽象句型或句子结构。`vocab` 可以是 single word，也可以是在当前语境中固定或半固定的 lexical chunk（包括 collocation、phrasal verb、fixed phrase、idiom、semi-fixed functional formula）。仅当多个 correction cards 指向同一个词或语块时才可合并。

逻辑结果：

```json
{
  "notes": [
    {
      "sourceCardOrdinals": [0, 3],
      "vocab": "make a decision",
      "targetDefinition": "to choose what to do after considering the possibilities",
      "nativeDefinition": "作出决定；在考虑各种可能性后选择要做什么",
      "examples": [
        { "targetText": "We need to make a decision by Friday.", "nativeText": "我们需要在周五前作出决定。" },
        { "targetText": "She made the decision to study abroad.", "nativeText": "她决定去国外学习。" },
        { "targetText": "It took me a while to make that decision.", "nativeText": "我花了一段时间才作出那个决定。" },
        { "targetText": "You should make your own decision.", "nativeText": "你应该自己作决定。" }
      ]
    }
  ]
}
```

| 字段 | 用途 |
| --- | --- |
| `sourceCardOrdinals` | 校验全覆盖恰好一次；不展示、不持久化 |
| `vocab` | 要学习的目标语单词或语块；Archive/Note 标题；抽认卡背面 |
| `targetDefinition` | 使用目标语言书写的词典式释义；生成并持久化，当前抽认 UI 不展示 |
| `nativeDefinition` | 使用用户母语书写的词典式释义；抽认卡正面 |
| `examples[].targetText/nativeText` | 同义对齐的自然日常例句及其母语翻译；存入 Note JSON 列，每次展示普通随机抽一条 |

不再生成 title/corePoint/summary/targetPatterns[]、`targetPattern` 或 `explanation`。每卡恰好覆盖一次。每 Note 生成四条互不重复、包含该 `vocab` 的自然日常目标语例句及准确母语翻译；四条是同一 Note 的例句池，不是四张持久化卡片，也没有顺序、游标或避免重复的 shuffle bag。

目标语释义和母语释义都采用简洁的词典释义，而非语法课式解释。母语以用户实际 `nativeLanguage` 为准（缺失时回退目标语言），不受 Profile 的 feedback-language 偏好影响。

## 10.1 浏览器显式调用

无后台 job/轮询/runner/heartbeat/请求池。

进入 `second_draft` 时浏览器调 `generatePractice`；胶囊：generating / failed+Retry / ready。

action 仅 attempt 身份：所有权；已有 `practiceGeneratedAt` 则返回已有 Notes；读 evaluation + 开始时 `evaluatedAt`；事务外 LLM + 校验；短事务条件更新 `practiceGeneratedAt IS NULL AND evaluatedAt 未变`，原子插 Notes/来源；失败回滚；条件未命中则返回已有或 409。

成功写入 Notes 后只设置 `practiceGeneratedAt` 并写入 Note 数据，**不得**清空仍可能被二稿 verifier 使用的 `generation1Messages`。history 由进入 `transfer` 的 phase 更新清理。错误只在胶囊，不写 failure 表。模型调用不持 DB 事务。

---

# 11. 全局统一 Note/FSRS 模型

Note 直接为 FSRS 单元，**删除**独立 ReviewCard。

统一 Note：`vocab`、`targetDefinition`、`nativeDefinition`、JSON `examples`、用户与目标语、唯一 source（session **或** translation attempt）、FSRS state、时间戳。

删除 `note_exercise_variant`；同时删除 Note 上的 `exerciseOrder` / `exerciseCursor`。例句只存在 Note 的 JSON 列，由严格 LLM schema、应用写入校验和读取校验保证至少一条、字段非空、目标语例句包含对应 `vocab`。

翻译来源：`note → translationAttempt → translationSourceSet → template`。

**所有**新写入路径（沉浸式反馈、划词保存、tutor Q&A、翻译 Gen2）同一 contract：一次 LLM 出满 vocab + 双语释义 + JSON examples + source + 初始 FSRS；校验失败不写半成品。可判断「零 Note」；不得写入缺释义或例句的半成品。调用与校验在事务外，写入短事务原子。

编辑 vocab/双语释义不重置 FSRS。重新生成例句为未来显式操作。

Review log 直接引用 Note；rating + log 同事务。

旧 note/reviewCard/reviewLog **开发数据可删**；旧 `targetPattern` / `explanation` / variants 无法无损推导 vocab 与双语词典释义，本轮迁移清空开发环境 attempt/Note/log 后切换新结构。**本 issue 不承诺生产数据迁移**（pre-production breaking）。

---

# 12. Stage 3：迁移练习与普通 Review

## 12.1 迁移练习（phase=`transfer`）

读取本 attempt Gen2 Notes。胶囊 generating/failed/ready；failed 仅 Retry。无 cards 不进本阶段；有 cards 则 coverage 至少一 Note。

队列初始包含本 attempt 的每个 Note 一次；每次 Note 到达队首时从其 JSON 例句池普通随机抽一条例句。迁移练习改为与普通 Review 共用同一个 Anki 风格自评组件，不再要求用户先输入目标语，也不做模型评分。

抽认区使用当前 Review 的暖白卡片背景，不照搬参考截图的深色主题。未揭晓时，上半区展示母语 `nativeDefinition`，并为其下方的 `vocab` 预留实际答案高度；分隔线下展示母语 `nativeText`，并为其下方的目标语 `targetText` 预留实际答案高度。揭晓后，两段答案在各自预留位置淡入，任何一段出现多行文本都不得推动既有题面或造成整卡位置突变。`targetDefinition` 暂不展示。

屏幕底部固定一组克制的 Anki 风格控制区：蓝 / 红 / 绿分别显示当前剩余队列的 New / Learning（含 Relearning）/ Review 数量；下方为单个宽 `Show Answer` 按钮。点击按钮或按 Space / Enter 揭晓后，同一控制区原位切换为评分按钮。Transfer 的 Incorrect 会把该 Note 变为 Learning 类型并随机新例句入队尾；Pass 将其移出剩余计数。

按钮：

- Incorrect → `Rating.Again`
- Pass → `Rating.Good`

每次 rating 事务更新 FSRS + review log；请求中禁用；失败不前进。

队列与每次已随机选择的例句索引仅存 versioned `sessionStorage` snapshot。Incorrect 从队首移除后将同一 Note 以新一次普通随机例句加入队尾，学习者先完成其他剩余 Note；不设错误次数上限，未答对就持续回到队尾。Pass 从队首移除且不再入队。

队列处理完毕（含 deferred 决议）→ phase=`completed`，写 `completedAt`。

## 12.2 普通 Review

`/review` 复用 §12.1 的同一抽认组件，揭晓后提供 Again / Hard / Good / Easy。底部三色数字按当前剩余复习队列中的 FSRS 类型统计。每次展示 Note 时直接从其 JSON 例句池普通随机一条；不持久化选择，不维护顺序、游标、去重或避免立即重复的 shuffle bag。

---

# 13. 视觉、动效与独立 demo

`motion`：等待 SVG、时间线、overview 展开与荧光笔、提示替换、结果区与 Diff 显影、可中断阶段过渡。尽量平滑。

二稿/transfer 右上角胶囊：indeterminate 环 + 文案；failed 整枚 Retry；ready 完成标。移动端贴 header 下安全区，不挡输入。reduced-motion 静态环 + live text。

简单 enter/exit 优先 Svelte transition。

dev-only `/translate-eval-demo` 已覆盖主要静态状态并通过产品审查；`/translate-eval-live-demo` 复制这套视觉语言，增加猫武士初始作答、正式 Gen1 调用以及 prompt/raw response 审阅面板。两者都不写业务数据库，正式组件继续复用已批准 layout/motion token。

---

# 14. 反馈语言偏好、本地化与无障碍

Profile 的 Settings 区新增反馈语言模式控件：

```text
native  # 使用用户 nativeLanguage
target  # 使用当前任务的目标学习语言
```

- 数据库存储用户偏好 `feedbackLanguagePreference`，默认 `native`；Profile 使用本地化 segmented control 或 radio group，不使用自由文本；
- 若偏好为 `native` 但用户没有设置 `nativeLanguage`，生成时回退到任务目标语言，Profile 同时提示先设置母语；
- 翻译 attempt 在首稿提交前把偏好解析为具体 `feedbackLanguage` 并持久化；Gen1、两级 hint、`teacherNotes`、correction verifier 和二稿 commentary 使用该冻结语言；Note 的 `nativeDefinition` / `examples[].nativeText` 则固定使用用户实际母语（缺失时回退目标语言），不受此偏好影响；
- 传统 task 在首次生成 `tutorFeedback` 时解析并把具体 `feedbackLanguage` 写入 `FeedbackResult`；message comment、objective 文字、summary 及该反馈页的后续 tutor Q&A 使用同一语言；
- 用户之后修改 Profile 只影响未来新生成的反馈，不重写已生成评价，也不改变进行中翻译 attempt / 已生成传统 task feedback；
- 原始学习者消息、annotated text、用户作答、参考答案、Note `vocab` / `targetDefinition` / `examples[].targetText` 始终保持任务目标语言；`nativeDefinition` / `examples[].nativeText` 使用用户母语，不随反馈语言偏好改变；
- 静态 UI 继续使用 `t(lang, key)`，新 key 四种 UI 语言同步。

全阶段：desktop/mobile、键盘与可见 focus、阶段后逻辑 focus、live status 不泄隐藏答案、Diff SR 文本、reduced-motion、非仅颜色状态、箭头 `aria-label`。

---

# 15. 验收标准

## LLM

- [x] Gen1 一次逻辑生成返回总评、四项评分、全部句级卡。
- [x] 无 token range/confidence/issue type/title/summary/model ref/diff_type。
- [x] 最小 contract + few-shot + Zod + 轻量领域校验 + 定向 repair。
- [x] 截断/非法评分/不可解析 → 不暴露部分结果。
- [x] 成功 Gen1 history 落库；进入 transfer 或无卡完成时清空，Gen2 先完成不得提前删除。
- [x] Profile `native|target` 偏好解析正确；翻译与传统 task 的反馈文本均使用冻结语言。
- [x] BYOK 无 structured output 仍可用。
- [x] live review demo 可用 reference 猫武士预填作答调用真实 Gen1，并完整展示实际 prompt、原始响应与解析后的反馈供人工审阅；成功结果通过校验后的 sessionStorage 在同一标签页刷新后恢复。
- [x] live review demo 提供 `0.0`–`1.0`、步长 `0.1`、默认 `0.4` 的 temperature 控件；服务端拒绝范围外值，选择值同标签页持久化并显示在实际调用 metadata 中。
- [x] live review demo 接通 Correction Verifier、二稿编辑和 Second Draft Verifier 的真实 LLM 调用。Correction Verifier 仅提供当前 card trusted context，不附带完整 Gen1 history；Second Draft Verifier 固定追加到完整成功 Gen1 history。每次调用均展示准确 prompt、raw response、provider metadata 和解析结果。
- [x] completion budget 统一为公共默认 `8,192`；Correction Verifier 与 Second Draft Verifier 使用该默认值。Generation 1、Generation 2 与场景练习完整会话反馈显式使用 `32,768`。
- [x] Correction Verifier 判断 learnerRevision 的意思、用法与自然度，使用 card issues 作为问题清单并检查修改是否引入退步。`referenceAnswer` 是主要语义基准，`sourceText` 只是较低优先级且可能不精确的原文语境；source/original/minimal 中未被 reference 要求的细节不得成为拒绝依据。不得因合理转述或语义强度差异而拒绝。输出固定 `allCardIssuesResolved`、`noNewErrors`、`fullyNatural` 三项 checks；仅三项全部通过时 schema 才允许 accept，reject 至少有一项失败。prompt 显式携带 `referenceAnswer` 与 `teacherNotes`，简要定义主要字段（尤其 `originalAnswer` 是用户首稿而非标准答案），且不包含 `attemptNumber`。

## 路由与阶段

- [x] `/translate/[id]` 详情 CTA 按 phase 进 attempt/feedback。
- [x] attempt/feedback URL 无 attempt id；服务端推断并校验 phase，错误 redirect。
- [x] 当前母语范围内活动 attempt 优先，否则取最新 completed；retake 后旧 completed 不再从主流程打开。
- [x] 详情页未完成可确认硬删放弃；评估内刷新不弹 retake。
- [x] `workflowPhase` 六态推进符合 §1.2；不存在 overview phase；correction 的总览 gate 与卡片细进度仅 snapshot。

## 总览与 regenerate

- [x] 左栏首稿 + exact 不重叠高亮；失败不高亮。
- [x] unverified 可整体 regenerate；成功前旧评价保留。
- [x] Gen1 成功直接写 phase=`correction`；总览 Continue 有卡时只写 snapshot，无卡时 → completed。
- [x] 无独立 issue summary。

## 改错

- [x] 空输入 + initialHint；最多两次；无 Skip。
- [x] 拒绝保留输入 + deeperHint；二次拒绝展示 minimal Diff，再以安全解析的 referenceMarked 展示完整参考答案和可学习表达。
- [x] 通过仅双 Diff + 圆圈序号 teacherNotes；非法 Diff 纯文本降级，不撤销 accept。
- [x] Correction Verifier 只用当前 card context；verifier 对话不落库；provider 错误不计数。

## Diff

- [x] 仅 delete/add/replace 协议；parser→AST；无 `{@html}`。
- [x] 只要协议语法可解析即展示 AST；不因 Diff 内容与 originalAnswer/minimalAnswer 不匹配而隐藏。replace 单边可为空以表达删除或插入。
- [x] 无强制重建恒等；语块级 prompt/few-shot。

## 二稿与 Gen2

- [x] 二稿自首稿初始化；检全部 passed+revealed。
- [x] commentary 在底栏上方，无固定文案，动画不顶按钮。
- [x] Gen2 浏览器 action；条件原子写 vocab/双语释义/JSON 例句 Notes；history 仅在进入 transfer 时清理。
- [x] 二稿结束 phase=transfer，Notes 未好则页内等。

## Note / 迁移 / Review

- [x] 全来源统一 vocab + 双语词典释义 + JSON 例句 contract；无 `note_exercise_variant`、cursor/order 或 ReviewCard 新写入。
- [x] 迁移正面为母语释义+母语例句翻译，背面为 vocab+目标语例句；Incorrect=Again 并无限入队尾，Pass=Good 并移除。
- [x] 普通 Review 四档，每次展示普通随机例句。
- [x] transfer 结束 → completed。
- [x] CDP 实际检验 Generation 2 与传统 session feedback 的 Save to Note 均生成符合本节 contract 的卡片。
- [x] Transfer 与 `/review` 使用同一个暖白 Anki 风格抽认组件；Transfer 不再要求输入答案。
- [x] Space、Enter 或宽 Show Answer 按钮均可揭晓；揭晓后两段答案在预留位置出现，多行内容不导致题面位置突变。
- [x] 屏幕底部显示剩余队列的 New / Learning（含 Relearning）/ Review 三色计数，并在揭晓后原位切换到各流程对应的评分按钮。
- [x] 抽认卡四字段均使用无衬线体，移动端字号依次为 `xl / 2xl / xl / xl`，`sm` 起各增一级；双语例句左对齐，评分按钮使用对应语义色实心填充。
- [x] 目标语例句使用同色左边线与绝对定位开引号，开引号不占布局且与正文保留明确垂直间距。
- [x] `/translate-eval-demo` 不模拟固定 390px 容器；demo 与正式 feedback 都直接使用 app layout 的唯一 `<main>`，不再嵌套第二层语义 main 或重复页面 padding；响应式验收使用浏览器 viewport。
- [x] feedback/demo 的短内容阶段不产生伪滚动：Waiting/Completed 的全高区域只扣除 app shell 的垂直 inset。
- [x] 普通 Review 遵循 Anki 式短期学习队列：默认学习步骤 `1m 10m`、重新学习步骤 `10m`；Again 将卡片保留在 Learning/Relearning 并移到当前队尾，直到 Good 完成步骤或 Easy 直接毕业后才结束该卡。

## 视觉 a11y

- [x] 与已批准 demo 一致的 motion/视觉方向；keyboard/focus/live/reduced-motion。

---

# 不在本 issue 范围内

- 按学习者水平动态调反馈深度；
- 生产环境旧 note/reviewCard/reviewLog **数据迁移**（dev 可 wipe）；
- 外部 durable queue；后台 Gen2 job/轮询/runner/heartbeat/请求池；
- 持久化改错尝试正文、二稿正文、迁移队列、Gen2 错误表；
- event-specific 等待页主题；
- 通用 tokenization / 通用 diff engine；
- Note 例句自动再生成或复杂编辑器；
- Diff old/new 与原文的严格恒等核验；
- 改错卡 Skip/Ignore。
