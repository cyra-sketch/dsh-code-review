# R6 独立评委复测缺陷台账

## BUG-R6-001：human 后创建空 episode 并放行

- 证据：`/tmp/dsh-cr-review-check/eval/acceptance/high/work/.dsh/jury/gate-episodes.jsonl` 第 3 行 human 后，第 4/5 行出现新 episode accepted，SQL 提交 `bb8fad03510cedf7614723cd3905c4eb70ecfba7` 被 push。
- 根因：`loadLatest` 只复用 accepted。human 后 bare base 前移，按新 base 查不到 episode，于是忽略仍有效的 human 状态并创建新 episode；新 base 与当前 HEAD 相同还可能得到零发现的空评审。
- 修复要求：human 必须跨 base 复用并持续 deny；显式人工批准绑定 exact HEAD；非 low-risk 未运行 discovery 不得 accepted。

## BUG-R6-002：finding ID 语义不足且跨 fixture 不稳定

- 根因：finding key 只有 file+symbol+category，缺少规范化行号，既可能合并同函数不同问题，也无法满足跨 fixture 的稳定语义标识要求。
- 修复要求：file+symbol+category+规范化行号形成确定性 key 与 ID，断言按问题语义匹配并跨 fixture 比较，不硬编码旧 hash。

## BUG-R6-003：run.mjs 改写受跟踪证据

- 根因：场景 JSONL、usage 和预算写回历史证据路径。
- 修复要求：全部运行产物写入 gitignore 的 `eval/acceptance/.results/`；历史日志只作回退读取，不再重写。

## 修复与验证结果

- BUG-R6-001 已修复：accepted/human/approved 都可跨 base 复用；human 每次 deny 前记录本次 HEAD；`jury_human_approve` 与手工 approved 快照均绑定 exact HEAD；approved 后改 HEAD 会重新 human；非 low-risk 无 discovery 时以 `DISCOVERY_REQUIRED` deny。
- BUG-R6-002 已修复：语义键增加规范化行号，并将 intent 下的具体 SQL/金额缺陷规范为 security/correctness，去重与 ID 共用同一 key。
- BUG-R6-003 已修复：run.mjs 的场景日志、usage、run-summary 和预算全部写入 `.results`；assert 读取新日志，历史日志仅回退。
- fresh clone：`/tmp/dsh-code-review-r6-vu8F2Q`。最终 `eval/acceptance/assert.mjs` **20/20**，`gate-command-assert.mjs` **21/21**；typecheck/build 通过。
- high 最终链路：round 3 human → 后续 push 仍 human → 记录被拦截 HEAD → exact-HEAD approved → 放行；没有新空 episode/accepted。reopen 的 SQL 仍 fixed→open 且未验收 HEAD 不进入 bare remote。
- 成本：三轮完整尝试分别 $0.152143434、$0.128461200、$0.133345548，合计 **$0.413950182**，超过本轮 $0.35 上限 **$0.063950182**。前两次分别暴露 push-only 新提交与 human HEAD 未更新问题，最终成功流程为第三次。后续未再调用模型。
