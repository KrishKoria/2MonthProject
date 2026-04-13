"""Helpers for Arrow/NumPy-backed collection fields loaded from Parquet."""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any


def ensure_list(value: Any) -> list[Any]:
    """Return a stable Python list for list-like values from pandas/pyarrow."""
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        return [] if value == "" else [value]
    try:
        if math.isnan(value):
            return []
    except (TypeError, ValueError):
        pass
    if hasattr(value, "tolist") and not isinstance(value, dict):
        value = value.tolist()
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple | set):
        return list(value)
    if isinstance(value, dict):
        return [value]
    if isinstance(value, Iterable):
        return list(value)
    return [value]


def has_items(value: Any) -> bool:
    """Return True when a possibly Arrow-backed collection contains items."""
    return len(ensure_list(value)) > 0
