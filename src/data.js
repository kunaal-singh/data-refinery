import Papa from 'papaparse';
export class WorkbookSheetSelectionRequired extends Error {
    constructor(sheets) {
        super('Choose a worksheet to analyze.');
        this.sheets = sheets;
        this.name = 'WorkbookSheetSelectionRequired';
    }
}
const normalize = (v) => {
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim()))
        return null;
    if (typeof v === 'number' || typeof v === 'boolean')
        return v;
    if (v instanceof Date)
        return v.toISOString();
    if (typeof v === 'string')
        return v.trim();
    if (typeof v === 'object')
        return JSON.stringify(v);
    return String(v);
};
export function numericValue(value) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string')
        return null;
    const cleaned = value.trim().replace(/[$£€₹,%\s]/g, '').replace(/,/g, '');
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(cleaned))
        return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}
export function profile(name, input) {
    const rows = input.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalize(v)])));
    const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const columns = names.map((name) => {
        const values = rows.map((r) => r[name] ?? null), present = values.filter((v) => v !== null), unique = new Set(present.map(String)).size;
        const nums = present.map((v) => numericValue(v) ?? NaN);
        const numericCount = nums.filter(Number.isFinite).length;
        const dateCount = present.filter((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))).length;
        const boolCount = present.filter((v) => typeof v === 'boolean' || ['true', 'false', 'yes', 'no'].includes(String(v).toLowerCase())).length;
        const idLike = /(^|[\s._-])(id|identifier|key|sku|code|zip|postal)([\s._-]|$)/i.test(name);
        let type = idLike ? 'identifier' : numericCount > present.length * .8 ? 'number' : dateCount > present.length * .8 ? 'date' : boolCount > present.length * .8 ? 'boolean' : unique / Math.max(present.length, 1) > .85 && present.length > 10 ? 'identifier' : 'category';
        const cleanNums = nums.filter(Number.isFinite);
        const valuesText = present.filter((v) => typeof v === 'string');
        const format = valuesText.some(v => /[$£€₹]/.test(v)) ? 'currency' : valuesText.some(v => /%/.test(v)) || /(percent|pct)$/.test(name.toLowerCase()) ? 'percentage' : undefined;
        const role = type === 'number' ? 'measure' : type === 'date' ? 'time' : type === 'identifier' ? 'identifier' : 'dimension';
        return { name, type, role, ...(type === 'number' && format ? { format } : {}), missing: values.length - present.length, unique, ...(type === 'number' && cleanNums.length ? (() => { const sorted = [...cleanNums].sort((a, b) => a - b), quantile = (p) => { const position = (sorted.length - 1) * p, low = Math.floor(position), fraction = position - low; return sorted[low] + ((sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * fraction); }; return { min: sorted[0], max: sorted[sorted.length - 1], mean: cleanNums.reduce((a, b) => a + b, 0) / cleanNums.length, median: quantile(.5), q1: quantile(.25), q3: quantile(.75) }; })() : {}) };
    });
    const seen = new Set();
    let duplicates = 0;
    rows.forEach((r) => { const key = JSON.stringify(r); if (seen.has(key))
        duplicates++;
    else
        seen.add(key); });
    const missing = columns.reduce((a, c) => a + c.missing, 0), total = rows.length * columns.length;
    const quality = total ? Math.max(0, Math.round(100 * (1 - (missing + duplicates * columns.length) / total))) : 0;
    return { name, rows, columns, quality, duplicates, missing, issues: inspectQuality(rows, columns), audit: [] };
}
async function readDelimitedText(file) {
    const bytes = await file.arrayBuffer(), view = new Uint8Array(bytes);
    if (view[0] === 0xff && view[1] === 0xfe)
        return new TextDecoder('utf-16le').decode(bytes);
    if (view[0] === 0xfe && view[1] === 0xff)
        return new TextDecoder('utf-16be').decode(bytes);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}
export function inspectQuality(rows, columns) {
    const issues = [];
    for (const column of columns) {
        const present = rows.map(row => row[column.name]).filter(v => v !== null && v !== undefined);
        const missing = rows.length - present.length;
        if (missing)
            issues.push({ column: column.name, kind: 'missing', count: missing, severity: 'warning', message: `${missing.toLocaleString()} missing value${missing === 1 ? '' : 's'} in ${column.name}.` });
        if (column.type === 'number') {
            const values = present.map(numericValue), valid = values.filter((v) => v !== null);
            const invalid = present.length - valid.length;
            if (invalid)
                issues.push({ column: column.name, kind: 'malformed_number', count: invalid, severity: 'warning', message: `${invalid.toLocaleString()} value${invalid === 1 ? '' : 's'} could not be parsed as a number.`, examples: present.filter(v => numericValue(v) === null).slice(0, 3).map(String) });
            if (column.format === 'percentage') {
                const outOfRange = valid.filter(value => value < 0 || value > 100).length;
                if (outOfRange)
                    issues.push({ column: column.name, kind: 'invalid_percentage', count: outOfRange, severity: 'warning', message: `${outOfRange.toLocaleString()} percentage value${outOfRange === 1 ? '' : 's'} fall outside the 0–100 range.` });
            }
            if (valid.length >= 4) {
                const sorted = [...valid].sort((a, b) => a - b), quantile = (p) => { const position = (sorted.length - 1) * p, low = Math.floor(position), fraction = position - low; return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * fraction; }, q1 = quantile(.25), q3 = quantile(.75), spread = q3 - q1;
                if (spread > 0) {
                    const count = valid.filter(v => v < q1 - 1.5 * spread || v > q3 + 1.5 * spread).length;
                    if (count)
                        issues.push({ column: column.name, kind: 'outlier', count, severity: 'info', message: `${count.toLocaleString()} values fall beyond the 1.5× interquartile range.` });
                }
            }
        }
        else if (column.type === 'date') {
            const invalid = present.filter(v => typeof v !== 'string' || Number.isNaN(Date.parse(v))).length;
            if (invalid)
                issues.push({ column: column.name, kind: 'invalid_date', count: invalid, severity: 'warning', message: `${invalid.toLocaleString()} value${invalid === 1 ? '' : 's'} could not be parsed as a date.`, examples: present.filter(v => typeof v !== 'string' || Number.isNaN(Date.parse(v))).slice(0, 3).map(String) });
        }
        else if (column.type === 'category') {
            const variants = new Map();
            present.filter((v) => typeof v === 'string').forEach(value => { const key = value.trim().toLocaleLowerCase(); if (!variants.has(key))
                variants.set(key, new Set()); variants.get(key).add(value); });
            const conflicting = [...variants.values()].filter(values => values.size > 1), count = conflicting.reduce((sum, values) => sum + values.size - 1, 0);
            if (count)
                issues.push({ column: column.name, kind: 'category_variants', count, severity: 'info', message: `${count.toLocaleString()} casing or whitespace variant${count === 1 ? '' : 's'} found in ${column.name}.`, examples: conflicting.flatMap(group => [...group]).slice(0, 4) });
        }
    }
    if (rows.length) {
        const seen = new Set();
        let duplicates = 0;
        rows.forEach(row => { const key = JSON.stringify(row); if (seen.has(key))
            duplicates++;
        else
            seen.add(key); });
        if (duplicates)
            issues.push({ kind: 'duplicate', count: duplicates, severity: 'warning', message: `${duplicates.toLocaleString()} exact duplicate row${duplicates === 1 ? '' : 's'} found.` });
    }
    return issues;
}
export function previewCleaning(data, operation, column, reason) {
    let affectedRows = 0;
    const beforeSamples = [], afterSamples = [];
    const sample = (from, to) => { if (beforeSamples.length < 4 && String(from) !== String(to)) {
        beforeSamples.push(String(from));
        afterSamples.push(String(to));
    } };
    let rows;
    if (operation === 'deduplicate') {
        const seen = new Set();
        rows = data.rows.filter(row => { const key = JSON.stringify(row); if (seen.has(key)) {
            affectedRows++;
            sample('Duplicate row', 'Removed');
            return false;
        } seen.add(key); return true; });
    }
    else if (operation === 'normalize_columns') {
        const mapping = new Map(), used = new Set();
        data.columns.forEach((col, i) => { const base = col.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${i + 1}`; let name = base, n = 2; while (used.has(name))
            name = `${base}_${n++}`; used.add(name); mapping.set(col.name, name); if (name !== col.name)
            sample(col.name, name); });
        const renamed = [...mapping].some(([before, after]) => before !== after);
        rows = data.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [mapping.get(key) ?? key, value])));
        affectedRows = renamed ? rows.length : 0;
    }
    else {
        const targets = column === '*all*' ? data.columns.filter(c => operation !== 'normalize_categories' || c.type === 'category').map(c => c.name) : [column];
        rows = data.rows.map(row => {
            const next = { ...row };
            let changed = false;
            targets.forEach(key => {
                const raw = row[key];
                if (typeof raw !== 'string')
                    return;
                let value = raw;
                if (operation === 'trim')
                    value = raw.trim();
                else if (operation === 'missing' && /^(?:n\/?a|null|none|undefined|-)$/i.test(raw.trim()))
                    value = '';
                else if (operation === 'normalize_categories')
                    value = raw.trim().toLocaleLowerCase().replace(/\b\p{L}/gu, char => char.toLocaleUpperCase());
                else if (['parse_numbers', 'parse_currency', 'parse_percentages'].includes(operation)) {
                    const parsed = numericValue(raw);
                    if (parsed !== null)
                        next[key] = parsed;
                }
                else if (operation === 'parse_dates') {
                    const parsed = Date.parse(raw);
                    if (!Number.isNaN(parsed))
                        next[key] = new Date(parsed).toISOString();
                }
                else if (operation === 'normalize_booleans' && /^(true|false|yes|no|y|n|1|0)$/i.test(raw.trim()))
                    next[key] = /^(true|yes|y|1)$/i.test(raw.trim());
                if (operation === 'missing' && value === '')
                    next[key] = null;
                else if (!['parse_numbers', 'parse_currency', 'parse_percentages', 'parse_dates', 'normalize_booleans'].includes(operation))
                    next[key] = value;
                if (next[key] !== raw) {
                    changed = true;
                    sample(raw, next[key]);
                }
            });
            if (changed)
                affectedRows++;
            return next;
        });
    }
    return { rows, affectedRows, before: beforeSamples.join(' · ') || 'No changes needed', after: afterSamples.join(' · ') || 'Values unchanged', reason: reason.trim() || 'User requested cleanup' };
}
export function cleanDataset(data, operation, column, reason) {
    const change = previewCleaning(data, operation, column, reason);
    const profiled = profile(data.name, change.rows);
    return { ...profiled, apiDatasetId: data.apiDatasetId, audit: [...data.audit, { operation, column: column === '*all*' ? 'All columns' : column, affectedRows: change.affectedRows, before: change.before, after: change.after, reason: change.reason, timestamp: new Date().toISOString() }] };
}
export async function parseFile(file, selectedSheet) {
    if (file.size > 50 * 1024 * 1024)
        throw new Error('Files must be smaller than 50 MB.');
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await readDelimitedText(file);
        const preview = Papa.parse(text, { header: false, skipEmptyLines: 'greedy', dynamicTyping: false, preview: 12, delimitersToGuess: [',', '\t', ';', '|'] });
        const first = preview.data?.[0]?.map(value => String(value ?? '').trim()) ?? [];
        if (!first.length || first.length < 2)
            throw new Error('This file does not contain enough columns to analyze.');
        const normalized = first.map(value => value.toLocaleLowerCase());
        const distinct = new Set(normalized).size === normalized.length;
        const headerTokens = first.filter(value => value !== '' && /^[\p{L}_][\p{L}\p{N}_ .()/\-]*$/u.test(value) && numericValue(value) === null && Number.isNaN(Date.parse(value))).length;
        const body = (preview.data ?? []).slice(1).filter(row => row.length === first.length);
        const typedColumns = first.reduce((score, name, index) => {
            const values = body.map(row => String(row[index] ?? '').trim()).filter(Boolean);
            if (values.length >= 2 && values.filter(value => numericValue(value) !== null).length / values.length >= .75 && numericValue(name) === null) return score + 1;
            return score;
        }, 0);
        const hasHeader = distinct && headerTokens / first.length >= .7 && (body.length === 0 || typedColumns / first.length >= .35 || headerTokens === first.length);
        const parsed = Papa.parse(text, { header: hasHeader, skipEmptyLines: 'greedy', dynamicTyping: true, delimitersToGuess: [',', '\t', ';', '|'] });
        if (parsed.errors.length && !parsed.data.length)
            throw new Error(parsed.errors[0].message);
        const rows = hasHeader ? parsed.data : parsed.data.map(row => Object.fromEntries(row.map((value, index) => [`Column ${index + 1}`, value])));
        return { ...profile(file.name, rows), hasHeader };
    }
    if (ext === 'json') {
        const raw = JSON.parse(await file.text());
        const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
        if (!rows || !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r)))
            throw new Error('JSON needs to contain a list of objects (or an object with a data list).');
        const flatten = (obj, prefix = '') => Object.entries(obj).reduce((acc, [k, v]) => {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v))
                Object.assign(acc, flatten(v, key));
            else
                acc[key] = v;
            return acc;
        }, {});
        return profile(file.name, rows.map((r) => flatten(r)));
    }
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') {
        if (ext === 'xls')
            throw new Error('Legacy .xls files are not supported yet. Save the workbook as .xlsx and try again.');
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const usableSheets = workbook.worksheets.filter(sheet => sheet.rowCount > 1 && sheet.actualColumnCount > 0);
        if (!usableSheets.length)
            throw new Error('This workbook has no worksheets with tabular data.');
        if (!selectedSheet && usableSheets.length > 1)
            throw new WorkbookSheetSelectionRequired(usableSheets.map(sheet => sheet.name));
        const sheet = selectedSheet ? usableSheets.find(candidate => candidate.name === selectedSheet) : usableSheets[0];
        if (!sheet)
            throw new Error('This workbook does not contain a readable sheet.');
        const headerRow = sheet.getRow(1);
        const headers = [];
        for (let i = 1; i <= headerRow.cellCount; i++)
            headers.push(String(headerRow.getCell(i).value ?? `Column ${i}`).trim());
        const rows = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1)
                return;
            const item = {};
            headers.forEach((header, i) => {
                const value = row.getCell(i + 1).value;
                item[header] = value && typeof value === 'object' && 'result' in value ? value.result : value && typeof value === 'object' && 'text' in value ? value.text : value;
            });
            if (Object.values(item).some(v => v !== null && v !== undefined && v !== ''))
                rows.push(item);
        });
        return profile(file.name, rows);
    }
    throw new Error('Choose a CSV, XLSX, or JSON file.');
}
export function suggestions(data) {
    const dims = data.columns.filter(c => c.type === 'category' && c.unique > 1 && c.unique <= 30);
    const measures = data.columns.filter(c => c.type === 'number' && c.unique > 1);
    const dates = data.columns.filter(c => c.type === 'date');
    const out = [];
    if (dates[0] && measures[0])
        out.push({ title: `${measures[0].name} over time`, x: dates[0].name, y: measures[0].name, kind: 'line' });
    if (dates[0] && measures[0])
        out.push({ title: `${measures[0].name} area over time`, x: dates[0].name, y: measures[0].name, kind: 'area' });
    if (dates[0] && dims[0] && measures[0])
        out.push({ title: `${measures[0].name} over time by ${dims[0].name}`, x: dates[0].name, y: measures[0].name, kind: 'line', series_column: dims[0].name });
    if (measures.length > 1)
        out.push({ title: `${measures[1].name} vs ${measures[0].name}`, x: measures[0].name, y: measures[1].name, kind: 'scatter' });
    if (measures[0])
        out.push({ title: `${measures[0].name} distribution`, x: measures[0].name, y: measures[0].name, kind: 'histogram' });
    if (dims[0] && measures[0])
        out.push({ title: `${measures[0].name} spread by ${dims[0].name}`, x: measures[0].name, y: measures[0].name, group: dims[0].name, kind: 'boxplot' });
    if (measures.length >= 3)
        out.push({ title: 'Numeric correlations', x: measures[0].name, y: measures[1].name, kind: 'heatmap' });
    if (dims[0] && measures[0])
        out.push({ title: `${measures[0].name} by ${dims[0].name}`, x: dims[0].name, y: measures[0].name, kind: 'bar' });
    if (dims[1] && measures[0])
        out.push({ title: `${measures[0].name} by ${dims[1].name}`, x: dims[1].name, y: measures[0].name, kind: 'bar' });
    if (dims[0] && dims[0].unique <= 8 && !measures[0])
        out.push({ title: `${dims[0].name} distribution`, x: dims[0].name, y: dims[0].name, kind: 'pie' });
    if (!out.length && dims[0])
        out.push({ title: `${dims[0].name} frequency`, x: dims[0].name, y: dims[0].name, kind: 'bar' });
    return out;
}
export function histogram(rows, column, bins = 12) {
    const values=rows.map(row=>numericValue(row[column])).filter(value=>value!==null);
    if(!values.length)return[];
    const min=Math.min(...values),max=Math.max(...values),width=(max-min)/bins;
    if(width===0)return[{label:String(min),value:values.length}];
    const counts=Array.from({length:bins},()=>0);
    values.forEach(value=>counts[Math.min(bins-1,Math.floor((value-min)/width))]++);
    return counts.map((value,index)=>({label:`${(min+index*width).toLocaleString(undefined,{maximumFractionDigits:2})}–${(index===bins-1?max:min+(index+1)*width).toLocaleString(undefined,{maximumFractionDigits:2})}`,value}));
}
export function boxPlotSummary(rows,column) {
    const values=rows.map(row=>numericValue(row[column])).filter(value=>value!==null).sort((a,b)=>a-b);
    if(!values.length)return null;
    const quantile=p=>{const position=(values.length-1)*p,low=Math.floor(position),fraction=position-low;return values[low]+((values[Math.min(low+1,values.length-1)]-values[low])*fraction)};
    const q1=quantile(.25),median=quantile(.5),q3=quantile(.75),spread=q3-q1;
    const inliers=values.filter(value=>value>=q1-1.5*spread&&value<=q3+1.5*spread);
    return{min:inliers[0]??values[0],q1,median,q3,max:inliers[inliers.length-1]??values[values.length-1],outliers:values.length-inliers.length,count:values.length};
}
export function groupedBoxPlotSummary(rows, valueColumn, groupColumn, limit = 8) {
    const groups = new Map();
    rows.forEach(row => {
        const label = String(row[groupColumn] ?? 'Missing');
        const values = groups.get(label) ?? [];
        values.push(row);
        groups.set(label, values);
    });
    return [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, limit).flatMap(([label, groupRows]) => {
        const summary = boxPlotSummary(groupRows, valueColumn);
        return summary ? [{ label, ...summary }] : [];
    });
}
export function correlationMatrix(data,limit=6) {
    const columns=data.columns.filter(column=>column.type==='number').slice(0,limit);
    return columns.map(left=>({name:left.name,values:columns.map(right=>{
        const pairs=data.rows.map(row=>[numericValue(row[left.name]),numericValue(row[right.name])]).filter(pair=>pair[0]!==null&&pair[1]!==null);
        if(!pairs.length)return{column:right.name,value:null};
        const meanX=pairs.reduce((sum,pair)=>sum+pair[0],0)/pairs.length,meanY=pairs.reduce((sum,pair)=>sum+pair[1],0)/pairs.length;
        const numerator=pairs.reduce((sum,pair)=>sum+(pair[0]-meanX)*(pair[1]-meanY),0),denomX=Math.sqrt(pairs.reduce((sum,pair)=>sum+(pair[0]-meanX)**2,0)),denomY=Math.sqrt(pairs.reduce((sum,pair)=>sum+(pair[1]-meanY)**2,0));
        return{column:right.name,value:denomX&&denomY?numerator/(denomX*denomY):null};
    })}));
}
export function aggregateSeries(data,x,y,seriesColumn,aggregation='sum') {
    const series=[...new Set(data.rows.map(row=>String(row[seriesColumn]??'Missing')))].slice(0,6),groups=new Map();
    data.rows.forEach(row=>{const label=String(row[x]??'Missing'),name=String(row[seriesColumn]??'Missing'),value=numericValue(row[y]);if(!series.includes(name)||value===null)return;const group=groups.get(label)??Object.fromEntries(series.map(key=>[key,{sum:0,count:0}]));group[name].sum+=value;group[name].count++;groups.set(label,group)});
    return [...groups].map(([label,group])=>({label,...Object.fromEntries(series.map(name=>[name,aggregation==='average'?group[name].sum/Math.max(group[name].count,1):group[name].sum]))})).sort((a,b)=>a.label.localeCompare(b.label)).slice(0,100);
}
export function aggregate(data, x, y, kind, aggregation = 'sum', sort = 'desc', filterColumn, filterValue) {
    const groups = new Map();
    data.rows.filter(row=>!filterColumn||filterValue===undefined||String(row[filterColumn]??'')===filterValue).forEach(row => {
        const key = String(row[x] ?? 'Missing');
        const group = groups.get(key) ?? { sum: 0, count: 0 };
        if (aggregation === 'count' || x === y || kind === 'pie' && data.columns.find(c => c.name === y)?.type !== 'number')
            group.count++;
        else {
            const value = numericValue(row[y]);
            if (value !== null) {
                group.sum += value;
                group.count++;
            }
        }
        groups.set(key, group);
    });
    return [...groups].map(([label, group]) => ({ label, value: aggregation === 'count' || x === y || kind === 'pie' && data.columns.find(c => c.name === y)?.type !== 'number' ? group.count : aggregation === 'average' ? group.sum / Math.max(group.count, 1) : group.sum })).sort((a, b) => ['line','area'].includes(kind) ? a.label.localeCompare(b.label) : (sort === 'desc' ? b.value - a.value : a.value - b.value)).slice(0, ['line','area'].includes(kind)?1000:24);
}
