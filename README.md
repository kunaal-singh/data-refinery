
<img width="577" height="135" alt="image" src="https://github.com/user-attachments/assets/362424ed-043f-4f66-94e3-0f65b983f562" />



# DataRefinery

> A local-first data analysis and visualization workspace for exploring, profiling, cleaning, querying, and visualizing CSV, Excel, and JSON datasets.

DataRefinery is a React + Vite frontend with a FastAPI backend that turns raw tabular data into an interactive data workspace.

It provides dataset profiling, deterministic chart recommendations, a configurable chart builder, data-quality checks, cleaning tools, structured data queries, a paginated data explorer, dashboards, and multiple export formats.

---

##  Features

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

#  Screenshots
<img width="1535" height="775" alt="image" src="https://github.com/user-attachments/assets/9c0b0e67-3b98-4276-a5d9-d81a626ee7a2" />
<img width="1532" height="773" alt="image" src="https://github.com/user-attachments/assets/9a43aa3e-8652-401b-a43a-30c6f6472ffb" />
<img width="1535" height="727" alt="image" src="https://github.com/user-attachments/assets/7727bb7c-1c32-44aa-8849-73044c953b5b" />

<img width="1535" height="773" alt="image" src="https://github.com/user-attachments/assets/b64b3f08-6a7e-4ec4-b306-a3ee9fef819a" />
<img width="1535" height="773" alt="image" src="https://github.com/user-attachments/assets/2bf2aeab-517e-4e8c-b49d-9ee9add84ec4" />
<img width="1535" height="718" alt="image" src="https://github.com/user-attachments/assets/cea28380-66e0-4bd9-88b5-2ddb526deefb" />
<img width="1535" height="771" alt="image" src="https://github.com/user-attachments/assets/e763252b-5312-45c3-9378-326b47e37847" />

---

#  Tech Stack

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

#  Architecture

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
