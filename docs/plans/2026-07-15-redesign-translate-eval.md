---
title: 翻译评估与主动学习流程实施计划
related-issue: docs/issues/2026-07-15-redesign-translate-eval.md
---

# 翻译评估与主动学习流程实施计划

## 计划目的

实现 `docs/issues/2026-07-15-redesign-translate-eval.md`：主动学习翻译评估、`workflowPhase` 续做、路由拆分、全局词汇 Note=FSRS+双语释义+JSON 例句，以及翻译/传统 task 共用的反馈语言偏好。

阶段 1 视觉 demo **已通过**产品审查。可进入阶段 2+（LLM 协议 / DB / 业务路由）。实现时以 issue 中 grill 共识为准；下文是落地拆分。

## 当前基线

- `/translate/[id]` 单页作答+静态评价；submit 同步 `evaluateTranslationAgainstReferences`
- 评价 schema：overall A/B/C + 段反馈；`chatJson` 无 raw/finish/usage 返回面
- `translationAttempt`：`draft|submitted|evaluated`，`(userId,sourceSetId)` 永久唯一
- Note = tutorComment/keywords；独立 ReviewCard + FSRS + reviewLog→cardId
- Profile 无反馈语言偏好；传统 task feedback 当前 summary 使用目标语、comment 固定英语，未形成统一语言 contract
- `motion` 已装；`/translate-eval-demo` + `src/lib/components/translate-evaluation/*` 已存在

## 已确定的技术决策（grill 后）

### 1. 定位与匹配

- 无 token/offset 协议；Gen1 直接 `sourceText`/`originalAnswer`
- exact containment + **长度降序不重叠分配**；失败 soft warning，不高亮
- 不做模糊匹配

### 2. Generation 1

- 单次逻辑生成总评+评分+全部卡+Diff+按主要问题组织的 `teacherNotes`
- Gen1 评分只保留 accuracy、naturalness、grammar、overall，每项只允许 A/B/C/F，不使用加减等级；语域、声音、语用和语境契合度并入 naturalness。
- 结构/评分/截断 = 致命；containment/重复/非法 Diff = warning 或降级
- 成功后落库 structured evaluation + **generation1Messages**（最终成功轮 messages+assistant raw）
- 二稿 pass/skip 进入 `transfer` 时清空 generation1Messages；无卡完成时同事务清空；Gen2 成功不得提前清理
- 固定使用完整 few-shot prompt；不保留 prompt variant 或自动 A/B harness
- dev-only live demo 使用 reference 猫武士任务实际调用 Gen1，并展示完整请求 messages 与原始响应供人工审阅

### 3. Diff

- LLM 生成受限 XML；手写 parser→AST；禁止 `{@html}`
- **不**做 old/new 与 expected 恒等核验
- 非法 Diff → 对应答案 escaped 纯文本；**不**撤销 accept
- 语块级 prompt；accept 返回 acceptedDiff 尽力展示

### 4. Verifier

- 上下文锁定：DB 中 **Gen1 单轮 history** + 本轮新 system/user
- verifier 对话**不**持久化
- 二稿同策略
- reject 防泄题；provider 错误不耗次数
- Correction Verifier 只发送当前 card trusted context，不维护完整 Gen1 history 路径；通过 live harness 人工抽查质量与泄露

### 5. workflowPhase 与路由

```text
draft → submitted → correction → second_draft → transfer → completed
```

- 单一六态 phase 字段（取代「仅 evaluated + completedAt 双轨」作进度源）；总览是 correction 内 UI step，不建 overview phase；`evaluatedAt`/`practiceGeneratedAt`/`completedAt` 仍保留
- 路由：
  - `/translate/[id]` 详情（template id）
  - `/translate/[id]/attempt` 作答
  - `/translate/[id]/feedback` 评估
  - attempt id **仅服务端**推断：当前母语范围内唯一非 completed 优先，否则最新 completed；source set 从 attempt 反查
- 详情页：继续 / 确认放弃硬删 retake / completed 再做
- 评估内刷新：不弹 retake，按 phase + 可选 snapshot 恢复
- correction **内**总览 gate 与卡片进度仅 sessionStorage；无 snapshot 从总览恢复
- 新 retake 成为活动 attempt 后，主流程不再提供旧 completed 的完整反馈入口

### 6. 放弃与 retake

- 未完成可放弃：物理删 attempt + cascade Notes/相关 logs
- completed 可多条；非 completed 每 user+source set 至多一条

### 7. Note

- Note 持 FSRS；删 ReviewCard
- **所有**来源一次 LLM：目标语 `vocab` + 目标语词典释义 + 用户母语词典释义 + 4 条自然日常 JSON 例句
- `vocab` 是从正确 reference 中提取的 single word 或语境所需 lexical chunk，不是抽象句型；例句池不是四张卡
- 删除 `note_exercise_variant` 与 Note cursor/order；transfer/review 每次展示普通随机例句
- reviewLog → noteId

### 8. 迁移评分

- Incorrect → Again；Pass → **Good**
- 队列和随机例句索引仅 versioned sessionStorage snapshot；Incorrect 无限入队尾，Pass 移除

### 9. 动画

- `motion` 负责编排；Svelte transition 负责简单 enter/exit
- 不引入 svelte-motion/GSAP（除非 demo 证明不够）

### 10. Gen2

- 浏览器显式 `generatePractice`；无 job/轮询
- 二稿结束 phase→transfer，Notes 未 ready 页内等
- 条件原子写入 Notes；history 由 phase→transfer 清理

### 11. 长度

- 不设固定字符数或卡片数产品上限
- 所有模型统一使用 40k token 调用预算；提交事务前按实际 Gen1 prompt 数据预检，超限保持 draft 可编辑
- 通过预检后的 completion 截断仍作为失败 Retry

### 12. 反馈语言偏好

- `user.feedbackLanguagePreference`: `native | target`，默认 `native`
- Profile 使用 segmented control/radio group；`native` 无可用母语时生成端回退任务目标语言并在 Profile 提示
- 翻译首稿提交时解析并冻结具体 `translationAttempt.feedbackLanguage`
- 传统 task 首次生成反馈时解析并写入 `FeedbackResult.feedbackLanguage`
- 翻译 Gen1/hints/teacherNotes/verifier/二稿 commentary，以及传统 task comments/objectives/summary/follow-up Q&A，均使用对应冻结反馈语言；Note 母语释义与例句翻译改用用户实际母语
- 修改偏好只影响未来反馈；不重写已生成反馈或进行中的翻译 attempt

---

# 一、目标模块划分

## 客户端与组件

```text
src/lib/components/translate-evaluation/   # 已有，正式接入时复用
src/lib/client/translation-feedback-snapshot.ts
src/lib/client/translation-highlight.ts    # 改为不重叠分配

src/routes/(app)/translate/
  +page.*                                  # 大厅
  [id]/+page.*                            # 详情 CTA
  [id]/attempt/+page.*                    # 作答
  [id]/feedback/+page.*                   # 评估（按 phase 子视图）

src/routes/(app)/translate-eval-demo/       # 保留 dev-only
src/routes/(app)/profile/+page.*            # 反馈语言偏好控件
src/lib/constants.ts                        # FeedbackLanguageMode 常量与类型
```

## 服务端

```text
src/lib/server/translation.ts              # source set / attempt 创建
src/lib/server/translation-evaluation/
  schema.ts prompt.ts diff.ts generation.ts
  validation.ts verifier.ts practice-generation.ts
src/lib/server/note.ts                     # 统一 contract
src/lib/server/review-cards.ts             # 删除或收束为 note FSRS helpers
src/lib/server/llm.ts                      # detailed JSON result + repair
src/lib/server/feedback.ts                 # 传统 task feedback 统一语言 contract
src/lib/feedback/types.ts                  # 持久化 resolved feedbackLanguage
src/lib/schemas/settings.ts                # Profile 偏好校验
```

## 数据层

- `user`：`feedbackLanguagePreference`（native/target，默认 native）
- `translationAttempt`：`workflowPhase`、evaluation、generation1Messages、feedbackLanguage、evaluatedAt、practiceGeneratedAt、completedAt
- `practiceSession.tutorFeedback` 的 `FeedbackResult`：包含 resolved `feedbackLanguage`
- 部分唯一：非 completed 每 user+source set 一条
- `note` + `noteExerciseVariant`；`reviewLog.noteId`
- 不建 evaluation/card/job/second-draft 过程表

---

# 二、数据与状态设计

## 2.1 Phase 推进（服务端权威）

| 事件                             | phase                                               |
| -------------------------------- | --------------------------------------------------- |
| 创建 attempt                     | draft                                               |
| submit 首稿                      | submitted                                           |
| Gen1 成功                        | correction（UI 起点=总览）                          |
| correction 总览 Continue（有卡） | phase 不变；snapshot step→cards                     |
| correction 总览 Continue（无卡） | completed + 清 history                              |
| 最后一张卡终态                   | second_draft（触发 Gen2）                           |
| 二稿 pass/skip                   | transfer + 清 history                               |
| 迁移队列完成                     | completed                                           |
| regenerate 成功                  | correction（清 snapshot，换 history，重新显示总览） |

## 2.2 generation1Messages

- 仅成功 Gen1 最终轮
- 供 correction/二稿 verifier 拼接
- Gen2 成功不清理，避免二稿 verifier 丢失上下文
- 二稿 pass/skip 推进 `transfer` 时清空；无卡直接 completed 时清空
- abandon/删 attempt 一并删除

## 2.3 sessionStorage snapshot

```ts
type TranslationFeedbackSnapshot = {
  schemaVersion: number;
  attemptId: number;
  evaluatedAt: string;
  correctionStep: "overview" | "cards";
  currentCardIndex: number;
  cards: LocalCorrectionState[];
  secondDraft: LocalSecondDraftState;
  transfer: LocalTransferState;
};
```

phase 不靠 snapshot 权威；snapshot 失效时停在 phase 起点。`correction` 的 phase 起点固定为总览，不是第一张卡。

## 2.4 Verifier / Gen2 actions

- 校验 user、phase、evaluatedAt、card ordinal；卡内容只读服务端 evaluation
- 不写卡内进度表
- Gen2：条件更新 + 原子 Notes；history 保留到进入 transfer

## 2.5 详情 CTA

| phase              | 主按钮                  | 次操作         |
| ------------------ | ----------------------- | -------------- |
| 无/draft           | 开始/继续作答 → attempt | —              |
| submitted…transfer | 继续评估 → feedback     | 确认放弃并重做 |
| completed          | 查看反馈 / 再做一次     | —              |

解析限定当前母语对应的 source set：非 completed 优先，否则最新 completed。活动 retake 存在时不再从主流程打开旧 completed。

## 2.6 反馈语言冻结

- `src/lib/constants.ts` 定义 `FEEDBACK_LANGUAGE_MODES` / `FeedbackLanguageMode`，不在 route、schema 或 prompt 中重复内联 union
- 公共 resolver 输入用户偏好、`nativeLanguage`、任务目标语言，输出具体 `NativeLanguageCode | LanguageCode`；`native` 缺失时回退目标语言
- 翻译在 submit 的 40k token 预检通过后、锁定首稿前解析，写入 attempt；regenerate 和后续 verifier 只读 attempt 值
- 传统 task 在 `generateFeedback` 时解析并写入 `FeedbackResult`；feedback follow-up 读取该值，不重新读取用户当前偏好
- exercise front/source text 等教学材料语言不由该偏好改写

---

# 三、LLM 与解析设计

## 3.1 detailed result + repair

同前：rawContent、finishReason、usage；致命错误有界 repair；length 不 repair。

## 3.2 Diff parser

手写 AST；entity；拒未知标签/嵌套；**无** equality gate。

## 3.3 Gen1 / Verifier / Gen2 prompts

- Gen1：角色、选卡、防泄题提示、Diff 语法、contract、few-shot、任务数据、resolved feedbackLanguage
- Verifier：history + 新轮；few-shot 含同义 accept、改意 reject、不泄题、accept Diff；输出语言锁定 attempt.feedbackLanguage
- Gen2：从 reference 正确表达提取 single word 或 lexical chunk、生成双语词典释义与四条 JSON 例句、全覆盖 ordinals；不再生成抽象模式/explanation
- 非翻译 Note 路径：同一 schema 一次生成
- 传统 task：comments/objectives/summary/follow-up 使用 FeedbackResult.feedbackLanguage；annotated learner text 保持目标语原文

## 3.4 Generation 1 live review demo

- 新增 dev-only `/translate-eval-live-demo`，不写数据库，不进入默认 CI。
- 初始页固定使用 `docs/references/2026-07-15.md` 的猫武士原文、参考译文与预填用户作答；允许在调用前编辑作答。
- 提交后通过正式 `generateTranslationEvaluation` service 调用 `.env` / BYOK 模型，并把真实结果映射到已批准的总体评价与 correction card UI。
- 页面始终可展开查看本次 Gen1 的完整 messages；成功后同时展示最终原始 assistant JSON、model、usage、finish reason 和耗时，供人工审阅 prompt 与反馈质量。

---

# 四、分阶段实施

## 阶段 0：基线 — 可与阶段 2 并行扫尾

- `pnpm check` / `pnpm test` 基线
- 列出全部 Note/ReviewCard 读写点
- live review demo 不进默认 CI

## 阶段 1：视觉 demo — **已完成并通过**

见文末进度记录。

## 阶段 2：LLM 协议、Diff parser、Generation 1 live review demo — **已完成**

- detailed JSON + repair
- Gen1/verifier/Gen2 schema
- Diff parser + safe renderer
- 固定 contract + multi-issue/no-card few-shot，不提供 prompt variant
- 复制已批准 demo 的视觉流程，增加猫武士初始作答页并完整接入真实 Gen1 service
- 页面展示实际使用的完整 prompt messages 与原始响应，供人工审阅模型反馈
- 翻译与传统 task prompt 接收显式 feedbackLanguage；两种模式均有 contract 测试

退出：parser 与协议单测通过；dev-only live demo 可提交预填作答、看到正式 UI 结果，并能逐条检查完整 prompt 与原始响应。

## 阶段 3：DB — phase、history、retake 与偏好字段

- `user.feedbackLanguagePreference`；`workflowPhase`；`generation1Messages`；`translationAttempt.feedbackLanguage`；`practiceGeneratedAt`/`completedAt`
- 唯一约束改为「至多一条非 completed」
- migration via `pnpm db:generate --name redesign_translation_evaluation`
- Gen1 submit/retry/regenerate 语义；Notes 已存在拒 regenerate
- 硬删 abandon service
- 40k token 提交前预检；超限不锁定首稿、不计 candidate vote

退出：空库可 migrate；无过程表；abandon/retake 测过。

## 阶段 4：路由拆分 + correction 总览接入

- `[id]` 详情 CTA；`attempt` 作答；`feedback` 按 phase
- phase redirect 矩阵
- correction 总览高亮不重叠；regenerate；有卡 Continue 只写 snapshot step，无卡 Continue 写 completed
- 多标签页 regenerate 更新 evaluatedAt；旧 snapshot/verifier 以 409 失效
- snapshot 读写；i18n 四语 key
- Profile 偏好控件、schema/auth 更新；传统 task feedback 与 follow-up 切换到冻结语言

退出：与 demo 视觉一致；submitted 刷新不回可编辑首稿。

## 阶段 5：correction + verifier

- 接入卡组件；两次尝试；无 Skip
- 当前 card context 调用 Correction Verifier；accept 不因 Diff 失败撤销
- 最后一卡 → second_draft

退出：accept / 双 reject 路径可测；409 evaluatedAt 处理。

## 阶段 6：全局 Note/FSRS（按词汇 Note 修订）

- note schema 改为 `vocab`、`targetDefinition`、`nativeDefinition`、JSON `examples`、FSRS；reviewLog→note 保持
- 删除 `note_exercise_variant`、`exerciseOrder`、`exerciseCursor`，pre-production migration wipe 无法无损转换的 attempt/Note/log
- 全部写入路径一次 LLM 满 contract；传统 feedback 显式传用户母语；Gen2 从 reference 正确表达中提取词或 lexical chunk
- Archive/Review/API/stats/删除同步切换新字段

退出：`rg` 无生产 ReviewCard/variant/cursor/order 写入；JSON 例句与双语释义约束测试。

## 阶段 7：Gen2 + 二稿

- generatePractice + 条件写 vocab/释义/JSON 例句；Gen2 成功不清 history
- 二稿 verifier + commentary UI + skip
- phase→transfer 时清 history；胶囊状态

退出：无 job/轮询；并发与版本竞争确定。

## 阶段 8：transfer queue + Review random example

- snapshot 队列保存 Note id 与本次随机 example index；typed-before-reveal
- Incorrect=Again、移到队尾并为下次普通随机例句，不设次数上限；Pass=Good、移除
- Review 四档；每次展示从 Note JSON examples 普通随机一条，不持久化 rotation 状态
- 队列结束 → completed

## 阶段 9：整体验证与清理

- reference 样例全流程 + 多种用户输入
- CDP 分别实测 Generation 2 和传统 session feedback Save to Note，检查正面母语释义+例句翻译、背面 vocab+目标语例句
- 删静态旧评价代码；四语；a11y；live 回归
- 更新 `AGENTS.md` 架构事实
- 申请是否移除 demo

```sh
pnpm check && pnpm test && pnpm build
```

## 阶段 10：统一 Anki 风格抽认界面

- 新建一个由 Transfer 和 `/review` 共同使用的受控抽认组件，统一题面、两段答案、键盘揭晓、评分控制区与三色队列计数；删除 3D 翻面和 Transfer 文本输入。
- 暖白抽认区按最终答案内容提前参与布局：上半区 `nativeDefinition` + 预留 `vocab`，下半区 `nativeText` + 预留 `targetText`，中间使用细分隔线。揭晓只改变答案可见性和透明度，不挂载新布局节点。
- 底部固定控制区统计剩余队列的 FSRS New / Learning+Relearning / Review。普通 Review 从服务端下发每张 Note 的队列类型；Transfer snapshot 队列持久化类型，Incorrect 后改为 Learning 并入队尾，Pass 后移除。
- 揭晓前提供整行 Show Answer；点击、Space、Enter 等价。揭晓后 Review 显示四档 FSRS 按钮，Transfer 显示 Incorrect / Pass；保留 Review 的 1–4 快捷键并为 Transfer 提供 1–2 快捷键。
- 组件 SSR 测试验证答案在未揭晓时不可访问但仍占位，队列纯函数测试验证类型计数与 Incorrect 转 Learning；CDP 分别测量揭晓前后卡片及两段题面 geometry，证明多行答案不会引起位置突变。

退出：两处均使用共享组件；键盘、计数、评分和移动端底栏可用；`pnpm check && pnpm test && pnpm build` 通过。

## 阶段 11：卡片排版与 Anki 学习步骤

- 共享 `StudyCard` 内不使用衬线体。`nativeDefinition / vocab / nativeText / targetText` 的基础字号依次固定为 `xl / 2xl / xl / xl`，`sm` 起各增一级；双语例句使用同一内容宽度并左对齐。根据最终字号重新检查上下区间距和固定底栏遮挡。
- Again、Hard、Good、Easy 以及 Transfer 对应操作使用语义色实心按钮，保留可读的白色标签、间隔预览和 hover 状态。
- 以 Anki 官方手册的 [Deck Options](https://docs.ankiweb.net/deck-options) 与 [Studying](https://docs.ankiweb.net/studying.html) 为排期依据：Again 表示未回忆并回到首个学习步骤；Hard 是通过而非失败；Good 推进学习步骤；Easy 直接毕业。显式学习步骤完成前卡片保持 Learning，Review 卡 Again 后保持 Relearning。
- 延续 `ts-fsrs` 默认显式步骤 `learning_steps=['1m','10m']`、`relearning_steps=['10m']`。API 评分后返回新 FSRS 类型、下一轮四档间隔和普通随机例句；客户端只移除已毕业卡，Learning/Relearning 卡更新后进入当前队尾。这样只按 Again 不会结束学习会话。
- 单元测试覆盖 New → Again → Learning、重复 Again、Good 完成两步后毕业、Review → Again → Relearning，以及客户端队尾/移除行为；CDP 连续两次对同一卡按 Again，确认页面不进入总结且 Learning 计数保持。

退出：四字段排版、对齐和按钮样式符合要求；Again 可无限重入队尾；官方排期规则、FSRS 状态和界面队列一致；全量验证通过。

---

# 五、测试矩阵

| 层          | 重点                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| 纯函数      | Diff parser、不重叠 highlight、snapshot、ratings                                              |
| LLM adapter | raw/repair/finishReason/BYOK、40k budget、feedbackLanguage                                    |
| Service     | phase 推进、history 生命周期、attempt 解析、偏好冻结、abandon cascade、Gen2 条件写、FSRS 事务 |
| Route       | CTA、redirect、无 attempt id 泄露、Profile 偏好、传统 feedback language                       |
| Component   | demo 状态、Diff a11y、focus、reduced-motion                                                   |
| Live        | parse、覆盖、泄题、语言方向                                                                   |
| Browser     | desktop/mobile、生产 demo 404                                                                 |

时间测试用固定日期。DB 单测 mock `$lib/server/db`；约束用 dev DB。

---

# 六、风险与控制

| 风险                 | 控制                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| 模型复制子串不准     | warning + regenerate；不重叠分配                                              |
| 输入超出模型预算     | 提交前按统一 40k token 预算预检；超限保持 draft 可编辑                        |
| 输出过长截断         | 通过预检后仍截断则失败 Retry；prompt 合并同句问题                             |
| reject 泄题          | history 路径 + 强 system；harness 抽查                                        |
| Gen2 中断            | practiceGeneratedAt 幂等；transfer 页等待                                     |
| 全局 Note 切换面大   | 阶段 6 清单 + rg 门禁后再删表                                                 |
| 放弃丢 Notes         | 确认文案写明；硬删 cascade                                                    |
| 动画残留             | Motion cleanup；reduced-motion 分支                                           |
| 用户中途切换反馈语言 | 翻译 attempt / 传统 FeedbackResult 冻结 resolved language；偏好只影响未来生成 |

---

# 进度追踪和实施记录

## 阶段 1

- Demo 路由：`/translate-eval-demo`（仅开发环境；生产 load 返回 404）
- 组件目录：`src/lib/components/translate-evaluation/`
- 覆盖场景：evaluating / evaluating-failed / evaluated match / warning+regenerate / no-cards / card initial / first reject / accept user Diff + referenceAnswer / second reject minimal Diff + referenceAnswer / provider error / second draft capsule generating·failed·ready / draft done waiting practice / transfer / complete；侧栏可切换 390px 与 reduced-motion
- 产品复审反馈（已写入 issue）：句级高亮、accept 仅双 Diff、second reject minimal Diff、细粒度 Diff、二稿底部 status + history/commentary verifier、textarea 自动增高
- 动效：`motion` 编排等待页 SVG pathLength 循环与 overview 入场/荧光笔；局部 enter/exit 用 Svelte transition；Motion controls 在 `$effect` cleanup 中 stop

用户审查：经若干轮修改，通过

## 阶段 2

- `chatJson` 已改为单一 object 参数接口，返回 parsed value、assistant content、finish reason、model、usage 与最终成功请求 messages；非法结构只做一次携带原始输出和具体校验错误的定向 repair，`finish_reason=length` 不 repair。
- 新增 `src/lib/server/translation-evaluation/`：严格 Gen1/correction verifier/second-draft verifier/Gen2 schemas、prompt、领域校验、协议调用和受限 Diff parser。Diff 只生成 AST；非法 Diff 作为 warning 并降级 escaped 纯文本，不撤销已接受结果。
- Gen1 固定使用 multi-issue + no-card 两组 few-shot，不再保留 shape-only variant、自动对比脚本或导出报告。
- Gen1 system prompt 要求先按输入顺序逐句审阅语义、语法、词形、搭配、结构、逻辑、指代和语域，再在输出前静默核对覆盖：每个有明确问题的句子恰好进入一张综合卡，不因句意可懂、相邻问题更严重或控制卡数而漏检；仅可选风格优化不生成卡片。
- Gen1 exact containment 使用长度降序不重叠分配；second draft 与 Gen2 要求 ordinal 恰好覆盖；Gen2 每 Note 恰好四个不同练习。
- Diff 只要受限语法可解析即展示，不做 original/minimal 内容匹配；replace 允许单边为空以表达删除或插入。
- `minimalDiff` 表示完整的 originalAnswer→minimalAnswer 句子/连续文本：未改内容保留为普通文本，只有实际编辑使用受限标签；单独返回某个编辑操作不满足该 contract。
- Gen1 每卡的 `teacherNotes` 与主要问题一一对应：每条完整讲一个问题，并把该问题的原因、原文意图、语言/背景知识、关联表达、例子与迁移方式整合在同一条，不为例句或拓展另起条目；采用 tutor 直接对用户说话的第二人称口吻。approved UI 与 old demo 均以圆圈序号列表展示。
- Gen1 每卡的 initial/deeper hint 覆盖同一组全部主要错误：initial 给出完整问题诊断、理由和修改方向，deeper 逐项延伸这些相同问题并提供更明确支撑，不以另一批并列错误取代 initial 内容。
- initialHint 只能提供不泄露答案的语义/语法方向，禁止确切替换词、正确词形、答案片段、可直接套用模板及解决当前句子的例句；deeperHint 才可对相同问题给候选短词、搭配或结构框架，仍禁止完整正确分句/句子。
- correction card 的 initial/deeper hint 通过共享 `renderMarkdown()` 安全渲染，保留段落、换行和编号列表结构。
- Gen1 task payload 每段只携带一个 `authenticReference` 字符串，不使用 `authenticReferences` 数组。
- 传统 task comments/objectives/summary/follow-up 与翻译协议均显式接收具体 feedback language；持久化冻结仍按后续 DB/路由阶段实施。
- dev-only `/translate-eval-live-demo` 使用 reference 猫武士样例，提供预填首稿、真实 Gen1 调用、批准后的评价 UI，以及完整 prompt/raw response 审阅面板；不写业务数据库。成功结果、prompt、raw response、metadata 与当前卡片状态写入经类型校验的 sessionStorage，同一标签页刷新可恢复，“Edit and run again”清除旧结果。
- live demo 的 Generation 1 sampling temperature 可在 `0.0`–`1.0`（步长 `0.1`）间选择，默认 `0.4`。服务端严格验证范围；选择值独立保存于同标签页 sessionStorage，实际使用的值记录在 review metadata 并显示于 inspector。
- live demo 的 correction card 使用唯一正式 Correction Verifier 协议：只发送 verifier instruction、当前 card trusted context 与本次 learner revision，并保留完整 request/raw response/metadata。
- live demo 复用正式 SecondDraft UI 接通真实 Second Draft Verifier；该 verifier 固定将 system/user 追加到准确的成功 Gen1 history，并展示完整调用过程。未通过的 card 映射回对应 source paragraph 做二稿高亮。
- LLM completion budget 的公共默认值调整为 `8,192`。Correction Verifier 和 Second Draft Verifier 不重复写额度，统一继承默认值；Generation 1、Generation 2 与场景练习完整会话反馈显式使用 `32,768`。
- Correction Verifier 以 `referenceAnswer` 为主要基准判断 learnerRevision 是否覆盖必要概念与交际意图、用法正确且自然，再用 card issues 检查遗留问题和新错误。reference 的确切同义词和细微强度不是硬要求；teacherNotes/hints 只是待复查诊断，不是词汇答案。`sourceText` 只作较低优先级且可能不精确的语境参考；source/original/minimal 中未被 reference 要求的细节不得成为拒绝依据。结构化输出固定 `allCardIssuesResolved`、`noNewErrors`、`fullyNatural`；accept schema 将三项约束为 literal true，reject 至少一项 false。请求显式携带 `referenceAnswer` 与 `teacherNotes`；system prompt 定义主要字段，说明 `originalAnswer` 是用户首稿而非标准答案；不包含 `attemptNumber`。
- Correction Verifier 的 reject feedback 只可引用 learner revision 中的错误措辞来定位问题，不得给出或对比候选替换，也不得泄露 `referenceAnswer`、`minimalAnswer` 或 `teacherNotes` 的答案措辞；反馈只提供抽象诊断和修改方向。
- 使用 `deepseek-v4-flash` 对曾被误拒的 `I'm really fond of ... falling in love after each of their mates passed away ... not the characters for that kind of development` revision 复测。该 revision 没有 source/original 中的 `again`，但 reference 也不要求该细节；最终唯一 card-context 请求返回 accept，三项 checks 均为 true，finish reason 为 `stop`，未触发 repair。
- 浏览器使用 singular reference + issue-grouped teacherNotes prompt 实际调用 `deepseek-v4-flash`：正式 Gen1 service 返回 7 张卡、`finish_reason=stop`、无 repair、无 validation warning；实际 request 只含 `authenticReference`，不含 `authenticReferences`。各卡 teacherNotes 数量为 1/3/3/2/3/3/3，每条均对应一个问题并把例子或拓展留在该问题条目内。调用耗时 121,371 ms，usage 为 3,752 prompt / 15,106 completion / 18,858 total tokens。
- Gen1 不再生成 `referenceDiff`；新增 `referenceMarked`，它逐字复现完整 `referenceAnswer`，仅以 `<mark>` 标记值得学习且用户首稿未使用的表达。Reference 安全解析后复用 Tutor Comments 的可点击语义化 mark 样式（暂不展开悬浮窗），非法则降级 `referenceAnswer`；Your/Minimal changes 继续使用标准删除与新增前后对照。
- Chrome 使用真实 Gen1 结果验证 hint Markdown：带前导段落和 `1./2./3.` 的模型文本渲染为一个 `<p>`、一个 `<ol>` 及对应 `<li>`，不再压成连续纯文本。

最新的 prompt 已调试好。严格 schema/payload 测试确认只保留四项评分且每项只接受 A/B/C/F、全部 Gen1 消息均不含 `referenceDiff`；CorrectionResult SSR 测试确认 referenceAnswer 直接以 `text-foreground` 纯文本渲染，结果区只有 primary DiffView；live-demo route/session tests 确认 temperature 透传、范围拒绝、已验证的同标签页持久化、唯一 card-only Correction Verifier、Second Draft Verifier 的 Gen1 history 追加和 canonical history prefix 拒绝。

## 阶段 3–8 实施记录

- 数据层已切换为六态 `workflowPhase`；attempt 保存冻结反馈语言、Gen1 history、评价版本、practice/completed 时间。活动 attempt 使用部分唯一索引，旧开发数据由 breaking migration 清除。
- 正式路由已拆为详情、`/attempt` 和 `/feedback`。attempt ID 仅服务端解析；详情页负责确认放弃/retake，评估页按服务端 phase 与当前标签页 versioned snapshot 恢复。
- 正式流程已接入 approved waiting、overview、correction、second draft、practice capsule 与 transfer 组件。Correction Verifier 只接收当前 card trusted context；二稿 verifier 从 DB 中成功 Gen1 history 追加新轮。
- Gen2 由浏览器显式触发，在 `evaluatedAt` 条件保护下原子写入 `practiceGeneratedAt` 与完整词汇 Notes；只有进入 transfer 才清 Gen1 history。
- Note 已直接承载 `vocab`、双语词典释义、JSON 例句与 FSRS。ReviewCard、`note_exercise_variant`、cursor/order、生成服务和 create-card API 已删除；Archive、普通 Review、transfer rating 与 review logs 都直接使用 Note。
- Profile 已加入 `native | target` 反馈语言偏好。翻译 attempt 与传统 `FeedbackResult` 在首次生成时冻结具体语言，后续 verifier、Note 与追问读取冻结值。

## 阶段 9 验收记录

- Chrome CDP 以已登录用户完成桌面端真实全流程：详情 → 首稿与候选选择 → Gen1 → 总览 → 两次拒绝/揭示与通过 → 二稿 verifier → Gen2 → 迁移 → completed；并检查 Archive、Review、Profile 和翻译列表结果。
- snapshot 经刷新验证首稿、改错和二稿恢复。迁移时发现切换 Note 后输入与揭示状态未重置，已修正为按 Note/variant 身份重置并在 HMR 后复测。
- 以 390×844 viewport 验收移动端详情页；检查键盘 Escape、按钮可用性、网络请求和页面无失败响应。
- 实际 BYOK 调用验证 Gen1、Correction Verifier、Second Draft Verifier 与 Generation 2。根据首次 Gen2 输出中不自然的搭配，收紧中心模式、合并条件、语义对齐及地道性自检 prompt；第二次实际调用通过 schema/ordinal 覆盖并生成 5 Notes、每 Note 4 个自然迁移句。
- 原四 variants 验收记录已被本轮词汇 Note 结构取代。迁移 `0009_vocab_notes` 清空不可无损转换的开发 attempt/Note/log，删除 variant 表和 cursor/order，并建立 vocab/双语释义/examples JSON 非空约束。
- Generation 2 live review 直接调用无数据库写入的正式 Gen2 service，展示每个 Note 的来源 card、`vocab`、双语词典释义和全部 JSON 例句，并暴露 exact prompt、raw response、provider metadata；验证后的结果和调用 artifacts 使用 versioned sessionStorage 在刷新后恢复，可反复重跑。
- 最终 CDP 验收中，live demo 的正式 Generation 2 调用以首稿 `build`、参考答案 `buildup` 生成 1 个 `buildup` Note：英文/中文词典释义齐全，4 组自然双语例句通过结构校验，`finish_reason=stop` 且未触发 repair。
- 传统 session feedback 的 `Save to Notes` 浏览器操作从 session 57 的 `whirlwind` 教师批注写入 Note 26：`vocab=whirlwind`、双语词典释义及 4 组双语例句均落库。随后 `/review` 的正面显示中文释义和中文例句，背面显示 `whirlwind` 和英文例句；连续 8 次重新加载实际抽到全部 4 条例句，确认不存在持久化轮换游标。
- 阶段 10 已用共享 `StudyCard` 取代 Review 的 3D `Flashcard`/独立 `RatingButtons` 以及 Transfer 输入式界面。两处都使用暖白上下双区卡片、固定底部三色 FSRS 队列计数和原位切换的揭晓/评分控制区；旧组件已删除。
- CDP 在 `/review` 分别用 Space、Enter 和宽按钮揭晓，均切换到四档评分；Transfer demo 使用同一组件切换到 Incorrect/Pass。揭晓前后抽认区和两段题面的 bounding rect 逐项相同；Transfer 的多行目标语答案底部为 646.875px，固定控制区顶部为 703px，无遮挡。
- CDP 在 Transfer demo 以快捷键 1 选择 Incorrect 后，下一 Note 先展示，原 New Note 移到队尾并把计数从 `1 + 0 + 1` 更新为 `0 + 1 + 1`，证明 Learning 类型和队尾行为同步。
- 阶段 11 按 Anki 官方手册核对短期步骤：默认首个 Again 为 `1m`（仅实际间隔不足一分钟时显示 `<1m`），而不是固定 `<1m`；显式 `1m 10m` 学习步骤下 Again 回到首步且不毕业，Review 卡 Again 进入 `10m` Relearning。共享卡片同步改为无衬线四档字号、左对齐例句和实心语义色按钮。
- CDP 检查实际 computed style：桌面端四字段为 `24px / 30px / 24px / 24px`、全部为 sans-serif，两条例句均左对齐，四个评分按钮均为白字实心色。连续两次按 Again 后均回到未揭晓卡面，未出现 Session Complete，计数持续为 `0 New + 1 Learning + 0 Review`。
- 目标语例句装饰按参考 Anki CSS 改为 `::before` 绝对定位开引号与 `currentColor` 左边线，引号不进入文档流；上 padding 调至 32px，拉开引号与正文。Demo 移除 390px 模拟开关，并与正式 feedback 一样直接使用 app layout 的页面 shell。
- 短内容页伪滚动和双层 padding 的根因是 `(app)/+layout.svelte` 已渲染带 inset 的 `<main>`，feedback 与 demo 又各自嵌套了带 min-height/padding 的第二个 `<main>`。现删除两个 route-level main；Waiting/Completed 直接按 `100dvh - 8rem` 使用 shell 可用高度。CDP 验证 demo DOM 只有一个 main，evaluating 为 `scrollHeight=clientHeight=825`。
- 最终验证：`pnpm check` 0 errors / 0 warnings；`pnpm test` 85 files / 939 tests passed
