import { useState } from "react";

import type { WorkLogItem } from "../../../../shared/model-contract";
import { useCitationNavigation } from "./CitationNavigationContext";

interface WebSearchSource {
  title: string;
  url: string;
}

export function WebSearch({ item }: { item: WorkLogItem }) {
  const citationNavigation = useCitationNavigation();
  const [open, setOpen] = useState(true);
  const query = stringArgument(item, "query");
  const sources = webSearchSources(item);
  const running = item.status === "running";
  const failed = item.status === "failed";

  return (
    <article
      className="web-search"
      data-state={failed ? "failed" : running ? "loading" : "done"}
    >
      <div className="web-search-row">
        <SearchIcon />
        <span className="web-search-label">
          <span className={`web-search-shimmer${running ? "" : " is-done"}`}>
            {running ? "正在搜索" : failed ? "搜索失败" : "已搜索"}
            {query && <span className="web-search-query">“{query}”</span>}
          </span>
          {(sources.length > 0 || failed) && (
            <button
              aria-expanded={open}
              aria-label={open ? "收起搜索结果" : "展开搜索结果"}
              className="web-search-chevron"
              onClick={() => setOpen((current) => !current)}
              type="button"
            >
              <CaretIcon />
            </button>
          )}
        </span>
      </div>

      {(sources.length > 0 || failed) && (
        <div className={`web-search-collapsible${open ? "" : " is-collapsed"}`}>
          <div className="web-search-collapsible-inner">
            <div className="web-search-results">
              <span className="web-search-rail" />
              {failed ? (
                <p className="web-search-error">
                  {item.errorMessage || "模型服务商未能完成网络搜索"}
                </p>
              ) : (
                <ul className="web-search-list">
                  {sources.map((source) => (
                    <li className="web-search-site" data-state="done" key={source.url}>
                      <a
                        href={source.url}
                        rel="noreferrer"
                        target={citationNavigation ? undefined : "_blank"}
                        onClick={(event) => {
                          if (!citationNavigation) return;
                          event.preventDefault();
                          citationNavigation.openCitation({
                            number: 0,
                            kind: "web",
                            label: source.title,
                            host: sourceHost(source.url),
                            url: source.url,
                          });
                        }}
                      >
                        <span className="web-search-bullet"><CheckIcon /></span>
                        <span className="web-search-title">{source.title}</span>
                        <span className="web-search-separator">·</span>
                        <span className="web-search-url">{displayUrl(source.url)}</span>
                        <span className="web-search-arrow"><ArrowIcon /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function webSearchSources(item: WorkLogItem): WebSearchSource[] {
  const raw = item.metadata?.sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const source = candidate as Record<string, unknown>;
    const url = typeof source.url === "string" ? source.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) return [];
    const title = typeof source.title === "string" && source.title.trim()
      ? source.title.trim()
      : displayUrl(url);
    return [{ title, url }];
  });
}

function stringArgument(item: WorkLogItem, key: string): string {
  const value = item.arguments?.[key];
  return typeof value === "string" ? value : "";
}

function displayUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function SearchIcon() {
  return <svg aria-hidden="true" height="14" viewBox="0 0 24 24" width="14"><path d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z" /></svg>;
}

function CaretIcon() {
  return <svg aria-hidden="true" height="10" viewBox="0 0 24 24" width="10"><path d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" height="10" viewBox="0 0 24 24" width="10"><path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" height="16" viewBox="0 0 24 24" width="16"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
}
