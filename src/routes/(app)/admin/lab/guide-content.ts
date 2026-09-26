/**
 * The LLM Lab guide for admins, in Chinese and English. Text in `backticks` renders as code.
 * Keep both languages in step when the Lab changes.
 */

export type GuideLanguage = "zh" | "en";

export type GuideBlock =
	| { kind: "p"; text: string }
	| { kind: "list"; items: string[] }
	| { kind: "steps"; items: string[] }
	| { kind: "note"; text: string };

export type GuideSection = { id: string; title: string; blocks: GuideBlock[] };

export type Guide = { title: string; lead: string; contents: string; sections: GuideSection[] };

const zh: Guide = {
	title: "LLM Lab 使用指南",
	lead: "LLM Lab 让管理员在应用里直接检查每一次 LLM 调用、在真实数据上尝试不同的提示词、模型和思考强度，并把几个方案放在一起比较。它不会改动学习者的数据，也不会消耗学习者的试用额度。",
	contents: "目录",
	sections: [
		{
			id: "why",
			title: "为什么需要它",
			blocks: [
				{
					kind: "p",
					text: "以前想改进一个提示词，只能改代码、手动重走一遍流程、再去服务器日志里翻 JSON。这样一次只能看一个例子，也很难判断改动到底是变好了还是碰巧。",
				},
				{
					kind: "p",
					text: "Lab 解决三件事：看得清（每次调用的输入、提示词、输出都以易读的方式呈现），能重跑（在同样的输入上换提示词、模型或思考强度再跑一次），能比较（把一组真实案例在几个方案上批量跑完，并排打分）。",
				},
			],
		},
		{
			id: "concepts",
			title: "核心概念",
			blocks: [
				{
					kind: "list",
					items: [
						"配方（Recipe）：应用里的每一种 LLM 调用都是一个配方，例如 `review.notes`（生成词汇笔记）、`practice.feedback`（对话批改）、`practice.agent-reply`（对话角色回复）。配方把结构化的输入变成发给模型的消息，并校验模型的输出。配方本身不写数据库，所以 Lab 可以随意重跑。",
						"输入（Input）：配方收到的结构化数据，例如任务简介、对话记录、需要生成笔记的条目。Lab 保存的是这份输入，而不仅仅是拼好的提示词，因此能用新的提示词在旧案例上重跑。",
						"片段（Slot）：配方里可编辑的一段提示词文字，例如笔记的「System prompt」和「Contract rules」。片段里的 `{{target}}` 这类占位符叫变量，由代码填入语言名、任务简介等内容。删掉某个变量就等于不再把那部分内容发给模型。目前笔记、对话批改、对话角色回复三个配方有片段；其他配方可以换模型、换思考强度或直接手改消息。",
						"追踪（Trace）：一次调用的完整记录，包括输入、实际发送的消息、每次尝试（初次回复以及格式修复）、输出或错误、模型、耗时和 token 用量。",
						"来源（Origin）：Real flow 表示学习流程中的真实调用；Override 表示管理员自己的账号在个人覆盖下的调用；Lab 表示在 Playground 或批量运行里发起的调用。",
						"提供方（Provider）：调用发往哪里。Shared provider 是应用的默认服务；My API key 是你在 Profile 里配置的密钥；此外还有部署时在 `LLM_LAB_PROVIDERS` 中配置的其他模型。Lab 里选定提供方的调用不会扣任何人的试用额度。",
						"思考强度（Thinking effort）：每次调用都开启思考，并按 OpenAI 规范发送 `reasoning_effort`。轻量、要求快速响应的调用默认 low，需要判断力的调用默认 medium。Lab 里可以改成 none 到 xhigh 之间的任意值。思考 token 也计入 32,768 的输出上限。",
						"数据集（Dataset）与案例（Case）：数据集围绕一个问题收集同一配方的输入，例如「笔记会不会把任务里的专有内容当成词汇」。每个输入是一个案例，可以从追踪固定进来，也可以手写 JSON。",
						"运行（Run）、列（Column）与重复（Repeat）：一次运行把数据集里的每个案例在每一列上各跑若干次。一列就是一个方案：片段改动、提供方、思考强度、温度的组合。",
						"评审（Judge）：可选的 LLM 评分。你用自然语言写评分标准（rubric），评审模型给每个输出打 1–5 分并说明理由。",
						"评价（Rating）：管理员对某次输出投 👍 或 👎，并可以附上备注。",
					],
				},
			],
		},
		{
			id: "safety",
			title: "安全、隐私与数据保留",
			blocks: [
				{
					kind: "list",
					items: [
						"记录谁的调用：默认记录所有用户的真实调用。只有配置了自有密钥（BYOK）的非管理员，能在 Profile 的 LLM API Key 一节看到「Help improve Libiamo features」并关闭它；没有自有密钥的用户看不到这个选项，始终会被记录；管理员也始终会被记录。",
						"保留多久：真实流程和 Playground 的追踪 30 天后自动删除，管理员也可以在 Traces 里提前手动删除。批量运行的输出随运行保存，删除运行或数据集时一并删除。学习者关闭记录后停止新的记录，已有记录按 30 天到期。",
						"固定下来的案例：案例会一直保留，直到管理员删除。来源学习者注销账号时，案例与账号解除关联但内容保留，隐私政策已写明这一点。请只固定确实有价值的案例。",
						"不影响学习者：Lab 调用只写追踪，不写笔记、会话、翻译尝试等业务数据，也不扣试用额度。密钥永远不会出现在追踪或页面里。",
						"随时可关：部署时设置 `LLM_LAB=off`，所有配方就按代码原样运行，也不会多出任何查询。",
					],
				},
			],
		},
		{
			id: "traces",
			title: "Traces：浏览调用记录",
			blocks: [
				{
					kind: "steps",
					items: [
						"打开 Traces 页，可以按配方、来源、状态、任务编号筛选；点用户名只看这个人的调用，点任务号只看这个任务的调用。",
						"标签含义：error 表示调用失败，repaired 表示第一次回复格式不对、经过一次修复才成功。",
						"点配方名进入详情页。",
						"删除：勾选左侧复选框后点「Delete selected」，确认后删除。表头复选框会选中本页全部；如果筛选结果不止一页，全选本页后会出现「Select all N matching traces」，可以一次删除当前筛选条件下的全部记录。详情页也有「Delete trace」。批量运行产生的记录无法单独删除（复选框不可选），要删除请删除整个运行。评分随记录一起删除，已固定到数据集的案例不受影响。",
					],
				},
				{ kind: "p", text: "详情页从上到下依次是：" },
				{
					kind: "list",
					items: [
						"概要：时间、来源、用户、任务、会话或尝试编号、模型与提供方、耗时、token 用量、配方版本。如果与默认配置不同（片段改动、选项、手改消息），会用橙色字标出。",
						"Output：按学习者看到的样子渲染，笔记显示成卡片，批改显示成带标记的原文，其他结果显示成结构化视图。点「Show raw response」可以看模型的原始回复。失败时会写明失败发生在哪个阶段（构建请求、提供方、解析、校验）。",
						"Rate：投票并写备注，其他管理员也能看到。",
						"Pin to a dataset：把这次调用的输入固定到一个数据集，也可以顺手新建数据集。",
						"Request：实际发送的消息。system 提示词按 `##` 标题折叠成段落，JSON 格式的用户消息显示成结构化视图，点「Raw」查看原文。",
						"Attempts：出现格式修复或错误时，可以看到每次尝试的原始回复和错误原因，例如 `finish_reason: length` 表示输出上限被用完。",
						"Recipe input：配方收到的结构化输入。",
					],
				},
			],
		},
		{
			id: "playground",
			title: "Playground：单个案例的试验",
			blocks: [
				{
					kind: "steps",
					items: [
						"从追踪详情点「Open in Playground」，或者在数据集的案例旁点「Playground」，输入和配方会自动带入。直接打开 Playground 时，顶部会显示使用引导和最近的真实调用，点一条即可带入；也可以选配方后手写 JSON 输入。",
						"选择提供方、思考强度（留空表示使用配方默认值）和温度（留空表示使用配方默认值）。",
						"展开片段进行编辑。编辑器下方会列出可用变量，用了未知变量会立即提示。已改动的片段会标上 edited，可以一键恢复默认。",
						"点「Preview messages」可以先看会发送什么，不调用模型、不花钱。",
						"点「Run」发起调用。右侧显示结果、耗时、token 用量和追踪链接；如果是从追踪带入的，下方还会显示原来的输出，方便对比。",
						"需要一次性的大改时，勾选「Send hand-edited messages」：先预览，再直接改每条消息的文字后运行。这种改动只对这一次调用有效，无法批量复用；想批量复用请改片段。",
					],
				},
				{ kind: "note", text: "每次 Run 都会存成一条 Lab 追踪，30 天后删除。" },
			],
		},
		{
			id: "datasets",
			title: "Datasets：收集案例",
			blocks: [
				{
					kind: "steps",
					items: [
						"新建数据集：填写名称、选择配方（一个数据集只收同一个配方的案例）、写下它要回答的问题。如果打算用 LLM 评审，可以顺便写好评分标准。",
						"添加案例：在追踪详情用「Pin to a dataset」固定真实案例，或者在数据集页用「Add a case from JSON」手写输入。每个案例都可以加标签，说明它为什么有代表性。",
						"案例旁的按钮：Playground 用这个案例做单次试验；Source trace 回到它的来源；Remove 删除案例。",
						"如果案例记录的配方版本比当前旧，会提示「input may no longer fit」，表示代码已经改变了输入格式。",
					],
				},
				{ kind: "note", text: "建议每个数据集准备 10–20 个真实且有代表性的案例：既要有出问题的，也要有原本就正常的，这样才能发现改动带来的回退。" },
			],
		},
		{
			id: "runs",
			title: "Runs：批量比较方案",
			blocks: [
				{
					kind: "steps",
					items: [
						"在数据集页底部的「New run」里设置：运行标签；Repeats（每个案例在每列跑几次，1–5 次，用来观察同一方案输出的稳定性）。",
						"第一列默认是 Baseline，即当前代码的提示词。点「Add column」会复制上一列，然后在新列里改片段、提供方、思考强度或温度。最多 6 列。",
						"想让模型评分，就勾选「Score each output with an LLM judge」，填写评分标准并选择评审用的提供方。评分标准要具体，写清什么情况算 5 分、什么情况算 1 分。",
						"按钮旁会显示总调用次数，一次运行最多 600 次调用（不含评审）。点「Start run」后进入运行页，后台会自动执行，页面每 3 秒刷新一次；关掉页面也不影响执行。",
					],
				},
				{ kind: "p", text: "运行页怎么看：" },
				{
					kind: "list",
					items: [
						"Summary 每列一行：Finished（已完成次数/总次数）、OK（成功）、Failed（失败）、Repaired（经过格式修复）、Latency（平均耗时）、Out tokens（平均输出 token，包含思考）、Judge（平均评分和已评分的数量）、Votes（👍/👎 数量）。",
						"Outputs by case：每个案例一行，各列并排显示。每个格子可以展开评审理由、投票或打开追踪。",
						"Cancel run：停止还没开始的调用。Retry：重跑失败、被取消以及模型报错的格子，旧结果会被替换。Delete run：删除这次运行和它的全部输出。",
					],
				},
				{
					kind: "note",
					text: "LLM 评审只是参考。它有自己的偏好，也可能误判。关键结论请结合人工投票，同时抽查几个格子的原始输出。",
				},
			],
		},
		{
			id: "overrides",
			title: "My overrides：在真实流程里体验",
			blocks: [
				{
					kind: "p",
					text: "个人覆盖让你在自己的账号上用实验方案走一遍真实的学习流程，例如把笔记片段换成新写法，然后完成一个任务，看看生成的笔记在复习卡片里是什么样子。其他人完全不受影响。",
				},
				{
					kind: "steps",
					items: [
						"在「Add an override for」里选配方，设置片段、提供方（选「Normal routing」表示照常使用你的密钥或共享服务）、思考强度和温度，写一句备注后保存。",
						"覆盖开启后，页面右侧 LLM 标签上会出现橙色小圆点，提醒你正处在实验状态。",
						"去应用里正常使用。相应的调用会以 Override 来源记录，可以在 LLM 标签或 Traces 页查看。",
						"体验结束后取消勾选「Use this override」或点「Remove override」，否则你之后的学习数据都会用实验方案生成。",
					],
				},
				{ kind: "note", text: "指定了提供方的覆盖调用不扣试用额度；选 Normal routing 则和平时一样计费。只有管理员身份时覆盖才生效。" },
			],
		},
		{
			id: "inspector",
			title: "LLM 标签：页面内检查",
			blocks: [
				{
					kind: "p",
					text: "管理员在每个页面的右侧都能看到一个竖向的「LLM」标签。点开后列出你自己最近的调用；在任务页上默认只显示这个任务的调用，可以取消勾选「Only task #…」查看全部。面板打开时每 4 秒自动刷新，点任意一条可以进入它的追踪详情。学习者看不到这个标签，也不会下载它的代码。",
				},
			],
		},
		{
			id: "workflows",
			title: "典型工作流",
			blocks: [
				{ kind: "p", text: "排查一条糟糕的输出（例如笔记学到了「entrar al Nether」，而不是通用的「entrar a」）：" },
				{
					kind: "steps",
					items: [
						"在出问题的页面打开 LLM 标签，找到对应调用，进入追踪详情。",
						"看 Request 和 Recipe input：模型拿到了哪些信息？任务简介、上下文里是否有容易被误学的专有内容？",
						"固定到一个数据集，例如 notes-task-leakage，再补充 10–20 个类似的真实案例。",
						"写好评分标准，发起一次运行：Baseline 对比「删掉 `{{sourceTask}}`」对比「在规则里要求把词条抽象成通用表达」。",
						"看统计、评分和投票，再抽查原始输出，判断哪一个方案更好。",
					],
				},
				{ kind: "p", text: "上线一个胜出的方案：" },
				{
					kind: "steps",
					items: [
						"把胜出列的片段文字复制到代码里的默认模板中（片段定义在对应配方旁边），以 PR 的形式提交评审。",
						"如果改动涉及输入格式，给配方的 `version` 加一，旧案例就会显示版本提示。",
						"上线后用同一个数据集再跑一次，确认 Baseline 已经变成新的方案。",
					],
				},
				{ kind: "p", text: "比较模型或思考强度：不改片段，只在各列设置不同的提供方或思考强度，结合 Latency 和 Out tokens 权衡质量与成本。" },
			],
		},
		{
			id: "developers",
			title: "给开发者：新增或修改配方",
			blocks: [
				{
					kind: "list",
					items: [
						"新的 LLM 调用一律用 `defineLlmRecipe` 声明，通过 `runLlmRecipe` 调用，并登记到 `server/llm/lab/recipes.ts`。不要在业务代码里直接调用 `chatJson`/`chatText`。",
						"输入必须是纯 JSON：只挑出需要的任务字段，不要传数据库行或 `Date`。`build` 和 `finalize` 必须是纯函数，副作用留在调用方。",
						"每个配方都要设置 `reasoningEffort`（轻量调用用 low，需要判断力的用 medium），并传入 `subjects`（task/session/attempt），这样追踪才能和页面对应起来。",
						"想让某段提示词可以在 Lab 里调，就把它写成片段模板：文字放进模板，随数据变化的内容做成变量。默认模板必须和现在的提示词逐字一致，已有测试会检查变量是否都已声明。",
						"新配方的输出如果需要专门的展示方式，可以在 `components/llm/OutputView.svelte` 里加一个渲染器，例如将来的「批改笔」动画。",
						"设计文档：`docs/design/2026-09-24-llm-lab.md`。",
					],
				},
			],
		},
	],
};

const en: Guide = {
	title: "LLM Lab guide",
	lead: "LLM Lab lets admins inspect every LLM call from inside the app, try other prompts, models and thinking effort on real inputs, and compare approaches side by side, without touching learner data or anyone's trial quota.",
	contents: "Contents",
	sections: [
		{
			id: "why",
			title: "Why it exists",
			blocks: [
				{
					kind: "p",
					text: "Improving a prompt used to mean editing code, replaying the flow by hand and reading JSON in server logs, one example at a time, with no way to tell a real improvement from luck.",
				},
				{
					kind: "p",
					text: "The Lab makes calls legible (inputs, prompts and outputs rendered for reading), repeatable (re-run the same input with another prompt, model or effort) and comparable (run a set of real cases across several variants and score them side by side).",
				},
			],
		},
		{
			id: "concepts",
			title: "Concepts",
			blocks: [
				{
					kind: "list",
					items: [
						"Recipe: every kind of LLM call in the app, such as `review.notes` (vocabulary Notes), `practice.feedback` (conversation feedback) or `practice.agent-reply` (the conversation partner). A recipe turns structured input into the messages sent to the model and validates the answer. It never writes to the database, so the Lab can re-run it freely.",
						"Input: the structured data a recipe receives, such as the task brief, the transcript or the items to make Notes from. The Lab stores this input, not just the rendered prompt, so old cases can be re-run with new prompts.",
						'Slot: an editable part of a recipe\'s prompt, such as the Notes "System prompt" and "Contract rules". Placeholders like `{{target}}` are variables that code fills with language names, task briefs and so on. Deleting a variable stops sending that content. Notes, conversation feedback and agent replies have slots today; other recipes can change provider or effort, or use hand-edited messages.',
						"Trace: the full record of one call: input, the messages actually sent, every attempt (first answer and format repair), output or error, model, latency and tokens.",
						"Origin: Real flow is a call made while learning; Override is an admin's own call under a personal override; Lab is a call from the Playground or a run.",
						"Provider: where a call goes. Shared provider is the app's default; My API key is the key from your Profile; others come from `LLM_LAB_PROVIDERS` in the deployment. Lab calls on a chosen provider never use anyone's trial quota.",
						"Thinking effort: every call thinks, sending the OpenAI-spec `reasoning_effort`: low for light, latency-sensitive calls and medium for judgement-heavy ones by default. The Lab can set anything from none to xhigh. Thinking tokens count toward the 32,768-token output cap.",
						'Dataset and case: a dataset gathers inputs of one recipe around a question, such as "do Notes treat task-specific details as vocabulary?". Each input is a case, pinned from a trace or written as JSON.',
						"Run, column and repeat: a run executes every case of a dataset in every column, a given number of times. A column is one variant: slot edits, provider, effort and temperature.",
						"Judge: optional LLM scoring. You write a rubric in plain language; the judge model scores each output 1–5 and explains why.",
						"Rating: an admin's 👍 or 👎 on an output, with an optional note.",
					],
				},
			],
		},
		{
			id: "safety",
			title: "Safety, privacy and retention",
			blocks: [
				{
					kind: "list",
					items: [
						'Whose calls are captured: everyone\'s real-flow calls, by default. Only non-admins on their own API key see "Help improve Libiamo features" in the LLM API Key section of their Profile and can turn it off; users without their own key never see it and are always captured, and so are admins.',
						"How long: real-flow and Playground traces are deleted after 30 days, or earlier by an admin in Traces. Run outputs live with their run and go when the run or dataset is deleted. Turning capture off stops new traces; existing ones expire on schedule.",
						"Pinned cases stay until an admin removes them. If the source learner deletes their account, the case is detached from it but its content stays, as the privacy policy says. Pin only what is worth keeping.",
						"No learner impact: Lab calls write only traces, never Notes, sessions or translation attempts, and never spend trial quota. API keys never appear in traces or pages.",
						"Kill switch: `LLM_LAB=off` makes every recipe run exactly as coded, with no extra queries.",
					],
				},
			],
		},
		{
			id: "traces",
			title: "Traces: browse calls",
			blocks: [
				{
					kind: "steps",
					items: [
						"Filter by recipe, origin, status or task id. Click a user to see only their calls, or a task number to see only that task's.",
						"Badges: error means the call failed; repaired means the first answer was malformed and one repair fixed it.",
						"Click a recipe name to open the trace.",
						'Delete: tick rows and press "Delete selected", then confirm. The header box selects the whole page; when the filter spans more pages, selecting the page offers "Select all N matching traces" to delete everything the current filter matches. A trace page has "Delete trace" too. Run outputs cannot be deleted on their own (their boxes are disabled); delete the run instead. Ratings go with the trace; cases pinned from it are unaffected.',
					],
				},
				{ kind: "p", text: "A trace page shows, top to bottom:" },
				{
					kind: "list",
					items: [
						"Summary: time, origin, user, task, session or attempt, model and provider, latency, tokens and recipe version. Deviations from the defaults (slots, options, hand-edited messages) are highlighted.",
						'Output, rendered as learners see it: Notes as cards, feedback as marked-up text, anything else as a structured view. "Show raw response" shows the model\'s text. Failures say where they stopped: build, provider, parse or validation.',
						"Rate: vote and leave a note other admins can see.",
						"Pin to a dataset: copy this call's input into a dataset, or create one on the spot.",
						'Request: the messages sent. System prompts fold into sections at `##` headings, JSON user messages render as structured values, and "Raw" shows the text.',
						"Attempts: after a repair or error, each raw answer and its errors, such as `finish_reason: length` when the output budget ran out.",
						"Recipe input: the structured input the recipe received.",
					],
				},
			],
		},
		{
			id: "playground",
			title: "Playground: experiment on one case",
			blocks: [
				{
					kind: "steps",
					items: [
						'Open it from a trace ("Open in Playground") or a dataset case ("Playground") to load its recipe and input. Opened directly, it starts with a short guide and your recent real calls to pick from; you can also pick a recipe and write the JSON input.',
						"Choose a provider, a thinking effort and a temperature (empty keeps the recipe's defaults).",
						"Expand a slot to edit it. Available variables are listed under the editor and unknown ones are flagged at once. Edited slots are marked and can be reset.",
						'"Preview messages" shows what would be sent without calling a model.',
						'"Run" calls the model. The result appears on the right with latency, tokens and a trace link; when you started from a trace, its original output is shown below for comparison.',
						'For a one-off rewrite, tick "Send hand-edited messages", preview, then edit each message\'s text and run. Such edits apply only to that call; use slots for anything you want to reuse across cases.',
					],
				},
				{ kind: "note", text: "Every run is stored as a Lab trace and deleted after 30 days." },
			],
		},
		{
			id: "datasets",
			title: "Datasets: collect cases",
			blocks: [
				{
					kind: "steps",
					items: [
						"Create a dataset with a name, a recipe (a dataset holds cases of one recipe) and the question it answers. Add a judge rubric now if you plan to use one.",
						'Add cases by pinning real traces ("Pin to a dataset") or with "Add a case from JSON". Label each case with why it matters.',
						"Beside each case: Playground to experiment on it, Source trace to go back to where it came from, Remove to delete it.",
						'"input may no longer fit" means the case was recorded with an older recipe version whose input shape the code has since changed.',
					],
				},
				{
					kind: "note",
					text: "Aim for 10–20 real, representative cases per dataset, including some that already work well, so regressions show up too.",
				},
			],
		},
		{
			id: "runs",
			title: "Runs: compare variants",
			blocks: [
				{
					kind: "steps",
					items: [
						'Under "New run" on a dataset page, give the run a label and choose repeats (1–5 runs per case and column, to see how stable a variant is).',
						'Column 1 is the Baseline: today\'s code. "Add column" copies the previous column; change its slots, provider, effort or temperature. Up to 6 columns.',
						'To have outputs scored, tick "Score each output with an LLM judge", write the rubric and pick the judge\'s provider. Make the rubric concrete about what earns a 5 and what earns a 1.',
						'The call count shows next to the button; a run is limited to 600 calls, not counting the judge. "Start run" opens the run page. Cells run in the background and the page refreshes every 3 seconds; closing it does not stop the run.',
					],
				},
				{ kind: "p", text: "Reading a run:" },
				{
					kind: "list",
					items: [
						"Summary, one row per column: Finished (done/total), OK, Failed, Repaired, mean Latency, mean Out tokens (thinking included), Judge (mean score and how many were scored) and Votes.",
						"Outputs by case: one row per case with the columns side by side. Expand judge reasoning, vote, or open a cell's trace.",
						"Cancel run stops cells that have not started. Retry re-runs cells that failed, were cancelled or whose model call errored, replacing their old results. Delete run removes the run and all its outputs.",
					],
				},
				{
					kind: "note",
					text: "The judge is a guide, not a verdict: it has its own biases and can be wrong. Back important conclusions with human votes and read some raw outputs.",
				},
			],
		},
		{
			id: "overrides",
			title: "My overrides: try it in the real app",
			blocks: [
				{
					kind: "p",
					text: "A personal override runs an experimental variant for your own account in the real flow. For example, swap in a new Notes slot, finish a task and see the Notes in your review cards. Nobody else is affected.",
				},
				{
					kind: "steps",
					items: [
						'Under "Add an override for", pick a recipe; set slots, a provider ("Normal routing" keeps your key or the shared provider), an effort and a temperature; add a note and save.',
						"While an override is on, the LLM tab on the right shows an orange dot.",
						"Use the app as usual. Affected calls are traced with the Override origin; find them in the LLM tab or on the Traces page.",
						'When you are done, untick "Use this override" or remove it. Otherwise your own learning data keeps being generated by the experiment.',
					],
				},
				{
					kind: "note",
					text: "Overrides routed to a chosen provider never use trial quota; Normal routing is billed as usual. Overrides apply only while you are an admin.",
				},
			],
		},
		{
			id: "inspector",
			title: "The LLM tab",
			blocks: [
				{
					kind: "p",
					text: 'Admins see a vertical "LLM" tab on the right of every page. It lists your own recent calls, limited to the current task on task pages (untick "Only task #…" to see everything). It refreshes every 4 seconds while open, and each entry opens its trace. Learners never see the tab or download its code.',
				},
			],
		},
		{
			id: "workflows",
			title: "Typical workflows",
			blocks: [
				{ kind: "p", text: 'Investigate a bad output (say a Note taught "entrar al Nether" instead of the reusable "entrar a"):' },
				{
					kind: "steps",
					items: [
						"Open the LLM tab on that page, find the call and open its trace.",
						"Read Request and Recipe input: what did the model see? Is the task brief or context full of details it might learn by mistake?",
						"Pin it to a dataset such as notes-task-leakage and add 10–20 similar real cases.",
						'Write a rubric and start a run: Baseline vs. "remove `{{sourceTask}}`" vs. "rules require generalizing vocab".',
						"Weigh the statistics, judge scores and votes, then read some raw outputs before deciding.",
					],
				},
				{ kind: "p", text: "Ship a winning variant:" },
				{
					kind: "steps",
					items: [
						"Copy the winning column's slot text into the default template in code (slots are defined next to their recipe) and open a PR.",
						"If the input shape changed, bump the recipe's `version` so older cases are flagged.",
						"After release, run the same dataset again to confirm the Baseline is now the new variant.",
					],
				},
				{
					kind: "p",
					text: "Compare models or effort: leave slots alone and give each column a different provider or effort; weigh quality against Latency and Out tokens.",
				},
			],
		},
		{
			id: "developers",
			title: "For developers: adding or changing recipes",
			blocks: [
				{
					kind: "list",
					items: [
						"Declare every new LLM call with `defineLlmRecipe`, call it through `runLlmRecipe` and register it in `server/llm/lab/recipes.ts`. Never call `chatJson`/`chatText` from domain code.",
						"Inputs must be plain JSON: pick the task fields you need, never pass database rows or `Date`s. `build` and `finalize` stay pure; side effects stay with the caller.",
						"Give every recipe a `reasoningEffort` (low for light calls, medium for judgement) and pass `subjects` (task/session/attempt) so traces can be found from pages.",
						"To make prose tunable in the Lab, turn it into a slot template: prose in the template, data-dependent parts as variables. Defaults must render today's prompt exactly; a test checks every variable is declared.",
						"If a recipe's output needs its own presentation (a future marker-pen feedback animation, say), add a renderer in `components/llm/OutputView.svelte`.",
						"Design: `docs/design/2026-09-24-llm-lab.md`.",
					],
				},
			],
		},
	],
};

export const LAB_GUIDE: Record<GuideLanguage, Guide> = { zh, en };
