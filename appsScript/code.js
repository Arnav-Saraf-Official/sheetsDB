const SHEET = SpreadsheetApp.getActiveSpreadsheet();

const KEYS = {
    masterKey: "your-master-key-here",
    readKey:   "your-read-key-here"
};

function doGet(e) {
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('SheetsDB — Google Sheets Database');
}

function doPost(e) {
    const body = e?.postData ? JSON.parse(e.postData.contents) : {};
    const method = body._method || e?.parameter?._method || 'POST';
    return handleRequest(e, method, body);
}

function handleRequest(e, method, body) {
    try {
        const headers = e?.postData?.headers || {};
        const auth = body.auth || headers['x-auth-key'] || headers['X-Auth-Key'] || '';
        if (!authenticate(auth)) return error('Unauthorized', 401);

        const path = e?.pathInfo || e?.parameter?.table || body.table;
        if (!path) return error('Table name required', 400);

        if (method !== 'GET' && getUserRole(auth) !== 'master') {
            return error('Write access requires master key', 403);
        }

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

function authenticate(key) {
    if (!key) return false;
    return key === KEYS.masterKey || key === KEYS.readKey;
}

function getUserRole(key) {
    if (key === KEYS.masterKey) return 'master';
    if (key === KEYS.readKey)   return 'reader';
    return null;
}

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

function handleGet(path, params) {
    if (path === '_tables') {
        if (params?.name) return success(describeTable(params.name));
        return success(listTables());
    }

    const query = buildQuery(params);
    validateQuery(path, query);
    return success(select(path, query));
}

function handlePost(path, body) {
    if (path === '_tables') {
        if (!body.name) return error('Table name required', 400);
        return success(createTable(body.name, body.columns || []));
    }
    if (path === '_schema') {
        if (!body.table)  return error('Table name required', 400);
        if (!body.column) return error('Column definition required', 400);
        return success(addColumn(body.table, body.column));
    }

    if (body.records && Array.isArray(body.records)) {
        return success(insertMany(path, body.records));
    }
    return success(insert(path, body));
}

function handlePut(path, body) {
    if (path === '_tables') {
        if (!body.oldName || !body.newName) return error('oldName and newName required', 400);
        return success(renameTable(body.oldName, body.newName));
    }
    if (path === '_schema') {
        if (body.oldName && body.newName) {
            return success(renameColumn(body.table, body.oldName, body.newName));
        }
        if (body.column && body.type) {
            return success(changeColumnType(body.table, body.column, body.type));
        }
        return error('oldName/newName or column/type required', 400);
    }

    let where = body.where;
    if (typeof where === 'string') where = parseWhere(where);
    if (!where) return error('where clause required', 400);
    return success(update(path, where, body.values || {}));
}

function handleDelete(path, params, body) {
    if (path === '_tables') {
        const name = body?.name || params?.name;
        if (!name) return error('Table name required', 400);
        return success(dropTable(name));
    }
    if (path === '_schema') {
        const table  = body?.table  || params?.table;
        const column = body?.column || params?.column;
        if (!table || !column) return error('table and column required', 400);
        return success(removeColumn(table, column));
    }

    let where = body?.where || params?.where;
    if (typeof where === 'string') where = parseWhere(where);
    if (!where) return error('where clause required', 400);
    return success(remove(path, where));
}