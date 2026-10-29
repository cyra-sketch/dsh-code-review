# 构建过程完整会话轨迹

本目录保存构建本插件的 AI agent（Kimi Code CLI）**全部原始会话事件流**（`wire.jsonl`，未编辑、未删节），供需要了解"这个插件是怎么被做出来的"的读者核查。

## 内容

- `sessions/session_42031307-agents/`：主会话。`main/wire.jsonl` 为主 agent 全过程；`agent-*/wire.jsonl` 为各子代理（调研、评审团实验、coder 实现、面试官盲评）的独立轨迹
- `sessions/session_1a7569a2-agents/`：中段关联会话（部分调研子代理）

共 50 个事件流文件，约 28MB。角色分工：

- `agent-0` ~ `agent-17`：方向调研（dsh 本体、插件生态、闭源 harness 功能、用户画像、白空间矩阵、Hermes 自进化等）
- `agent-18` ~ `agent-36`：评审团机制验证实验（finder/voter  swarm）
- `agent-37`：插件实现与全部迭代的 coder
- `agent-38` ~ `agent-39`：插件评估工具调研
- `agent-40` ~ `agent-45`：零上下文面试官的五轮独立盲评（5/10 → 6/10 → 5/10 → 7/10 → 7/10 → 8/10）

## 格式与隐私

`wire.jsonl` 为每行一个事件的 JSONL（消息、工具调用、工具结果）。已做密钥模式扫描（sk-/ghp-/gho-/xoxb-/Bearer），未发现敏感凭证。所有 dsh 实验的原始运行证据另见仓库 `eval/runs/`，预算账目见 `eval/budget-*.md`。
