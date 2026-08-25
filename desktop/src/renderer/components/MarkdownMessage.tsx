import hljs from "highlight.js";
import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { markdownStyleClasses } from "./assistant-ui/markdown-style-classes";
import { TooltipIconButton } from "./assistant-ui/tooltip-icon-button";
import { cn } from "../lib/utils";

interface MarkdownMessageProps {
  content: string;
}

interface MarkdownCodeBlockProps {
  children: ReactNode;
  language?: string;
  source: string;
}

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
    <div className="aui-md-code-block">
      <div className={markdownStyleClasses.codeHeader}>
        <span className={markdownStyleClasses.codeHeaderLanguage}>
          {language ?? "text"}
        </span>
        <TooltipIconButton
          tooltip={copied ? "已复制" : "复制"}
          aria-label={copied ? "已复制代码" : "复制代码"}
          onClick={() => void copyCode()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </TooltipIconButton>
      </div>
      <pre className={markdownStyleClasses.pre}>{children}</pre>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  h1({ node: _node, className, ...props }) {
    return <h1 className={cn(markdownStyleClasses.h1, className)} {...props} />;
  },
  h2({ node: _node, className, ...props }) {
    return <h2 className={cn(markdownStyleClasses.h2, className)} {...props} />;
  },
  h3({ node: _node, className, ...props }) {
    return <h3 className={cn(markdownStyleClasses.h3, className)} {...props} />;
  },
  h4({ node: _node, className, ...props }) {
    return <h4 className={cn(markdownStyleClasses.h4, className)} {...props} />;
  },
  h5({ node: _node, className, ...props }) {
    return <h5 className={cn(markdownStyleClasses.h5, className)} {...props} />;
  },
  h6({ node: _node, className, ...props }) {
    return <h6 className={cn(markdownStyleClasses.h6, className)} {...props} />;
  },
  p({ node: _node, className, ...props }) {
    return <p className={cn(markdownStyleClasses.p, className)} {...props} />;
  },
  a({ node: _node, href, className, children, ...props }) {
    const external = href?.startsWith("https://");
    return (
      <a
        {...props}
        className={cn(markdownStyleClasses.a, className)}
        href={href}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
  blockquote({ node: _node, className, ...props }) {
    return (
      <blockquote
        className={cn(markdownStyleClasses.blockquote, className)}
        {...props}
      />
    );
  },
  ul({ node: _node, className, ...props }) {
    return <ul className={cn(markdownStyleClasses.ul, className)} {...props} />;
  },
  ol({ node: _node, className, ...props }) {
    return <ol className={cn(markdownStyleClasses.ol, className)} {...props} />;
  },
  li({ node: _node, className, ...props }) {
    return <li className={cn(markdownStyleClasses.li, className)} {...props} />;
  },
  hr({ node: _node, className, ...props }) {
    return <hr className={cn(markdownStyleClasses.hr, className)} {...props} />;
  },
  strong({ node: _node, className, ...props }) {
    return (
      <strong
        className={cn(markdownStyleClasses.strong, className)}
        {...props}
      />
    );
  },
  sup({ node: _node, className, ...props }) {
    return <sup className={cn(markdownStyleClasses.sup, className)} {...props} />;
  },
  input({ node: _node, ...props }) {
    return <input {...props} disabled />;
  },
  table({ node: _node, className, ...props }) {
    return (
      <table
        className={cn(markdownStyleClasses.table, className)}
        {...props}
      />
    );
  },
  th({ node: _node, className, ...props }) {
    return <th className={cn(markdownStyleClasses.th, className)} {...props} />;
  },
  td({ node: _node, className, ...props }) {
    return <td className={cn(markdownStyleClasses.td, className)} {...props} />;
  },
  tr({ node: _node, className, ...props }) {
    return <tr className={cn(markdownStyleClasses.tr, className)} {...props} />;
  },
  pre({ node: _node, children }) {
    return <>{children}</>;
  },
  code({ node: _node, className, children, ...props }) {
    const rawSource = String(children);
    const source = rawSource.replace(/\n$/, "");
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
    const fenced = Boolean(language) || rawSource.includes("\n");
    if (!fenced) {
      return (
        <code
          {...props}
          className={cn(markdownStyleClasses.inlineCode, className)}
        >
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
    <div className={markdownStyleClasses.root}>
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
