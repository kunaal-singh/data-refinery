from __future__ import annotations
import csv
import io
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd

SUPPORTED_DELIMITERS = [",", ";", "\t", "|"]


def safe_frame(path: Path, file_type: str, sheet: str | None = None, has_header: bool = True) -> pd.DataFrame:
    suffix = file_type.lower()
    if suffix in {"csv", "tsv", "txt"}:
        raw = path.read_bytes()
        text = None
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise ValueError("This file's text encoding could not be detected.")
        try:
            delimiter = csv.Sniffer().sniff(text[:65536], delimiters="".join(SUPPORTED_DELIMITERS)).delimiter
        except csv.Error:
            delimiter = "\t" if suffix == "tsv" else ","
        frame = pd.read_csv(io.StringIO(text), sep=delimiter, on_bad_lines="error", low_memory=False, header=0 if has_header else None)
        frame.columns = [str(column) if has_header else f"Column {index + 1}" for index, column in enumerate(frame.columns)]
        return frame
    if suffix in {"xlsx", "xlsm"}:
        book = pd.ExcelFile(path, engine="openpyxl")
        selected = sheet or book.sheet_names[0]
        if selected not in book.sheet_names:
            raise ValueError("The selected worksheet does not exist in this workbook.")
        frame = pd.read_excel(book, sheet_name=selected, engine="openpyxl")
        frame.columns = [str(column) for column in frame.columns]
        return frame
    if suffix == "json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, dict) and isinstance(value.get("data"), list):
            value = value["data"]
        if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
            raise ValueError("JSON must be a list of objects or an object containing a data list.")
        frame = pd.json_normalize(value, sep=".")
        frame.columns = [str(column) for column in frame.columns]
        return frame
    raise ValueError("Choose a CSV, XLSX, XLSM, or JSON file.")


def json_value(value: Any) -> Any:
    if value is None:
        return None
    missing = pd.isna(value)
    if isinstance(missing, (bool, np.bool_)) and missing:
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def frame_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [{str(k): json_value(v) for k, v in row.items()} for row in frame.to_dict(orient="records")]


def profile(frame: pd.DataFrame) -> dict[str, Any]:
    columns = []
    for name in frame.columns:
        series = frame[name]
        present = series.dropna()
        unique = int(present.nunique(dropna=True))
        id_like = bool(re.search(r"(^|[\s._-])(id|identifier|key|sku|code|zip|postal)([\s._-]|$)", str(name), re.IGNORECASE))
        if id_like:
            kind = "identifier"
        elif pd.api.types.is_bool_dtype(series):
            kind = "boolean"
        elif pd.api.types.is_numeric_dtype(series):
            kind = "number"
        elif pd.api.types.is_datetime64_any_dtype(series):
            kind = "date"
        else:
            parsed_dates = pd.to_datetime(present, errors="coerce", format="mixed") if len(present) else pd.Series(dtype="datetime64[ns]")
            if len(present) and parsed_dates.notna().mean() >= 0.8:
                kind = "date"
            elif unique / max(len(present), 1) > 0.85 and len(present) > 10:
                kind = "identifier"
            else:
                kind = "category"
        column = {"name": str(name), "type": kind, "missing": int(series.isna().sum()), "unique": unique}
        if kind == "number" and len(present):
            nums = pd.to_numeric(present, errors="coerce").dropna()
            if len(nums):
                column.update(min=float(nums.min()), max=float(nums.max()), mean=float(nums.mean()), median=float(nums.median()), q1=float(nums.quantile(.25)), q3=float(nums.quantile(.75)))
        columns.append(column)
    missing = int(frame.isna().sum().sum())
    duplicates = int(frame.duplicated().sum())
    total = frame.shape[0] * frame.shape[1]
    quality = max(0, round(100 * (1 - (missing + duplicates * frame.shape[1]) / total))) if total else 0
    return {"rows": int(frame.shape[0]), "columns": int(frame.shape[1]), "missing": missing, "duplicates": duplicates, "quality": quality, "column_profile": columns}


def quality_report(frame: pd.DataFrame) -> dict[str, Any]:
    issues = []
    for name in frame.columns:
        series = frame[name]
        missing = int(series.isna().sum())
        if missing:
            issues.append({"column": str(name), "kind": "missing", "count": missing, "message": f"{missing} values are missing in {name}."})
        if pd.api.types.is_numeric_dtype(series):
            nums = pd.to_numeric(series, errors="coerce").dropna()
            if len(nums) >= 4:
                q1, q3 = nums.quantile(.25), nums.quantile(.75)
                spread = q3 - q1
                if spread > 0:
                    outliers = int(((nums < q1 - 1.5 * spread) | (nums > q3 + 1.5 * spread)).sum())
                    if outliers:
                        issues.append({"column": str(name), "kind": "outlier", "count": outliers, "message": f"{outliers} values in {name} fall beyond the 1.5× IQR range."})
        if series.dtype == "object":
            text = series.dropna().astype(str)
            if len(text):
                name_lower = str(name).casefold()
                if not any(token in name_lower for token in ("id", "sku", "code", "zip", "postal")):
                    numeric = pd.to_numeric(text.str.replace(r"[$,%]", "", regex=True).str.replace(",", "", regex=False), errors="coerce")
                    numeric_ratio = float(numeric.notna().mean())
                    if .6 <= numeric_ratio < 1:
                        invalid = int(numeric.isna().sum())
                        issues.append({"column": str(name), "kind": "malformed_number", "count": invalid, "message": f"{invalid} values in {name} are not valid numbers."})
                    parsed_dates = pd.to_datetime(text, errors="coerce", format="mixed")
                    date_ratio = float(parsed_dates.notna().mean())
                    if .6 <= date_ratio < 1:
                        invalid = int(parsed_dates.isna().sum())
                        issues.append({"column": str(name), "kind": "invalid_date", "count": invalid, "message": f"{invalid} values in {name} are not valid dates."})
                lower = text.str.strip().str.casefold()
                groups: dict[str, set[str]] = {}
                for original, normalized in zip(text, lower):
                    groups.setdefault(normalized, set()).add(original)
                variants = [values for values in groups.values() if len(values) > 1]
                if variants:
                    count = sum(len(v) - 1 for v in variants)
                    issues.append({"column": str(name), "kind": "category_variants", "count": count, "message": f"{count} casing or whitespace variants detected in {name}."})
    duplicate_count = int(frame.duplicated().sum())
    if duplicate_count:
        issues.append({"column": None, "kind": "duplicate", "count": duplicate_count, "message": f"{duplicate_count} exact duplicate rows detected."})
    return {**profile(frame), "issues": issues}


def recommend_charts(frame: pd.DataFrame) -> list[dict[str, Any]]:
    p = profile(frame)
    dimensions = [c for c in p["column_profile"] if c["type"] == "category" and 1 < c["unique"] <= 30]
    measures = [c for c in p["column_profile"] if c["type"] == "number" and c["unique"] > 1]
    dates = [c for c in p["column_profile"] if c["type"] == "date"]
    charts = []
    if dates and measures:
        charts.append({"title": f"{measures[0]['name']} over time", "x": dates[0]["name"], "y": measures[0]["name"], "kind": "line", "aggregation": "sum"})
    for dim in dimensions[:2]:
        if measures:
            charts.append({"title": f"{measures[0]['name']} by {dim['name']}", "x": dim["name"], "y": measures[0]["name"], "kind": "bar", "aggregation": "sum"})
        elif dim["unique"] <= 8:
            charts.append({"title": f"{dim['name']} distribution", "x": dim["name"], "y": dim["name"], "kind": "pie", "aggregation": "count"})
    return charts


def aggregate_chart(frame: pd.DataFrame, chart: dict[str, Any]) -> list[dict[str, Any]]:
    x, y = chart["x"], chart["y"]
    if x not in frame or y not in frame:
        raise ValueError("Chart fields must match columns in this dataset.")
    data = frame.copy()
    if chart.get("filter_column") and chart.get("filter_value") is not None:
        data = data[data[chart["filter_column"]].astype("string").fillna("") == chart["filter_value"]].copy()
    data[x] = data[x].fillna("Missing").astype(str)
    agg = chart.get("aggregation", "sum")
    if agg == "count" or x == y:
        result = data.groupby(x, dropna=False).size().rename("value")
    else:
        values = pd.to_numeric(data[y], errors="coerce")
        grouped = values.groupby(data[x])
        result = grouped.mean() if agg == "average" else grouped.sum(min_count=1)
    if chart.get("kind") not in {"line", "area"}:
        result = result.sort_values(ascending=chart.get("sort", "desc") == "asc")
    return [{"label": str(index), "value": json_value(value)} for index, value in result.dropna().head(100).items()]


def run_query(frame: pd.DataFrame, spec: dict[str, Any]) -> dict[str, Any]:
    operation = spec["operation"]
    limit = spec.get("limit", 10)
    dimension, measure, aggregation = spec.get("dimension"), spec.get("measure"), spec.get("aggregation", "sum")
    if operation in {"group_by", "top_values"}:
        if not dimension or dimension not in frame.columns:
            raise ValueError("A valid dimension column is required.")
        if operation == "top_values" or aggregation == "count":
            result = frame[dimension].fillna("Missing").astype(str).value_counts().rename("value")
        else:
            if not measure or measure not in frame.columns:
                raise ValueError("A valid measure column is required.")
            numeric = pd.to_numeric(frame[measure], errors="coerce")
            grouped = numeric.groupby(frame[dimension])
            func = {"sum": "sum", "average": "mean", "min": "min", "max": "max"}.get(aggregation)
            if not func:
                raise ValueError("Unsupported aggregation.")
            result = getattr(grouped, func)()
        result = result.sort_values(ascending=spec.get("sort", "desc") == "asc").head(limit)
        return {"operation": operation, "dimension": dimension, "measure": measure, "aggregation": aggregation, "rows": [{"label": str(k), "value": json_value(v)} for k,v in result.items()]}
    if operation == "count":
        return {"operation": operation, "value": int(frame[measure].count()) if measure in frame else int(len(frame))}
    if not measure or measure not in frame:
        raise ValueError("A valid numeric measure column is required.")
    values = pd.to_numeric(frame[measure], errors="coerce").dropna()
    if not len(values):
        raise ValueError("The selected measure does not contain numeric values.")
    value = values.sum() if operation == "total" else values.mean() if operation == "average" else values.max() if operation == "maximum" else values.min()
    return {"operation": operation, "measure": measure, "value": json_value(value), "count": len(values)}
