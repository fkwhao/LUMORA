import hljs from "highlight.js";
import { Check, Copy } from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

interface MarkdownCodeBlockProps {
  children: ReactNode;
  language?: string;
  source: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell",
  css: "CSS",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  powershell: "PowerShell",
  python: "Python",
  py: "Python",
  shell: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

function MarkdownCodeBlock({
  children,
  language,
  source,
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const copyCode = async () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span>{language ? (LANGUAGE_LABELS[language] ?? language) : "Text"}</span>
        <button
          type="button"
          className={copied ? "is-copied" : undefined}
          aria-label={copied ? "已复制代码" : "复制代码"}
          onClick={() => void copyCode()}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
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
  table({ node: _node, children, ...props }) {
    return (
      <div className="markdown-table-scroll">
        <table {...props}>{children}</table>
      </div>
    );
  },
  pre({ node: _node, children }) {
    return <>{children}</>;
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

    // highlight.js 会转义源代码，只输出包含高亮 span 的安全 HTML。
    const highlighted =
      language && hljs.getLanguage(language)
        ? hljs.highlight(source, { language }).value
        : hljs.highlightAuto(source).value;
    return (
      <MarkdownCodeBlock language={language} source={source}>
        <code
          {...props}
          className={`hljs${language ? ` language-${language}` : ""}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </MarkdownCodeBlock>
    );
  },
};

const REMARK_PLUGINS = [remarkGfm];

/** 渲染模型返回的 Markdown；禁用原始 HTML，避免模型内容直接注入 DOM。 */
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
}: MarkdownMessageProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
