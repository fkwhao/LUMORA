import hljs from "highlight.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

/**
 * 渲染模型返回的 Markdown。默认禁用原始 HTML，避免模型内容直接注入 DOM。
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ node: _node, href, children, ...props }) {
            const external = href?.startsWith("https://");
            return (
              <a
                {...props}
                href={href}
                rel={external ? "noreferrer" : undefined}
                target={external ? "_blank" : undefined}
              >
                {children}
              </a>
            );
          },
          input({ node: _node, ...props }) {
            return <input {...props} disabled />;
          },
          code({ node: _node, className, children, ...props }) {
            const source = String(children).replace(/\n$/, "");
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            const fenced = Boolean(language) || source.includes("\n");
            if (!fenced) {
              return (
                <code {...props} className={className}>
                  {children}
                </code>
              );
            }
            // highlight.js 会先转义源码，再输出仅包含高亮 span 的安全 HTML。
            const highlighted =
              language && hljs.getLanguage(language)
                ? hljs.highlight(source, { language }).value
                : hljs.highlightAuto(source).value;
            return (
              <code
                {...props}
                className={`hljs${language ? ` language-${language}` : ""}`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
