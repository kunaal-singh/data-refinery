# DataRefinery

DataRefinery is a local-first workspace for turning tabular files into useful summaries, charts, and dashboards. It combines a React and Vite frontend written in JavaScript with an optional FastAPI service. The browser can analyze files without an account; when the API is running, the app can also keep a local copy of datasets and persist chart and dashboard settings.

## Contents

- [Highlights](#highlights)
- [Technology](#technology)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Using the app](#using-the-app)
- [Data formats and limits](#data-formats-and-limits)
- [API reference](#api-reference)
- [Privacy and security](#privacy-and-security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Development commands](#development-commands)
- [License](#license)

## Highlights

- Import CSV, TSV, TXT, Excel workbooks (.xlsx, .xlsm), and JSON.
- Preview and analyze files in the browser; choose a worksheet when a workbook has multiple usable sheets.
- Automatically infer column types, calculate profile and quality summaries, and suggest charts.
- Build and customize bar, horizontal bar, line, area, multi-series, pie/donut, scatter, histogram, box plot, and correlation heatmap charts.
- Explore rows with search, sorting, column selection, filters, and pagination.
- Review data quality findings such as missing values, duplicate rows, invalid dates, outliers, and category inconsistencies.
- Apply previewable cleaning actions and keep a session audit log of changes.
- Ask supported data questions using validated structured operations, then visualize grouped results.
- Arrange charts in a dashboard, filter dashboard categories, and export individual charts or reports.
- Load bundled synthetic sample datasets for sales, e-commerce, marketing, web analytics, and inventory.

## Technology

| Area | Technology |
|---|---|
| Frontend | React 18, Vite, JavaScript, CSS |
| Charting | Recharts |
| File parsing | Papa Parse, ExcelJS, browser File APIs |
| Backend | Python, FastAPI, Uvicorn, pandas, NumPy |
| Dataset files | Local filesystem; Parquet for processed API copies |
| Metadata | Local JSON by default; optional MongoDB |

Package versions are recorded in package.json and backend/requirements.txt.

## How it works

1. Select or drop a file, or choose one of the included sample datasets.
2. DataRefinery parses rows and columns and creates a profile and quality summary.
3. Review recommended charts, insights, data quality findings, and the row explorer.
4. Create charts, customize fields and styles, clean data, or ask a supported question.
5. Arrange charts in a dashboard and download chart, data, or report exports.

The browser performs analysis on the loaded dataset. The API is an optional local service used for saved dataset copies, persistent chart/dashboard configuration, paginated API exploration, and server-side exports.

## Architecture

The frontend owns the interactive workspace and can analyze a selected file in the browser. The optional FastAPI backend provides durable local dataset storage and API-backed features. Vite forwards development requests under `/api` to the backend.

flowchart TB
    person[User] --> ui[React + Vite UI<br/>JavaScript]
    file[CSV / TSV / Excel / JSON] --> parser[Browser parsing and profiling<br/>Papa Parse · ExcelJS]
    ui --> parser
    samples[Bundled sample CSVs] --> parser
    parser --> analysis[Charts · quality · insights<br/>explorer · structured queries]
    analysis --> ui
    ui -->|Optional /api requests| api[FastAPI service]
    vite[Vite dev server] -->|Proxies /api| api
    api --> engine[Python analysis engine<br/>pandas · NumPy]
    engine --> files[Local dataset files<br/>original + processed Parquet]
    api --> metadata[Metadata store]
    metadata --> json[Local JSON, default]
    metadata --> mongo[MongoDB, optional]
    files --> api
    analysis --> exports[Browser exports<br/>CSV · XLSX · PNG · SVG · PDF]
    api --> exportsApi[API exports<br/>CSV · XLSX · Parquet]


    Runtime responsibilities

- **Browser:** Reads the selected file, builds the interactive workspace, profiles the loaded rows, renders charts, and handles browser-side CSV/XLSX and chart/report downloads. Browser analysis is available even when the API is stopped.
- **Vite:** Serves the React app in development and proxies `/api` requests to `http://127.0.0.1:8000`.
- **FastAPI:** Accepts optional local copies of datasets; supports saved charts and dashboard settings, paginated exploration, quality and insight endpoints, structured queries, cleaning records, and server-side exports.
- **Dataset storage:** The API stores source files and processed Parquet data under the configured storage directory, `storage/` by default.
- **Metadata store:** Uses a local JSON file by default. If MongoDB is configured and reachable when the API starts, metadata is stored in MongoDB instead. Dataset files stay in local filesystem storage.

### Data flow

1. A file is parsed and analyzed in the browser, or a bundled sample is loaded.
2. The browser creates the profile, quality findings, chart recommendations, and workspace views from the loaded records.
3. When the API is available, the frontend may send a copy of an uploaded file and supported changes to the local FastAPI service for persistence.
4. The API stores file data locally and metadata in its configured metadata store; later API requests read or update those records.
5. Charts and tables render in the browser. Downloads are produced by the browser or by the API depending on the export type.

Browser-side analysis is independent of MongoDB. MongoDB is only an optional metadata backend for the API.

## Project layout

~~~text
DataRefinery/
├── backend/
│   ├── app/
│   │   ├── engine.py       # Profiling, quality, chart recommendations, queries
│   │   ├── main.py         # FastAPI routes and dataset operations
│   │   ├── models.py       # Validated API request models
│   │   └── store.py        # MongoDB / local JSON metadata store
│   └── requirements.txt
├── public/
│   └── datarefinery-logo.png
├── samples/                # Bundled synthetic CSV datasets
├── src/
│   ├── api.js               # Frontend API client
│   ├── App.jsx              # Application and workspace views
│   ├── data.js              # Browser-side parsing, profiling, recommendations
│   ├── main.jsx             # Frontend entry point
│   ├── queryEngine.js       # Supported browser-side structured queries
│   └── styles.css
├── storage/                 # Runtime API data (created as needed; gitignored)
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
~~~

## Requirements

- Node.js 18 or later with npm.
- Python 3.10 or later (backend dependencies are listed in backend/requirements.txt).
- MongoDB is optional. Without a reachable MongoDB URI, the API uses a local JSON metadata file.

## Quick start

### 1. Install frontend dependencies

From the project root:

~~~sh
npm install
~~~

### 2. Install backend dependencies

Windows PowerShell:

~~~powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
~~~

macOS or Linux:

~~~sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
~~~

### 3. Start the API

Run from the project root. Windows:

~~~powershell
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
~~~

macOS or Linux:

~~~sh
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
~~~

The API health endpoint is http://127.0.0.1:8000/api/health. Interactive API documentation is at http://127.0.0.1:8000/docs.

### 4. Start the frontend

In a second terminal, from the project root:

~~~sh
npm run dev
~~~

Open the local URL printed by Vite (normally http://localhost:5173). Vite proxies /api requests to http://127.0.0.1:8000.

The frontend can also be run by itself. Browser analysis and bundled samples remain available, but API persistence features will be unavailable until the backend starts.

## Configuration

The backend reads optional settings from backend/.env. Create that file only if you need to override defaults; do not commit secrets. No external API key is required by the current application.

| Variable | Default | Purpose |
|---|---|---|
| MONGODB_URI | Empty | Optional MongoDB connection string for metadata. An unavailable connection falls back to local JSON metadata. |
| MONGODB_DATABASE | datarefinery | MongoDB database name. |
| DATAREFINERY_STORAGE | storage | Root directory for uploaded and processed API dataset files and local metadata. Relative paths are resolved from the project root. |
| DATAREFINERY_MAX_UPLOAD_MB | 50 | Maximum API upload size in megabytes. |

When MONGODB_URI is empty or MongoDB cannot be reached during startup, metadata is written to storage/metadata.json. Dataset files are stored below storage/datasets/. The storage/ directory is runtime data and should not be committed.

Example optional settings (use your own values and keep this file private):

~~~dotenv
# backend/.env
# MONGODB_URI=mongodb://127.0.0.1:27017
# MONGODB_DATABASE=datarefinery
# DATAREFINERY_STORAGE=storage
# DATAREFINERY_MAX_UPLOAD_MB=50
~~~

## Using the app

### Upload and samples

Use the home page to drop a file or select one from disk. Excel workbooks with multiple usable sheets prompt for a worksheet. Five synthetic sample CSVs are included in samples/; sample data is intended for exploration and does not represent real customer records.

### Analysis and charts

The overview includes dataset dimensions, column profiles, quality metrics, summaries, and recommended charts. The chart builder supports the chart types listed above with valid dimensions, aggregations, filters, sort order, custom titles, axis labels, and palette colors. Charts with enough points can include a brush for zooming and panning.

### Data quality and cleaning

Quality findings can include missing values, exact duplicate rows, malformed numbers, invalid dates, out-of-range percentages where detected, numeric outliers, and category casing or whitespace variants. Cleaning operations include trimming whitespace, standardizing missing tokens, normalizing categories and column names, removing duplicate rows, parsing numeric/currency/percentage/date values, and normalizing booleans. Review a preview before applying a change. The audit log is session-level in the browser; API-backed cleaning operations are recorded with the dataset metadata.

### Ask Your Data

Ask Your Data supports a limited set of deterministic question patterns that map to validated query operations such as grouped sums/counts/averages/minimums/maximums, totals, row counts, and top/bottom values. It does not call an LLM, send data to an AI service, or execute generated code. Unsupported questions may not be understood; use the structured query controls where available.

### Data explorer and dashboard

The explorer supports search, sorting, column selection, categorical filters, pagination, and per-column statistics. Dashboards support saved chart membership, ordering, categorical filters, and a small row preview. Saved dashboard and chart settings require the API to be running; browser print can be used to create a PDF report.

### Exports

- Individual rendered charts: SVG and PNG.
- Current browser dataset: CSV and XLSX.
- API-backed dataset: CSV, XLSX, or Parquet.
- Dashboard/report: browser print dialog, including Save as PDF.

## Data formats and limits

| Format | Import | Export | Notes |
|---|---:|---:|---|
| CSV / TSV / TXT | Yes | CSV | Delimiters and encodings are detected conservatively. |
| XLSX / XLSM | Yes | XLSX | A worksheet can be selected when a workbook has multiple usable sheets. |
| JSON | Yes | — | Supports flat records and nested-record inputs that can be tabularized. |
| Parquet | — | API only | Exported by the backend; not currently an upload format. |

- The backend upload size defaults to 50 MB. Configure DATAREFINERY_MAX_UPLOAD_MB to change the API limit.
- Datasets above 25,000 rows are not yet reopenable in the browser workspace from saved API metadata, though API pagination remains available.
- Browser processing is limited by the memory available to the browser tab and the user''s device.

## API reference

The FastAPI OpenAPI interface at /docs is the authoritative source for request schemas. Routes currently include:

| Method | Route | Description |
|---|---|---|
| GET | /api/health | API and metadata-store health. |
| GET | /api/datasets | List recent saved datasets. |
| POST | /api/datasets/upload | Upload and analyze a supported file. |
| POST | /api/datasets/{id}/analyze | Select and analyze a workbook sheet. |
| GET | /api/datasets/{id} | Read saved dataset metadata. |
| GET | /api/datasets/{id}/charts | List saved chart specs. |
| POST | /api/datasets/{id}/charts | Save a chart spec. |
| PUT | /api/datasets/{id}/charts/{chart_id} | Update a saved chart. |
| DELETE | /api/datasets/{id}/charts/{chart_id} | Remove a saved chart. |
| GET | /api/datasets/{id}/dashboard | Read dashboard configuration. |
| PUT | /api/datasets/{id}/dashboard | Save dashboard title, chart order, and filters. |
| GET | /api/datasets/{id}/quality | Read data quality results. |
| GET | /api/datasets/{id}/explore | Search, sort, select columns, and paginate rows. |
| POST | /api/datasets/{id}/query | Run a validated structured query. |
| POST | /api/datasets/{id}/clean | Apply a supported cleaning operation and record it. |
| POST | /api/datasets/{id}/export | Export CSV, XLSX, or Parquet. |
| GET | /api/datasets/{id}/insights | Return computed dataset facts. |

## Privacy and security

- There is no account system or authentication in the current version. Run the API only on a trusted machine or network; do not expose it publicly without adding appropriate authentication and access controls.
- Browser-side analysis runs in the local browser tab. When the optional API is enabled, uploads are copied to the API host''s local storage directory. Use only datasets you are allowed to process on that machine.
- MongoDB is optional and stores metadata; uploaded and processed dataset files remain in the configured local storage directory.
- The application does not require a third-party AI API key. Never commit real credentials in .env files.

## Known limitations

- No authentication, user accounts, or multi-user access controls.
- Natural-language question interpretation is deterministic and limited; it is not an LLM-powered open-ended assistant.
- Reopening saved datasets in the browser is limited to 25,000 rows.
- The backend chooses MongoDB at startup when configured and reachable; otherwise it uses local JSON metadata. It does not automatically migrate between those stores.
- Dashboard PDF export uses the browser''s print dialog.

## Troubleshooting

**The interface loads, but saved datasets or chart persistence are unavailable.** Start the FastAPI service on port 8000 and confirm http://127.0.0.1:8000/api/health responds. The Vite development server proxies API requests to that address.

**MongoDB is not available.** Remove or correct MONGODB_URI in backend/.env, then restart the API. It will use local JSON metadata when MongoDB is not configured or cannot be reached at startup.

**An Excel workbook asks for a sheet.** Choose one of the usable worksheets shown before continuing analysis.

**A saved dataset cannot be reopened.** Check its processing status and row count. Browser reopening currently supports ready datasets of up to 25,000 rows.

**Uploads exceed the configured size.** Increase DATAREFINERY_MAX_UPLOAD_MB for the backend, or process a smaller file in the browser.

## Development commands

| Command | Description |
|---|---|
| npm run dev | Start Vite development server. |
| npm run build | Create the production frontend build in dist/. |
| npm run preview | Preview the production build locally. |
| python -m uvicorn app.main:app --app-dir backend --reload --port 8000 | Start the API (run from the project root with the environment''s Python). |

## License

No license file is currently included. All rights reserved unless a project owner adds a license specifying otherwise.

