# Hosted Web Search

LUMORA 使用模型服务商托管的 Web Search，不在本地实现搜索引擎，也不要求用户配置第三方搜索 Provider。

## 支持范围

| API 格式 | 请求工具 | 结果事件 |
| --- | --- | --- |
| Responses | `{"type":"web_search"}` | `web_search_call`、引用与完整来源列表 |
| Anthropic Messages | `{"type":"web_search_20250305","name":"web_search"}` | `server_tool_use`、`web_search_tool_result` |
| Chat Completions | 暂不启用 | 不同供应商扩展差异较大，后续按独立适配器接入 |

该能力按模型显式开启，默认关闭。只有交互式 Agent 回合会携带搜索工具；连接测试、上下文压缩和其他后台模型调用不会触发搜索。

## 事件边界

Provider 适配器将不同服务商的流式事件统一为：

- `web_search_started`
- `web_search_progress`
- `web_search_completed`
- `web_search_failed`

这些事件经 Java Core 持久化为工作记录。前端将其放在现有工具调用组内，工具调用组默认折叠；展开后显示搜索词、状态和服务商实际返回的可点击来源。

最终回答可以把这些真实来源编码为内联编号。编号、底部来源列表和 Electron 右侧内置网页预览的完整约定见 [内联引用与来源预览](./inline-citations-design.md)。

Responses 与 Anthropic 的最终文本都按服务商原生增量实时输出。若模型在一段文本之后继续发起搜索，该文本会转为 `progress_message` 保留在处理步骤中，新的搜索和最终答案继续执行；只有被同一输出条目更正的临时答案才会回滚，不会删除已经完成的阶段回复。

## 安全与费用

- 搜索在模型服务商侧执行，不经过本地 Shell 审批。
- 开关表达的是“允许模型按需搜索”，不是每轮强制搜索。
- 不支持原生搜索的兼容服务商可能拒绝工具定义；关闭模型开关即可恢复普通调用。
- UI 明示该能力可能产生额外费用，不为新模型自动开启。

## 协议依据

- OpenAI Web Search guide: https://developers.openai.com/api/docs/guides/tools-web-search
- DeepSeek Responses API: https://api-docs.deepseek.com/guides/responses_api/
- DeepSeek Anthropic API: https://api-docs.deepseek.com/guides/anthropic_api/
