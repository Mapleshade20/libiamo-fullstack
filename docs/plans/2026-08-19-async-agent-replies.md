---
title: 真实异步 Agent 回复实施计划
related-issue: docs/issues/2026-08-16-async-agent-replies.md
---

# 真实异步 Agent 回复实施计划

> 关联 issue 当前不在工作树中，路径保留为 `docs/issues/2026-08-16-async-agent-replies.md`，需要在实施前恢复或由维护者确认其内容。本文依据既定产品不变量和实施范围重建。

## 目标与边界

将当前“提交用户消息时同步生成 Agent 回复”的流程改造成可恢复的持久化异步流程：Web 请求只保存用户输入并安排工作，独立 worker 按时间和批次生成、投递回复。页面关闭、worker 重启或短暂 provider 失败不能丢失可交付工作，也不能把过期 generation 的结果投递到新状态。

本计划不包含生产迁移、push、PR 或历史重写。Drizzle migration 只生成、审查并测试，不执行到生产数据库。

## 产品不变量

1. `maxTurns` 仍表示用户 turn 数。第 `maxTurns` 条用户消息保存后，在同一原子流程中完成 session、取消未投递 Agent 工作，并且不创建新的 response batch；不等待最后一条 Agent 回复。
2. Agent 判断“聊完了”只能阻止 idle follow-up，不能完成 session。
3. `terminate` 只用于严重辱骂或攻击；普通告别使用 `no_reply` 或停止 follow-up。
4. 用户发送与 Agent 回复解耦。等待异步回复期间输入保持可用。
5. 用户 turn、response batch、delivery、Agent 投递次数和 feedback 是不同概念，不能互相替代或共享上限。
6. `urgency` 表示从触发消息到下一次回复的 MTTH/preset，不表示回复次数。
7. `maxSessionAge` 从 session 创建时开始计算，过期后取消所有未投递工作。
8. stale generation、取消中的 delivery、已完成 session 的迟到结果都不得显示给用户。
9. Feedback 必须支持 conversation 以用户消息结束。

## 技术决策

1. 使用持久化 response batch 和 delivery 表实现 claimable scheduling；不能依赖页面加载时 backfill。
2. 以 session 的用户消息水位、batch generation 和 delivery 状态共同防止重复投递与迟到结果。
3. worker 使用短 lease 原子 claim 工作；租约过期后可恢复，已完成或已取消工作幂等处理。
4. 结构化 Agent 协议使用 `chatJson` schema，显式区分 `reply`、`no_reply` 和 `terminate_abuse`，并返回可验证的 delivery target 与 `allowIdleFollowUp`。
5. 记录 exact prompt、raw provider response、parsed result、repair 信息和 provider metadata；截断响应不做无界 repair。
6. Correction/普通回复只使用当前可信上下文；需要历史时由 batch generation 明确追加，不混用不同 verifier 的 context 策略。
7. BYOK 与 trial quota 必须在 worker 侧按真实 `userId` 解析，不能依赖 Web 请求生命周期。
8. 所有新状态迁移必须兼容现有 task/session；legacy `slow` 的转换要显式、可测试且不改变已经完成的 session。
9. 浏览器验收使用独立临时 profile 启动的 ungoogled-chromium，通过 CDP 验证真实时间、页面关闭/刷新、worker 重启和 Quest Hall 未读状态。

## 阶段 1：固化文档和产品不变量

- 恢复或核查 issue，并使 issue/plan 的术语和边界一致。
- 在文档中记录 maxTurns、idle follow-up、abuse termination、session completion 和取消语义。
- 退出条件：文档能明确区分用户 turn、Agent delivery、batch、session 生命周期和 feedback 边界。
- Commit：`docs: define asynchronous agent reply workflow`

## 阶段 2：配置、schema 与 migration

- 增加 urgency 类型、preset 和统一常量。
- 扩展 template、task、practice session 的配置和快照字段。
- 新增 response batch、delivery 及 claim/lease/generation 所需索引和状态字段。
- 更新 admin validation、TemplateForm、JSON import/export、task scheduling snapshot。
- 安全迁移 legacy slow，处理既有 task/session，并为时间策略和 migration 写测试。
- 只生成和审查 migration，不应用到生产数据库。
- 退出条件：schema、导入导出、调度快照和迁移测试通过，现有 session 数据语义不变。
- Commit：`feat: add asynchronous reply persistence`

## 阶段 3：结构化 Agent 回复协议

- 将单条纯文本生成改为 plan 定义的 `chatJson` contract。
- 实现 `reply`、`no_reply`、`terminate_abuse`、deliveries 和 `allowIdleFollowUp`。
- 支持 Reddit/AO3 reply target，并拒绝非法 target。
- 持久化 exact prompt、raw response、parsed result、repair 和 provider metadata。
- 覆盖 repair、截断、非法 target、普通告别和辱骂终止测试。
- 退出条件：协议 schema、解析错误、provider metadata 和安全终止行为均有测试证据。
- Commit：`feat: add structured agent reply generation`

## 阶段 4：response batch 与 worker

- 实现消息水位、dueAt、原子 claim、lease、租约恢复、stale generation 和 delivery 调度。
- worker 以后在 Web 服务进程内运行（`hooks.server.ts` 启动，`sveltekit:shutdown` 优雅停止；曾短暂为独立进程，后按决策内联，部署只有单个服务）。
- 实现 maxSessionAge、idle follow-up、provider failure、重试边界和迟到结果保护。
- 确保 worker 使用正确 userId 解析 BYOK 和 trial quota。
- 添加 worker、并发、幂等、取消、重启恢复和 lease 测试。
- 退出条件：两个 worker 并发运行不会重复投递；重启后可恢复未完成 lease；stale/cancelled 结果不可见。
- Commit：`feat: add asynchronous reply worker`

## 阶段 5：session 发送与结束流程

- 用户发送只持久化消息、创建或扩展 batch，并快速返回。
- 普通异步等待期间不锁输入；新用户消息更新水位并使旧 generation 按规则失效。
- 第 maxTurns 条用户消息在同一原子流程中保存、完成 session、取消任务且不创建新 batch。
- 用户主动结束和硬截止取消所有未投递工作。
- Feedback 支持以用户消息结尾的 conversation。
- 添加 route、service、并发和 maxTurns 回归测试。
- 退出条件：请求返回不依赖 provider 延迟；maxTurns 竞态和结束竞态由事务/测试证明。
- Commit：`refactor: decouple message submission from agent replies`

## 阶段 6：频道 UI 与 Quest Hall

- 更新客户端刷新、pending、错误和重试状态。
- 增加 Quest Hall 未读回复与 acknowledge，并持久化 acknowledge。
- 修复 Discord 连续消息分组，保持 iMessage bubble grouping。
- 验证 Reddit/AO3 thread target 和 Mail 连续邮件展示。
- 添加组件和页面测试。
- 退出条件：回复到达、失败、刷新和未读 acknowledge 的可见状态一致，且不重复渲染 delivery。
- Commit：`feat: render asynchronous conversations`

## 阶段 7：开发 Prompt 实验页

- 新增 plan 指定的两个固定任务。
- 复用生产 prompt builder、schema 和 generator，不复制另一套协议。
- 支持重置、重复运行、时间推进、generation 中插话和 maxTurns 取消场景。
- 展示 exact prompts、raw responses、parsed result、usage、repair、stale 和 cancelled 信息。
- 仅在开发环境可访问，不污染正式 task/session 数据。
- 使用独立临时 profile 的 ungoogled-chromium + CDP 验证上述交互、可见状态和持久化边界。
- 退出条件：实验页能重现所有关键协议分支，且生产数据没有新增记录。
- Commit：`feat: add asynchronous reply live demo`

## 阶段 8：跨系统验证

- 补充缺失的集成和回归测试。
- 运行 `pnpm check`、`pnpm test`、`pnpm build`。
- 启动 Web 服务（worker 内联同进程），执行 smoke test。
- 使用 CDP 控制 ungoogled-chromium，验证 worker 重启、lease 恢复、关闭页面后的真实回复、刷新持久化、Quest Hall 未读，以及两个固定任务中的连续消息、插话、no-reply、follow-up、abuse termination、maxTurns 立即完成、stale generation 和 cancelled delivery。
- 记录浏览器版本、CDP endpoint、实际 URL、关键交互、可见结果、控制台/网络错误和清理结果。
- 不修改前面 commit；发现问题时在本步骤直接修复。
- 退出条件：自动化检查、构建、Web/worker smoke test 和 CDP 验收全部通过，或剩余风险被明确记录。
- Commit：`test: verify asynchronous reply workflow`

## 每阶段门禁

每阶段只能创建一个 commit。提交前必须运行该阶段相关测试、`pnpm check`、`git diff` 和 `git diff --check`，确认没有无关文件或覆盖用户修改。不得 amend、squash、rebase 或提交明显不可运行的中间状态。

最终报告必须列出所有 commit、测试结果、migration 注意事项、Web/worker smoke test、ungoogled-chromium 版本与 CDP endpoint、尚未执行的外部操作和剩余风险。不得执行生产迁移、push、PR 或删除用户现有修改。
