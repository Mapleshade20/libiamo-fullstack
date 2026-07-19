---
title: 重设计翻译评估与主动学习流程
type: feature
status: needs-review
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

本 issue 改为以“句级改错卡片”为核心的主动学习流程。模型直接生成卡片需要展示的原文、用户原始作答、两级提示、参考译文和 LLM Diff。系统不再建立 token 定位协议，不再让学习者标记 confidence，也不再计算实时 diff。

本 issue 同时保留全文二稿、Note 生成、迁移练习、当前标签页内恢复和全局统一 Note/FSRS 模型，但所有数据结构都应围绕实际展示和调度需求收敛。

## 目标

- 将静态翻译报告改为“总体评价 → 句级主动改写 → 全文二稿 → 迁移练习”的学习流程。
- 让学习者在看到参考译文前最多进行两次自主修改。
- 模型拒绝修改时，只评价用户刚刚提交的尝试，不泄露或暗示标准答案。
- 使用 LLM 生成的受限类 XML 标记渲染 Diff，不引入 token diff 或通用分词器。
- 只保留有明确展示位置、验证用途或调度用途的模型字段。
- 将 Note 直接作为 FSRS 调度单元，并为每个 Note 保存四个练习变体。
- 只持久化不可替代的学习成果；进行中的改错和二稿状态仅在当前标签页内恢复，不支持跨设备续做。
- 通过真实模型评测证明输出可以稳定解析，并能覆盖 `docs/references/2026-07-15.md` 中绝大多数高价值反馈点。
- 在业务实现前先交付独立可交互视觉 demo，并以人工审查通过作为后续开发的硬门槛。

---

# 1. 完整工作流

```text
ANSWERING
  ↓
SUBMIT_FIRST_DRAFT
  ↓
EVALUATION_PENDING / RUNNING
  ├─ FAILED → RETRY
  ↓
EVALUATION_OVERVIEW
  ├─ VALIDATION_WARNING → REGENERATE_WHOLE_EVALUATION
  ├─ NO_CARDS → CONTINUE → COMPLETE
  ↓ CONTINUE（当前标签页此后禁止重新生成）
CORRECTION_CARDS
  └─ 每张卡：
       INITIAL_HINT + EMPTY_INPUT
       ├─ ACCEPT → DUAL_DIFF_RESULT
       └─ FIRST_REJECT → FEEDBACK + DEEPER_HINT
            ├─ ACCEPT → DUAL_DIFF_RESULT
            └─ SECOND_REJECT → FEEDBACK + REFERENCE_DIFF
  ↓
FULL_TEXT_SECOND_DRAFT       BROWSER_CALLS_GENERATE_PRACTICE_ACTION
  ├─ PASS                    ├─ GENERATING（右上角胶囊旋转环）
  ├─ MODIFY_AND_RESUBMIT     ├─ FAILED → 胶囊内 RETRY
  └─ CONFIRM_SKIP            └─ READY
  ↓
WAIT_UNTIL_PRACTICE_READY_IF_NEEDED
  ↓
TRANSFER_PRACTICE
  ↓
COMPLETE
```

如果评估没有生成任何改错卡，总体评价页的 Continue 直接完成本次流程，不进入全文二稿、Note 生成或迁移练习。

---

# 2. 作答与提交

保留现有按段作答布局。

提交时：

1. 服务端验证 attempt 所有权和答案完整性；
2. 在一个短事务中保存不可变首稿、所选 prompt candidate 和提交时间；
3. 将 attempt 切换到现有 `submitted` 状态；
4. 使用完整原文提示、用户首稿、真实参考文本、语境和语言方向发起 Generation 1。

提交后的文本不得再被修改。未提交草稿仍可按 attempt ID 保存在 `sessionStorage`。

应用必须限制一次翻译的总输入长度，确保完整请求和输出可以放入所支持模型的上下文窗口。改错卡不设固定数量上限；模型应为所有确实值得修改的句生成卡片，而不是为了满足数量要求拆分或截断问题。技术上的上下文和 completion 上限仍然适用，任何长度截断都属于生成失败。

---

# 3. Generation 1：总体评价与改错卡

## 3.1 单次逻辑生成

Generation 1 是一次逻辑生成，必须同时返回总体评价和全部改错卡。

模型应直接决定句级卡片内容。逻辑结果只有以下字段：

```json
{
  "overallCommentary": "使用学习者母语撰写的一段总体评价",
  "ratings": {
    "accuracy": "A-",
    "naturalness": "B",
    "grammar": "B",
    "register": "B+",
    "contextualFit": "A-",
    "overall": "B+"
  },
  "cards": [
    {
      "sourceText": "卡片展示的原文句子或必要的连续短句",
      "originalAnswer": "从用户不可变首稿复制的目标语言句子",
      "initialHint": "进入卡片时直接展示的初级提示",
      "deeperHint": "第一次尝试被拒绝后替换初级提示的第二级提示",
      "referenceAnswer": "自然、准确并符合语境的参考译文",
      "minimalAnswer": "在 originalAnswer 上做较少修改后达到正确且自然度很高的目标语言句子",
      "minimalDiff": "minimalAnswer 相对于 originalAnswer 的受限类 XML Diff",
      "referenceDiff": "referenceAnswer 相对于 originalAnswer 的受限类 XML Diff",
      "teachersNote": "使用学习者母语，对本句 originalAnswer 的问题与 reference 相关语言点做详细讲解"
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
| `referenceAnswer`   | Diff 无法安全渲染时的纯文本降级内容；不在 accept 态单独作为“你的改写”展示                                    |
| `minimalAnswer`     | 第二次拒绝揭示时的 minimal Diff 重建目标；非法 Diff 时的纯文本降级                                           |
| `minimalDiff`       | 第二次拒绝后，在 reference Diff 之前展示的“最小改动” Diff                                                    |
| `referenceDiff`     | 通过后的第二组 Diff；第二次拒绝后在 minimal Diff 之后展示的参考 Diff                                         |
| `teachersNote`      | 通过后或第二次拒绝揭示 Diff 时，与 Diff 一同展示的教师讲解（不单独增加 Suggested revisions 类装饰标题栏）     |

不得增加仅用于“让结果看起来完整”但没有展示或验证用途的模型字段。

## 3.3 卡片生成原则

- 改错单位通常是一个句子；拆句、并句或句界本身有问题时，`sourceText` 可以包含必要的连续短句。
- 同一个用户句子中的拼写、标点、搭配、语法、语义和语域问题应合并到一张综合卡，不建立 minor issue 子类型。
- 已经准确、自然且符合语境的句子不生成卡片。
- 不得把同一底层问题拆成多张近似卡片。
- `sourceText` 和 `originalAnswer` 必须原样复制输入内容，不得在所谓“原文”或“原始作答”中先行修正。
- 参考文本是有效译法的重要依据，但不是唯一标准；模型可以生成同样自然且更适合卡片上下文的参考答案。
- 两级提示应逐步增加方向性，但即使 `deeperHint` 也不得直接给出完整参考答案。

## 3.4 评分

评分只允许：

```text
A+ A A- B+ B B- C+ C C- F
```

总体评价需覆盖准确性、自然度、语法、语域、语境契合度、主要优点和最值得改进的模式，不得只是评分字段的重复描述。

## 3.5 Prompt 与解析可靠性

简单展示 JSON shape 不足以约束本任务。Generation 1 必须同时使用：

1. 清晰且最小化的输出 contract；
2. 至少一个包含多个高价值问题的完整 few-shot；
3. 至少一个“译文已经合格、cards 为空”的 few-shot；
4. Zod 结构校验；
5. Diff 重建等领域语义校验；
6. 携带原始无效输出和具体错误列表的定向 repair。

不得像当前 `chatJson` 一样在失败后原样重发同一请求而不告诉模型哪里无效。LLM 抽象必须能够在当前请求中返回 parsed value、raw assistant content、finish reason、model metadata 和 usage，供校验、repair、日志和测试使用；数据库只保存最终通过校验的结构化评价，不保存原始消息、raw content 或 usage。

OpenAI-compatible provider 若支持 JSON Schema structured output，可以将其作为提高成功率的能力使用；BYOK provider 不支持该能力时必须回退到文本 JSON + 本地校验 + repair。正确性不得依赖 provider 的 structured output 或 prompt cache。

实现阶段必须使用 `.env` 中配置的真实模型，对 `docs/references/2026-07-15.md` 的完整样例重复运行对比：

- 仅提供 JSON contract 的提示词；
- JSON contract + representative few-shot 的提示词。

评测至少记录结构解析成功率、领域校验成功率、值得学习的问题覆盖率、错误拆分质量、无问题句子的误报率和反馈语言正确性。最终采用的 prompt 版本必须以评测结果为依据，而不是凭一次成功输出决定。

## 3.6 校验、警告与重新生成

服务端对每张卡执行以下校验：

- 所有字段非空；
- `sourceText` 是否原样包含于发送给模型的原文；
- `originalAnswer` 是否原样包含于不可变首稿；
- `referenceDiff` / `minimalDiff` 是否符合受限标记语法；
- 从 `referenceDiff` 重建的旧/新文本是否分别等于 `originalAnswer` / `referenceAnswer`；
- 从 `minimalDiff` 重建的旧/新文本是否分别等于 `originalAnswer` / `minimalAnswer`；
- 卡片是否存在完全重复。

JSON/schema 无法解析、总体评价缺失、评分非法或生成被截断属于致命错误：不暴露部分评价，保留可重试的失败状态。

卡片原文无法精确匹配、Diff 无法重建或出现重复卡片属于非致命校验警告：评价仍可展示，但标记为 `unverified`。这类状态是服务端派生结果，不是新增模型输出字段。

存在任一 `unverified` 卡片时：

- 总体评价页显示说明和“整体重新生成”按钮；
- 用户可以选择继续使用当前结果；
- 重新生成替换整份总体评价和全部卡片，而不是只替换单卡；
- 新生成结果完整校验并成功写回 attempt 前，旧结果保持可用；
- 用户一旦从总体评价页选择 Continue，当前标签页 snapshot 记录 overview gate，此后本标签页不再展示重新生成入口；该 gate 不写入数据库，因此新标签页、跨设备或 snapshot 丢失时会重新从总体评价开始。
- `practiceGeneratedAt` 已存在时服务端拒绝重新生成评价，避免已写入的 Notes 与评价失配。

若用户继续使用 `referenceDiff` 或 `minimalDiff` 无法验证的卡片，对应 Diff 最终揭示时安全降级为 escaped `referenceAnswer` / `minimalAnswer` 纯文本，不得渲染未经解析的模型标记。

---

# 4. 评估等待页

提交后不再保留作答表单，显示独立等待状态。

页面中心显示本地化的 `Evaluating`。装饰 SVG 使用一个声明式主题配置，按以下顺序形成循环：

1. 左上节点；
2. 沿左侧到左下；
3. 沿底部到右下；
4. 沿右侧到右上；
5. 回到左上。

路径、节点和小图形依次显影。动画不展示虚假百分比，也不暗示真实模型进度。

Generation 1 失败时 attempt 保持现有 `submitted` 状态，当前页面展示 Retry。刷新后也根据 `submitted` 状态展示 Retry。重试继续同一个已提交 attempt，不重复保存答案或统计 prompt candidate vote；不新增 running/failed job 状态。

动画实现使用 `motion` 编排 SVG `pathLength` 和跨阶段时间线；简单淡入淡出继续使用 Svelte 原生 transition。`prefers-reduced-motion` 下显示完整静态图，只保留短 opacity 变化。

---

# 5. 总体评价页

Generation 1 成功后执行连续过渡：

1. 本地化的 `Evaluating` 变为本地化的 `Evaluated`；
2. 标题缩小并移向上方；
3. 主区域展开为左右两栏；
4. 左栏显示用户不可变首稿，右栏显示总体评价和六项评分。

左栏按原段落顺序展示完整用户作答。对于能在首稿中精确匹配的 `originalAnswer`，使用浅红色荧光笔效果标记对应文本；重叠匹配按区间并集渲染。无法匹配的卡片不猜测位置，也不高亮。

若存在 `unverified` 卡片，在总体评价页显示：

- 说明模型生成的部分卡片未能与首稿精确对应；
- 整体重新生成按钮；
- 继续使用当前结果的正常 Continue 按钮。

总体评价页不再显示问题标题、问题摘要列表或额外的 issue summary 页面。Continue 直接进入第一张改错卡；若 `cards` 为空则直接完成。

移动端先显示用户作答，再显示总体评价。焦点在过渡结束后移动到新页面主标题。reduced-motion 下不执行大位移。

---

# 6. Stage 1：句级改错卡片

## 6.1 初始状态

每张卡初始包含四部分：

1. 原文：`sourceText`；
2. 用户原始作答：`originalAnswer`；
3. 空输入框；
4. 默认直接展示的 `initialHint`。

页面底部是 Continue/提交按钮。输入框初始必须为空，不得预填首稿、上一张卡的内容或参考答案。

每张卡最多记录两次教学尝试。没有 Ignore 或 Skip 操作。

## 6.2 第一次尝试

用户输入完整改写并选择 Continue 后，服务端调用动态 verifier。

如果通过：

- 在当前标签页 snapshot 中记录通过状态、用户最终内容和 `acceptedDiff`；
- 移除输入框、提示和拒绝反馈；
- 进入双 Diff 结果态。

如果拒绝：

- 在当前标签页 snapshot 中记录第一次尝试和模型评价；
- 保留用户输入，允许继续编辑；
- 在输入框附近展示对本次尝试的评价；
- 用 `deeperHint` 覆盖并替换原提示位置的 `initialHint`。

## 6.3 第二次尝试

第二次提交如果通过，行为与第一次通过相同。

第二次提交如果拒绝：

- 在当前标签页 snapshot 中记录第二次尝试、评价和 `revealed` 状态；
- 移除输入框和提示；
- 展示对第二次尝试的评价；
- 先展示 `minimalDiff`（相对 `originalAnswer` 的较少修改），再展示 `referenceDiff`；
- 不允许第三次输入。

通过或第二次拒绝后，页面底部显示圆形右箭头按钮，不包含文字。按钮必须有本地化的 `aria-label`。

## 6.4 动态 verifier

verifier 必须把 provider/配额错误 与 教学拒绝 分开。provider 错误不增加尝试次数，保留输入并展示 Retry。

对比测试两种方式，看哪种 LLM 的反馈最好：

一种是只提供
- 从 Generation 1 提取当前卡片的完整信息；
- 已经向用户展示的提示；
- 用户刚刚提交的改写。

另一种是
- 完整 Generation 1 的历史记录（保证 LLM 调用的前缀缓存命中）
- 补充的 system role 提示词
- 用户刚刚提交的改写。

注意包括这个在内的所有 prompt 都应区分 system role 和 user role，不要把所有内容无脑塞到一个 user role message 里。

逻辑返回值使用 discriminated union：

```json
{
  "verdict": "reject",
  "feedback": "只评价用户这次尝试的问题或实际表达出的意思"
}
```

或：

```json
{
  "verdict": "accept",
  "acceptedDiff": "用户最终改写相对于 originalAnswer 的受限类 XML Diff"
}
```

拒绝反馈必须：

- 只讨论用户刚刚提交的尝试；
- 可以说明这次表达实际传达了什么、仍有什么语义/语法/搭配/语域问题；
- 不得提及“标准答案”“参考答案”“老师版本”或任何同义说法；
- 不得引用、复述、拼接或暗示 `referenceAnswer`，或是在反馈中直接给出可复制的完整正确句子。

## 6.5 通过后的双 Diff 结果态

通过后**不**再单独展示“Your revision / 你的改写”纯文本块。只展示两组 Diff：

1. 用户最终内容相对于 `originalAnswer` 的 Diff（`acceptedDiff`，标签如 Your changes）；
2. `referenceAnswer` 相对于 `originalAnswer` 的 Diff（`referenceDiff`，标签如 Reference changes）。

桌面端两组 Diff 并列；窄屏/移动端按上述顺序纵向堆叠，不得横向挤爆。通过后不再展示提示、输入框或模型文字评价。

用户最终答案与参考答案应尽可能相同，或有差别但完全正确且自然。应引导 LLM 更为严格地判断，而不是随意接受任何意思相似但不自然、不最优的改法。

---

# 7. 受限类 XML Diff

Diff 由 LLM 生成，但只允许以下标记：

```xml
unchanged
<delete>old text</delete>
<add>new text</add>
<replace><from>old text</from><to>new text</to></replace>
```

规则：

- 标记外文本在旧文本和新文本中都存在；
- `<delete>` 只进入旧文本；
- `<add>` 只进入新文本；
- `<replace>` 必须恰好包含一个 `<from>` 和一个 `<to>`；
- `<from>` 只进入旧文本，`<to>` 只进入新文本；
- 标签不得嵌套到其他操作标签中；
- 文本中的 `&`、`<`、`>` 必须使用 XML entity；
- 不允许属性、Markdown、HTML 或其他标签。

服务端必须使用专用 parser 将标记转换为受限 AST，并同时重建 old/new 两份文本。渲染层只消费 AST，不使用 `{@html}`。

参考 Diff 的 old/new 必须分别等于 `originalAnswer`/`referenceAnswer`；minimal Diff 的 old/new 必须分别等于 `originalAnswer`/`minimalAnswer`；通过 Diff 的 old/new 必须分别等于 `originalAnswer`/用户最终内容。

### Diff 粒度

Diff 服务教学可读性：学习者应看到**可迁移的表达语块**如何变化，而不是每个单词被拆成碎片。

- 以有意义的短语/搭配/子句为单位做 `delete` / `add` / `replace`（例如 `weakens the crucial parts` → `undermines major parts`，而不是逐词 weakens/undermines、the crucial/major）；
- 不要为了“对齐粒度最细”把介词、冠词、单个形容词各自拆成独立 replace；
- 也避免把几乎整句塞进一个巨大 replace；在语块级与整句级之间取可读折中；
- prompt 与 few-shot 必须示范**语块级** Diff，并明确禁止逐词碎拆。

视觉语义：

- delete 使用红色和删除线；
- add 使用绿色和下划线（两端有1/3高度的竖线边界，整体像一个矮开口盒子）；
- replace 将 from/to 保持在相邻视觉位置；
- 屏幕阅读器能够读出“删除、增加、替换自、替换为”。

---

# 8. 最小持久化、当前标签页恢复与重做

反馈流程按“用户会在当前标签页连续完成”设计。服务端不承担跨设备恢复每一步教学交互的职责。

## 8.1 数据库只保存不可替代的数据

服务端只持久化：

- 现有 `translationAttempt` 和 `translationAnswer` 中的不可变首稿、所选 candidate 和提交时间；
- Generation 1 通过校验后的完整结构化评价 JSON，包括总体评价、评分、cards 和服务端派生 warnings；
- `evaluatedAt`，同时作为当前评价版本标识；
- Generation 2 成功后原子写入的 Notes、四个 exercise variants、FSRS state 和 Note 到 attempt 的来源关系；
- `practiceGeneratedAt`，用于区分“尚未生成”和“已经生成”；
- `completedAt`，用于区分未完成 attempt 与可 retake 的历史 attempt。

不新增 `translationEvaluation`、`translationCorrectionCard`、`translationSecondDraftAnswer` 或 `translationNoteJob` 表。数据库不保存：

- raw LLM messages/content/usage；
- 当前 workflow phase；
- overview Continue gate；
- 当前 card index；
- 卡片尝试次数、用户改写、拒绝 feedback、passed/revealed 或 accepted Diff；
- 全文二稿内容、verifier 结果或 skip；
- Generation 2 的 loading/error/retry 状态。

动态 verifier 和全文二稿 action 必须验证用户、attempt、card ordinal 及浏览器提交的 `evaluatedAt` 版本，并从服务端保存的 evaluation JSON 读取卡片内容；版本不一致时返回 409，要求页面加载新评价。但“两次尝试”和 reveal gate 是当前页面的教学 UI 约束，不建立跨标签页的数据库状态机。

## 8.2 当前标签页 snapshot

使用一个 attempt-scoped、带 schema version 的 `sessionStorage` snapshot 尽量恢复当前标签页：

- 当前 overview/card/second-draft/transfer UI 步骤；
- overview 是否已经 Continue；
- 当前 card index；
- 每张卡的本地尝试次数、输入、feedback、passed/revealed、accepted answer 和 accepted Diff；
- 全文二稿输入、最近一次 unresolved 结果、commentary 和本地 pass/skip；
- 迁移练习本地队列、variant 使用情况和 Incorrect 次数。

snapshot 同时保存 attempt ID 和 `evaluatedAt`。整体重新生成成功后清除旧 snapshot；加载时只接受与当前 attempt/evaluation version 一致的数据。解析失败、版本不兼容或字段越界时删除 snapshot，并从总体评价页重新开始。

snapshot 不提供跨设备保证。新标签页、另一台设备或浏览器清理 storage 后重新进入时，复用数据库中的 Generation 1 评价并从总体评价开始，不重新调用 Generation 1。

## 8.3 边缘情况

| 情况                                      | 行为                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| 首稿已保存但 Generation 1 请求失败/断开   | attempt 保持 `submitted`；页面或刷新后显示 Retry                                      |
| 总体评价、改错卡或二稿期间刷新            | snapshot 有效时恢复；无效或不存在时从总体评价开始                                     |
| verifier 响应在浏览器收到前中断           | 本地尝试次数不增加；用户 Retry 可能产生一次额外模型调用，但不会写入教学进度表         |
| Generation 2 请求期间刷新/关闭            | 若服务端已提交 Notes，重新进入后直接识别为 ready；否则恢复到二稿时重新发起普通 action |
| 两个 Generation 2 请求并发                | 可以产生重复模型调用，但最终只有一个请求通过条件更新写入 Notes，另一个返回已有结果    |
| Generation 2 期间评价被另一标签页重新生成 | 最终写入必须比较开始时的 `evaluatedAt`；版本不一致时丢弃旧评价生成的结果并要求重试    |
| 新标签页或跨设备打开                      | 不恢复卡片/二稿进度，从已保存总体评价开始                                             |

## 8.4 重做

只有 `completedAt` 非空的 attempt 才允许 retake。同一用户和 source set 可以有多个已完成历史 attempt，但最多只能有一个 `completedAt IS NULL` 的 attempt。未完成 attempt 再次打开时复用其首稿和评价，不提供“放弃本次并重新作答”。

开发期旧数据可以删除，不要求迁移。

---

# 9. Stage 2：全文二稿

全部改错卡完成后：

1. 浏览器把 Stage 1 完成状态写入当前 attempt 的 session snapshot；
2. 立即进入全文二稿；
3. 同时由浏览器显式调用 `generatePractice` server action；
4. 页面右上角显示迁移练习生成胶囊，不阻塞二稿编辑。

全文二稿复用初始按段布局，所有输入初始化为不可变首稿，而不是卡片中的通过答案或参考答案。用户需要在完整语境中独立重新应用刚学到的内容。

“跳过全文二稿”必须有确认说明，并把 confirmed skip 写入当前标签页 snapshot，不写数据库。

提交二稿后，verifier 检查所有 correction cards，包括独立通过的卡片和第二次失败后揭示答案的卡片。

二稿 verifier 的上下文固定为：

1. 完整 Generation 1 的 message history（便于 prefix cache）；
2. 追加的 system role 指令（说明二稿任务、resolved 判定与输出 contract）；
3. 用户刚刚提交的全文二稿。

不得把上述内容全部塞进单条 user message。逻辑返回值除每个 card ordinal 的 resolved 状态外，还必须包含一段面向学习者的 `commentary`（使用学习者母语），概括二稿整体表现或仍未落实的模式；不得只返回通过/不通过布尔值。服务端要求 ordinal 结果完整且不重复。

如果全部 resolved，在当前标签页 snapshot 中记录 pass 与 commentary。否则：

- 标记受影响段落或相关原文片段，但不展示答案；
- 在页面底部、提交按钮紧上方**只展示模型 `commentary`**（不得再叠加固定文案如 “All correction points look resolved…” / “Some sentences still need work…”）；
- commentary 的出现/替换须有平滑过渡，不得造成底部按钮位置突变；
- 保留用户二稿；
- 允许修改并再次提交；
- 允许确认跳过剩余检查；
- provider 错误不作为教学失败。

全部通过时同样只展示 commentary（位置与动画要求相同）。二稿输入框有明确的最小初始高度，并随内容自动增高以完整显示，不在框内滚动截断可见正文。

二稿输入、unresolved 结果、commentary 和 pass/skip 只写入当前标签页 snapshot。二稿完成或确认跳过后，如果迁移练习仍在生成，Continue 保持禁用并说明需要等待；如果生成失败，用户必须从右上角胶囊 Retry。这里不提供 Finish for now 或“稍后从迁移阶段继续”。

如果 Generation 1 没有生成卡片，则整个 Stage 2 跳过。

---

# 10. Generation 2：统一 Note 与练习变体

Generation 2 处理本 attempt 的全部 correction cards，不因卡片是 `passed` 还是 `revealed` 而排除。无法在两次内独立改对的内容尤其需要进入后续学习。

模型可以把教授同一可迁移模式的多张卡合并为一个 Note，但不能只因表面相似而合并不同能力点。

逻辑结果：

```json
{
  "notes": [
    {
      "sourceCardOrdinals": [0, 3],
      "targetPattern": "可复用的目标语言结构或表达",
      "explanation": "使用学习者母语撰写的完整解释",
      "exercises": [
        { "front": "母语例句 1", "back": "自然目标语言译文 1" },
        { "front": "母语例句 2", "back": "自然目标语言译文 2" },
        { "front": "母语例句 3", "back": "自然目标语言译文 3" },
        { "front": "母语例句 4", "back": "自然目标语言译文 4" }
      ]
    }
  ]
}
```

字段展示和用途：

| 字段                 | 展示或用途                                        |
| -------------------- | ------------------------------------------------- |
| `sourceCardOrdinals` | 服务端校验所有 cards 恰好被覆盖，不展示也不持久化 |
| `targetPattern`      | Archive/Note 列表标题和 Note 详情主标题           |
| `explanation`        | Note 详情正文和学习说明                           |
| `exercises[].front`  | 迁移练习与普通 Review 正面                        |
| `exercises[].back`   | 迁移练习与普通 Review 揭示答案                    |

不再生成 `title`、`corePoint`、`summary` 或 `targetPatterns[]`。

每张 correction card 必须在所有 `sourceCardOrdinals` 中恰好出现一次。每个 Note 必须恰好有四个互不重复的练习。四个练习应改变主题、场景和词汇，同时明确练习同一 `targetPattern`，不能只替换人名。

## 10.1 浏览器显式调用

Generation 2 不使用后台 job、runner、轮询、heartbeat 或请求池。

进入全文二稿时，当前浏览器显式发起一个普通 `generatePractice` server action，并在右上角胶囊中持有该请求的客户端状态：

- `generating`：显示本地化文案和 indeterminate 环形旋转动画，不展示虚假百分比；
- `failed`：显示简短错误和可点击 Retry；
- `ready`：显示完成状态，允许在二稿完成后进入迁移练习。

action 只接收 attempt ID。服务端必须：

1. 验证用户和 attempt 所有权；
2. 若 `practiceGeneratedAt` 已存在，直接返回已有 Notes；
3. 从 attempt 保存的 Generation 1 evaluation JSON 读取全部 cards；
4. 记录当前 `evaluatedAt`，在事务外调用模型并完成全部 schema/coverage 校验；
5. 在一个短事务中，以 `practiceGeneratedAt IS NULL` 且 `evaluatedAt` 未变化为条件更新 `practiceGeneratedAt`，并原子插入 Notes、四个 exercise variants 和 attempt source relationships；任一写入失败则全部回滚；
6. 如果条件更新未命中，则不插入本次结果；
7. 如果其他请求已经提交成功，丢弃本次重复结果并返回已有 Notes；如果评价版本变化，返回可重试冲突。

请求失败不写持久化 failure 状态，错误只存在于当前胶囊。模型调用期间不得保持数据库事务。页面销毁时浏览器可以 abort 请求；即使服务端随后完成，重新进入时也会通过 `practiceGeneratedAt` 识别已有结果。

---

# 11. 全局统一 Note/FSRS 模型

Note 直接成为 FSRS 调度单元，不再存在独立 ReviewCard。

统一 Note 保存：

- 用户和目标语言；
- 单个 `targetPattern`；
- 学习者母语 `explanation`；
- source type 和且仅一个 source ID；
- FSRS card state；
- exercise variant 轮换状态；
- 创建和更新时间。

Exercise variant 是子记录，保存 `front`、`back` 和稳定 ordinal，并以 `(note_id, ordinal)` 唯一。每个已生成 Note 恰好有四个 variants。

翻译 Note 直接关联：

```text
note → translationAttempt → translationSourceSet → template
```

`sourceCardOrdinals` 只用于 Generation 2 返回值的 coverage 校验。由于 correction cards 不单独建表，校验完成后不持久化这些 ordinals；翻译 Note 只保留到 `translationAttempt` 的来源关系。

沉浸式模拟反馈、选择保存和 tutor Q&A 等所有新 Note 写入路径也必须使用同一完整 contract：

- `targetPattern`；
- `explanation`；
- exactly four exercise variants；
- source relationship；
- 初始 FSRS state。

一个来源可以判断没有值得保存的 Note，但不得创建缺少四个 variants 的半成品 Note。模型调用和完整校验必须在事务外完成，Note、variants 和 source relationships 在一个短事务中原子写入。

编辑 `targetPattern` 或 `explanation` 不得重置 FSRS。重新生成 variants 必须是未来单独的显式操作。

Review log 直接引用 Note。应用 FSRS rating 和插入 review log 必须在同一事务中完成。

旧 note、reviewCard、reviewLog 开发数据可以删除。删除旧表前必须先切换 Archive、Review、卡片管理、API、统计、来源删除和所有 Note 写入路径。

---

# 12. Stage 3：迁移练习与普通 Review

## 12.1 迁移练习

迁移练习读取本 attempt 的 Generation 2 Notes。`generating/failed/ready` 由全文二稿右上角胶囊承载；failed 只提供 Retry，不提供 Finish for now。Generation 1 无 cards 时不会进入本阶段；有 cards 时 Generation 2 coverage 校验要求至少生成一个 Note。

每张 Note 从四个 variants 中抽取一个。正面只显示母语 `front`（练习句）；**在用户提交自己的答案并揭示之前，不展示 `targetPattern`**。用户必须先输入目标语言答案，才能揭示 `back` 与 `targetPattern`。输入只用于主动回忆和自我比较，不做模型评分。揭示时注意布局与动画，避免按钮与内容突跳。

迁移练习只显示：

- Incorrect → `Rating.Again`；
- Pass → `Rating.Hard`。

每次 rating 都事务性更新 Note FSRS state 并插入 review log。请求期间禁用按钮，失败时不前进。

迁移队列、已用 variant ordinal、每个 Note 的 Incorrect 次数和本地 passed/deferred 状态只保存在 attempt-scoped `sessionStorage`，不建立迁移 session 数据表。

Incorrect 后把 Note 放到其他 pending Notes 末尾，并优先使用未见 variant。一个本地迁移 session 最多对同一 Note 记录四次 Incorrect；第四次后不再入队，标记 deferred，并提示到普通 Review 继续。

## 12.2 普通 Review

普通 Review（现有 `/review` 路由）仍使用 Again、Hard、Good 和 Easy。每次卡片出现时从四个 variants 中随机选择一个展示。

---

# 13. 视觉、动效与独立 demo

本流程使用 `motion` 处理：

- 等待页 SVG path drawing；
- 多元素时间线；
- 总体评价页展开和荧光笔 reveal；
- 提示替换、结果区展开和 Diff 操作显影；
- 可中断的阶段过渡。

要求尽量所有交互、变化均有动画，且平滑、流畅、自然。

全文二稿右上角使用一枚不遮挡正文的胶囊形小悬浮控件承载迁移练习生成状态。generating 时左侧显示 indeterminate 环形旋转线，右侧显示短状态文案；failed 时整枚胶囊成为 Retry 控件；ready 时环线收束为完成标记。它只表示“请求仍在进行”，不展示百分比。移动端把胶囊吸附在页面 header 下方安全区域，不能覆盖二稿输入或提交按钮。reduced-motion 下环形图保持静态分段样式，通过文字和 live status 表达 generating。

简单单元素进入/退出优先使用 Svelte 原生 transition，避免所有动画都依赖命令式 timeline。

实施计划必须先建立 dev-only 独立可交互 demo 路由，使用固定 fixtures 展示至少以下状态：

- evaluating；
- evaluated 两栏总览；
- 全部匹配；
- 部分匹配失败 + 整体重新生成；
- 改错卡初始态；
- 第一次拒绝；
- 第一次/第二次通过；
- 第二次拒绝并揭示参考 Diff；
- provider 错误；
- 无卡片；
- 全文二稿右上角胶囊的 generating、failed/retry 和 ready；
- 二稿已完成但迁移练习仍未 ready；
- desktop、mobile 和 reduced-motion。

视觉 demo 必须由产品负责人明确审查通过，之后才能开始数据库、LLM 或正式工作流实现。已批准 demo 的布局、motion token 和交互层级应被正式组件复用，而不是在接业务时另写一套页面。

---

# 14. 本地化与无障碍

- 静态 UI 使用现有 `t(lang, key)`，不得硬编码页面字符串；
- 总体评价、提示、拒绝反馈和 Note explanation 使用学习者母语；
- 原文和 exercise front 使用母语；
- 用户作答、参考答案、targetPattern 和 exercise back 使用目标语言。

所有阶段必须支持：

- desktop/mobile 响应式布局；
- 完整键盘操作和可见 focus；
- 阶段变化后的逻辑 focus movement；
- live status 不泄露隐藏答案；
- Diff 操作的 screen-reader 文本；
- `prefers-reduced-motion`；
- 颜色之外的状态提示；
- 圆形箭头按钮的本地化 `aria-label`。

---

# 15. 验收标准

## LLM 输出与解析

- [ ] Generation 1 一次逻辑生成返回总体评价、六项评分和全部句级改错卡。
- [ ] 输出不包含 token range、confidence、issue type、title、summary、model ref 或 `diff_type`。
- [ ] Prompt 同时使用最小 JSON contract、representative few-shot、schema 校验和领域校验。
- [ ] Repair 请求包含原始无效输出和具体错误，不盲目重发同一请求。
- [ ] length truncation、非法评分或无法解析的整体结构不暴露部分结果。
- [ ] 不支持 structured output 的 BYOK provider 仍能通过文本 JSON + 校验 + repair 工作。
- [ ] 真实模型 A/B 评测证明最终 prompt 的解析稳定性和教学覆盖优于或不低于简单 shape-only prompt。
- [ ] `docs/references/2026-07-15.md` 中绝大多数高价值语言点能够被稳定发现，而不是只返回少量泛泛评价。

## 总体评价与重新生成

- [ ] 总体页左栏显示完整首稿，右栏显示总体评价和六项评分。
- [ ] 能精确匹配的 `originalAnswer` 使用浅红荧光笔标记；无法匹配时不猜测位置。
- [ ] 非致命校验失败仍可查看和继续当前评价。
- [ ] 存在 `unverified` 卡片时可以整体重新生成评价。
- [ ] 新结果成功前旧评价不丢失。
- [ ] Continue 后当前标签页不再展示重新生成入口；新标签页或 snapshot 丢失时按已声明的降级规则从总体评价开始。
- [ ] 不存在独立 issue summary 页面。
- [ ] 无卡片时总体评价后直接完成。

## 改错卡片

- [ ] 初始态只显示原文、原始作答、空输入框和默认展开的初级提示。
- [ ] 每张卡最多两次教学尝试，没有 Ignore/Skip。
- [ ] 第一次拒绝保留输入，展示本次评价，并以二级提示替换初级提示。
- [ ] 第二次拒绝展示本次评价，以及 minimal Diff 后再接 reference Diff，不再允许输入。
- [ ] 任一次通过后移除输入、提示和文字评价；不单独展示 Your revision 纯文本，只展示 accepted Diff 与 reference Diff 两组（窄屏纵向堆叠）。
- [ ] 两种 verifier 上下文方案经过真实模型对比，最终方案的拒绝反馈不泄露或暗示标准答案。
- [ ] provider/配额/格式错误不增加教学尝试次数。
- [ ] 通过状态和 accepted Diff 在展示前写入当前标签页 snapshot，不写数据库。
- [ ] 圆形箭头按钮无可见文字，但有本地化 accessible name。

## Diff

- [ ] Diff 仅允许 delete、add、replace/from/to 协议。
- [ ] 专用 parser 能从每个 Diff 重建 old/new 文本并严格比对预期（含 minimal / reference / accepted）。
- [ ] 渲染消费 AST，不直接注入模型 HTML/XML。
- [ ] 非法 minimal/reference Diff 分别降级为 escaped minimal/reference answer，不渲染原始标记。
- [ ] Prompt/few-shot 要求语块级 Diff（可迁移短语/搭配），禁止逐词碎拆，也避免几乎整句单一 replace。
- [ ] 通过或二次拒绝揭示时展示 `teachersNote`，与 Diff 同区呈现；无 “Suggested revisions” 装饰性总标题。
- [ ] Diff 不依赖 tokenization，并支持 screen reader 和非颜色提示。

## 持久化与二稿

- [ ] 数据库只保存首稿、结构化 Generation 1、最终 Notes/variants、`practiceGeneratedAt` 和 `completedAt`。
- [ ] 不新增 evaluation/card/second-draft/job 过程表，不持久化 raw LLM transcript 或教学交互进度。
- [ ] 有效 session snapshot 能在同一标签页恢复 overview gate、卡片进度和全文二稿；损坏/过期时安全回到总体评价。
- [ ] 新标签页和跨设备不恢复教学进度，但复用已保存的 Generation 1。
- [ ] 两次尝试约束由当前页面和 snapshot 维护，不建立服务端教学状态机。
- [ ] 完成后允许 retake，但同一用户/source set 最多有一个未完成 attempt。
- [ ] 未完成 attempt 不允许放弃后立即 retake，只能继续现有首稿和评价。
- [ ] 全文二稿始终从不可变首稿初始化。
- [ ] 全文二稿验证全部 correction cards，包括 passed 和 revealed。
- [ ] 二稿 verifier 使用完整 Generation 1 history + 新 system 指令 + 用户二稿；返回 per-card resolved 与 commentary。
- [ ] 底部提交区上方只展示模型 commentary（无固定 pass/unresolved 文案），出现有平滑过渡且不造成按钮突跳。
- [ ] 二稿输入框有最小高度并随内容自动增高完整显示。
- [ ] 用户可以修改重交或确认跳过，当前标签页内可恢复。
- [ ] 二稿完成时若迁移练习未 ready，Continue 禁用并要求等待或重试。

## 统一 Note、迁移与 Review

- [ ] Generation 2 覆盖每张 correction card 恰好一次，并可合并同一 targetPattern。
- [ ] Note 只生成 `targetPattern`、`explanation` 和四个 exercises，不生成重复标题/摘要字段。
- [ ] 每个 Note 恰好有四个不同 variants；card ordinals 只用于生成结果 coverage 校验，不持久化。
- [ ] 所有 Note 来源都在完整验证后原子写入 Note、variants 和 source relationships。
- [ ] Generation 2 由浏览器显式调用普通 server action，不使用后台 job、轮询、runner、heartbeat 或请求池。
- [ ] 右上角胶囊展示 generating、failed/retry 和 ready；错误不写数据库。
- [ ] 重复或中断的 Generation 2 请求不会重复创建 Notes，也不会写入基于旧评价版本的结果。
- [ ] Note 直接持有 FSRS state，review log 直接引用 Note。
- [ ] 旧 ReviewCard 写入路径和独立卡片生成步骤全部删除。
- [ ] 迁移练习揭示前不展示 targetPattern；揭示后展示 pattern 与 back，布局动画平滑。
- [ ] 迁移练习只显示 Incorrect/Pass，并分别映射 Again/Hard。
- [ ] 普通 Review 轮换四个 variants，并保留四档 rating。
- [ ] generating、failed 和 deferred 状态都不会渲染空白页面。

## 视觉与无障碍

- [ ] `motion` 仅用于需要编排的 SVG/阶段动画，简单 transition 不重复造轮子。
- [ ] 独立 demo 覆盖所有列出的工作流状态、mobile 和 reduced-motion。
- [ ] 产品负责人明确批准视觉 demo 后才开始正式业务实现。
- [ ] 页面符合项目的暖纸色、编辑杂志式 serif/sans 视觉方向。
- [ ] 阶段切换没有 abrupt flash、大幅 layout jump 或无法中断的残留动画。
- [ ] 键盘、focus、live region、Diff 语义和 reduced-motion 均通过验证。

---

# 不在本 issue 范围内

- 根据学习者水平动态调整反馈深度；
- 保留或迁移现有开发环境中的旧 note/reviewCard/reviewLog 数据；
- 外部 durable queue 服务；
- 后台 Generation 2 job、轮询、runner、heartbeat 或请求池；
- 在数据库中保存改错卡尝试、全文二稿或迁移生成错误；
- 在数据库中持久化迁移练习队列和本地错误次数；
- event-specific 等待页主题；
- 通用文本 tokenization 或通用 diff engine；
- 在本 issue 中实现 Note variant 自动再生成或复杂编辑器。
