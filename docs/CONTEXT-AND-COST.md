# 上下文与成本规则

这套规则来自对本地会话记录（`%USERPROFILE%\.codex\sessions`）和 DeepSeek 官方文档的实测，
用来解决"开发到后期记忆越来越长、压缩越来越频繁、token 消耗越来越快"的问题。

## 实测数据（2026-09-23）

- 35 条 Codex 会话，累计输入 **10.95 亿 tokens**，缓存命中率 **97.5%**，输出 507 万 tokens。
- 其中单条会话占 **9.33 亿输入 tokens、59 次压缩、2465 张图片**，约占总开销的 80%。
- 结论：钱和时间主要花在"一条永不结束的线程"上，而不是花在功能开发本身。

## 根因

1. 模型目录里 `deepseek-flash` 的 `context_window` 写成 272000，乘 95% 有效系数后是 258400，
   于是大约每 25 万 tokens 就压缩一次；而 DeepSeek 官方文档写明该模型上下文为 1M。
2. 每次压缩都会重写提示词前缀。DeepSeek 的硬盘缓存按"完整前缀单元"匹配，前缀一变，
   这段输入就从缓存命中（$0.003 / 1M）变成缓存未命中（$0.15 / 1M），差 50 倍。
3. 截图会一直留在历史里每轮重发，是撑爆窗口、逼出压缩的最大单一因素。

## 已落地的配置

`~/.codex/model-catalogs/relay-mu5jr1y0.json`（对 `deepseek-flash`）：

```json
"context_window": 1048576,
"max_context_window": 1048576,
"effective_context_window_percent": 95,
"auto_compact_token_limit": 800000
```

`~/.codex/config.toml`：

```toml
model_context_window = 1048576
model_auto_compact_token_limit = 800000
```

验证方式：跑一次任意任务，然后看最新 rollout 里 `task_started` 事件的
`model_context_window`，正确值是 `996147`（1048576 × 95%）。

注意：如果模型目录被重新拉取覆盖，需要重新应用上面的改动。

## 日常规则

- 一个任务一条线程。功能、bug、UI 截图调整分开开线程，做完写 `docs/HANDOFF.md`。
- 不要在线程中途改 `AGENTS.md`、Codex 配置、MCP 服务器列表；要改先开新线程。
- 改过被镜像的仓库文档（`AGENTS.md`、`README.md`、`RELEASE.md`、`DESIGN.md`、`docs/` 下的
  文档、`docs/vault/` 下的手写笔记）就**必须**在收尾前跑 `npm run sync:vault`，见下节。
- 用 `rg` 定位 + 行区间读取，不整文件输出；长日志先落盘再截取。
- 检索和比对交给子代理，主线程只收结论。
- DeepSeek 高峰时段是北京时间 09:00-12:00 与 14:00-18:00（周一至周五，价格翻倍），
  大改动放在晚间或周末更省。

## 文档同步规则（每次都要做）

仓库文档是唯一真实来源，Obsidian vault 是生成视图。vault 不会自己更新，漏跑一次就开始漂移，
下一条线程读到的就是过期状态。

1. 只要这一次任务动过被镜像的仓库文档，收尾前跑 `npm run sync:vault`。
2. 排错或想确认状态时跑 `npm run sync:vault:check`：它只读不写，逐份比对 vault 和仓库，
   列出"内容过期／笔记缺失／多余笔记"，对不上就退出码 1。`npm run verify` 最后一步就是它，
   所以漏同步会在门禁里直接报出来。vault 目录不存在时这一步会打印"跳过同步检查"并通过，
   这样 CI 和没装 Obsidian 的机器不受影响。
3. 路径解析顺序：`--vault <路径>` → 环境变量 `ZP_WORKBENCH_VAULT` → Windows 注册表里的
   "文档"目录（能正确处理重定向，本机解析到 `D:\Users\小zp\Documents\Obsidian Vault`）→
   `~/Documents`。要临时指到别处才需要手动指定。
4. 手写笔记的正文放在仓库 `docs/vault/` 下，同样靠这条命令搬进 vault；直接进 vault 改生成笔记
   会被下一次同步覆盖。
5. 判据不是"跑过了"，而是 `npm run sync:vault:check` 通过，或 vault 里对应笔记的修改时间是最新的
   且搜得到这次改动的关键词。

## 参考

- DeepSeek 定价与上下文长度：https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek 上下文缓存规则：https://api-docs.deepseek.com/guides/kv_cache
- Codex 压缩相关已知问题：openai/codex `#9505`、`#36712`、`#45296`、`#16140`、`#43295`
