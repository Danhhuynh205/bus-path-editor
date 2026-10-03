// --------------------------------------------------------------------
// GỌI API (cùng origin với backend, không xác thực)
// --------------------------------------------------------------------
const API_BASE = "/api/v1";
const MAP_BASEMAP = "streets-navigation-vector";
const MAP_DEFAULT_CENTER = [106.70, 10.78]; // Trung tâm TP.HCM
const MAP_DEFAULT_ZOOM = 12;

async function apiGetJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

// Gửi request JSON; body (nếu có) được serialize
function apiRequest(method, path, body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`${API_BASE}${path}`, options);
}

// Danh sách <option> cho dropdown chọn tuyến
function routeOptionsHtml(routes) {
  return routes
    .map(r => `<option value="${escapeHtml(r.route_id)}">Tuyến ${escapeHtml(r.route_number)}: ${escapeHtml(r.route_name)}</option>`)
    .join("");
}

// Tên tuyến / trạm lấy từ dữ liệu nhập ngoài, cần escape trước khi chèn vào HTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
