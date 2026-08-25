---
title: 实现真实异步 Agent 回复
type: feature
status: needs-plan
link: https://github.com/Mapleshade20/libiamo-fullstack/issues/
---

# 实现真实异步 Agent 回复

## 背景

当前 practice session 在用户发送消息的请求内同步生成 Agent 回复。这样会把 provider 延迟、页面生命周期和 session 提交耦合在一起：用户等待期间无法稳定继续输入，关闭页面可能丢失回复，worker 重启没有可恢复的工作，迟到的模型结果也可能写入已经变化的 conversation。

真实异步回复需要把用户 turn、response batch、delivery、session 生命周期和 feedback 分开建模，并由持久化、可 claim 的 scheduler/worker 驱动。页面加载时补做一次生成不满足该需求。

## 目标

- 用户发送只负责保存消息和安排工作，快速返回，不等待模型回复。
- 通过持久化 response batch 和 delivery 支持 dueAt、原子 claim、lease 恢复、幂等投递和 worker 重启。
- 结构化记录 `reply`、`no_reply`、`terminate_abuse`、delivery target、`allowIdleFollowUp` 及 provider 诊断信息。
- 支持 urgency preset、idle follow-up、maxSessionAge、stale generation、取消和 provider failure。
- 让 Reddit/AO3 thread target、Discord 连续消息、iMessage bubble grouping 和 Mail 连续邮件保持正确展示。
- Quest Hall 能显示异步回复未读状态，并支持 acknowledge。
- 提供开发专用 live demo，复用生产 prompt builder、schema 和 generator，展示完整请求/响应证据。

## 产品不变量

1. `maxTurns` 仍只计算用户消息。第 `maxTurns` 条用户消息保存后立即完成 session，取消未投递 Agent 工作，不等待最后回复，也不创建新 batch。
2. Agent 判断“聊完了”只能停止 idle follow-up，不能完成 session。
3. `terminate` 仅用于严重辱骂或攻击；普通告别不是 terminate。
4. 异步等待期间不锁住用户输入；新用户 turn 会更新水位并按 generation 规则处理旧工作。
5. `urgency` 是从触发消息到下一次回复的 MTTH/preset，不是 delivery 或用户 turn 上限。
6. `maxSessionAge` 从 session 创建时计算，过期后取消所有未投递工作。
7. stale generation、cancelled delivery 和已完成 session 的迟到结果不得投递。
8. Feedback 必须支持 conversation 以用户消息结束。

## 预期实现范围

### 配置、数据与迁移

- 增加 urgency 常量、preset 和类型。
- 扩展 template、task、practice session 及其 snapshot。
- 新增 response batch、delivery、generation、水位、claim/lease 和状态索引。
- 更新 admin validation、template form、JSON import/export 和 scheduling snapshot。
- 安全迁移 legacy slow 及已有 task/session。
- migration 只生成和审查，不执行生产迁移。

### Agent 协议与 worker

- 使用结构化 `chatJson` contract 生成回复。
- 保存 exact prompt、raw response、parsed result、repair 和 provider metadata。
- 覆盖 repair、截断、非法 target、普通告别和辱骂终止。
- 实现持久化 scheduler、原子 claim、lease、恢复、stale generation、delivery 调度、idle follow-up、maxSessionAge 和 provider failure。
- worker 必须以真实 `userId` 解析 BYOK 和 trial quota。

### Session、UI 与实验页

- 解耦消息提交和 Agent 生成；处理主动结束、硬截止、maxTurns 原子完成和 feedback。
- 更新频道 pending/error/retry 状态及消息分组。
- 增加 Quest Hall 未读回复与 acknowledge。
- 新增 dev-only asynchronous reply live demo，支持重置、时间推进、插话、no-reply、follow-up、abuse termination 和 maxTurns 取消。

## 验收标准

- [ ] 用户发送请求不等待 provider，异步回复由独立 worker 产生并投递。
- [ ] 两个 worker 并发运行不会重复 claim 或重复显示 delivery。
- [ ] worker 重启后 lease 到期工作可恢复；provider 失败不会丢失或无限重试。
- [ ] 新消息、session 结束、maxTurns 和 maxSessionAge 能取消旧工作；stale 结果不可见。
- [ ] 页面关闭后重新打开仍能看到持久化回复；刷新不会制造重复回复。
- [ ] Quest Hall 未读状态和 acknowledge 在刷新后保持一致。
- [ ] Reddit/AO3 target、Discord 连续消息、iMessage bubble grouping 和 Mail 连续邮件通过组件/页面测试。
- [ ] Feedback 可以处理最后一条消息是用户消息的 conversation。
- [ ] live demo 仅开发环境可访问，且不污染正式 task/session 数据。
- [ ] 使用独立临时 profile 的 ungoogled-chromium 通过 CDP 验证两个固定任务、连续消息、generation 中插话、no-reply、idle follow-up、abuse termination、maxTurns 立即完成、worker 重启和页面关闭/刷新恢复。
- [ ] `pnpm check`、`pnpm test`、`pnpm build` 和 Web/worker 双进程 smoke test 通过。

## 非目标与限制

- 不执行生产数据库迁移。
- 不实现页面加载时 backfill 来替代 scheduler/worker。
- 不把 Agent 的“聊完了”判断当作 session completion。
- 不把普通告别当作 abuse termination。
- 不 push、创建 PR、重写历史、amend、rebase 或删除用户现有修改。

## 关联计划

- `docs/plans/2026-08-19-async-agent-replies.md`
