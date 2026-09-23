from __future__ import annotations
import io
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from .engine import aggregate_chart, frame_records, profile, quality_report, recommend_charts, run_query, safe_frame
from .models import ChartRequest, CleanRequest, DashboardRequest, ExportRequest, QuerySpec
from .store import MetadataStore

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
storage_env = Path(os.getenv("DATAREFINERY_STORAGE", "storage"))
STORAGE = storage_env if storage_env.is_absolute() else ROOT / storage_env
MAX_BYTES = int(os.getenv("DATAREFINERY_MAX_UPLOAD_MB", "50")) * 1024 * 1024
STORE = MetadataStore(STORAGE)
ALLOWED = {"csv", "tsv", "txt", "xlsx", "xlsm", "json"}

app = FastAPI(title="DataRefinery API", version="0.2.0", description="Local data analysis API; no authentication or user accounts.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=False, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["*"])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_meta(dataset_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f-]{36}", dataset_id):
        raise HTTPException(404, "Dataset not found.")
    meta = STORE.get(dataset_id)
    if not meta:
        raise HTTPException(404, "Dataset not found.")
    return meta


def data_path(meta: dict[str, Any]) -> Path:
    base = (STORAGE / "datasets" / meta["dataset_id"]).resolve()
    path = (base / meta["processed_storage_path"]).resolve()
    if base not in path.parents or not path.is_file():
        raise HTTPException(404, "Processed dataset file is unavailable.")
    return path


def frame_for(meta: dict[str, Any]) -> pd.DataFrame:
    if meta.get("processing_status") != "ready":
        raise HTTPException(409, "Choose a worksheet before analyzing this workbook.")
    return pd.read_parquet(data_path(meta))


def public_meta(meta: dict[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in meta.items() if key not in {"storage_path", "processed_storage_path"}}
    return result


def safe_error(exc: Exception) -> str:
    message = str(exc)
    message = message.replace(str(STORAGE), "[local storage]").replace(str(ROOT), "[project]")
    message = re.sub(r"[A-Za-z]:\\[^\s:'\"]+", "[local path]", message)
    return message[:300] or "Invalid or unsupported dataset."


def analyze(meta: dict[str, Any], sheet: str | None = None, has_header: bool = True) -> dict[str, Any]:
    original = (STORAGE / "datasets" / meta["dataset_id"] / meta["storage_path"]).resolve()
    frame = safe_frame(original, meta["file_type"], sheet, has_header)
    if frame.empty and not len(frame.columns):
        raise ValueError("This file has no tabular rows or columns to analyze.")
    processed = STORAGE / "datasets" / meta["dataset_id"] / "processed" / "data.parquet"
    processed.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(processed, index=False)
    info = profile(frame)
    meta.update(info)
    meta.update(processing_status="ready", sheet_name=sheet, processed_storage_path="processed/data.parquet", updated_at=utc_now())
    meta["column_profile"] = info["column_profile"]
    meta.setdefault("charts", [])
    meta.setdefault("audit_log", [])
    STORE.put(meta)
    return meta


@app.get("/api/health")
def health():
    return {"status": "ok", "metadata_store": "mongodb" if STORE.collection is not None else "local_json"}


@app.get("/api/datasets")
def list_datasets(limit: int = Query(12, ge=1, le=50)):
    datasets = []
    for item in STORE.all()[:limit]:
        summary = public_meta(item)
        for key in ("audit_log", "charts", "dashboard"):
            summary.pop(key, None)
        datasets.append(summary)
    return {"datasets": datasets}


@app.post("/api/datasets/upload", status_code=201)
async def upload_dataset(file: UploadFile = File(...), sheet: str | None = Form(default=None), has_header: bool = Form(default=True)):
    filename = Path(file.filename or "dataset").name.replace("\x00", "")
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED:
        raise HTTPException(415, "Choose a CSV, XLSX, XLSM, or JSON file.")
    dataset_id = str(uuid.uuid4())
    folder = STORAGE / "datasets" / dataset_id / "original"
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"source.{ext}"
    size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, f"Files must be smaller than {MAX_BYTES // (1024 * 1024)} MB.")
                output.write(chunk)
        created = utc_now()
        meta: dict[str, Any] = {"dataset_id": dataset_id, "filename": filename[:240], "file_type": ext, "file_size": size, "processing_status": "uploaded", "created_at": created, "updated_at": created, "storage_path": f"original/source.{ext}", "charts": [], "audit_log": []}
        if ext in {"xlsx", "xlsm"}:
            workbook = pd.ExcelFile(destination, engine="openpyxl")
            sheets = []
            try:
                for name in workbook.sheet_names:
                    sample = pd.read_excel(workbook, sheet_name=name, nrows=3).dropna(how="all")
                    if len(sample.index) and len(sample.columns):
                        sheets.append(name)
            finally:
                workbook.close()
            if not sheets:
                raise ValueError("This workbook has no worksheets with tabular data.")
            meta["available_sheets"] = sheets
            if len(sheets) > 1 and sheet is None:
                meta["processing_status"] = "needs_sheet"
                STORE.put(meta)
                return {**public_meta(meta), "message": "Choose a worksheet to analyze."}
            sheet = sheet or (sheets[0] if sheets else None)
        try:
            meta = analyze(meta, sheet, has_header if ext in {"csv", "tsv", "txt"} else True)
        except Exception as exc:
            if isinstance(exc, HTTPException):
                raise
            raise ValueError(safe_error(exc)) from exc
        return public_meta(meta)
    except HTTPException:
        shutil.rmtree(STORAGE / "datasets" / dataset_id, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(STORAGE / "datasets" / dataset_id, ignore_errors=True)
        raise HTTPException(422, f"Could not analyze this file: {exc}") from exc
    finally:
        await file.close()


@app.post("/api/datasets/{dataset_id}/analyze")
def analyze_workbook(dataset_id: str, sheet: str = Form(...)):
    meta = get_meta(dataset_id)
    if meta.get("file_type") not in {"xlsx", "xlsm"}:
        raise HTTPException(400, "Worksheet selection applies only to Excel workbooks.")
    if sheet not in meta.get("available_sheets", []):
        raise HTTPException(422, "Choose one of the worksheets listed for this workbook.")
    try:
        return public_meta(analyze(meta, sheet))
    except Exception as exc:
        raise HTTPException(422, f"Could not analyze worksheet: {safe_error(exc)}") from exc


@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str):
    meta = get_meta(dataset_id)
    frame_for(meta)
    return public_meta(meta)


@app.get("/api/datasets/{dataset_id}/charts")
def get_charts(dataset_id: str):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    charts = []
    for spec in [*recommend_charts(frame), *meta.get("charts", [])]:
        try:
            charts.append({**spec, "data": aggregate_chart(frame, spec)})
        except (KeyError, ValueError):
            continue
    return {"charts": charts}


@app.post("/api/datasets/{dataset_id}/charts")
def save_chart(dataset_id: str, chart: ChartRequest):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    chart = chart.model_dump()
    if not all(isinstance(chart.get(k), str) and chart[k] in frame.columns for k in ("x", "y")):
        raise HTTPException(422, "Chart axes must use columns in this dataset.")
    if chart.get("kind") not in {"bar", "horizontal_bar", "line", "area", "pie", "scatter", "histogram", "boxplot", "heatmap"} or chart.get("aggregation", "sum") not in {"sum", "average", "count"}:
        raise HTTPException(422, "This chart configuration is not supported.")
    if chart.get("kind") in {"scatter", "histogram", "boxplot", "heatmap"} and not all(pd.api.types.is_numeric_dtype(frame[key]) for key in (chart["x"], chart["y"])):
        raise HTTPException(422, "This chart type requires numeric columns.")
    if chart.get("series_column") and chart["series_column"] not in frame.columns:
        raise HTTPException(422, "Choose a valid series column from this dataset.")
    if chart.get("filter_column") and (chart["filter_column"] not in frame.columns or chart.get("filter_value") is None):
        raise HTTPException(422, "Chart filters need a valid column and value from this dataset.")
    if chart.get("aggregation", "sum") != "count" and not pd.api.types.is_numeric_dtype(frame[chart["y"]]):
        raise HTTPException(422, "Choose a numeric measure or Count aggregation.")
    spec = {key: chart[key] for key in ("title", "x", "y", "kind", "aggregation", "sort", "color", "series_column", "filter_column", "filter_value", "x_label", "y_label") if key in chart}
    spec["chart_id"] = str(uuid.uuid4())
    aggregate_chart(frame, spec)
    meta.setdefault("charts", []).append(spec)
    meta["updated_at"] = utc_now()
    STORE.put(meta)
    return {**spec, "data": aggregate_chart(frame, spec)}


@app.put("/api/datasets/{dataset_id}/charts/{chart_id}")
def update_chart(dataset_id: str, chart_id: str, chart: ChartRequest):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    chart_data = chart.model_dump()
    if not all(isinstance(chart_data.get(key), str) and chart_data[key] in frame.columns for key in ("x", "y")):
        raise HTTPException(422, "Chart axes must use columns in this dataset.")
    if chart_data["kind"] in {"scatter", "histogram", "boxplot", "heatmap"}:
        valid = all(pd.api.types.is_numeric_dtype(frame[key]) for key in (chart_data["x"], chart_data["y"]))
    else:
        valid = chart_data["aggregation"] == "count" or pd.api.types.is_numeric_dtype(frame[chart_data["y"]])
    if not valid:
        raise HTTPException(422, "Choose valid numeric chart axes and aggregation for this chart type.")
    if chart_data.get("series_column") and chart_data["series_column"] not in frame.columns:
        raise HTTPException(422, "Choose a valid series column from this dataset.")
    if chart_data.get("filter_column") and (chart_data["filter_column"] not in frame.columns or chart_data.get("filter_value") is None):
        raise HTTPException(422, "Chart filters need a valid column and value from this dataset.")
    charts = meta.get("charts", [])
    index = next((i for i, item in enumerate(charts) if item.get("chart_id") == chart_id), None)
    if index is None:
        raise HTTPException(404, "Saved chart not found.")
    spec = {key: chart_data[key] for key in ("title", "x", "y", "kind", "aggregation", "sort", "color", "series_column", "filter_column", "filter_value", "x_label", "y_label")}
    spec["chart_id"] = chart_id
    charts[index] = spec
    meta["charts"] = charts
    meta["updated_at"] = utc_now()
    STORE.put(meta)
    return {**spec, "data": aggregate_chart(frame, spec)}


@app.delete("/api/datasets/{dataset_id}/charts/{chart_id}")
def delete_chart(dataset_id: str, chart_id: str):
    meta = get_meta(dataset_id)
    charts = meta.get("charts", [])
    updated = [chart for chart in charts if chart.get("chart_id") != chart_id]
    if len(updated) == len(charts):
        raise HTTPException(404, "Saved chart not found.")
    meta["charts"] = updated
    if meta.get("dashboard"):
        meta["dashboard"]["chart_ids"] = [value for value in meta["dashboard"].get("chart_ids", []) if value != chart_id]
    meta["updated_at"] = utc_now()
    STORE.put(meta)
    return {"deleted": chart_id}


@app.get("/api/datasets/{dataset_id}/dashboard")
def get_dashboard(dataset_id: str):
    meta = get_meta(dataset_id)
    return meta.get("dashboard", {"title": f"{Path(meta['filename']).stem} dashboard", "chart_ids": [], "filters": []})


@app.put("/api/datasets/{dataset_id}/dashboard")
def save_dashboard(dataset_id: str, request: DashboardRequest):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    available = {chart.get("chart_id") for chart in meta.get("charts", [])}
    if len(set(request.chart_ids)) != len(request.chart_ids) or any(chart_id not in available for chart_id in request.chart_ids):
        raise HTTPException(422, "A dashboard can only include saved charts from this dataset, once each.")
    for item in request.filters:
        if item.get("column") not in frame.columns or item.get("value") is None:
            raise HTTPException(422, "Dashboard filters must target columns in this dataset and include a value.")
    config = {"title": request.title.strip(), "chart_ids": request.chart_ids, "filters": request.filters, "updated_at": utc_now()}
    meta["dashboard"] = config
    meta["updated_at"] = config["updated_at"]
    STORE.put(meta)
    return config


@app.get("/api/datasets/{dataset_id}/quality")
def get_quality(dataset_id: str):
    meta = get_meta(dataset_id)
    return quality_report(frame_for(meta))


@app.get("/api/datasets/{dataset_id}/explore")
def explore(dataset_id: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=500), search: str = "", sort_by: str | None = None, sort_dir: str = Query("asc", pattern="^(asc|desc)$"), columns: str | None = None):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    if columns:
        selected = [c for c in columns.split(",") if c in frame.columns]
        if selected:
            frame = frame[selected]
    if sort_by:
        if sort_by not in frame.columns:
            raise HTTPException(422, "Sort column does not exist in this dataset.")
        frame = frame.sort_values(sort_by, ascending=sort_dir == "asc", na_position="last", kind="stable")
    if search:
        mask = frame.astype("string").apply(lambda col: col.str.contains(search[:200], case=False, regex=False, na=False)).any(axis=1)
        frame = frame.loc[mask]
    total = len(frame)
    start = (page - 1) * page_size
    return {"page": page, "page_size": page_size, "total": total, "columns": [str(c) for c in frame.columns], "rows": frame_records(frame.iloc[start:start + page_size])}


@app.post("/api/datasets/{dataset_id}/query")
def query_dataset(dataset_id: str, query: QuerySpec):
    meta = get_meta(dataset_id)
    try:
        spec = query.model_dump()
        result = run_query(frame_for(meta), spec)
        meta.setdefault("analysis_queries", []).append({"query": spec, "result": result, "created_at": utc_now()})
        meta["updated_at"] = utc_now()
        STORE.put(meta)
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/datasets/{dataset_id}/clean")
def clean_dataset(dataset_id: str, request: CleanRequest):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    column = request.column
    if request.operation not in {"normalize_columns", "deduplicate"} and column not in {"*all*", None} and column not in frame.columns:
        raise HTTPException(422, "Choose a column in this dataset.")
    target = list(frame.columns) if column in {None, "*all*"} else [column]
    before_rows = len(frame)
    before_examples: list[str] = []
    after_examples: list[str] = []
    affected = 0
    if request.operation == "trim":
        changed_rows = pd.Series(False, index=frame.index)
        for key in target:
            if frame[key].dtype == "object" or pd.api.types.is_string_dtype(frame[key]):
                original = frame[key].copy()
                frame[key] = frame[key].map(lambda v: v.strip() if isinstance(v, str) else v)
                mask = original.astype("string").fillna("") != frame[key].astype("string").fillna("")
                changed_rows |= mask
                for old, new in zip(original[mask].head(4), frame.loc[mask, key].head(4)):
                    before_examples.append(str(old)); after_examples.append(str(new))
        affected = int(changed_rows.sum())
    elif request.operation == "missing":
        changed_rows = pd.Series(False, index=frame.index)
        for key in target:
            if frame[key].dtype == "object" or pd.api.types.is_string_dtype(frame[key]):
                series = frame[key].astype("string")
                mask = series.str.strip().str.fullmatch(r"(?i)(n/?a|null|none|undefined|-)", na=False)
                changed_rows |= mask
                if mask.any():
                    before_examples.extend(series[mask].head(4).astype(str).tolist()); after_examples.extend(["null"] * min(4, int(mask.sum())))
                    frame.loc[mask, key] = None
        affected = int(changed_rows.sum())
    elif request.operation == "normalize_categories":
        if not column or column == "*all*":
            target = [c["name"] for c in profile(frame)["column_profile"] if c["type"] == "category"]
        changed_rows = pd.Series(False, index=frame.index)
        for key in target:
            original = frame[key].copy()
            normalized = frame[key].map(lambda v: v.strip().title() if isinstance(v, str) else v)
            mask = original.astype("string").fillna("") != normalized.astype("string").fillna("")
            changed_rows |= mask
            before_examples.extend(original[mask].head(4).astype(str).tolist()); after_examples.extend(normalized[mask].head(4).astype(str).tolist())
            frame[key] = normalized
        affected = int(changed_rows.sum())
    elif request.operation in {"parse_numbers", "parse_currency", "parse_percentages", "parse_dates", "normalize_booleans"}:
        changed_rows = pd.Series(False, index=frame.index)
        for key in target:
            original = frame[key].copy()
            if request.operation in {"parse_numbers", "parse_currency", "parse_percentages"}:
                cleaned = original.astype("string").str.replace(r"[$£€₹,%\s,]", "", regex=True)
                converted = pd.to_numeric(cleaned, errors="coerce")
                converted[original.isna()] = pd.NA
            elif request.operation == "parse_dates":
                converted = pd.to_datetime(original, errors="coerce", utc=True).astype("string")
                converted[original.isna()] = pd.NA
            else:
                mapping = {"true": True, "yes": True, "y": True, "1": True, "false": False, "no": False, "n": False, "0": False}
                converted = original.map(lambda value: mapping.get(str(value).strip().lower(), value) if pd.notna(value) else value)
            mask = original.astype("string").fillna("") != pd.Series(converted, index=frame.index).astype("string").fillna("")
            changed_rows |= mask
            before_examples.extend(original[mask].head(4).astype(str).tolist())
            after_examples.extend(pd.Series(converted, index=frame.index)[mask].head(4).astype(str).tolist())
            frame[key] = converted
        affected = int(changed_rows.sum())
    elif request.operation == "normalize_columns":
        mapping: dict[str, str] = {}
        used: set[str] = set()
        for i, name in enumerate(frame.columns):
            base = re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_") or f"column_{i+1}"
            new = base; index = 2
            while new in used:
                new = f"{base}_{index}"; index += 1
            used.add(new); mapping[str(name)] = new
        affected = len(frame) if any(k != v for k, v in mapping.items()) else 0
        before_examples = [k for k,v in mapping.items() if k != v][:4]
        after_examples = [mapping[k] for k in before_examples]
        frame = frame.rename(columns=mapping)
    elif request.operation == "deduplicate":
        duplicate_mask = frame.duplicated(keep="first")
        affected = int(duplicate_mask.sum())
        if affected:
            before_examples = ["Duplicate row"]
            after_examples = ["Removed"]
            frame = frame.loc[~duplicate_mask].copy()
    before = " · ".join(before_examples) or "No changes needed"
    after = " · ".join(after_examples) or "Values unchanged"
    if affected:
        processed = STORAGE / "datasets" / dataset_id / "processed" / "data.parquet"
        frame.to_parquet(processed, index=False)
        info = profile(frame)
        meta.update(info)
        meta["column_profile"] = info["column_profile"]
    entry = {"operation": request.operation, "column": column or "All columns", "affected_rows": affected, "before": before, "after": after, "reason": request.reason.strip() or "User requested cleanup", "timestamp": utc_now()}
    meta.setdefault("audit_log", []).append(entry)
    meta["updated_at"] = utc_now()
    STORE.put(meta)
    return {"dataset": public_meta(meta), "change": entry}


@app.post("/api/datasets/{dataset_id}/export")
def export_dataset(dataset_id: str, request: ExportRequest):
    meta = get_meta(dataset_id)
    frame = frame_for(meta)
    stream = io.BytesIO()
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(meta["filename"]).stem) or "dataset"
    if request.format == "csv":
        stream.write(frame.to_csv(index=False).encode("utf-8-sig"))
        media, suffix = "text/csv; charset=utf-8", "csv"
    elif request.format == "xlsx":
        with pd.ExcelWriter(stream, engine="openpyxl") as writer:
            frame.to_excel(writer, index=False, sheet_name="Data")
        media, suffix = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    else:
        frame.to_parquet(stream, index=False)
        media, suffix = "application/vnd.apache.parquet", "parquet"
    stream.seek(0)
    return StreamingResponse(stream, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}.{suffix}"'})


@app.get("/api/datasets/{dataset_id}/insights")
def insights(dataset_id: str):
    frame = frame_for(get_meta(dataset_id))
    summary = profile(frame)
    facts = [f"This dataset contains {summary['rows']:,} rows across {summary['columns']} columns."]
    if summary["missing"]:
        facts.append(f"{summary['missing']:,} cells are missing ({summary['missing'] / max(summary['rows'] * summary['columns'], 1):.1%} of the dataset).")
    if summary["duplicates"]:
        facts.append(f"{summary['duplicates']:,} exact duplicate rows were found.")
    numeric = frame.select_dtypes(include="number")
    for name in numeric.columns[:3]:
        if numeric[name].notna().any():
            facts.append(f"{name} ranges from {json_value(numeric[name].min())} to {json_value(numeric[name].max())} (mean {json_value(numeric[name].mean())}).")
    return {"insights": facts}
