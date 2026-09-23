import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownToLine, ArrowRight, BarChart3, Check, ChevronDown, CircleHelp, FileSpreadsheet, FileUp, LayoutDashboard, Search, Sparkles, Table2, Upload } from 'lucide-react';
import { aggregate, aggregateSeries, boxPlotSummary, groupedBoxPlotSummary, correlationMatrix, histogram, cleanDataset, numericValue, parseFile, previewCleaning, profile, suggestions, WorkbookSheetSelectionRequired } from './data';
import { listSavedCharts, listSavedDatasets, persistChart, persistCleaning, persistDashboard, persistQuery, persistUpload, removePersistedChart, reopenDataset, exportParquet, updatePersistedChart, getDashboardConfig } from './api';
import { executeQuestion, parseQuestion } from './queryEngine';
const palette = ['#6558e8', '#28a98a', '#f4aa59', '#e67885', '#4f8bd7', '#9b70cf'];
export default function App() {
  const [data, setData] = useState(null),
    [tab, setTab] = useState('Overview'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [answer, setAnswer] = useState(''),
    [pendingWorkbook, setPendingWorkbook] = useState(null),
    [selectedSheet, setSelectedSheet] = useState(''),
    [sampleName, setSampleName] = useState('sales'),
    [syncWarning, setSyncWarning] = useState(''),
    [savedDatasets, setSavedDatasets] = useState([]);
  const input = useRef(null);
  useEffect(() => {
    let alive = true;
    listSavedDatasets().then(items => {
      if (alive) setSavedDatasets(items);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  async function reopen(saved) {
    setBusy(true);
    setError('');
    try {
      setData(await reopenDataset(saved.dataset_id));
      setSyncWarning('');
      setTab('Overview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This saved dataset could not be reopened.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(file, sheet) {
    if (!file) return;
    setBusy(true);
    setPendingWorkbook(null);
    setSelectedSheet('');
    setError('');
    try {
      const local = await parseFile(file, sheet);
      try {
        const apiDatasetId = await persistUpload(file, sheet, local.hasHeader ?? true);
        setData({
          ...local,
          apiDatasetId
        });
        setSyncWarning('');
        listSavedDatasets().then(setSavedDatasets).catch(() => {});
      } catch (e) {
        setData(local);
        setSyncWarning(`This dataset is available in the browser only. Local API sync failed: ${e instanceof Error ? e.message : 'service unavailable'}`);
      }
      setTab('Overview');
    } catch (e) {
      if (e instanceof WorkbookSheetSelectionRequired) {
        setPendingWorkbook({
          file,
          sheets: e.sheets
        });
        setSelectedSheet('');
      } else setError(e instanceof Error ? e.message : 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  }
  async function sample(dataset = sampleName) {
    setBusy(true);
    setPendingWorkbook(null);
    setSelectedSheet('');
    setError('');
    try {
      const response = await fetch(`/samples/${dataset}.csv`);
      if (!response.ok) throw new Error('The sample dataset could not be loaded.');
      const text = await response.text(),
        parsed = Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        });
      const local = profile(`${dataset}.csv`, parsed.data);
      try {
        const copy = new File([text], `${dataset}.csv`, {
            type: 'text/csv'
          }),
          apiDatasetId = await persistUpload(copy);
        setData({
          ...local,
          apiDatasetId
        });
        setSyncWarning('');
        listSavedDatasets().then(setSavedDatasets).catch(() => {});
      } catch (e) {
        setData(local);
        setSyncWarning(`Sample is available in the browser only. Local API sync failed: ${e instanceof Error ? e.message : 'service unavailable'}`);
      }
      setTab('Overview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The sample dataset could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  const nav = [{
    name: 'Overview',
    icon: LayoutDashboard
  }, {
    name: 'Charts',
    icon: BarChart3
  }, {
    name: 'Dashboard',
    icon: LayoutDashboard
  }, {
    name: 'Data quality',
    icon: Sparkles
  }, {
    name: 'Explore',
    icon: Table2
  }, {
    name: 'Ask your data',
    icon: CircleHelp
  }];
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#" onClick={e => {
        e.preventDefault();
        setData(null);
      }}><span className="brand-mark"><BarChart3 size={18} /></span><span>{"datarefinery"}<span className="brand-dot">{"."}</span></span></a><nav className="topnav">{nav.map(({
          name
        }) => <button className={tab === name ? 'nav-link active' : 'nav-link'} onClick={() => data ? setTab(name) : name === 'Overview' ? setTab(name) : undefined} key={name}>{name}</button>)}</nav></header><main className="main-area">{!data ? <section className="landing"><div className="hero-copy"><div className="eyebrow"><span />{" DATA VISUALIZATION & ANALYTICS"}</div><h1>{"Make your data"}<br /><span>{"make sense."}</span></h1><p className="hero-desc">{"Upload a dataset and get a clearer picture in seconds. Discover patterns, explore what matters, and leave the spreadsheet maze behind."}</p><div className="hero-actions"><button className="button primary" onClick={() => input.current?.click()}><Upload size={16} />{" Upload a dataset "}<ArrowRight size={16} /></button><button className="button quiet" onClick={sample}>{"Explore sample data"}</button></div><div className="trust-line"><span><Check size={14} />{" No account needed"}</span><i />{" "}<span>{"Your files stay on this device"}</span></div></div><div className="upload-card" onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault();
          upload(e.dataTransfer.files[0]);
        }}><div className="upload-orbit"><div className="upload-icon"><FileUp size={24} /></div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" /></div><h2>{busy ? 'Analyzing your dataset…' : 'Drop a file to get started'}</h2><p>{busy ? 'Reading columns and finding useful patterns' : 'Bring your CSV, Excel, or JSON file along'}</p><button className="button primary choose-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Working…' : 'Choose a file'}</button><div className="file-types"><span>{"CSV"}</span><span>{"XLSX"}</span><span>{"JSON"}</span><small>{"Up to 50 MB"}</small></div>{pendingWorkbook && <div className="sheet-picker"><label>{"Choose a worksheet in "}{pendingWorkbook.file.name}<select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}><option value="">{"Select a sheet\u2026"}</option>{pendingWorkbook.sheets.map(sheet => <option key={sheet}>{sheet}</option>)}</select></label><button className="button primary" disabled={!selectedSheet || busy} onClick={() => upload(pendingWorkbook.file, selectedSheet)}>{"Analyze sheet "}<ArrowRight size={14} /></button></div>}{error && <div className="error-message">{error}</div>}</div><div className="feature-note"><div className="feature-icon"><Sparkles size={17} /></div><div><b>{"From raw rows to real insight"}</b><span>{"Automatic profiling, useful charts, and clear data quality notes."}</span></div><ArrowRight size={17} /></div><div className="sample-caption"><span>{"SAMPLE DATASETS"}</span><select aria-label="Sample dataset" value={sampleName} onChange={e => setSampleName(e.target.value)}><option value="sales">Sales</option><option value="ecommerce">E-commerce</option><option value="marketing">Marketing</option><option value="web_analytics">Web Analytics</option><option value="inventory">Inventory</option></select><button disabled={busy} onClick={() => sample()}>{"Load sample "}<ArrowRight size={14} /></button></div>{savedDatasets.length > 0 && <div className="recent-datasets"><div className="recent-heading"><div><b>{"Saved on this device"}</b><span>{"Reopen a dataset from your local API workspace"}</span></div><small>{savedDatasets.length}{" recent"}</small></div><div className="recent-list">{savedDatasets.map(item => {
              const canOpen = item.processing_status === 'ready' && (item.rows ?? 0) <= 25000;
              return <div className="recent-item" key={item.dataset_id}><span className="recent-file"><FileSpreadsheet size={15} /></span><div><b>{item.filename}</b><small>{item.processing_status === 'ready' ? `${(item.rows ?? 0).toLocaleString()} rows · ${item.columns ?? 0} columns` : item.processing_status === 'needs_sheet' ? 'Choose a worksheet in the original workbook' : 'Processing incomplete'}</small></div><button disabled={!canOpen || busy} onClick={() => reopen(item)}>{canOpen ? 'Open' : 'Unavailable'}{" "}<ArrowRight size={13} /></button></div>;
            })}</div></div>}<input ref={input} className="hidden-input" type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.json" onChange={e => {
          upload(e.target.files?.[0]);
          e.target.value = '';
        }} /></section> : <Workspace data={data} setData={setData} syncWarning={syncWarning} setSyncWarning={setSyncWarning} setTab={setTab} tab={tab} onReset={() => setData(null)} query={query} setQuery={setQuery} answer={answer} setAnswer={setAnswer} />}</main><footer className="footer"><span>{"\u2733 \u00A0DataRefinery"}</span><span>{"Clearer answers start with better questions."}</span><button onClick={() => data ? setData(null) : window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })}>{" "}{data ? 'Change dataset' : 'Back to top'}{" "}<ArrowRight size={13} /></button></footer></div>;
}
function exportDashboardPdf() {
  document.body.classList.add('printing-dashboard');
  const cleanup = () => {
    document.body.classList.remove('printing-dashboard');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 1500);
}
async function downloadData(data, format) {
  const stem = data.name.replace(/\.[^.]+$/, '') || 'dataset';
  let blob, filename;
  if (format === 'csv') {
    blob = new Blob([Papa.unparse(data.rows)], {
      type: 'text/csv;charset=utf-8'
    });
    filename = `${stem}-data.csv`;
  } else {
    const {
      default: ExcelJS
    } = await import('exceljs');
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Data');
    sheet.addRow(data.columns.map(column => column.name));
    data.rows.forEach(row => sheet.addRow(data.columns.map(column => row[column.name] ?? null)));
    const bytes = await workbook.xlsx.writeBuffer();
    blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    filename = `${stem}-data.xlsx`;
  }
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
async function downloadParquet(datasetId, name, setWarning) {
  try {
    const {
        blob,
        filename
      } = await exportParquet(datasetId),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename || `${name.replace(/\.[^.]+$/, '')}.parquet`;
    link.click();
    URL.revokeObjectURL(url);
    setWarning('');
  } catch (error) {
    setWarning(`Parquet export failed: ${error instanceof Error ? error.message : 'API unavailable'}`);
  }
}
function Workspace({
  data,
  setData,
  syncWarning,
  setSyncWarning,
  tab,
  setTab,
  onReset,
  query,
  setQuery,
  answer,
  setAnswer
}) {
  const recs = suggestions(data);
  const [savedCharts, setSavedCharts] = useState([]),
    [editingIndex, setEditingIndex] = useState(null),
    [dashboardFilter, setDashboardFilter] = useState({column:'',value:''});
  useEffect(() => {
    if (!data.apiDatasetId) return;
    let alive = true;
    Promise.all([listSavedCharts(data.apiDatasetId), getDashboardConfig(data.apiDatasetId)]).then(([charts,config]) => {
      if (alive) { setSavedCharts(charts); setDashboardFilter(config.filters?.[0]??{column:'',value:''}); }
    }).catch(e => {
      if (alive) setSyncWarning(`Saved dashboard could not be loaded: ${e instanceof Error ? e.message : 'API unavailable'}`);
    });
    return () => {
      alive = false;
    };
  }, [data.apiDatasetId, setSyncWarning]);
  const dashboardDimensions=data.columns.filter(column=>column.type==='category'&&column.unique>1&&column.unique<=50);
  const dashboardFilterValues=dashboardFilter.column?Array.from(new Set(data.rows.map(row=>String(row[dashboardFilter.column]??'')))).filter(Boolean):[];
  const dashboardRows=useMemo(()=>!dashboardFilter.column||!dashboardFilter.value?data.rows:data.rows.filter(row=>String(row[dashboardFilter.column]??'')===dashboardFilter.value),[data,dashboardFilter]);
  const dashboardData=dashboardRows===data.rows?data:{...data,rows:dashboardRows};
  async function changeDashboardFilter(column,value){const next={column,value};setDashboardFilter(next);if(data.apiDatasetId){try{await persistDashboard(data.apiDatasetId,`${data.name.replace(/\.[^.]+$/,'')} dashboard`,savedCharts,column&&value?[next]:[]);setSyncWarning('')}catch(e){setSyncWarning(`Dashboard filter changed locally but could not be saved: ${e instanceof Error?e.message:'API unavailable'}`)}}}
  async function saveChart(spec) {
    let next,
      saved = spec;
    if (editingIndex !== null) {
      const previous = savedCharts[editingIndex];
      saved = {
        ...spec,
        chart_id: previous.chart_id
      };
      if (data.apiDatasetId && previous.chart_id) {
        try {
          saved = await updatePersistedChart(data.apiDatasetId, previous.chart_id, spec);
          setSyncWarning('');
        } catch (e) {
          setSyncWarning(`Chart updated in this browser but could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
        }
      }
      next = savedCharts.map((chart, index) => index === editingIndex ? saved : chart);
      setEditingIndex(null);
    } else {
      if (data.apiDatasetId) {
        try {
          saved = await persistChart(data.apiDatasetId, spec);
          setSyncWarning('');
        } catch (e) {
          setSyncWarning(`Chart saved in this browser but could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
        }
      }
      next = [...savedCharts, saved];
    }
    setSavedCharts(next);
    if (data.apiDatasetId) {
      try {
        await persistDashboard(data.apiDatasetId, `${data.name.replace(/\.[^.]+$/, '')} dashboard`, next, dashboardFilter.column&&dashboardFilter.value?[dashboardFilter]:[]);
      } catch (e) {
        setSyncWarning(`Chart list was updated, but the dashboard could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
      }
    }
  }
  async function removeChart(index) {
    const removed = savedCharts[index],
      next = savedCharts.filter((_, i) => i !== index);
    setSavedCharts(next);
    if (data.apiDatasetId) {
      try {
        if (removed.chart_id) await removePersistedChart(data.apiDatasetId, removed.chart_id);
        await persistDashboard(data.apiDatasetId, `${data.name.replace(/\.[^.]+$/, '')} dashboard`, next, dashboardFilter.column&&dashboardFilter.value?[dashboardFilter]:[]);
        setSyncWarning('');
      } catch (e) {
        setSyncWarning(`Chart was removed from this browser but could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
      }
    }
  }
  async function moveChart(from, to) {
    if (to < 0 || to >= savedCharts.length) return;
    const next = [...savedCharts],
      [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSavedCharts(next);
    if (data.apiDatasetId) {
      try {
        await persistDashboard(data.apiDatasetId, `${data.name.replace(/\.[^.]+$/, '')} dashboard`, next, dashboardFilter.column&&dashboardFilter.value?[dashboardFilter]:[]);
        setSyncWarning('');
      } catch (e) {
        setSyncWarning(`Chart order changed locally but could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
      }
    }
  }
  async function applyCleaning(operation, column, reason) {
    const updated = cleanDataset(data, operation, column, reason);
    setData(updated);
    if (data.apiDatasetId) {
      try {
        await persistCleaning(data.apiDatasetId, operation, column, reason);
        setSyncWarning('');
      } catch (e) {
        setSyncWarning(`Cleanup was applied in this browser but could not be synced: ${e instanceof Error ? e.message : 'API unavailable'}`);
      }
    }
  }
  return <div className="workspace"><aside className="side-nav"><div className="side-label">{"WORKSPACE"}</div>{[{
        name: 'Overview',
        icon: LayoutDashboard
      }, {
        name: 'Charts',
        icon: BarChart3
      }, {
        name: 'Dashboard',
        icon: LayoutDashboard
      }, {
        name: 'Data quality',
        icon: Sparkles
      }, {
        name: 'Explore',
        icon: Table2
      }, {
        name: 'Ask your data',
        icon: CircleHelp
      }].map(({
        name,
        icon: Icon
      }) => <button className={tab === name ? 'side-link selected' : 'side-link'} onClick={() => setTab(name)} key={name}><Icon size={16} />{name}</button>)}<div className="side-dataset"><span className="dataset-icon"><FileSpreadsheet size={16} /></span><div><b>{data.name}</b><small>{data.rows.length.toLocaleString()}{" rows \u00B7 "}{data.columns.length}{" columns"}</small></div><ChevronDown size={14} /></div><button className="change-data" onClick={onReset}><Upload size={15} />{" Change dataset"}</button></aside><section className="workspace-content"><div className="crumb">{"Your workspace "}<span>{"/"}</span>{" "}<b>{data.name}</b><span className={data.apiDatasetId ? 'storage-pill connected' : 'storage-pill'}>{data.apiDatasetId ? 'Local API copy' : 'Browser only'}</span></div>{syncWarning && <div className="sync-warning">{syncWarning}<button aria-label="Dismiss" onClick={() => setSyncWarning('')}>{"\u00D7"}</button></div>}<div className="workspace-title-row"><div><div className="eyebrow"><span />{" DATASET OVERVIEW"}</div><h1>{tab === 'Overview' ? 'Your data, at a glance.' : tab === 'Charts' ? 'Recommended charts.' : tab === 'Dashboard' ? 'Your dashboard.' : tab === 'Data quality' ? 'A closer look at quality.' : tab === 'Explore' ? 'Explore your rows.' : 'Ask a question.'}</h1><p className="workspace-subtitle">{tab === 'Overview' ? 'A fresh perspective on ' + data.name + '.' : tab === 'Charts' ? 'A few good places to start exploring.' : tab === 'Dashboard' ? 'Charts you have added to this workspace.' : tab === 'Data quality' ? 'A transparent snapshot of completeness and consistency.' : tab === 'Explore' ? 'Search and browse the records in your dataset.' : 'Get an answer grounded in your actual data.'}</p></div><div className="export-actions"><button className="button outline" onClick={() => downloadData(data, 'csv')}><ArrowDownToLine size={15} />{" CSV"}</button><button className="button outline" onClick={() => downloadData(data, 'xlsx')}><ArrowDownToLine size={15} />{" XLSX"}</button>{data.apiDatasetId && <button className="button outline" onClick={() => downloadParquet(data.apiDatasetId, data.name, setSyncWarning)}><ArrowDownToLine size={15} />{" Parquet"}</button>}</div></div>{tab === 'Overview' && <><div className="stat-grid"><Stat label="ROWS" value={data.rows.length.toLocaleString()} icon={<Table2 size={16} />} tone="lavender" /><Stat label="COLUMNS" value={String(data.columns.length)} icon={<BarChart3 size={16} />} tone="mint" /><Stat label="MISSING VALUES" value={data.missing.toLocaleString()} icon={<Search size={16} />} tone="peach" /><Stat label="QUALITY SCORE" value={`${data.quality}%`} icon={<Check size={16} />} tone="blue" /></div><div className="section-heading"><div><h2>{"Charts worth a look"}</h2><p>{"Generated from the columns in your dataset"}</p></div><button className="text-link" onClick={() => setTab('Charts')}>{"See all charts "}<ArrowRight size={15} /></button></div>{recs.length ? <div className="chart-grid">{recs.slice(0, 3).map((r, i) => <ChartCard data={data} rec={r} index={i} key={r.title} />)}</div> : <div className="empty-card"><span className="empty-icon"><BarChart3 /></span><b>{"Not quite chart-ready"}</b><p>{"We couldn't find a useful visualization. Try a dataset with numeric or categorical columns."}</p></div>}<InsightPanel data={data} /><div className="lower-grid"><div className="panel"><div className="panel-heading"><div><h3>{"Column profile"}</h3><p>{"Types detected automatically"}</p></div><button className="text-link" onClick={() => setTab('Explore')}>{"Explore data "}<ArrowRight size={14} /></button></div><div className="column-list">{data.columns.slice(0, 5).map(c => <div className="column-row" key={c.name}><span className={'type-badge ' + c.type}>{c.type === 'number' ? '#' : c.type === 'date' ? '◷' : 'Aa'}</span><b>{c.name}</b><span>{c.role ?? c.type}</span><small>{c.unique.toLocaleString()}{" unique"}</small></div>)}</div></div><div className="quality-panel"><div className="quality-top"><div><h3>{"Data quality"}</h3><p>{data.quality >= 90 ? 'Looking good so far' : 'A few things to review'}</p></div><div className="score-ring">{data.quality}<small>{"%"}</small></div></div><div className="quality-bar"><span style={{
                width: `${data.quality}%`
              }} /></div><div className="quality-facts"><span><i className="fact-dot missing" />{data.missing.toLocaleString()}{" missing values"}</span><span><i className="fact-dot duplicate" />{data.duplicates.toLocaleString()}{" duplicate rows"}</span></div><button className="text-link" onClick={() => setTab('Data quality')}>{"View quality details "}<ArrowRight size={14} /></button></div></div></>}{tab === 'Charts' && <><ChartBuilder data={data} initial={editingIndex === null ? undefined : savedCharts[editingIndex]} onSave={saveChart} onCancel={() => setEditingIndex(null)} key={editingIndex === null ? 'new-chart' : `edit-${editingIndex}`} />{savedCharts.length > 0 && <div className="section-heading saved-heading"><div><h2>{"Your charts"}</h2><p>{savedCharts.length}{" chart"}{savedCharts.length === 1 ? '' : 's'}{" saved to this workspace"}</p></div></div>}{savedCharts.length > 0 && <div className="chart-grid full saved-grid">{savedCharts.map((r, i) => <div className="saved-chart-wrap" key={`${r.title}-${i}`}><ChartCard data={data} rec={r} index={i} /><div className="saved-chart-actions"><button onClick={() => {
                setEditingIndex(i);
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth'
                });
              }}>{"Edit chart"}</button><button className="remove-chart" onClick={() => removeChart(i)}>{"Remove chart"}</button></div></div>)}</div>}{recs.length ? <><div className="section-heading"><div><h2>{"Recommended charts"}</h2><p>{"Starting points selected from your dataset"}</p></div></div><div className="chart-grid full">{recs.map((r, i) => <ChartCard data={data} rec={r} index={i} key={r.title} />)}</div></> : <div className="empty-card"><b>{"No recommendations for this dataset"}</b><p>{"Use the chart builder above with a category or date column and a numeric measure."}</p></div>}</>}{tab === 'Dashboard' && (savedCharts.length ? <><div className="dashboard-toolbar"><div><h2>{data.name.replace(/\.[^.]+$/, '')}{" dashboard"}</h2><p>{savedCharts.length}{" saved charts \u00B7 "}{dashboardRows.length.toLocaleString()}{" rows"}</p></div><button className="button primary" onClick={exportDashboardPdf}><ArrowDownToLine size={15} />{" Export PDF"}</button></div><div className="dashboard-filters"><label>Filter charts by<select value={dashboardFilter.column} onChange={e=>changeDashboardFilter(e.target.value,'')}><option value="">All categories</option>{dashboardDimensions.map(column=><option key={column.name} value={column.name}>{column.name}</option>)}</select></label>{dashboardFilter.column&&<><select aria-label="Dashboard filter value" value={dashboardFilter.value} onChange={e=>changeDashboardFilter(dashboardFilter.column,e.target.value)}><option value="">All values</option>{dashboardFilterValues.map(value=><option key={value}>{value}</option>)}</select>{dashboardFilter.value&&<button onClick={()=>changeDashboardFilter(dashboardFilter.column,'')}>Clear</button>}</>}</div><div className="dashboard-kpis"><Stat label="ROWS" value={dashboardRows.length.toLocaleString()} icon={<Table2 size={16} />} tone="lavender" /><Stat label="COLUMNS" value={String(data.columns.length)} icon={<BarChart3 size={16} />} tone="mint" /><Stat label="QUALITY SCORE" value={`${data.quality}%`} icon={<Check size={16} />} tone="blue" /></div><div className="dashboard-grid">{savedCharts.map((chart, index) => <div className="dashboard-chart" key={`${chart.title}-${index}`} draggable onDragStart={event=>{event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='move'}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='move'}} onDrop={event=>{event.preventDefault();const from=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(from))moveChart(from,index)}}><ChartCard data={dashboardData} rec={chart} index={index} /><div className="chart-order"><button disabled={index === 0} onClick={() => moveChart(index, index - 1)}>{"Move up"}</button><button disabled={index === savedCharts.length - 1} onClick={() => moveChart(index, index + 1)}>{"Move down"}</button></div></div>)}</div><section className="panel dashboard-preview"><div className="panel-heading"><div><h3>Data preview</h3><p>First five rows matching the dashboard filter</p></div><button className="text-link" onClick={()=>setTab('Explore')}>Explore all rows <ArrowRight size={14}/></button></div><div className="dashboard-preview-scroll"><table><thead><tr>{data.columns.slice(0,6).map(column=><th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{dashboardRows.slice(0,5).map((row,index)=><tr key={index}>{data.columns.slice(0,6).map(column=><td key={column.name}>{row[column.name]===null||row[column.name]===undefined?'null':String(row[column.name])}</td>)}</tr>)}</tbody></table>{dashboardRows.length===0&&<p className="dashboard-preview-empty">No rows match this filter.</p>}</div></section><section className="panel dashboard-insights"><h3>{"Dataset notes"}</h3><p>{data.missing.toLocaleString()}{" missing cells \u00B7 "}{data.duplicates.toLocaleString()}{" duplicate rows \u00B7 "}{data.issues.length}{" quality findings"}</p></section></> : <div className="empty-card"><span className="empty-icon"><LayoutDashboard /></span><b>{"Your dashboard is ready for a chart"}</b><p>{"Add a chart from the Charts workspace and it will appear here."}</p><button className="text-link" onClick={() => setTab('Charts')}>{"Build a chart "}<ArrowRight size={14} /></button></div>)}{tab === 'Data quality' && <><div className="quality-summary"><div><div className="eyebrow"><span />{" OVERALL QUALITY"}</div><div className="big-score">{data.quality}<small>{"/ 100"}</small></div><p>{"Calculated from actual missing cells and exact duplicate rows."}</p></div><div className="quality-counters"><div><span className="fact-dot missing" /><b>{data.missing.toLocaleString()}</b><small>{"Missing values"}</small></div><div><span className="fact-dot duplicate" /><b>{data.duplicates.toLocaleString()}</b><small>{"Duplicate rows"}</small></div><div><span className="fact-dot clean" /><b>{Math.max(0, data.rows.length - data.duplicates).toLocaleString()}</b><small>{"Unique rows"}</small></div></div></div><div className="panel quality-table"><div className="panel-heading"><div><h3>{"Column issues"}</h3><p>{"Missing values and distinct values by column"}</p></div></div><div className="quality-head"><span>{"Column"}</span><span>{"Type"}</span><span>{"Missing"}</span><span>{"Unique"}</span><span>{"Completeness"}</span></div>{data.columns.map(c => <div className="quality-row" key={c.name}><b>{c.name}</b><span>{c.type}</span><span className={c.missing ? 'warn-text' : ''}>{c.missing.toLocaleString()}</span><span>{c.unique.toLocaleString()}</span><div className="mini-progress"><i style={{
                width: `${data.rows.length ? 100 * (1 - c.missing / data.rows.length) : 0}%`
              }} /></div></div>)}{data.issues.length === 0 && <p className="success-note"><Check size={15} />{" No significant data quality issues detected."}</p>}</div><section className="panel findings-panel"><div className="panel-heading"><div><h3>{"Detected findings"}</h3><p>{"Evidence-based checks across the loaded rows"}</p></div><span className="finding-count">{data.issues.length}{" finding"}{data.issues.length === 1 ? '' : 's'}</span></div>{data.issues.length ? <div className="finding-list">{data.issues.map((issue, index) => <article className="finding-item" key={`${issue.kind}-${issue.column ?? 'dataset'}-${index}`}><span className={`finding-severity ${issue.severity}`}>{issue.severity === 'warning' ? 'Review' : 'Info'}</span><div className="finding-copy"><b>{issue.kind.split('_').join(' ')}{issue.column ? ` · ${issue.column}` : ''}</b><p>{issue.message}</p>{issue.examples?.length ? <small>{"Examples: "}{issue.examples.join(' · ')}</small> : null}</div><strong>{issue.count.toLocaleString()}</strong></article>)}</div> : <p className="findings-empty"><Check size={15} />{" No findings from the available checks."}</p>}</section><CleaningPanel data={data} onApply={applyCleaning} /></>}{tab === 'Explore' && <Explorer data={data} />}{tab === 'Ask your data' && <AskPanel data={data} query={query} setQuery={setQuery} answer={answer} setAnswer={setAnswer} setSyncWarning={setSyncWarning} />}</section></div>;
}
function ChartBuilder({
  data,
  onSave,
  initial,
  onCancel
}) {
  const dimensions = data.columns.filter(c => (c.type === 'category' || c.type === 'date' || c.type === 'boolean') && c.unique > 1 && c.unique <= 50);
  const pieDimensions = dimensions.filter(c => c.unique <= 8),
    measures = data.columns.filter(c => c.type === 'number');
  const [kind, setKind] = useState(initial?.kind ?? (dimensions.some(c => c.type === 'date') ? 'line' : 'bar'));
  const [x, setX] = useState(initial?.x ?? (dimensions.find(c => c.type === 'date') ?? dimensions[0])?.name ?? '');
  const [y, setY] = useState(initial?.y ?? measures[0]?.name ?? '');
  const [aggregation, setAggregation] = useState(initial?.aggregation ?? (measures.length ? 'sum' : 'count'));
  const [sort, setSort] = useState(initial?.sort ?? 'desc');
  const [color, setColor] = useState(initial?.color ?? palette[0]);
  const [title, setTitle] = useState(initial?.title ?? ''),
    [seriesColumn,setSeriesColumn]=useState(initial?.series_column??''),
    [filterColumn,setFilterColumn]=useState(initial?.filter_column??''),[filterValue,setFilterValue]=useState(initial?.filter_value??''),
    [xLabel,setXLabel]=useState(initial?.x_label??''),[yLabel,setYLabel]=useState(initial?.y_label??'');
  const numericChart=['scatter','histogram','boxplot','heatmap'].includes(kind);
  const filterDimensions=data.columns.filter(column=>column.type==='category'&&column.unique>1&&column.unique<=30);
  const filterValues=filterColumn?[...new Set(data.rows.map(row=>String(row[filterColumn]??'')))].filter(Boolean):[];
  const xOptions = numericChart ? measures : kind === 'pie' ? pieDimensions : ['line','area'].includes(kind) ? dimensions.filter(c => c.type === 'date') : dimensions;
  const validX = xOptions.some(c => c.name === x) ? x : xOptions[0]?.name ?? '';
  const yOptions = aggregation === 'count' ? data.columns.filter(c => c.name === validX) : measures;
  const validY = yOptions.some(c => c.name === y) ? y : yOptions[0]?.name ?? '';
  const valid = Boolean(validX && (!filterColumn||filterValue) && (['histogram','boxplot'].includes(kind) ? measures.some(c=>c.name===validX) : validY && (aggregation === 'count' || measures.some(c => c.name === validY)) && (kind !== 'pie' || pieDimensions.some(c => c.name === validX)) && (!['scatter','heatmap'].includes(kind) || measures.some(c => c.name === validX) && measures.some(c => c.name === validY) && validX !== validY)));
  function changeKind(next) {
    setKind(next);
    const dim = ['line','area'].includes(next) ? dimensions.find(c => c.type === 'date') : next === 'pie' ? pieDimensions[0] : ['scatter','histogram','boxplot','heatmap'].includes(next) ? measures[0] : dimensions[0];
    if (dim) setX(dim.name);
    if (['scatter','heatmap'].includes(next) && measures[1]) setY(measures[1].name);
    if (['scatter','histogram','boxplot','heatmap'].includes(next)) setAggregation('sum');
  }
  function save(e) {
    e.preventDefault();
    if (!valid) return;
    const dimension = data.columns.find(c => c.name === validX);
    onSave({
      title: title.trim() || (['line','area'].includes(kind)?`${validY} over time`:kind==='histogram'?`${validX} distribution`:kind==='boxplot'?`${validX} spread`:kind==='heatmap'?'Numeric correlations':kind==='scatter'?`${validY} vs ${validX}`:seriesColumn?`${validY} over time by ${seriesColumn}`:`${validY === 'x' ? 'Records' : validY} by ${dimension?.name}`),
      x: validX,
      y: ['histogram','boxplot'].includes(kind) ? validX : aggregation === 'count' ? validX : validY,
      kind,
      aggregation,
      sort,
      color,
      ...(['line','area'].includes(kind)&&seriesColumn?{series_column:seriesColumn}:{}),
      ...(filterColumn&&filterValue?{filter_column:filterColumn,filter_value:filterValue}:{}),
      ...(xLabel.trim()?{x_label:xLabel.trim()}:{}),...(yLabel.trim()?{y_label:yLabel.trim()}:{})
    });
    setTitle('');
  }
  return <form className="builder-card" onSubmit={save}><div className="builder-intro"><div className="builder-symbol"><BarChart3 size={17} /></div><div><h2>{"Build a chart"}</h2><p>{"Choose fields that fit your data. Your chart is calculated from the dataset."}</p></div></div><div className="builder-fields"><label>{"Chart type"}<select value={kind} onChange={e => changeKind(e.target.value)}><option value="bar">{"Bar"}</option><option value="line" disabled={!dimensions.some(c => c.type === 'date')}>{"Line"}</option><option value="area" disabled={!dimensions.some(c => c.type === 'date')}>Area</option><option value="horizontal_bar">Horizontal bar</option><option value="pie" disabled={!pieDimensions.length}>{"Donut"}</option><option value="scatter" disabled={measures.length < 2}>{"Scatter"}</option><option value="histogram" disabled={!measures.length}>Histogram</option><option value="boxplot" disabled={!measures.length}>Box plot</option><option value="heatmap" disabled={measures.length<3}>Correlation heatmap</option></select></label><label>{kind==='scatter'?'X measure':kind==='heatmap'?'Measure':numericChart?'Measure':'X-axis'}<select value={validX} onChange={e => setX(e.target.value)} disabled={!xOptions.length}>{xOptions.map(c => <option key={c.name}>{c.name}</option>)}</select></label><label>{kind==='scatter'?'Y measure':kind==='heatmap'?'Second measure':'Measure'}<select value={aggregation === 'count' ? '' : validY} onChange={e => {
          setY(e.target.value);
          setAggregation('sum');
        }}><option value="">{"Count of records"}</option>{measures.map(c => <option key={c.name}>{c.name}</option>)}</select></label><label>{"Aggregation"}<select value={aggregation} disabled={numericChart} onChange={e => setAggregation(e.target.value)}><option value="sum" disabled={!measures.length}>{"Sum"}</option><option value="average" disabled={!measures.length}>{"Average"}</option><option value="count">{"Count"}</option></select></label><label>{"Sort"}<select value={sort} disabled={['line','area'].includes(kind)} onChange={e => setSort(e.target.value)}><option value="desc">{"Largest first"}</option><option value="asc">{"Smallest first"}</option></select></label>{['line','area'].includes(kind)&&<label>{"Split series by"}<select value={seriesColumn} onChange={e=>setSeriesColumn(e.target.value)}><option value="">No split</option>{dimensions.filter(column=>column.type==='category'&&column.unique<=6).map(column=><option key={column.name} value={column.name}>{column.name}</option>)}</select></label>}<label>{"Filter column"}<select value={filterColumn} onChange={e=>{setFilterColumn(e.target.value);setFilterValue('')}}><option value="">No filter</option>{filterDimensions.map(column=><option key={column.name} value={column.name}>{column.name}</option>)}</select></label>{filterColumn&&<label>{"Filter value"}<select value={filterValue} onChange={e=>setFilterValue(e.target.value)}><option value="">Choose value…</option>{filterValues.map(value=><option key={value}>{value}</option>)}</select></label>}{['bar','horizontal_bar','line','area','scatter','histogram'].includes(kind)&&<><label>{"X-axis label"}<input value={xLabel} onChange={e=>setXLabel(e.target.value)} maxLength={80} placeholder={validX}/></label><label>{"Y-axis label"}<input value={yLabel} onChange={e=>setYLabel(e.target.value)} maxLength={80} placeholder={validY}/></label></>}<label>{"Title"}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={`${validY || 'Records'} by ${validX || 'category'}`} /></label></div><div className="builder-actions"><div className="color-control"><span>{"Chart color"}</span>{palette.map(c => <button type="button" aria-label={`Use ${c}`} className={color === c ? 'color-swatch selected' : 'color-swatch'} style={{
          background: c
        }} onClick={() => setColor(c)} key={c} />)}</div><div className="builder-submit-actions">{initial && <button type="button" className="button outline" onClick={onCancel}>{"Cancel"}</button>}<button className="button primary" disabled={!valid}><BarChart3 size={14} />{" "}{initial ? 'Save changes' : 'Add chart'}</button></div></div>{!dimensions.length && <p className="builder-hint">{"A chart needs a category, date, or boolean column with at least two values."}</p>}</form>;
}
function AskPanel({
  data,
  query,
  setQuery,
  answer,
  setAnswer,
  setSyncWarning
}) {
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const parsed = parseQuestion(data, query);
    if (!parsed) {
      setResult(null);
      setAnswer('I could not map that question to a supported query. Try a total, average, highest value, row count, or a grouped question using your column names.');
      return;
    }
    const computed = executeQuestion(data, parsed.spec, parsed.description);
    setResult(computed);
    if (computed.rows) setAnswer(`${parsed.description}: ${computed.rows.length} result${computed.rows.length === 1 ? '' : 's'}.`);else if (parsed.spec.operation === 'count') setAnswer(`${computed.value?.toLocaleString()} rows in this dataset.`);else setAnswer(`${parsed.description}: ${computed.value?.toLocaleString(undefined, {
      maximumFractionDigits: 2
    })}${computed.count !== undefined ? ` from ${computed.count.toLocaleString()} values` : ''}.`);
    if (data.apiDatasetId) {
      setBusy(true);
      try {
        await persistQuery(data.apiDatasetId, parsed.spec);
        setSyncWarning('');
      } catch (error) {
        setSyncWarning(`The answer was calculated locally, but the query could not be saved: ${error instanceof Error ? error.message : 'API unavailable'}`);
      } finally {
        setBusy(false);
      }
    }
  }
  const dimensions = data.columns.filter(c => ['category', 'date', 'boolean'].includes(c.type) && c.unique > 1 && c.unique <= 30).sort((a,b)=>(a.type==='category'?0:1)-(b.type==='category'?0:1)),
    measures = data.columns.filter(c => c.type === 'number');
  const examples = [...(dimensions[0] && measures[0] ? [`Top 5 ${dimensions[0].name} by ${measures[0].name}`] : []), ...(measures[0] ? [`What is the average ${measures[0].name}?`] : []), ...(dimensions[0] ? [`Count records by ${dimensions[0].name}`] : [])];
  const specText = result ? JSON.stringify(result.spec) : '';
  return <div className="ask-panel"><div className="ask-orb"><Sparkles /></div><h2>{"What would you like to know?"}</h2><p>{"Questions become a validated query over the columns in "}{data.name}{". No generated code is run."}</p><form onSubmit={submit}><input value={query} onChange={e => {
        setQuery(e.target.value);
        setResult(null);
        setAnswer('');
      }} placeholder="e.g. Top 5 products by revenue" /><button className="button primary" disabled={busy}>{"Ask "}<ArrowRight size={15} /></button></form>{answer && <div className="answer-card"><span className="answer-check"><Check size={16} /></span><div><b>{result ? 'Calculated from your dataset' : 'Try a supported query'}</b><p>{answer}</p></div></div>}{result && <div className="query-result"><div className="query-spec"><small>{"VALIDATED QUERY"}</small><code>{specText}</code></div>{result.rows ? <div className="query-table"><div><span>{"Value"}</span><span>{"Result"}</span></div>{result.rows.map(row => <div key={row.label}><b>{row.label}</b><span>{row.value.toLocaleString(undefined, {
              maximumFractionDigits: 2
            })}</span></div>)}</div> : <div className="query-scalar"><small>{result.spec.operation === 'count' ? 'ROW COUNT' : 'RESULT'}</small><b>{result.value?.toLocaleString(undefined, {
            maximumFractionDigits: 2
          })}</b>{result.count !== undefined && <span>{"Calculated from "}{result.count.toLocaleString()}{" numeric values"}</span>}</div>}{result.rows?.length > 1 && <section className="query-chart"><h3>Result visualization</h3><div className="query-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={result.rows} margin={{top:8,right:12,left:4,bottom:24}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececf2"/><XAxis dataKey="label" angle={-18} textAnchor="end" interval={0} height={48} tick={{fontSize:10,fill:"#777b89"}}/><YAxis tick={{fontSize:10,fill:"#777b89"}}/><Tooltip/><Bar dataKey="value" name={result.spec.measure ?? "Records"} fill={palette[0]} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>}</div>}<div className="suggested-questions"><small>{"TRY ASKING"}</small>{examples.map(example => <button onClick={() => {
        setQuery(example);
        setResult(null);
        setAnswer('');
      }} key={example}>{example}{" "}<ArrowRight size={13} /></button>)}</div></div>;
}
function CleaningPanel({
  data,
  onApply
}) {
  const [operation, setOperation] = useState('trim'),
    [column, setColumn] = useState('*all*'),
    [reason, setReason] = useState('');
  const options = operation === 'normalize_categories' ? data.columns.filter(c => c.type === 'category') : data.columns;
  const global = operation === 'normalize_columns' || operation === 'deduplicate';
  const target = global ? '*all*' : column === '*all*' || options.some(c => c.name === column) ? column : options[0]?.name ?? '';
  const preview = useMemo(() => previewCleaning(data, operation, target, reason), [data, operation, target, reason]);
  const label = {
    trim: 'Trim whitespace',
    missing: 'Standardize missing values',
    normalize_categories: 'Normalize category casing',
    normalize_columns: 'Normalize column names',
    deduplicate: 'Remove exact duplicates',
    parse_numbers: 'Parse numbers',
    parse_currency: 'Parse currency values',
    parse_percentages: 'Parse percentages',
    parse_dates: 'Parse dates',
    normalize_booleans: 'Normalize booleans'
  };
  return <div className="cleaning-stack"><section className="cleaner panel"><div className="panel-heading"><div><h3>{"Clean this dataset"}</h3><p>{"Nothing changes until you apply an operation. Each change is recorded below."}</p></div><span className="audit-count">{data.audit.length}{" logged"}</span></div><div className="cleaner-controls"><label>{"Operation"}<select value={operation} onChange={e => {
            setOperation(e.target.value);
            setColumn('*all*');
          }}>{Object.entries(label).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label>{!global && <label>{"Column"}<select value={target} onChange={e => setColumn(e.target.value)}><option value="*all*">{"All "}{operation === 'normalize_categories' ? 'categorical ' : ''}{"columns"}</option>{options.map(c => <option key={c.name}>{c.name}</option>)}</select></label>}<label className="reason-field">{"Reason (optional)"}<input value={reason} onChange={e => setReason(e.target.value)} maxLength={160} placeholder="e.g. Standardize imported CRM values" /></label></div><div className="clean-preview"><div><small>{"PREVIEW"}</small><b>{preview.affectedRows.toLocaleString()}{" row"}{preview.affectedRows === 1 ? '' : 's'}{" affected"}</b></div><p><span>{preview.before}</span><ArrowRight size={14} /><span>{preview.after}</span></p><button className="button primary" disabled={!preview.affectedRows} onClick={() => onApply(operation, target, reason)}><Check size={14} />{" Apply cleanup"}</button></div></section><section className="panel audit-panel"><div className="panel-heading"><div><h3>{"Change history"}</h3><p>{"Local audit log for this dataset session"}</p></div></div>{data.audit.length ? <div className="audit-list">{[...data.audit].reverse().map((entry, index) => <article className="audit-entry" key={`${entry.timestamp}-${index}`}><span className="audit-check"><Check size={13} /></span><div className="audit-main"><div className="audit-title"><b>{label[entry.operation]}</b><time>{new Date(entry.timestamp).toLocaleString()}</time></div><p>{entry.affectedRows.toLocaleString()}{" rows affected \u00B7 "}{entry.column}</p><div className="audit-values"><span><small>{"BEFORE"}</small>{entry.before}</span><ArrowRight size={13} /><span><small>{"AFTER"}</small>{entry.after}</span></div><small className="audit-reason">{"Reason: "}{entry.reason}</small></div></article>)}</div> : <div className="audit-empty"><span><Check size={16} /></span><b>{"No cleaning changes yet"}</b><p>{"Choose an operation above to preview what it would change."}</p></div>}</section></div>;
}
function InsightPanel({
  data
}) {
  const numeric = data.columns.filter(column => column.type === 'number' && column.mean !== undefined).slice(0, 3),
    categories = data.columns.filter(column => column.type === 'category' && column.unique > 1).slice(0, 2);
  if (!numeric.length && !categories.length) return <div className="insight-strip"><b>{"No significant patterns detected yet"}</b><span>{"Add numeric or categorical columns to generate summary insights."}</span></div>;
  return <section className="insight-section"><div className="section-heading"><div><h2>{"Quick insights"}</h2><p>{"Computed directly from the loaded rows"}</p></div></div><div className="insight-grid">{numeric.map(column => <article key={column.name}><small>{"NUMERIC SUMMARY \u00B7 "}{column.name}</small><b>{"Average "}{column.mean?.toLocaleString(undefined, {
            maximumFractionDigits: 2
          })}</b><span>{"Range "}{column.min?.toLocaleString()}{"\u2013"}{column.max?.toLocaleString()}{" \u00B7 median "}{column.median?.toLocaleString(undefined, {
            maximumFractionDigits: 2
          })}</span></article>)}{categories.map(column => {
        const counts = new Map();
        data.rows.forEach(row => {
          const value = row[column.name];
          if (value !== null && value !== undefined) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
        });
        const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
        return <article key={column.name}><small>{"MOST COMMON \u00B7 "}{column.name}</small><b>{value || 'No values'}</b><span>{count.toLocaleString()}{" of "}{data.rows.length.toLocaleString()}{" rows"}</span></article>;
      })}</div></section>;
}
function Stat({
  label,
  value,
  icon,
  tone
}) {
  return <div className="stat-card"><div className={'stat-icon ' + tone}>{icon}</div><small>{label}</small><b>{value}</b></div>;
}
function ChartCard({
  data,
  rec,
  index
}) {
  const chartRef = useRef(null),
    chartData=rec.filter_column&&rec.filter_value?{...data,rows:data.rows.filter(row=>String(row[rec.filter_column]??'')===rec.filter_value)}:data,
    color = rec.color ?? palette[index % palette.length],
    points = ['line','area'].includes(rec.kind)&&rec.series_column?aggregateSeries(chartData,rec.x,rec.y,rec.series_column,rec.aggregation):rec.kind === 'scatter' ? chartData.rows.map((row, i) => ({
      label: String(i + 1), value: numericValue(row[rec.y]) ?? NaN,
      x: numericValue(row[rec.x]) ?? NaN, y: numericValue(row[rec.y]) ?? NaN
    })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, 500) : rec.kind==='histogram'?histogram(chartData.rows,rec.x):rec.kind==='boxplot'?(rec.group?groupedBoxPlotSummary(chartData.rows,rec.x,rec.group):(boxPlotSummary(chartData.rows,rec.x)?[boxPlotSummary(chartData.rows,rec.x)]:[])):rec.kind==='heatmap'?correlationMatrix(chartData):aggregate(chartData, rec.x, rec.y, rec.kind, rec.aggregation, rec.sort),
    validAxes = data.columns.some(c => c.name === rec.x) && data.columns.some(c => c.name === rec.y);
  return <article ref={chartRef} className="chart-card"><div className="chart-card-head"><div><span className="chart-kicker">{['line','area'].includes(rec.kind) ? 'TREND' : rec.kind === 'pie' ? 'DISTRIBUTION' : rec.kind === 'scatter' ? 'RELATIONSHIP' : rec.kind==='histogram'?'DISTRIBUTION':rec.kind==='boxplot'?'SPREAD':rec.kind==='heatmap'?'CORRELATION':'COMPARISON'}</span><h3>{rec.title}</h3></div><div className="chart-card-tools"><span className="chart-kind-label">{rec.kind === 'pie' ? 'DONUT' : rec.kind.toUpperCase()}</span>{points.length > 0 && validAxes && <><button onClick={() => downloadChart(chartRef.current, rec.title, 'svg')} aria-label="Download chart as SVG">{"SVG"}</button><button onClick={() => downloadChart(chartRef.current, rec.title, 'png')} aria-label="Download chart as PNG">{"PNG"}</button></>}</div></div><div className="chart-wrap">{!validAxes ? <div className="chart-empty">{"A column changed. Rebuild this chart to refresh it."}</div> : !points.length ? <div className="chart-empty">{"No data to chart"}</div> : rec.kind==='heatmap'?<svg className="correlation-heatmap-svg" viewBox={`0 0 ${Math.max(260,(points[0]?.values.length??0)*68+95)} ${Math.max(130,points.length*42+45)}`} role="img" aria-label="Numeric correlation heatmap">{points[0]?.values.map((cell,index)=><text key={cell.column} x={92+index*68+25} y="18" textAnchor="middle">{cell.column.slice(0,9)}</text>)}{points.map((row,rowIndex)=><g key={row.name}><text x="4" y={48+rowIndex*42} dominantBaseline="middle">{row.name.slice(0,12)}</text>{row.values.map((cell,columnIndex)=>{const value=cell.value??0,alpha=Math.min(.85,Math.abs(value)*.85),x=92+columnIndex*68,y=29+rowIndex*42;return <g key={cell.column}><title>{`${row.name} / ${cell.column}: ${cell.value===null?'unavailable':cell.value.toFixed(3)}`}</title><rect x={x} y={y} width="60" height="34" rx="5" fill={value>=0?`rgba(101,88,232,${alpha})`:`rgba(226,120,133,${alpha})`}/><text x={x+30} y={y+22} textAnchor="middle" fill={alpha>.48?'white':'#37394a'}>{cell.value===null?'—':cell.value.toFixed(2)}</text></g>})}</g>)}</svg>:rec.kind==='boxplot'?(()=>{const min=Math.min(...points.map(box=>box.min)),max=Math.max(...points.map(box=>box.max)),span=max-min||1,x=value=>120+455*(value-min)/span,rowHeight=34,height=Math.max(150,points.length*rowHeight+48);return <svg className="boxplot-svg" viewBox={`0 0 600 ${height}`} role="img" aria-label={`Box plot of ${rec.x}${rec.group?` grouped by ${rec.group}`:''}`}>{points.map((box,index)=>{const y=30+index*rowHeight;return <g key={box.label??'all'}><title>{`${box.label??rec.x}: median ${box.median}, ${box.outliers} outliers`}</title>{rec.group&&<text x="4" y={y+4}>{String(box.label).slice(0,16)}</text>}<line x1={x(box.min)} x2={x(box.max)} y1={y} y2={y} stroke="#85899a" strokeWidth="2"/><line x1={x(box.min)} x2={x(box.min)} y1={y-7} y2={y+7} stroke="#85899a" strokeWidth="2"/><line x1={x(box.max)} x2={x(box.max)} y1={y-7} y2={y+7} stroke="#85899a" strokeWidth="2"/><rect x={x(box.q1)} y={y-9} width={Math.max(2,x(box.q3)-x(box.q1))} height="18" rx="3" fill="#6558e84d" stroke="#6558e8"/><line x1={x(box.median)} x2={x(box.median)} y1={y-10} y2={y+10} stroke="#5145cd" strokeWidth="3"/><text x="585" y={y+4} textAnchor="end">{box.outliers} out</text></g>})}<text x="300" y={height-7} textAnchor="middle">{`${min.toLocaleString()} to ${max.toLocaleString()} · ${rec.group?rec.group+' groups':'min/max and quartiles'}`}</text></svg>})():<ResponsiveContainer width="100%" height="100%">{rec.kind === 'scatter' ? <ScatterChart margin={{
          top: 10,
          right: 12,
          left: 0,
          bottom: 0
        }}><CartesianGrid stroke="#edf0f5" /><XAxis type="number" dataKey="x" name={rec.x} label={{value:rec.x_label||rec.x,position:'insideBottom',offset:-4,style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} /><YAxis type="number" dataKey="y" name={rec.y} label={{value:rec.y_label||rec.y,angle:-90,position:'insideLeft',style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} /><Tooltip cursor={{
            strokeDasharray: '3 3'
          }} /><Scatter name={rec.y} data={points} fill={color} />{points.length>12&&<Brush dataKey="label" height={14} travellerWidth={8}/>}</ScatterChart> : rec.kind === 'pie' ? <PieChart><Tooltip formatter={v => [v, rec.aggregation === 'count' ? 'Rows' : rec.y]} /><Pie data={points} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="75%" paddingAngle={3}>{points.map((_, i) => <Cell fill={palette[i % palette.length]} key={i} />)}</Pie></PieChart> : ['line','area'].includes(rec.kind) ? <AreaChart data={points} margin={{
          top: 10,
          right: 8,
          left: 0,
          bottom: 0
        }}><defs><linearGradient id={`fill${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.2} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey={rec.kind==='horizontal_bar'?'value':'label'} type={rec.kind==='horizontal_bar'?'number':'category'} label={{value:rec.kind==='horizontal_bar'?(rec.x_label||rec.y):(rec.x_label||rec.x),position:'insideBottom',offset:-4,style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} axisLine={false} tickLine={false} /><YAxis dataKey={rec.kind==='horizontal_bar'?'label':undefined} type={rec.kind==='horizontal_bar'?'category':'number'} label={{value:rec.kind==='horizontal_bar'?(rec.y_label||rec.x):(rec.y_label||rec.y),angle:-90,position:'insideLeft',style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} axisLine={false} tickLine={false} /><Tooltip /><Legend />{rec.series_column?Array.from(new Set(data.rows.map(row=>String(row[rec.series_column]??'Missing')))).slice(0,6).map((name,seriesIndex)=><Area key={name} type="monotone" dataKey={name} name={name} stroke={palette[seriesIndex%palette.length]} fill="none" strokeWidth={2} activeDot={{r:3}}/>):<Area type="monotone" dataKey="value" name={rec.aggregation === 'count' ? 'Rows' : rec.y} stroke={color} strokeWidth={2.5} fill={rec.kind==='area'?`url(#fill${index})`:'none'} activeDot={{r:4}} />}{points.length>12&&<Brush dataKey="label" height={14} travellerWidth={8}/>}</AreaChart> : <BarChart data={points} layout={rec.kind==='horizontal_bar'?'vertical':'horizontal'} margin={{
          top: 10,
          right: 8,
          left: 0,
          bottom: 0
        }}><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey={rec.kind==='horizontal_bar'?'value':'label'} type={rec.kind==='horizontal_bar'?'number':'category'} label={{value:rec.kind==='horizontal_bar'?(rec.x_label||rec.y):(rec.x_label||rec.x),position:'insideBottom',offset:-4,style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} axisLine={false} tickLine={false} /><YAxis dataKey={rec.kind==='horizontal_bar'?'label':undefined} type={rec.kind==='horizontal_bar'?'category':'number'} label={{value:rec.kind==='horizontal_bar'?(rec.y_label||rec.x):(rec.y_label||rec.y),angle:-90,position:'insideLeft',style:{fontSize:9,fill:'#7c8090'}}} tick={{
            fontSize: 10,
            fill: '#9299a9'
          }} axisLine={false} tickLine={false} /><Tooltip cursor={{
            fill: '#f4f3ff'
          }} /><Bar dataKey="value" name={rec.aggregation === 'count' ? 'Rows' : rec.y} fill={color} radius={[5, 5, 0, 0]} maxBarSize={34} />{points.length>12&&<Brush dataKey="label" height={14} travellerWidth={8}/>}</BarChart>}</ResponsiveContainer>}</div><div className="chart-foot"><span><i style={{
          background: color
        }} />{" "}{['histogram','boxplot'].includes(rec.kind)?rec.x:rec.kind==='heatmap'?'Pearson correlation':rec.kind === 'scatter' ? `${rec.x} vs ${rec.y}` : rec.aggregation === 'count' ? 'Rows' : `${rec.aggregation ?? 'sum'} of ${rec.y}`}</span><span>{rec.kind==='boxplot'?points[0]?.count:points.length}{" "}{rec.kind === 'scatter' ? 'points' : rec.kind==='histogram'?'bins':rec.kind==='heatmap'?'columns':rec.kind==='boxplot'?'values':'categories'}</span></div></article>;
}
function downloadChart(card, title, format) {
  const source = card?.querySelector('svg');
  if (!source) return;
  const svg = source.cloneNode(true),
    box = source.getBoundingClientRect();
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(Math.max(1, Math.round(box.width))));
  svg.setAttribute('height', String(Math.max(1, Math.round(box.height))));
  const text = new XMLSerializer().serializeToString(svg),
    blob = new Blob([text], {
      type: 'image/svg+xml;charset=utf-8'
    }),
    name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
  const save = (url, suffix) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.${suffix}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (format === 'svg') {
    save(URL.createObjectURL(blob), 'svg');
    return;
  }
  const url = URL.createObjectURL(blob),
    image = new Image();
  image.onload = () => {
    const scale = 2,
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(box.width * scale));
    canvas.height = Math.max(1, Math.round(box.height * scale));
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(output => {
        if (output) save(URL.createObjectURL(output), 'png');
      }, 'image/png');
    }
    URL.revokeObjectURL(url);
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}
function Explorer({
  data
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [sortColumn, setSortColumn] = useState(''),
    [descending, setDescending] = useState(false),
    [selectedColumn, setSelectedColumn] = useState(data.columns[0]?.name ?? ''),
    [filterColumn, setFilterColumn] = useState(''),
    [filterValue, setFilterValue] = useState(''),
    [visible, setVisible] = useState(data.columns.map(column => column.name));
  const selected = data.columns.find(column => column.name === selectedColumn),
    filterOptions = filterColumn ? Array.from(new Set(data.rows.map(row => String(row[filterColumn] ?? '')))).filter(Boolean).slice(0, 100) : [];
  const filtered = data.rows.filter(row => {
    const matchesSearch = !search || JSON.stringify(row).toLocaleLowerCase().includes(search.toLocaleLowerCase());
    const matchesFilter = !filterColumn || !filterValue || String(row[filterColumn] ?? '') === filterValue;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (!sortColumn) return 0;
    const av = a[sortColumn],
      bv = b[sortColumn],
      an = numericValue(av),
      bn = numericValue(bv);
    const order = an !== null && bn !== null ? an - bn : String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
    return descending ? -order : order;
  });
  const pages = Math.ceil(filtered.length / 10),
    shown = data.columns.filter(column => visible.includes(column.name)),
    present = selected ? data.rows.map(row => row[selectedColumn]).filter(value => value !== null && value !== undefined) : [],
    numeric = present.map(numericValue).filter(value => value !== null),
    sorted = [...numeric].sort((a, b) => a - b),
    median = sorted.length ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : null;
  return <div className="explorer-stack"><div className="panel explorer"><div className="explorer-tools"><div className="table-search"><Search size={15} /><input value={search} onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }} placeholder="Search rows" /></div><label className="explorer-filter">{"Filter column"}<select value={filterColumn} onChange={e => {
            setFilterColumn(e.target.value);
            setFilterValue('');
            setPage(0);
          }}><option value="">{"All values"}</option>{data.columns.filter(column => column.unique <= 100).map(column => <option value={column.name} key={column.name}>{column.name}</option>)}</select></label>{filterColumn && <select aria-label="Filter value" value={filterValue} onChange={e => {
          setFilterValue(e.target.value);
          setPage(0);
        }}><option value="">{"Every value"}</option>{filterOptions.map(value => <option key={value}>{value}</option>)}</select>}<details className="column-picker"><summary>{"Columns ("}{shown.length}{"/"}{data.columns.length}{")"}</summary><div>{data.columns.map(column => <label key={column.name}><input type="checkbox" checked={visible.includes(column.name)} onChange={e => setVisible(current => e.target.checked ? [...current, column.name] : current.filter(name => name !== column.name))} />{column.name}</label>)}</div></details><span>{filtered.length.toLocaleString()}{" records"}</span></div><div className="table-overflow"><table><thead><tr>{shown.map(column => <th key={column.name}><button className="sort-heading" onClick={() => {
                  setSortColumn(column.name);
                  setDescending(sortColumn === column.name ? !descending : false);
                }}>{column.name}{" "}{sortColumn === column.name ? descending ? '↓' : '↑' : '↕'}</button><small>{column.type}{column.format ? ` · ${column.format}` : ''}</small></th>)}</tr></thead><tbody>{filtered.slice(page * 10, page * 10 + 10).map((row, i) => <tr key={page * 10 + i}>{shown.map(column => <td key={column.name}>{row[column.name] === null || row[column.name] === undefined ? <span className="null-cell">{"null"}</span> : String(row[column.name])}</td>)}</tr>)}</tbody></table>{!filtered.length && <div className="table-empty">{"No rows match the current search and filters."}</div>}</div><div className="pagination"><span>{"Page "}{pages ? page + 1 : 0}{" of "}{pages}</span><div><button disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>{"Previous"}</button><button disabled={page >= pages - 1} onClick={() => setPage(Math.min(pages - 1, page + 1))}>{"Next"}</button></div></div></div><section className="panel column-stats"><div className="panel-heading"><div><h3>{"Column statistics"}</h3><p>{"Computed from all loaded rows"}</p></div><select value={selectedColumn} onChange={e => setSelectedColumn(e.target.value)}>{data.columns.map(column => <option key={column.name}>{column.name}</option>)}</select></div>{selected && <div className="stats-facts"><span><small>{"TYPE"}</small><b>{selected.format ?? selected.type}</b></span><span><small>{"ROLE"}</small><b>{selected.role ?? "dimension"}</b></span><span><small>{"NON-EMPTY"}</small><b>{present.length.toLocaleString()}</b></span><span><small>{"MISSING"}</small><b>{(data.rows.length - present.length).toLocaleString()}</b></span><span><small>{"UNIQUE"}</small><b>{new Set(present.map(String)).size.toLocaleString()}</b></span>{numeric.length > 0 && <><span><small>{"MIN"}</small><b>{Math.min(...numeric).toLocaleString()}</b></span><span><small>{"MEDIAN"}</small><b>{median?.toLocaleString(undefined, {
                maximumFractionDigits: 2
              })}</b></span><span><small>{"MAX"}</small><b>{Math.max(...numeric).toLocaleString()}</b></span></>}</div>}</section></div>;
}
