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
- 用 `rg` 定位 + 行区间读取，不整文件输出；长日志先落盘再截取。
- 检索和比对交给子代理，主线程只收结论。
- DeepSeek 高峰时段是北京时间 09:00-12:00 与 14:00-18:00（周一至周五，价格翻倍），
  大改动放在晚间或周末更省。

## 参考

- DeepSeek 定价与上下文长度：https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek 上下文缓存规则：https://api-docs.deepseek.com/guides/kv_cache
- Codex 压缩相关已知问题：openai/codex `#9505`、`#36712`、`#45296`、`#16140`、`#43295`
