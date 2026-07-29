---
title: 对齐 Review 与 Anki 的日内学习排期
type: bug
status: done
link: https://github.com/Mapleshade20/libiamo-fullstack/issues/72#issuecomment-4972196146
---

# 对齐 Review 与 Anki 的日内学习排期

## 问题

`/review` 虽然使用 `ts-fsrs` 默认的 `1m 10m` 学习步骤和 `10m` 重新学习步骤，但当前实现只把这些步骤当作普通队尾循环：

- 按钮显示 `1m / 6m / 10m`，没有表达 Anki 默认 20 分钟 Learn ahead 下可提前出现的 `<1m / <6m / <10m`；
- 初次加载只查询 `due <= now`，刷新页面后，未来 20 分钟内的 Learning/Relearning 卡不会像 Anki 一样进入 learn-ahead 队列；
- `ts-fsrs@5.4.1` 的默认学习步骤策略在第二个及后续步骤仍把 Hard 算成首两步平均值，和 Anki“首步取平均、其余步骤重复当前步骤”的规则不同；
- FSRS 最大间隔被限制为 365 天，而 Anki 默认是 36,500 天；
- 评分接口允许直接评分任意未来卡，绕过到期和 Learn ahead 边界。

这些差异会让持久化状态、按钮提示、刷新恢复和实际出队行为互相矛盾。

## 目标行为

以 Anki 源码 `8fbfd2ed839b3870c80880d2f020d470a8586216` 和官方手册为准：

- 固定默认学习步骤 `1m 10m`、重新学习步骤 `10m`、Learn ahead 20 分钟、目标保持率 0.9、最大间隔 36,500 天；
- New/Learning 的 Again 回到 `1m`；首步 Hard 为 `6m`，第二步 Hard 为 `10m`；Good 推进一步并在末步毕业；Easy 立即毕业；
- Review 的 Again 进入 `10m` Relearning；单步 Relearning 的 Hard 为 `15m`，Good/Easy 毕业；
- 所有小于 20 分钟 Learn ahead 的按钮间隔使用 `<` 前缀；这些卡在普通到期队列耗尽后可立即提前出现；
- 已经到期的 Learning/Relearning 优先于普通 New/Review，未来 20 分钟内的 Learning/Relearning 排在普通队列之后；
- 小于一天的默认学习步骤会留在本次学习队列，毕业到至少一天后的 Review 卡从今天的队列移除；
- 刷新 `/review` 不丢失处于 Learn ahead 窗口内的学习卡；窗口外的学习卡和未来 Review 卡不能提前评分。

## 依据

- Anki Manual, Deck Options：Learning Steps、Hard、Day Boundaries、Relearning Steps。
- Anki Manual, Preferences：默认 Learn ahead limit 为 20 分钟，普通队列为空时可提前显示窗口内学习卡。
- Anki `rslib/src/scheduler/states/steps.rs`：首步 Hard 取首两步平均值，后续 Hard 重复当前步骤。
- Anki `rslib/src/scheduler/queue/learning.rs` 与 `queue/mod.rs`：到期日内学习卡优先，主队列其次，learn-ahead 卡最后。
- Anki `rslib/src/scheduler/timespan.rs`：小于 Learn ahead 的按钮间隔带 `<`。
- Anki `rslib/src/deckconfig/mod.rs`：默认步骤、保持率和 36,500 天最大间隔。

## 验收标准

- [x] 新卡首次显示 `<1m / <6m / <10m / Nd`，其中 Easy 不带 `<`。
- [x] 新卡 Good 后显示 Again `<1m`、Hard `<10m`，再次 Good 后毕业并从今天队列消失。
- [x] 新卡或 Review 卡 Again 后保持 Learning/Relearning，普通队列清空后无需真实等待即可再次显示。
- [x] 刷新后，未来 20 分钟内的 Learning/Relearning 仍可继续；未来 Review 或窗口外 Learning 不可提前评分。
- [x] 服务端和纯队列测试覆盖状态、间隔提示、learn-ahead 排序和提前评分边界。
- [x] `pnpm check`、`pnpm test` 和浏览器 CDP 验收通过。

## 验收记录

- `pnpm check`：0 errors / 0 warnings。
- `pnpm test`：85 个测试文件、944 个测试全部通过。
- Chrome CDP：两张 Learning 卡分别 Again 后交替立即出现；刷新 `/review` 后未来 1 分钟的 Learning 卡仍出现；首步按钮为 `<1m / <6m / <10m`；Good 进入第二步后 Hard 为 `<10m`；末步 Good 后进入 Session Complete。
