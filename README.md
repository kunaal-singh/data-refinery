# DataRefinery

DataRefinery is a React and Vite application written in JavaScript. It turns local CSV, Excel, and JSON files into a browsable data workspace with an automatic profile, deterministic chart recommendations, a configurable chart builder, quality checks, and a paginated data explorer.

## Run locally

```sh
npm install
npm run dev
```

In a second terminal, start the FastAPI service on Windows:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

The API health check is at `http://127.0.0.1:8000/api/health`, with interactive API documentation at `http://127.0.0.1:8000/docs`. Vite proxies `/api` requests to that service. By default the API stores metadata in `storage/metadata.json` and dataset files under `storage/datasets/`. To use MongoDB for metadata, copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` (dataset files remain local).

Use **Choose a file** or drag a `.csv`, `.tsv`, `.xlsx`, `.xlsm`, or `.json` file into the drop zone. Excel workbooks with more than one sheet prompt you to choose a worksheet. Five synthetic sample datasets are included and selectable: sales, e-commerce, marketing, web analytics, and inventory.

## Current scope

The browser processes files locally and optionally mirrors them to the API when it is available. It supports CSV delimiter, encoding, and conservative header detection, flat/nested-record JSON, and Excel worksheets. Empty worksheets are skipped, a single usable sheet is selected automatically, and workbooks with multiple usable sheets prompt for a choice. Profiling and chart recommendations use the loaded rows. The frontend quality view reports missing values, exact duplicate rows, malformed numeric values, out-of-range percentages when a column is identified as a percentage, IQR-based numeric outliers, invalid dates in detected date columns, and category casing or whitespace variants. Each finding includes a count and, where useful, example values. The quality score itself remains based on missing cells and duplicate rows. Data export downloads the current loaded rows as CSV or XLSX; Parquet export is available through the local API copy. Ask Your Data maps supported question patterns onto a validated structured query (grouped sums/counts/averages/min/max, totals, row counts, top/bottom values), and visualizes grouped results; it does not call an LLM or execute generated code.

The Overview includes factual numeric summaries and category frequency insights. The Explore workspace supports row search, categorical filtering, sortable columns, column selection, pagination, and per-column statistics. The dashboard supports saved category filters, drag-and-drop chart ordering with move controls as an accessible alternative, a filtered five-row preview, and browser print-to-PDF export. The Charts workspace lets you create vertical and horizontal bar, time-series line and area, multi-series line, donut, numeric scatter, histogram, category-grouped or overall box plots, and correlation heatmap charts. Chart specs support valid dimensions, numeric measures, sum/average/count aggregation, sorting, category filters, custom axis labels, titles, and palette colors. Cartesian charts with enough points include a brush control for zooming and panning through the plotted range. Saved charts appear in a reorderable two-column dashboard with persisted categorical filtering when the local API is enabled. The Data quality workspace supports previewed, user-applied whitespace trimming, missing-token standardization, category casing, column-name normalization, exact duplicate removal, number/currency/percentage/date parsing, and boolean normalization. Each applied change records its affected row count, before/after examples, reason, and timestamp in a session-only audit log.

The standalone API includes local dataset upload and metadata, multi-worksheet selection, quality reporting, deterministic chart recommendations and saved chart specs, chart removal, dashboard configuration from saved charts, paginated/searchable/sortable exploration, validated structured queries, recorded cleaning operations, CSV/XLSX/Parquet API exports, and computed factual insights. When the API is running, the browser also stores an API copy of each upload and syncs cleaning operations, saved charts, and dashboard membership. The home screen lists saved API datasets and can reopen datasets of up to 25,000 rows by fetching them in pages. Larger datasets remain stored and available through paginated API access, but are not yet reopenable in the browser workspace.

Dashboard chart order supports drag-and-drop, with move controls as an accessible alternative. Individual chart cards can export SVG and PNG from the current browser-rendered chart. Natural-language-to-query interpretation is still limited; the API accepts only validated structured query specifications. No authentication is included.
