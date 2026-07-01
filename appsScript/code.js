const SHEET = SpreadSheetApp.getActiveSpreadsheet();
const USERS = { "admin" : "password123", "reader": "readpass" };

function doGet(e) { return handleRequest(e, 'GET'); }
function doPost(e) { return handleRequest(e, 'POST'); }
function doPut(e) { return handleRequest(e, 'PUT'); }
function doDelete(e) { return handleRequest(e, 'DELETE'); }

function handleRequest(e, method) {
    try {
        const auth = e?.parameter?.auth || JSON.parse(e?.postData?.contents || '{}').auth;
        if (!authenticate(auth)) return returnError('Unauthorized', 401);
        
        const path = e?.pathInfo || e?.parameter?.table;
        if (!path) return returnError('Table name requried', 400);

        // Admin endpoints for tables lol
        if (path === "_tables" && method === "POST") return handleCreateTable(JSON.parse(e?.postData?.contents));
        if (path === "_tables" && method === "DELETE") return handleDropTable(e?.parameter?.name);

        // Crud ig
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return returnError('Method not supported', 405);
        if (method !== 'GET' && getUserRole(auth) !== 'admin') return returnError('Write requires admin', 403);

        switch (method) {
            case 'GET': return handleGet(path, e?.parameter);
            case 'POST': return handlePost(path, JSON.parse(e?.postData?.contents));
            case 'PUT': return handlePut(path, JSON.parse(e?.postData?.contents));
            case 'DELETE': return handleDelete(path, e?.parameter);
        }

    } catch (err){
        return returnError(err.toString(), 500);
    }
}
