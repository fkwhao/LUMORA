from collections.abc import Mapping
from pathlib import Path

import yaml


def load_yaml_mapping(path: Path) -> Mapping[str, object]:
    """安全读取本地 YAML，并确保根节点是对象。"""
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"无法读取本地配置文件：{path}") from error

    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as error:
        # 本地配置也必须使用 safe_load，避免自定义 YAML 标签执行任意 Python 对象。
        raise ValueError(f"本地配置文件格式无效：{path}") from error

    if not isinstance(data, Mapping):
        raise TypeError(f"本地配置文件根节点必须是对象：{path}")
    return data
