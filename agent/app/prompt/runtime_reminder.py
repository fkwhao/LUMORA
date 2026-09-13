from collections.abc import Callable, Iterable
from dataclasses import dataclass
from threading import RLock
from typing import Literal

ReminderAction = Literal["upsert", "remove", "clear"]
ReminderListener = Callable[["RuntimeReminderChange"], None]


@dataclass(frozen=True, slots=True)
class RuntimeReminderChange:
    """一次运行时 Reminder 状态变化。"""

    revision: int
    action: ReminderAction
    key: str
    content: str = ""


class RuntimeReminderStore:
    """统一管理动态 Reminder，并向 Prompt Runtime 发布状态版本。"""

    def __init__(
        self,
        initial: Iterable[tuple[str, str]] = (),
    ) -> None:
        self._lock = RLock()
        self._reminders: dict[str, str] = {}
        self._listeners: list[ReminderListener] = []
        self._revision = 0
        for key, content in initial:
            normalized_key = _normalize_key(key)
            normalized_content = _normalize_content(content)
            self._reminders[normalized_key] = normalized_content

    @property
    def revision(self) -> int:
        """返回可用于检测 Prompt 是否需要重新组装的单调版本号。"""
        with self._lock:
            return self._revision

    def snapshot(self) -> tuple[str, ...]:
        """返回当前 Reminder 内容，保持注册顺序。"""
        with self._lock:
            return tuple(self._reminders.values())

    def upsert(self, key: str, content: str) -> bool:
        """新增或替换一个 Reminder；内容没有变化时不触发通知。"""
        normalized_key = _normalize_key(key)
        normalized_content = _normalize_content(content)
        with self._lock:
            if self._reminders.get(normalized_key) == normalized_content:
                return False
            self._reminders[normalized_key] = normalized_content
            change = self._change_locked(
                action="upsert",
                key=normalized_key,
                content=normalized_content,
            )
            listeners = tuple(self._listeners)
        self._notify(listeners, change)
        return True

    def remove(self, key: str) -> bool:
        """移除一个 Reminder；目标不存在时不触发通知。"""
        normalized_key = _normalize_key(key)
        with self._lock:
            if normalized_key not in self._reminders:
                return False
            self._reminders.pop(normalized_key)
            change = self._change_locked(
                action="remove",
                key=normalized_key,
            )
            listeners = tuple(self._listeners)
        self._notify(listeners, change)
        return True

    def clear(self) -> bool:
        """清空所有 Reminder。"""
        with self._lock:
            if not self._reminders:
                return False
            self._reminders.clear()
            change = self._change_locked(action="clear", key="*")
            listeners = tuple(self._listeners)
        self._notify(listeners, change)
        return True

    def subscribe(self, listener: ReminderListener) -> Callable[[], None]:
        """订阅状态变化，返回幂等的取消订阅函数。"""
        with self._lock:
            self._listeners.append(listener)

        unsubscribed = False

        def unsubscribe() -> None:
            nonlocal unsubscribed
            if unsubscribed:
                return
            unsubscribed = True
            with self._lock:
                try:
                    self._listeners.remove(listener)
                except ValueError:
                    pass

        return unsubscribe

    def _change_locked(
        self,
        *,
        action: ReminderAction,
        key: str,
        content: str = "",
    ) -> RuntimeReminderChange:
        self._revision += 1
        return RuntimeReminderChange(
            revision=self._revision,
            action=action,
            key=key,
            content=content,
        )

    @staticmethod
    def _notify(
        listeners: tuple[ReminderListener, ...],
        change: RuntimeReminderChange,
    ) -> None:
        for listener in listeners:
            listener(change)


def _normalize_key(value: str) -> str:
    key = value.strip()
    if not key:
        raise ValueError("Reminder key 不能为空")
    return key


def _normalize_content(value: str) -> str:
    content = value.strip()
    if not content:
        raise ValueError("Reminder content 不能为空")
    return content
