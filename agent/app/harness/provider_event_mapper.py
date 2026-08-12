from app.harness.contracts import ProviderTurnEvent
from app.harness.run_event import RunEvent

_WEB_SEARCH_EVENT_TYPES = {
    "web_search_started": "web_search_started",
    "web_search_progress": "web_search_progress",
    "web_search_completed": "web_search_completed",
    "web_search_failed": "web_search_failed",
}


def is_web_search_event(event: ProviderTurnEvent) -> bool:
    return event.type in _WEB_SEARCH_EVENT_TYPES


def web_search_run_event(event: ProviderTurnEvent) -> RunEvent:
    event_type = _WEB_SEARCH_EVENT_TYPES.get(event.type)
    if event_type is None:
        raise ValueError(f"不是 Web Search 事件: {event.type}")
    sources = [
        {"title": source.title, "url": source.url}
        for source in event.sources
    ]
    if event.type == "web_search_completed":
        output = f"已获取 {len(sources)} 个来源" if sources else "搜索完成"
    else:
        output = ""
    return RunEvent(
        type=event_type,  # type: ignore[arg-type]
        item_id=event.item_id,
        tool_call_id=event.item_id,
        tool_name="web_search",
        title="网络搜索",
        arguments={"query": event.query} if event.query else {},
        output=output,
        delta=event.delta,
        error_message=event.error_message,
        model=event.model,
        metadata={
            "executionLocation": "provider",
            "sources": sources,
        },
    )
