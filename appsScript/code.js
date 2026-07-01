const SHEET = SpreadsheetApp.getActiveSpreadsheet();
const USERS = { "admin": "password123", "reader": "readpass" };

function doGet(e)    { return handleRequest(e, 'GET'); }
function doPost(e)   { return handleRequest(e, 'POST'); }
function doPut(e)    { return handleRequest(e, 'PUT'); }
function doDelete(e) { return handleRequest(e, 'DELETE'); }

function handleRequest(e, method) {
    try {
        // --- auth ---
        const body = e?.postData ? JSON.parse(e.postData.contents) : {};
        const auth = e?.parameter?.auth || body.auth;
        if (!authenticate(auth)) return error('Unauthorized', 401);

        // --- table name ---
        const path = e?.pathInfo || e?.parameter?.table;
        if (!path) return error('Table name required', 400);

        // --- write guard ---
        if (method !== 'GET' && getUserRole(auth) !== 'admin') {
            return error('Write access requires admin role', 403);
        }

        // --- route ---
        switch (method) {
            case 'GET':    return handleGet(path, e?.parameter);
            case 'POST':   return handlePost(path, body);
            case 'PUT':    return handlePut(path, body);
            case 'DELETE': return handleDelete(path, e?.parameter, body);
            default:       return error('Method not allowed', 405);
        }

    } catch (err) {
        return error(err.toString(), 500);
    }
}

// ============================================================
//  Auth
// ============================================================

function authenticate(key) {
    if (!key) return false;
    return Object.values(USERS).includes(key);
}

function getUserRole(key) {
    for (const [role, pass] of Object.entries(USERS)) {
        if (pass === key) return role;
    }
    return null;
}

// ============================================================
//  Response helpers
// ============================================================

function success(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function error(msg, code) {
    return ContentService.createTextOutput(JSON.stringify({
        error: true,
        message: msg,
        code: code || 500
    })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  Route handlers
// ============================================================

function handleGet(path, params) {
    // system: list / describe tables
    if (path === '_tables') {
        if (params?.name) return success(describeTable(params.name));
        return success(listTables());
    }

    // query rows
    const query = buildQuery(params);
    validateQuery(path, query);
    return success(select(path, query));
}

function handlePost(path, body) {
    // system: create table
    if (path === '_tables') {
        if (!body.name) return error('Table name required', 400);
        return success(createTable(body.name, body.columns || []));
    }
    // system: add column
    if (path === '_schema') {
        if (!body.table)  return error('Table name required', 400);
        if (!body.column) return error('Column definition required', 400);
        return success(addColumn(body.table, body.column));
    }

    // insert row(s)
    if (body.records && Array.isArray(body.records)) {
        return success(insertMany(path, body.records));
    }
    return success(insert(path, body));
}

function handlePut(path, body) {
    // system: rename table
    if (path === '_tables') {
        if (!body.oldName || !body.newName) return error('oldName and newName required', 400);
        return success(renameTable(body.oldName, body.newName));
    }
    // system: modify column
    if (path === '_schema') {
        if (!body.table) return error('Table name required', 400);
        if (body.oldName && body.newName) {
            return success(renameColumn(body.table, body.oldName, body.newName));
        }
        if (body.column && body.type) {
            return success(changeColumnType(body.table, body.column, body.type));
        }
        return error('oldName/newName or column/type required', 400);
    }

    // update rows
    if (!body.where) return error('where clause required', 400);
    return success(update(path, body.where, body.values || {}));
}

function handleDelete(path, params, body) {
    // system: drop table
    if (path === '_tables') {
        const name = body?.name || params?.name;
        if (!name) return error('Table name required', 400);
        return success(dropTable(name));
    }
    // system: remove column
    if (path === '_schema') {
        const table  = body?.table  || params?.table;
        const column = body?.column || params?.column;
        if (!table || !column) return error('table and column required', 400);
        return success(removeColumn(table, column));
    }

    // delete rows
    let where = body?.where || params?.where;
    if (typeof where === 'string') where = parseWhere(where);
    if (!where) return error('where clause required', 400);
    return success(remove(path, where));
}
