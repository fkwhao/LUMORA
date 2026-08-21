from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass(frozen=True, slots=True)
class TextEdit:
    start: int
    end: int
    replacement: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MergeConflictHunk:
    base_start_line: int
    base_end_line: int
    current_text: str
    proposed_text: str

    def metadata(self) -> dict[str, object]:
        return {
            "baseStartLine": self.base_start_line,
            "baseEndLine": self.base_end_line,
            "currentText": self.current_text[:4000],
            "proposedText": self.proposed_text[:4000],
        }


@dataclass(frozen=True, slots=True)
class ThreeWayMergeResult:
    content: str | None
    conflicts: tuple[MergeConflictHunk, ...] = ()

    @property
    def merged(self) -> bool:
        return self.content is not None and not self.conflicts


def merge_text(base: str, current: str, proposed: str) -> ThreeWayMergeResult:
    """Merge independent line edits and report overlapping edits for a human.

    ``base`` is the content observed by the writer, ``current`` is the latest
    file, and ``proposed`` is the writer's desired full-file result.  Identical
    edits are coalesced; overlapping edits are never guessed.
    """

    newline = _preferred_newline(current, proposed, base)
    normalized_base = _normalize_newlines(base)
    normalized_current = _normalize_newlines(current)
    normalized_proposed = _normalize_newlines(proposed)

    if normalized_current == normalized_base:
        return ThreeWayMergeResult(
            _restore_newlines(normalized_proposed, newline)
        )
    if (
        normalized_proposed == normalized_base
        or normalized_proposed == normalized_current
    ):
        return ThreeWayMergeResult(current)

    base_lines = tuple(normalized_base.splitlines(keepends=True))
    current_edits = _edits(
        base_lines,
        tuple(normalized_current.splitlines(keepends=True)),
    )
    proposed_edits = _edits(
        base_lines,
        tuple(normalized_proposed.splitlines(keepends=True)),
    )
    conflicts: list[MergeConflictHunk] = []
    for theirs in current_edits:
        for ours in proposed_edits:
            if theirs == ours:
                continue
            if _overlaps(theirs, ours):
                conflicts.append(MergeConflictHunk(
                    base_start_line=min(theirs.start, ours.start) + 1,
                    base_end_line=max(theirs.end, ours.end),
                    current_text="".join(theirs.replacement),
                    proposed_text="".join(ours.replacement),
                ))
    if conflicts:
        unique = tuple(dict.fromkeys(conflicts))
        return ThreeWayMergeResult(None, unique)

    combined = list(dict.fromkeys((*current_edits, *proposed_edits)))
    merged = list(base_lines)
    for edit in sorted(combined, key=lambda value: (value.start, value.end), reverse=True):
        merged[edit.start:edit.end] = edit.replacement
    return ThreeWayMergeResult(
        _restore_newlines("".join(merged), newline)
    )


def _edits(base: tuple[str, ...], target: tuple[str, ...]) -> tuple[TextEdit, ...]:
    matcher = SequenceMatcher(a=base, b=target, autojunk=False)
    return tuple(
        TextEdit(i1, i2, target[j1:j2])
        for tag, i1, i2, j1, j2 in matcher.get_opcodes()
        if tag != "equal"
    )


def _overlaps(first: TextEdit, second: TextEdit) -> bool:
    first_insert = first.start == first.end
    second_insert = second.start == second.end
    if first_insert and second_insert:
        return first.start == second.start
    if first_insert:
        return second.start < first.start < second.end
    if second_insert:
        return first.start < second.start < first.end
    return max(first.start, second.start) < min(first.end, second.end)


def _normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def _restore_newlines(value: str, newline: str) -> str:
    return value if newline == "\n" else value.replace("\n", newline)


def _preferred_newline(*values: str) -> str:
    for value in values:
        crlf = value.count("\r\n")
        lf = value.count("\n") - crlf
        cr = value.count("\r") - crlf
        if crlf or lf or cr:
            return max(
                ((crlf, "\r\n"), (lf, "\n"), (cr, "\r")),
                key=lambda item: item[0],
            )[1]
    return "\n"
