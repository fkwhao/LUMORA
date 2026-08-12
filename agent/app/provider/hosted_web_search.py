from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.harness.contracts import ProviderWebSource


@dataclass(frozen=True, slots=True)
class ProviderWebSearch:
    item_id: str
    query: str = ""
    sources: tuple[ProviderWebSource, ...] = ()


def responses_web_searches(payload: Mapping[str, Any]) -> tuple[ProviderWebSearch, ...]:
    citations = _responses_citations(payload)
    searches: list[ProviderWebSearch] = []
    for raw_item in _sequence(payload.get("output")):
        if not isinstance(raw_item, Mapping) or raw_item.get("type") != "web_search_call":
            continue
        action = _mapping(raw_item.get("action"))
        sources = _sources(action.get("sources")) or citations
        searches.append(ProviderWebSearch(
            item_id=_text(raw_item.get("id")),
            query=_search_query(action),
            sources=sources,
        ))
    return tuple(search for search in searches if search.item_id)


def anthropic_web_sources(raw_result: Any) -> tuple[ProviderWebSource, ...]:
    result = _mapping(raw_result)
    content = result.get("content")
    if isinstance(content, Mapping):
        content = [content]
    return _sources(content)


def web_search_query(raw_input: Any) -> str:
    data = _mapping(raw_input)
    query = _text(data.get("query"))
    if query:
        return query
    queries = _sequence(data.get("queries"))
    return _text(queries[0]) if queries else ""


def _responses_citations(
    payload: Mapping[str, Any],
) -> tuple[ProviderWebSource, ...]:
    raw_sources: list[Any] = []
    for raw_item in _sequence(payload.get("output")):
        if not isinstance(raw_item, Mapping) or raw_item.get("type") != "message":
            continue
        for block in _sequence(raw_item.get("content")):
            if not isinstance(block, Mapping):
                continue
            raw_sources.extend(_sequence(block.get("annotations")))
    return _sources(raw_sources)


def _sources(raw_sources: Any) -> tuple[ProviderWebSource, ...]:
    sources: list[ProviderWebSource] = []
    seen_urls: set[str] = set()
    for raw_source in _sequence(raw_sources):
        if not isinstance(raw_source, Mapping):
            continue
        nested = _mapping(raw_source.get("url_citation"))
        url = _text(raw_source.get("url") or nested.get("url"))
        if not url or url in seen_urls:
            continue
        title = _text(raw_source.get("title") or nested.get("title")) or url
        seen_urls.add(url)
        sources.append(ProviderWebSource(title=title[:500], url=url[:2_000]))
        if len(sources) >= 12:
            break
    return tuple(sources)


def _search_query(action: Mapping[str, Any]) -> str:
    query = _text(action.get("query"))
    if query:
        return query
    queries = _sequence(action.get("queries"))
    if queries:
        return _text(queries[0])
    url = _text(action.get("url"))
    pattern = _text(action.get("pattern"))
    if url and pattern:
        return f"{url} · {pattern}"
    return url or pattern


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, (list, tuple)) else ()


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
