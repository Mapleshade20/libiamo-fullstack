# Agent API 文档

本文档对应实现文件：`src/lib/server/client.ts`

## 对外可用函数

- `createSingleTurnChat(input)`
- `createMultiTurnChat(input)`

## 环境变量

`.env` 建议设置如下：

```env
# OpenAI-compatible API
OPENAI_API_KEY="sk-sefz-tfLW-cSOJlQ5psfJA"
OPENAI_BASE_URL="https://api-ai.thucs.cn/v1"
OPENAI_MODEL="qwen3-max"
API_VERIFY_SSL="false"
```


## 类型定义

```ts
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

system：系统提示词，如mbti等身份设定
user：用户对话内容
assistant：历史对话内容

type OpenAIOptions = {
  temperature?: number; // 默认 0.7
  maxTokens?: number;   // 默认 4096
};

temperature：模型采样随机性设定，建议使用默认值，通过system prompt改变模型行为
maxTokens：模型生成回复的最大长度

type OpenAIResponse = {
  id?: string;
  model?: string;
  content: string;
  raw: unknown;
};

type ConversationTurnResult = {
  reply: OpenAIResponse;
  messages: ChatMessage[];
};
```

## 1) createSingleTurnChat(input)

入参：

- `systemPrompt: string`（必填）
- `userMessage: string`（必填）
- `options?: { temperature?: number; maxTokens?: number }`

校验规则：

- `systemPrompt` 为空会抛错：`systemPrompt is required`
- `userMessage` 为空会抛错：`userMessage is required`

返回：

- `reply`: 本轮模型回复
- `messages`: `[system, user, assistant]`，可直接用于后续多轮历史

示例：

```ts
import { createSingleTurnChat } from "$lib/server/client";

const turn = await createSingleTurnChat({
  systemPrompt: "你是英语口语陪练教练，回答简短。",
  userMessage: "你好",
  options: { temperature: 0.6, maxTokens: 512 },
});

console.log(turn.reply.content);
```

## 2) createMultiTurnChat(input)

入参：

- `history: ChatMessage[]`（必填）
- `userMessage: string`（必填）
- `systemPrompt?: string`（可选，但第一次对话必须包含systemPrompt）
- `options?: { temperature?: number; maxTokens?: number }`

校验规则：

- `userMessage` 为空会抛错：`userMessage is required`
- `history` 不是数组会抛错：`history must be an array`

system 规则：

1. 当次传了 `systemPrompt`：
- 会在 `history` 中查找已有 `system` 消息（不要求在第一条）。
- 若找到，使用新的 `systemPrompt` 替换该条 `system` 内容。
- 若没找到，自动把 `systemPrompt` 插到最前面。

2. 当次没传 `systemPrompt`：
- 会在 `history` 中查找有效 `system` 消息；
- 若找不到则抛错：
  `systemPrompt is required for the first turn, or history must include a system message`

返回：

- `reply`: 本轮模型回复
- `messages`: `history + 当前 user + 当前 assistant`

示例：

```ts
import { createMultiTurnChat, type ChatMessage } from "$lib/server/client";

let history: ChatMessage[] = [
  { role: "system", content: "你是英语口语陪练教练，回答尽量简短。" },
  { role: "user", content: "Hi, I am Chen." },
  { role: "assistant", content: "Nice to meet you, Chen! What do you do?" },
];

const turn = await createMultiTurnChat({
  history,
  userMessage: "I am a software engineer.",
  options: { temperature: 0.6, maxTokens: 512 },
});

history = turn.messages;
console.log(turn.reply.content);
```
