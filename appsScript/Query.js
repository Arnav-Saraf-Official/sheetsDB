const QUERY_OPERATORS = [
    "=",
    "!=",
    ">=",
    "<=",
    ">",
    "<",
    "contains",
    "startsWith",
    "endsWith",
    "in"
];

function normalizeQuery(options) {
    options = options || {};
    return{
        where: parseWhere(options.where),
        sort: parseSort(options.sort),
        limit: parseLimit(options.limit),
        offset: parseOffset(options.offset),
        select: parseSelect(options.select)
    };
}

function parseWhere(where) {
    if (!where) return null;
    if (typeof where === "object") return where;
    if (typeof where !== "string") throw new Error("Invalid where clause: " + where);

    where = where.trim();
    if (where.length === 0) return null;

    const conditions = where.split(";").map(c => c.trim()).filter(Boolean);
    return conditions.map(parseCondition);
}
function parseCondition(condition) {

    for (const operator of [
        "startsWith",
        "endsWith",
        "contains",
        "!=",
        ">=",
        "<=",
        ">",
        "<",
        "=",
        "in"
    ]) {
        const index = condition.indexOf(operator);
        if (index === -1) continue;
        
        const column = condition.substring(0, index).trim();
        let value = condition.substring(index + operator.length).trim();

        if (operator === "in") {
            value = value
                .replace(/^\[/, "")
                .replace(/\]$/, "")
                .split(",")
                .map(v => parseValue(v.trim()));
        } else {
            value = parseValue(value);
        }
        return { column, operator, value };
    }
}

function parseValue(value) {
    if (value === "") return "";
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;

    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

     if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    )
        return value.substring(1, value.length - 1);
    
    return value;
}

function parseSort(sort) {
    if (!sort) return null;
    if (typeof sort !== "string") throw new Error("Sort must be string." + sort);

    sort = sort.trim();

    if (sort.length === 0) return null;
    const descending = sort.startsWith("-");

    const column = descending ? sort.substring(1) : sort;

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) throw new Error("Invalid sort column.");

    return descending ? "-" + column : column;
}

function parseLimit(limit){
    if(
        limit === undefined ||
        limit === null ||
        limit === ""
    ) return null;

    limit = Number(limit);

    if (!Number.isInteger(limit) || limit < 0) throw new Error("Limit out of bounds: " + String(limit));
    return limit;
}

function parseOffset(offset){
    if (
        offset === undefined ||
        offset === null ||
        offset === ""
    ) return 0;
    offset = Number(offset);

    if (!Number.isInteger(offset) || offset < 0) throw new Error("Invalid offset: " + String(offset));
    return offset;
}

function parseSelect(select){
    if (!select) return null;
    if (Array.isArray(select)) return select;
    if (typeof select !== "string") throw new Error("Select must be string or array: " + select);
    return select
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

function buildQuery(parameters) {

    parameters = parameters || {};

    return normalizeQuery({
        where: parameters.where,
        sort: parameters.sort,
        limit: parameters.limit,
        offset: parameters.offset,
        select: parameters.select
    });
}

function executeQuery(table, parameters) {
    const query = buildQuery(parameters);
    return select(table, query);
}

function executeCount(table, parameters) {
    const query = buildQuery(parameters);
    return count(table, query.where);
}

function executeExists(table, parameters) {
    const query = buildQuery(parameters);
    return exists(table, query.where);
}

function validateQuery(query) {
    query = normalizeQuery(query);
    const schema = getSchema();
    const columns = schema.map(c => c.name);

    if (query.select){
        query.select.forEach(column =>{
            if (!columns.includes(column)) throw new Error("Invalid select column: " + column);
        });
    }
    if (query.sort) {
        const column = query.sort.startsWith("-") ? query.sort.substring(1) : query.sort;
        if (!columns.includes(column)) throw new Error(`Unknown column '${column}'.`);
    }
    if (Array.isArray(query.where)) {

        query.where.forEach(condition => {

            const column = condition[0];
            const operator = condition[1];

            if (!columns.includes(column)) throw new Error(`Unknown column '${column}'.`);
            if (!QUERY_OPERATORS.includes(operator)) throw new Error(`Unsupported operator '${operator}'.`);
        });
    }
    if ( query.where && !Array.isArray(query.where) ) {
        Object.keys(query.where).forEach(column => {
            if (!columns.includes(column)) throw new Error(`Unknown column '${column}'.`);
        });
    }
    return query;
}

