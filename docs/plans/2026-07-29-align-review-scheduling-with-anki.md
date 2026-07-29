---
title: 对齐 Review 与 Anki 日内排期实施计划
related-issue: docs/issues/2026-07-29-align-review-scheduling-with-anki.md
---

# 对齐 Review 与 Anki 日内排期实施计划

## 技术决策

1. 继续使用 `ts-fsrs` 负责 FSRS-6 记忆参数和长期间隔，不复制 Anki 的完整调度器。
2. 显式配置 Anki 默认参数，并通过 `StrategyMode.LEARNING_STEPS` 修正 `ts-fsrs@5.4.1` 在后续学习步骤上的 Hard 计算。
3. 将 20 分钟 Learn ahead 建模为服务端可评分边界和客户端队列顺序，而不是把持久化 `due` 改成当前时间。这样 review log 仍保存名义上的 `1m / 10m` 延迟。
4. 队列卡携带 ISO `due`。每次评分后按“已到期 Learning → 普通 New/Review → future Learning within learn-ahead”重排；learn-ahead 折叠时只要存在另一张卡，就避免同卡立刻连续出现。
5. 初次查询只扩展 Learning/Relearning 的窗口，不提前纳入未来 New/Review。评分事务在锁行后再次检查相同边界。
6. Transfer 继续复用同一评分服务；其立即 Again 重试位于 20 分钟窗口内，不改变现有流程。

## 阶段 1：锁定调度规则

- 增加调度常量和 Anki 学习步骤策略。
- 单元测试覆盖 New 两步、后续 Hard、单步 Relearning、Learn ahead 间隔文案和最大间隔配置。

退出：纯调度测试能区分官方 Anki 行为和 `ts-fsrs` 原默认行为。

## 阶段 2：服务端队列与边界

- `getDueNotes()` 查询到期卡以及 20 分钟内的 Learning/Relearning，并按 Anki 队列层级返回 `due`。
- `rateNote()` 拒绝未来 Review/New 和窗口外 Learning/Relearning；返回新 `due` 和下一轮预览。
- API 将不可提前评分映射为冲突响应。

退出：刷新恢复与越界评分均由服务端测试证明。

## 阶段 3：客户端队列

- 页面数据和评分响应保留 `due`。
- 纯队列函数根据当前时间重排，并在 Learn ahead 折叠时避免可避免的同卡连续展示。
- 更新页面响应校验和错误处理。

退出：默认 `1m / 10m` 步骤可在同一会话提前完成，毕业卡不再进入当天队列。

## 阶段 4：验证

```sh
pnpm check
pnpm test
```

- 使用 Chrome CDP 在 `/review` 验证首次按钮 `<` 文案、Again 后 Learning 计数、无需等待的再次出现、Good 毕业和刷新恢复。
- 若环境数据不足，使用开发数据库创建最小可回滚 Note；验收结束后清理。

退出：自动化检查和浏览器可观察行为全部通过。
