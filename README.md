# DataRefinery

> A local-first data analysis and visualization workspace for exploring, profiling, cleaning, querying, and visualizing CSV, Excel, and JSON datasets.

DataRefinery is a React + Vite frontend with a FastAPI backend that turns raw tabular data into an interactive data workspace.

It provides dataset profiling, deterministic chart recommendations, a configurable chart builder, data-quality checks, cleaning tools, structured data queries, a paginated data explorer, dashboards, and multiple export formats.

---

## 🚀 Features

- 📂 Import CSV, TSV, Excel, and JSON files
- 📊 Automatic dataset profiling
- 📈 Deterministic chart recommendations
- 🛠️ Configurable chart builder
- 🔎 Searchable and paginated data explorer
- 🧹 Data quality analysis
- ✨ Interactive data cleaning tools
- 💬 Ask Your Data with validated structured queries
- 📑 Reorderable dashboard
- 🎨 Custom chart titles, labels, filters, sorting, and colors
- 🔍 Chart zoom and pan for supported Cartesian charts
- 📤 CSV, XLSX, and Parquet export
- 💾 Local dataset persistence through the FastAPI backend
- 🗃️ Optional MongoDB metadata storage
- 🧪 Synthetic sample datasets
- 🔐 Local-first processing with no authentication requirement
- 🧾 Session-level cleaning audit log

---

# 🧰 Tech Stack

## Frontend

- React
- Vite
- JavaScript
- HTML5
- CSS
- Browser File APIs
- Client-side data processing

## Backend

- Python
- FastAPI
- Uvicorn
- Local filesystem storage
- Optional MongoDB metadata persistence

## Supported Data Formats

- CSV
- TSV
- XLSX
- XLSM
- JSON
- Parquet for API export

> Exact package versions are defined in the project's `package.json` and `backend/requirements.txt`.

---

# 🏗️ Architecture

```text
                    ┌───────────────────────┐
                    │      DataRefinery     │
                    │     React + Vite      │
                    └───────────┬───────────┘
                                │
                         /api proxy
                                │
                                ▼
                    ┌───────────────────────┐
                    │       FastAPI         │
                    │       Backend         │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
       Local Metadata     Dataset Storage    Optional MongoDB
       storage/           storage/datasets/  Metadata
       metadata.json


# PROJECT STRUCTURE

DataRefinery/
│
├── backend/
│   ├── app/
│   │   └── ...
│   ├── requirements.txt
│   └── ...
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── ...
│   └── ...
│
├── public/
│
├── storage/
│   ├── datasets/
│   └── metadata.json
│
├── package.json
├── vite.config.*
├── README.md
└── ...

# How It Works

Upload Dataset
      │
      ▼
Parse Dataset
      │
      ▼
Profile Dataset
      │
      ├───────────────┐
      │               │
      ▼               ▼
Data Quality      Chart Recommendations
      │               │
      ▼               ▼
Cleaning          Visualization
      │               │
      └───────┬───────┘
              ▼
       Explore / Query
              │
              ▼
          Dashboard
              │
              ▼
            Export
