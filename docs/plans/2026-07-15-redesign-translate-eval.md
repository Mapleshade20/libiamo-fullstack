---
title: 翻译评估与主动学习流程实施计划
related-issue: docs/issues/2026-07-15-redesign-translate-eval.md
---

# 翻译评估与主动学习流程实施计划

## 计划目的

实现 `docs/issues/2026-07-15-redesign-translate-eval.md`：主动学习翻译评估、`workflowPhase` 续做、路由拆分、全局 Note=FSRS+4 variants，以及翻译/传统 task 共用的反馈语言偏好。

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

- 单次逻辑生成总评+评分+全部卡+Diff+teachersNote
- 结构/评分/截断 = 致命；containment/重复/非法 Diff = warning 或降级
- 成功后落库 structured evaluation + **generation1Messages**（最终成功轮 messages+assistant raw）
- 二稿 pass/skip 进入 `transfer` 时清空 generation1Messages；无卡完成时同事务清空；Gen2 成功不得提前清理
- shape-only vs few-shot 真实模型 A/B

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
- 实现期不双轨 A/B 代码；harness 抽查质量/泄露

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

- 未完成可放弃：物理删 attempt + cascade Notes/variants/相关 logs
- completed 可多条；非 completed 每 user+source set 至多一条

### 7. Note

- Note 持 FSRS；删 ReviewCard
- **所有**来源一次 LLM：targetPattern + explanation + 恰好 4 exercises
- reviewLog → noteId

### 8. 迁移评分

- Incorrect → Again；Pass → **Good**
- 队列仅 snapshot；四次 Incorrect deferred

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
- 翻译 Gen1/hints/teachersNote/verifier/二稿 commentary/Note explanation，以及传统 task comments/objectives/summary/follow-up Q&A，均使用对应冻结语言
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

| 事件 | phase |
| --- | --- |
| 创建 attempt | draft |
| submit 首稿 | submitted |
| Gen1 成功 | correction（UI 起点=总览） |
| correction 总览 Continue（有卡） | phase 不变；snapshot step→cards |
| correction 总览 Continue（无卡） | completed + 清 history |
| 最后一张卡终态 | second_draft（触发 Gen2） |
| 二稿 pass/skip | transfer + 清 history |
| 迁移队列完成 | completed |
| regenerate 成功 | correction（清 snapshot，换 history，重新显示总览） |

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

| phase | 主按钮 | 次操作 |
| --- | --- | --- |
| 无/draft | 开始/继续作答 → attempt | — |
| submitted…transfer | 继续评估 → feedback | 确认放弃并重做 |
| completed | 查看反馈 / 再做一次 | — |

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
- Gen2：合并模式、四 exercises、全覆盖 ordinals；explanation 使用 attempt.feedbackLanguage
- 非翻译 Note 路径：同一 schema 一次生成
- 传统 task：comments/objectives/summary/follow-up 使用 FeedbackResult.feedbackLanguage；annotated learner text 保持目标语原文

## 3.4 Live harness

默认 CI 不调外网；显式命令 + `.env`；reference 样例打分表。

---

# 四、分阶段实施

## 阶段 0：基线 — 可与阶段 2 并行扫尾

- `pnpm check` / `pnpm test` 基线
- 列出全部 Note/ReviewCard 读写点
- live eval 不进默认 CI

## 阶段 1：视觉 demo — **已完成并通过**

见文末进度记录。

## 阶段 2：LLM 协议、Diff parser、真实模型 A/B

- detailed JSON + repair
- Gen1/verifier/Gen2 schema
- Diff parser + safe renderer
- shape-only vs few-shot live 评测（≥3 次/版本）
- verifier 泄题/严格性抽查（单上下文路径）
- 翻译与传统 task prompt 接收显式 feedbackLanguage；两种模式均有 contract 测试

退出：parser 单测通过；有可复查 live 结论；选定生产 prompt。

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
- history 拼接 verifier；accept 不因 Diff 失败撤销
- 最后一卡 → second_draft

退出：accept / 双 reject 路径可测；409 evaluatedAt 处理。

## 阶段 6：全局 Note/FSRS

- note schema + 4 variants；reviewLog→note
- 全部写入路径一次 LLM 满 contract
- Archive/Review/API/stats/删除
- 删 ReviewCard 写入与表（dev wipe）

退出：`rg` 无生产 ReviewCard 写入；四 variants 约束测试。

## 阶段 7：Gen2 + 二稿

- generatePractice + 条件写；Gen2 成功不清 history
- 二稿 verifier + commentary UI + skip
- phase→transfer 时清 history；胶囊状态

退出：无 job/轮询；并发与版本竞争确定。

## 阶段 8：transfer + Review rotation

- snapshot 队列；typed-before-reveal
- Incorrect=Again，Pass=Good
- Review 四档 + variant bag
- 队列结束 → completed

## 阶段 9：整体验证与清理

- reference 样例全流程 + 多种用户输入
- 删静态旧评价代码；四语；a11y；live 回归
- 更新 `AGENTS.md` 架构事实
- 申请是否移除 demo

```sh
pnpm check && pnpm test && pnpm build
```

---

# 五、测试矩阵

| 层 | 重点 |
| --- | --- |
| 纯函数 | Diff parser、不重叠 highlight、snapshot、ratings |
| LLM adapter | raw/repair/finishReason/BYOK、40k budget、feedbackLanguage |
| Service | phase 推进、history 生命周期、attempt 解析、偏好冻结、abandon cascade、Gen2 条件写、FSRS 事务 |
| Route | CTA、redirect、无 attempt id 泄露、Profile 偏好、传统 feedback language |
| Component | demo 状态、Diff a11y、focus、reduced-motion |
| Live | parse、覆盖、泄题、语言方向 |
| Browser | desktop/mobile、生产 demo 404 |

时间测试用固定日期。DB 单测 mock `$lib/server/db`；约束用 dev DB。

---

# 六、风险与控制

| 风险 | 控制 |
| --- | --- |
| 模型复制子串不准 | warning + regenerate；不重叠分配 |
| 输入超出模型预算 | 提交前按统一 40k token 预算预检；超限保持 draft 可编辑 |
| 输出过长截断 | 通过预检后仍截断则失败 Retry；prompt 合并同句问题 |
| reject 泄题 | history 路径 + 强 system；harness 抽查 |
| Gen2 中断 | practiceGeneratedAt 幂等；transfer 页等待 |
| 全局 Note 切换面大 | 阶段 6 清单 + rg 门禁后再删表 |
| 放弃丢 Notes | 确认文案写明；硬删 cascade |
| 动画残留 | Motion cleanup；reduced-motion 分支 |
| 用户中途切换反馈语言 | 翻译 attempt / 传统 FeedbackResult 冻结 resolved language；偏好只影响未来生成 |

---

# 进度追踪和实施记录

## 阶段 1

- Demo 路由：`/translate-eval-demo`（仅开发环境；生产 load 返回 404）
- 组件目录：`src/lib/components/translate-evaluation/`
- 覆盖场景：evaluating / evaluating-failed / evaluated match / warning+regenerate / no-cards / card initial / first reject / accept dual-diff（无 Your revision 纯文本） / second reject minimal+reference Diff / provider error / second draft capsule generating·failed·ready / draft done waiting practice / transfer / complete；侧栏可切换 390px 与 reduced-motion
- 产品复审反馈（已写入 issue）：句级高亮、accept 仅双 Diff、second reject minimal Diff、细粒度 Diff、二稿底部 status + history/commentary verifier、textarea 自动增高
- 动效：`motion` 编排等待页 SVG pathLength 循环与 overview 入场/荧光笔；局部 enter/exit 用 Svelte transition；Motion controls 在 `$effect` cleanup 中 stop

用户审查：经若干轮修改，通过

## Grill 共识同步

- 已按 2026-07-21 grill 重写 issue 与本 plan 决策/阶段（phase 路由、history、Diff 不核验恒等、Pass=Good、全站 4 variants、可硬删放弃）。
- 后续 grill 明确：history 在 transfer/no-card completed 清理；attempt 按当前母语下活动优先、否则最新 completed；所有模型采用提交前 40k token 预算预检。
- 新增 Profile `native|target` 反馈语言偏好，并把传统 task feedback/follow-up 纳入同一冻结语言 contract。
- 移除独立 `overview` phase；总览合并为 correction 首个 UI step，phase 级恢复回到总览。
- 之后不应再把第一阶段叫做 card，而应该是 correction。
- 阶段 1 demo 结论：仍然已通过。
