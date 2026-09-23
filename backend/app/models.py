from typing import Literal
from pydantic import BaseModel, Field


class QuerySpec(BaseModel):
    operation: Literal["group_by", "total", "average", "count", "top_values", "maximum", "minimum"]
    dimension: str | None = None
    measure: str | None = None
    aggregation: Literal["sum", "average", "count", "min", "max"] = "sum"
    sort: Literal["asc", "desc"] = "desc"
    limit: int = Field(default=10, ge=1, le=100)
    question: str | None = Field(default=None, max_length=300)


class CleanRequest(BaseModel):
    operation: Literal["trim", "missing", "normalize_categories", "normalize_columns", "deduplicate", "parse_numbers", "parse_currency", "parse_percentages", "parse_dates", "normalize_booleans"]
    column: str | None = None
    reason: str = Field(default="User requested cleanup", max_length=300)


class ExportRequest(BaseModel):
    format: Literal["csv", "xlsx", "parquet"]


class ChartRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    x: str = Field(min_length=1, max_length=255)
    y: str = Field(min_length=1, max_length=255)
    kind: Literal["bar", "horizontal_bar", "line", "area", "pie", "scatter", "histogram", "boxplot", "heatmap"]
    aggregation: Literal["sum", "average", "count"] = "sum"
    sort: Literal["asc", "desc"] = "desc"
    color: str = Field(default="#6558e8", pattern=r"^#[0-9a-fA-F]{6}$")
    series_column: str | None = Field(default=None, max_length=255)
    filter_column: str | None = Field(default=None, max_length=255)
    filter_value: str | None = Field(default=None, max_length=255)
    x_label: str | None = Field(default=None, max_length=80)
    y_label: str | None = Field(default=None, max_length=80)


class DashboardRequest(BaseModel):
    title: str = Field(default="My dashboard", min_length=1, max_length=120)
    chart_ids: list[str] = Field(default_factory=list, max_length=30)
    filters: list[dict[str, str]] = Field(default_factory=list, max_length=10)
