# EVAL-010：R3 物理隔离干净重跑与叙事收口

> 日期：2026-10-29 ｜ 协议：`eval/PROTOCOL-R3.md`（运行前冻结）。预算账：`eval/budget-R3.md`。未读取凭证、未对项目仓库 commit。

## 1. 勘误落地

`eval/ERRATA-001.md` 已披露：

- pr-008 baseline 在 `r2-pr-008-baseline.jsonl:40-42` 读取 fix.patch；pr-009 baseline 在 `r2-pr-009-baseline.jsonl:21-33` 读取 fix.patch 和 GT，答案泄漏使 R2 对照失效。
- baseline 96.43% 时，≥15% 相对提升通过线在数学上不可达，是设计错误。
- 旧数据复用破坏严格 held-out 对照，因此 R2 结论降级为“未证明评审团增量”，不是“已证伪”。

`eval/EVAL-008-decisive.md` 顶部已加入勘误指引，历史正文未改写。

## 2. 隔离执行与污染检查

R3 工作区与 GT、fix.patch、协议和历史日志隔离，prompt 只指定目标 diff：`eval/r3-isolated/pr-00X/`。prompt 禁止读取其他文件、补丁、GT、协议、历史日志或联网找修复提交。逐份事件流检查显示所有评审只调用指定 diff 的 `read` 或 `jury_run`，未发生 GT/fix/协议/历史日志读取，无运行需作废。

两项隔离限制必须保留：pr-008 的 diff 自带 commit message，其中 `Bug fixes` 明确描述“负数的整数部分为 0 时缺符号”，对各臂都构成额外定位提示；`eval/r3-isolated/pr-008/issue31.json` 也留在隔离目录中，虽未被事件流读取，但说明目录并非严格只含 diff。本轮证明的是限制实际读取后的对照，不是完全无定位提示的盲审。

共 3 个干净样本、3 臂、每臂一次；另有 pr-008 baseline A/A 一次。共 10 次运行，成本 **$0.519622980 < $0.60**，剩余 $0.080377020。

## 3. 干净对照数据（协调者人工盲裁）

当前环境没有独立 explore 子代理可用，以下为协调者人工盲裁，不冒充独立评审。

| PR | baseline | single | standard |
|---|---:|---:|---:|
| pr-007 | **6/6** | **5/6**（漏幂等键） | **6/6** |
| pr-008 | **1/1** | **1/1** | 超时，无报告 |
| pr-009 | **1/1** | **1/1** | **1/1** |

- 所有已完成 finding 均带 file:line，证据率 100%。
- 未发现误报；uncertain 不计为误报。
- standard 在 **0/3** 样本上严格多于 baseline，未达到预注册的 ≥2/3 恢复线。
- standard 完成报告比例为 2/3；pr-008 在 15 分钟超时前未出报告。
- A/A：pr-008 baseline 两次均 1/1，召回无波动。

## 4. 成本对照

谷时价格：input $0.15/M、cacheRead $0.003/M、output $0.60/M。

| 臂（不含 A/A） | 非缓存输入 | 缓存读 | 输出 | 美元 | 真 bug 数 | 每真 bug 成本 |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 21,171 | 41,856 | 81,939 | **$0.052464618** | 8 | **$0.006558077** |
| single | 158,174 | 5,464,320 | 113,276 | **$0.108084660** | 7 | **$0.015440666** |
| standard | 434,636 | 14,930,688 | 350,634 | **$0.320367864** | 7 | **$0.045766838** |

standard 无增量召回，不能计算增量边际成本；它不是更有成本效益的选择。pr-008 standard 的超时运行本身花费 $0.199021644。

## 5. 预注册产品规则判定

**维持 single 默认，standard 仅作显式选项。** standard 在 0/3 干净样本上严格多于 baseline，不能恢复“高危建议 standard”。

本轮没有证明 single 的召回总优于 standard：pr-007 上 single 漏 1 个幂等键，standard 全中；但在全部样本上 baseline 已很强，评审团并未显示增量价值。结论限定为当前三个干净样本，不外推为所有 PR。

## 6. 叙事收口

已完成：

- README 首屏改为“single 默认引擎的 agent 工作过程质量关卡（gate+intent）”，standard/deep 仅作显式深度档；不再以多 persona 团为核心卖点。
- `package.json` description 改为 `Single-first agent workflow quality gate for DeepSeek Harness`。
- 验收 prompt 强化：未触碰的 fixed 保持 fixed，语义等价修复也算 fixed，只有缺陷仍存在或明确重引入才判 open。
- `eval/regression/ACCEPTANCE.md` 记录两个回归用例：等价修复不得重开、明确重引入必须重开。B 已由 exact-HEAD 覆盖；A 后续已在 R4 实跑，见 `eval/EVAL-011-contract-suite.md`。

## 7. 遗留问题

1. pr-008 standard 超时说明大 diff 上仍有可靠性/成本问题，不能由 pr-007/009 的完成推断稳定。
2. 本包没有独立子代理盲裁；当前是协调者人工盲裁，后续有 explore 工具时可复核。
3. 样本只有三个且各一次，无法估计 standard 方差；R3 只回答当前协议下的产品默认值，不证明评审团普遍无效。
