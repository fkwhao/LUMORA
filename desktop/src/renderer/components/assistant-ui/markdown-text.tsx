"use client";

import "@assistant-ui/react-markdown/styles/dot.css";
import hljs from "highlight.js";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  type SyntaxHighlighterProps,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { useAuiState } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";
import { type ComponentProps, type FC, memo, useMemo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { markdownStyleClasses } from "@/components/assistant-ui/markdown-style-classes";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { InlineCitationMark } from "@/features/tasks/components/InlineCitations";
import { useCitationNavigation } from "@/features/tasks/components/CitationNavigationContext";

const MarkdownTextImpl = () => {
  const navigation = useCitationNavigation();
  const messageIndex = useAuiState((state) => state.message.index);
  const references = navigation?.citationsForMessage(messageIndex) ?? [];
  const citationSignature = references.map((reference) => reference.number).join(":");
  const remarkPlugins = useMemo(
    () => references.length > 0
      ? [remarkGfm, inlineCitationPlugin(references.map((reference) => reference.number))]
      : [remarkGfm],
    [citationSignature],
  );
  return (
    <MarkdownTextPrimitive
      remarkPlugins={remarkPlugins}
      className={markdownStyleClasses.root}
      components={defaultComponents}
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

function CitationAwareLink({ href, className, ...props }: ComponentProps<"a">) {
  const navigation = useCitationNavigation();
  const messageIndex = useAuiState((state) => state.message.index);
  const number = citationNumberFromHref(href);
  const references = navigation?.citationsForMessage(messageIndex) ?? [];
  const reference = number === undefined
    ? references.find((candidate) => citationHrefMatches(candidate, href))
    : references.find((candidate) => candidate.number === number);
  if (reference && navigation) {
    return (
      <InlineCitationMark
        reference={reference}
        onOpen={navigation.openCitation}
      />
    );
  }
  return (
    <a
      href={href}
      className={cn(markdownStyleClasses.a, className)}
      {...props}
    />
  );
}

const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  components: { Pre, Code },
  language,
  code,
}) => {
  const highlighted = useMemo(
    () =>
      hljs.getLanguage(language)
        ? hljs.highlight(code, { language }).value
        : hljs.highlightAuto(code).value,
    [code, language],
  );

  return (
    <Pre>
      <Code
        className={`hljs language-${language}`}
        // highlight.js 会转义源代码，只生成用于着色的 span。
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </Pre>
  );
};

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className={markdownStyleClasses.codeHeader}>
      <span className={markdownStyleClasses.codeHeaderLanguage}>
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      },
      () => {},
    );
  };

  return { isCopied, copyToClipboard };
};

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        markdownStyleClasses.h1,
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        markdownStyleClasses.h2,
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        markdownStyleClasses.h3,
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        markdownStyleClasses.h4,
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        markdownStyleClasses.h5,
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        markdownStyleClasses.h6,
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        markdownStyleClasses.p,
        className,
      )}
      {...props}
    />
  ),
  a: CitationAwareLink,
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        markdownStyleClasses.blockquote,
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        markdownStyleClasses.ul,
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        markdownStyleClasses.ol,
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn(markdownStyleClasses.hr, className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        markdownStyleClasses.table,
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        markdownStyleClasses.th,
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        markdownStyleClasses.td,
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        markdownStyleClasses.tr,
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn(markdownStyleClasses.li, className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn(markdownStyleClasses.strong, className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn(markdownStyleClasses.sup, className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        markdownStyleClasses.pre,
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock &&
            markdownStyleClasses.inlineCode,
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
  SyntaxHighlighter,
});

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  label?: string;
  children?: MarkdownNode[];
}

function inlineCitationPlugin(numbers: number[]) {
  const available = new Set(numbers);
  return () => (tree: MarkdownNode) => transformCitationText(tree, available);
}

function transformCitationText(node: MarkdownNode, available: Set<number>) {
  if (!node.children || shouldSkipCitationChildren(node.type)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "linkReference") {
      const number = Number(child.identifier ?? child.label);
      if (Number.isInteger(number) && available.has(number)) {
        return [{
          type: "link",
          url: `#lumora-citation-${number}`,
          children: [{ type: "text", value: String(number) }],
        }];
      }
    }
    if (child.type !== "text" || !child.value) {
      transformCitationText(child, available);
      return [child];
    }
    return citationTextParts(child.value, available);
  });
}

function citationTextParts(value: string, available: Set<number>): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  const pattern = /\[(\d{1,3})\]/g;
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const number = Number(match[1]);
    if (!available.has(number)) continue;
    if (index > offset) result.push({ type: "text", value: value.slice(offset, index) });
    result.push({
      type: "link",
      url: `#lumora-citation-${number}`,
      children: [{ type: "text", value: String(number) }],
    });
    offset = index + match[0].length;
  }
  if (offset === 0) return [{ type: "text", value }];
  if (offset < value.length) result.push({ type: "text", value: value.slice(offset) });
  return result;
}

function shouldSkipCitationChildren(type: string): boolean {
  return type === "link"
    || type === "linkReference"
    || type === "definition"
    || type === "code"
    || type === "inlineCode";
}

function citationNumberFromHref(href?: string): number | undefined {
  const match = href?.match(/^#lumora-citation-(\d{1,3})$/);
  return match ? Number(match[1]) : undefined;
}

function citationHrefMatches(
  reference: { kind: string; url?: string },
  href?: string,
): boolean {
  if (reference.kind !== "web" || !reference.url || !href) return false;
  try {
    return new URL(reference.url).toString() === new URL(href).toString();
  } catch {
    return reference.url === href;
  }
}
