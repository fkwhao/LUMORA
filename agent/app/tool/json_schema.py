"""Shared JSON Schema validation helpers for tool contracts."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from jsonschema import SchemaError, ValidationError
from jsonschema.validators import validator_for
from referencing.exceptions import Unresolvable

_MAX_SCHEMA_DEPTH = 64
_MAX_SCHEMA_NODES = 20_000


def validate_schema_definition(
    schema: Mapping[str, Any],
    *,
    require_object_root: bool = False,
) -> None:
    """Validate a tool schema before exposing it to the model.

    External references are deliberately rejected: resolving remote schemas during a
    tool call would add an implicit network boundary and make validation non-deterministic.
    Local references (``#/...``) remain supported.
    """

    _check_schema_limits_and_refs(schema)
    if require_object_root and schema.get("type") != "object":
        raise ValueError("工具输入 Schema 的根节点必须是 object")

    try:
        validator_for(schema).check_schema(dict(schema))
    except SchemaError as exc:
        raise ValueError(f"无效的 JSON Schema：{exc.message}") from exc


def validate_schema_instance(schema: Mapping[str, Any], instance: Any) -> None:
    """Validate one value and raise ``ValueError`` with a concise user-facing error."""

    try:
        validator = validator_for(schema)(schema)
        error = next(iter(validator.iter_errors(instance)), None)
    except Unresolvable as exc:
        raise ValueError(f"JSON Schema 引用无法解析：{exc}") from exc

    if error is None:
        return
    raise ValueError(_format_validation_error(error))


def _check_schema_limits_and_refs(schema: Mapping[str, Any]) -> None:
    node_count = 0
    stack: list[tuple[Any, int]] = [(schema, 0)]
    while stack:
        value, depth = stack.pop()
        node_count += 1
        if node_count > _MAX_SCHEMA_NODES:
            raise ValueError("JSON Schema 过大")
        if depth > _MAX_SCHEMA_DEPTH:
            raise ValueError("JSON Schema 嵌套过深")

        if isinstance(value, Mapping):
            for key, child in value.items():
                if (
                    key in {"$ref", "$dynamicRef"}
                    and isinstance(child, str)
                    and not child.startswith("#")
                ):
                    raise ValueError("不支持 JSON Schema 外部引用")
                stack.append((child, depth + 1))
        elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            stack.extend((child, depth + 1) for child in value)


def _format_validation_error(error: ValidationError) -> str:
    if error.validator == "required":
        missing = str(error.message).split("'", 2)
        if len(missing) >= 2:
            return f"缺少必填参数：{missing[1]}"

    location = ".".join(str(part) for part in error.absolute_path)
    prefix = f"参数 {location}" if location else "工具参数"
    return f"{prefix}不符合 Schema：{error.message}"
