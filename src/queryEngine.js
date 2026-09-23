import { numericValue } from './data';
export function parseQuestion(data, question) {
    const q = question.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    if (!q)
        return null;
    const mentioned = data.columns.filter(c => q.includes(c.name.toLocaleLowerCase())).sort((a, b) => b.name.length - a.name.length);
    const measures = mentioned.filter(c => c.type === 'number'), dimensions = mentioned.filter(c => ['category', 'date', 'boolean', 'identifier'].includes(c.type) && c.unique > 0 && c.unique <= 100);
    const measure = measures[0]?.name, dimension = dimensions[0]?.name;
    const limitMatch = q.match(/\btop\s+(\d{1,3})\b/), limit = Math.min(100, Math.max(1, Number(limitMatch?.[1] ?? (dimension && /\b(first|top|highest|lowest|most|least)\b/.test(q) ? 10 : 20))));
    const sort = /\b(lowest|least|smallest|ascending|bottom)\b/.test(q) ? 'asc' : 'desc';
    let aggregation = 'sum';
    if (/\b(average|avg|mean)\b/.test(q))
        aggregation = 'average';
    else if (/\b(count|frequency|frequencies)\b/.test(q) && !(/\bhow many\b/.test(q) && measure))
        aggregation = 'count';
    else if (/\b(minimum|min|lowest)\b/.test(q))
        aggregation = 'min';
    else if (/\b(maximum|max|highest)\b/.test(q))
        aggregation = 'max';
    let spec, description;
    if (dimension) {
        if (!measure)
            aggregation = 'count';
        spec = { operation: 'group_by', dimension, measure: aggregation === 'count' ? undefined : measure, aggregation, sort, limit, question };
        description = `${aggregation === 'count' ? 'Count records' : `${aggregation[0].toUpperCase()}${aggregation.slice(1)} of ${measure}`} by ${dimension}, ${sort === 'desc' ? 'largest' : 'smallest'} first`;
    }
    else if (measure) {
        const operation = aggregation === 'count' ? 'count' : aggregation === 'average' ? 'average' : aggregation === 'min' ? 'minimum' : aggregation === 'max' ? 'maximum' : 'total';
        spec = { operation, measure, question };
        description = `${operation === 'total' ? 'Total' : operation === 'average' ? 'Average' : operation === 'count' ? 'Count' : operation === 'maximum' ? 'Highest' : 'Lowest'} ${measure}${operation === 'count' ? ' values' : ''}`;
    }
    else if (/\b(count|how many|number of|rows|records)\b/.test(q)) {
        spec = { operation: 'count', question };
        description = 'Count dataset rows';
    }
    else
        return null;
    return { spec, description };
}
export function executeQuestion(data, spec, description) {
    if (spec.operation === 'count')
        return { spec, description, value: spec.measure ? data.rows.filter(row => row[spec.measure] !== null && row[spec.measure] !== undefined).length : data.rows.length };
    const valuesFor = (row, column) => numericValue(row[column]);
    if (spec.operation === 'total' || spec.operation === 'average' || spec.operation === 'maximum' || spec.operation === 'minimum') {
        const values = data.rows.map(row => valuesFor(row, spec.measure)).filter((v) => v !== null);
        if (!values.length)
            return { spec, description, value: 0, count: 0 };
        const value = spec.operation === 'total' ? values.reduce((a, b) => a + b, 0) : spec.operation === 'average' ? values.reduce((a, b) => a + b, 0) / values.length : spec.operation === 'maximum' ? values.reduce((a, b) => Math.max(a, b), -Infinity) : values.reduce((a, b) => Math.min(a, b), Infinity);
        return { spec, description, value, count: values.length };
    }
    const groups = new Map();
    data.rows.forEach(row => { const label = String(row[spec.dimension] ?? 'Missing'), group = groups.get(label) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity }; if (spec.aggregation === 'count') {
        group.count++;
        groups.set(label, group);
        return;
    } const value = valuesFor(row, spec.measure); if (value !== null) {
        group.sum += value;
        group.count++;
        group.min = Math.min(group.min, value);
        group.max = Math.max(group.max, value);
    } groups.set(label, group); });
    const rows = [...groups].map(([label, g]) => ({ label, value: spec.aggregation === 'count' ? g.count : spec.aggregation === 'average' ? g.sum / Math.max(g.count, 1) : spec.aggregation === 'min' ? g.min : spec.aggregation === 'max' ? g.max : g.sum })).filter(row => Number.isFinite(row.value)).sort((a, b) => spec.sort === 'asc' ? a.value - b.value : b.value - a.value).slice(0, spec.limit ?? 20);
    return { spec, description, rows };
}
