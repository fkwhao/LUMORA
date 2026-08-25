# 内联引用与来源预览

## 目标

最终回答可以用紧凑的上标编号标出事实来源，并在回答底部展示去重后的来源列表。正文编号和来源列表使用同一份引用数据；点击任一入口都打开主聊天界面现有的右侧页签，不离开当前会话。

支持四类来源：

- `web`：Hosted Web Search 返回的 HTTP/HTTPS 页面；
- `file`：当前任务工作区或有效 worktree 内的文本、代码和图片；
- `attachment`：当前会话已登记的图片或文档附件；
- `artifact`：Agent 已持久化的运行结果。

## 回答协议

Agent 在正文中使用连续编号 `[1]`、`[2]`，并在回答末尾写标准 Markdown 引用定义。定义由 Markdown 隐藏，但会被桌面端解析为结构化来源：

```markdown
缓存由固定前缀稳定性决定[1]，实现位于请求构建器[2]。

[1]: https://example.com/cache "缓存说明"
[2]: lumora-file:agent/app/provider.py#L40-L58 "provider.py"
[3]: lumora-attachment:attachment-id#P2-P4 "设计文档"
[4]: lumora-artifact:artifact-id "运行结果"
```

Agent 只能引用工具实际返回的 URL、路径、附件 ID 或 Artifact ID，不能猜测来源定位。为了兼容已有会话，如果回答只有 `[n]` 而没有定义，桌面端会按该消息工作记录中已完成且去重后的来源顺序进行尽力匹配。

## 渲染与交互

- Markdown AST 中的数字引用会转换为小型上标按钮；代码块、行内代码和普通链接不参与转换。
- 回答底部来源列表与正文按钮共享 `CitationReference`，避免两套状态产生编号或目标不一致。
- 同一来源复用同一个右侧页签；重复点击只激活该页签。
- 本地文本按行展示，并将 `#Lx-Ly` 定位到可视区域中央；图片和已登记的 PDF 附件使用内嵌预览，PDF 按 `#Px-Py` 的起始页打开。
- 网页页签提供后退、前进、停止和刷新，网页内容由 Electron `WebContentsView` 承载，因此不会调用 Windows 默认浏览器。

## 安全边界

- 网页预览仅接受 HTTP/HTTPS，启用 sandbox、context isolation 和 web security，不加载 Node 或 preload。
- 网页权限请求和下载默认拒绝，新窗口请求在同一预览页签内导航。
- 本地文件读取在 Main Process 完成。路径必须在任务源工作区或有效 worktree 的真实路径内；同时校验 `realpath`，阻止 `..` 穿越和符号链接逃逸。
- 文本和图片预览设置大小上限；未知二进制格式不直接读取到 Renderer。

## 数据与生命周期

引用定义作为最终回答文本的一部分随消息持久化，不新增数据库表。Web Search 来源、文件行号、附件页码和 Artifact ID 仍由既有 WorkLog 元数据提供回退依据。

网页视图跟随右侧页签生命周期：切走时隐藏，关闭页签或切换任务时销毁；Renderer 只通过受限的 citations preload API 控制导航和边界，不接触任意 IPC channel。
