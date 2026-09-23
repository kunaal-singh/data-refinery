import { profile } from './data';
async function request(path, init) {
    const response = await fetch(path, init);
    if (!response.ok) {
        let message = `API request failed (${response.status})`;
        try {
            const body = await response.json();
            message = body.detail ?? message;
        }
        catch { /* use status text */ }
        throw new Error(message);
    }
    return response;
}
export async function listSavedDatasets() {
    const response = await request('/api/datasets?limit=12');
    const result = await response.json();
    return result.datasets;
}
export async function listSavedCharts(datasetId) {
    const [chartResponse, dashboardResponse] = await Promise.all([request(`/api/datasets/${datasetId}/charts`), request(`/api/datasets/${datasetId}/dashboard`)]);
    const result = await chartResponse.json();
    const dashboard = await dashboardResponse.json();
    const charts = result.charts.filter(chart => Boolean(chart.chart_id)).map(chart => Object.fromEntries(Object.entries(chart).filter(([key]) => key !== 'data')));
    const rank = new Map((dashboard.chart_ids ?? []).map((id, index) => [id, index]));
    return charts.sort((a, b) => (rank.get(a.chart_id ?? '') ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.chart_id ?? '') ?? Number.MAX_SAFE_INTEGER));
}
export async function reopenDataset(datasetId) {
    const response = await request(`/api/datasets/${datasetId}`);
    const metadata = await response.json();
    if (metadata.processing_status !== 'ready')
        throw new Error('Choose a worksheet before reopening this dataset.');
    const rowCount = metadata.rows ?? 0;
    if (rowCount > 25000)
        throw new Error('This saved dataset has more than 25,000 rows. Large datasets can’t yet be reopened in the browser workspace.');
    const pageSize = 500, pages = Math.ceil(rowCount / pageSize), records = [];
    for (let start = 1; start <= pages; start += 4) {
        const batch = await Promise.all(Array.from({ length: Math.min(4, pages - start + 1) }, (_, offset) => request(`/api/datasets/${datasetId}/explore?page=${start + offset}&page_size=${pageSize}`).then(res => res.json())));
        batch.forEach(result => records.push(...result.rows));
    }
    const data = profile(metadata.filename, records);
    data.apiDatasetId = datasetId;
    if (typeof metadata.quality === 'number')
        data.quality = metadata.quality;
    if (typeof metadata.missing === 'number')
        data.missing = metadata.missing;
    if (typeof metadata.duplicates === 'number')
        data.duplicates = metadata.duplicates;
    data.audit = (metadata.audit_log ?? []).map(entry => ({ operation: entry.operation, column: entry.column, affectedRows: entry.affected_rows, before: entry.before, after: entry.after, reason: entry.reason, timestamp: entry.timestamp }));
    return data;
}
export async function persistUpload(file, sheet, hasHeader = true) {
    const form = new FormData();
    form.append('file', file);
    if (sheet)
        form.append('sheet', sheet);
    form.append('has_header', String(hasHeader));
    const response = await request('/api/datasets/upload', { method: 'POST', body: form });
    const result = await response.json();
    if (!result.dataset_id || result.processing_status !== 'ready')
        throw new Error('The local API did not finish processing this file.');
    return result.dataset_id;
}
export async function persistCleaning(datasetId, operation, column, reason) {
    return request(`/api/datasets/${datasetId}/clean`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, column, reason }) });
}
export async function persistChart(datasetId, chart) {
    const response = await request(`/api/datasets/${datasetId}/charts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chart) });
    return response.json();
}
export async function updatePersistedChart(datasetId, chartId, chart) {
    const response = await request(`/api/datasets/${datasetId}/charts/${chartId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chart) });
    return response.json();
}
export async function removePersistedChart(datasetId, chartId) {
    return request(`/api/datasets/${datasetId}/charts/${chartId}`, { method: 'DELETE' });
}
export async function persistDashboard(datasetId, title, charts, filters = []) {
    const chart_ids = charts.flatMap(chart => chart.chart_id ? [chart.chart_id] : []);
    return request(`/api/datasets/${datasetId}/dashboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, chart_ids, filters }) });
}
export async function getDashboardConfig(datasetId) {
    const response = await request(`/api/datasets/${datasetId}/dashboard`);
    return response.json();
}
export async function exportParquet(datasetId) {
    const response = await request(`/api/datasets/${datasetId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'parquet' }) });
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'dataset.parquet';
    return { blob: await response.blob(), filename };
}
export async function persistQuery(datasetId, spec) {
    return request(`/api/datasets/${datasetId}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
}
