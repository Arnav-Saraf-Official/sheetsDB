const DB_OPERATORS = {
    "=": (a, b) => a == b,
    "!=": (a, b) => a != b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "contains": (a, b) => String(a).includes(String(b)),
    "startsWith": (a, b) => String(a).startsWith(String(b)),
    "endsWith": (a, b) => String(a).endsWith(String(b)),
    "in": (a, b) => Array.isArray(b) && b.includes(a)
};

function insert(table, record){
    const lock = LockService.getDocumentLock();
    lock.waitLock(30000);

    try {
        const sheet = getTable(table);
        const schema = getSchema(table);
        const meta = getTableMeta(table);

        const row = [];

        schema.forEach(column => {
            let value;

            if (column.name === "_id")
                value = meta.nextId;
            else if (record.hasOwnProperty(column.name))
                value = validateValue(record[column.name], column);
            else if (column.hasOwnProperty("default"))
                value = column.default === "NOW"
                    ? new Date()
                    : validateValue(column.default, column);
            else
                value = "";

            row.push(value);
        });
        sheet.appendRow(row);

        updateTableMeta(table, {
            nextId: meta.nextId + 1,
            modified: new Date()
        });

        return{
            success: true,
            id: meta.nextId
        }
    }
    finally {
        lock.releaseLock();
    }
}

function insertMany(table, records) {
    const lock = LockService.getDocumentLock();
    lock.waitLock(30000);

    try{
        if (!Array.isArray(records)) throw new Error("Records must be an array.");

        const sheet = getTable(table);
        const schema = getSchema(table);
        const meta = getTableMeta(table);

        let nextId = meta.nextId;

        const rows = records.map(record =>{
            return schema.map(column =>{
                if (column.name === "_id") return nextId++;
                if (record.hasOwnProperty(column.name)) return validateValue(record[column.name], column);
                if (column.hasOwnProperty("default")) return column.default === "NOW" ? new Date() : validateValue(column.default, column);
                return "";
            });
        });
        
        if (rows.length){
            sheet.getRange(
                sheet.getLastRow() + 1,
                1,
                rows.length,
                schema.length
            ).setValues(rows);
        }
        updateTableMeta(table, {
            nextId,
            modified: new Date()
        });
        return{
            success: true, 
            inserted: rows.length
        };

    } finally {
        lock.releaseLock();
    }
}
function select(table, options={}){
    const sheet = getTable(table);
    const schema = getSchema(table);

    const values = sheet.getDataRange().getValues()

    if(values.length <= 1) return [];

    const headers = values[0];

    let rows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index];
        });

        return obj;
    })
    if (options.where) rows = rows.filter(r => matchesWhere(r, options.where));
    if (options.sort) rows = sortRows(rows, options.sort);
    if (options.offset) rows = rows.slice(options.offset);
    if (options.limit) rows = rows.slice(0, options.limit);

    if(options.select){
        rows = rows.map(row =>{
            const obj = {};
            options.select.forEach(col => {
                obj[col] = row[col];
            });
            return obj;
        })
    }
    return rows;
}

function update(table, where, values){
    const lock = LockService.getDocumentLock();
    lock.waitLock(30000);

    try{
        const sheet = getTable(table);
        const schema = getSchema(table);
        const data = sheet.getDataRange().getValues();

        if (data.length <= 1)
            return {
                success: true,
                updated: 0
            };

        const headers = data[0];
        let updated = 0;

        for (let r = 1; r < data.length ; r++) {
            const row = {};

            headers.forEach((h,c) => row[h] = data[r][c]);
            if (!matchesWhere(row, where)) continue;

            Object.keys(values).forEach(key => {
                const index = headers.indexOf(key);
                if (index === -1) return;
                const colDef = schema.find(c => c.name === key);
                data[r][index] = colDef ? validateValue(values[key], colDef) : values[key];
            });
            updated++;
        }
        sheet.getRange(2, 1, data.length - 1, headers.length).setValues(data.slice(1));
        updateTableMeta(table, {
            modified: new Date()
        });
        return {
            success: true,
            updated
        };
    } finally {
        lock.releaseLock();
    }
}

function remove(table, where) {
    const lock = LockService.getDocumentLock();
    lock.waitLock(30000);

    try {
        const sheet = getTable(table);

        const data = sheet.getDataRange().getValues();

        if (data.length <= 1)
            return {
                success: true,
                deleted: 0
            };
        const headers = data[0];
        const keep = [headers];
        let deleted = 0;    
        for (let r = 1; r < data.length; r++) {

            const row = {};

            headers.forEach((h, c) => row[h] = data[r][c]);

            if (matchesWhere(row, where)) {
                deleted++;
                continue;
            }
            keep.push(data[r]);
        }
        sheet.clearContents();
        sheet.getRange(1, 1, keep.length, headers.length).setValues(keep);
        updateTableMeta(table, { modified: new Date() });
        return {
            success: true,
            deleted
        };
        
    } finally {
        lock.releaseLock();
    }
}

function count(table, where = null) {
    return select(table, {where}).length;
}

function exists(table, where){
    return count(table, where) > 0;
}

function matchesWhere(row, where) {
    if (!where) return true;
    
    if (Array.isArray(where)) {
        return where.every(condition => {
            const [column, operator, value] = condition;
            return DB_OPERATORS[operator](row[column], value);
        })
    }
    return Object.keys(where).every(key => row[key] == where[key]);
}

function sortRows(rows, sort) {
    const descending = sort.startsWith("-");
    const column = descending ? sort.substring(1) : sort;

    rows.sort((a, b) => {
        if (a[column] < b[column]) return descending ? 1 : -1;
        if (a[column] > b[column]) return descending ? -1 : 1;
        return 0;
    });

    return rows;
}