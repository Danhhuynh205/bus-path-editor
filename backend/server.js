// ====================================================================
// API CÔNG CỤ SỬA LỘ TRÌNH XE BUÝT + PHỤC VỤ FRONTEND TĨNH
// Không có xác thực: chỉ chạy local, không mở cổng ra mạng ngoài.
// ====================================================================
const path = require("path");
const express = require("express");
const mysql = require("mysql2/promise");
const { DB_CONFIG } = require("./scripts/busdata_db");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

const dbPool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 10 });

// [lon, lat] hợp lệ theo WGS84
function isLonLat(pt) {
  return Array.isArray(pt) && pt.length >= 2 &&
    Number.isFinite(pt[0]) && Number.isFinite(pt[1]) &&
    Math.abs(pt[0]) <= 180 && Math.abs(pt[1]) <= 90;
}

function parseDirection(value) {
  const dir = parseInt(value, 10);
  return dir === 1 || dir === 2 ? dir : null;
}

// --------------------------------------------------------------------
// TUYẾN XE
// --------------------------------------------------------------------
app.get("/api/v1/routes", async (req, res) => {
  try {
    const [rows] = await dbPool.query("SELECT route_id, route_number, route_name FROM bus_routes");
    // Sắp xếp tự nhiên theo số tuyến ("13" trước "100", "61-4" trước "61-37")
    rows.sort((a, b) => a.route_number.localeCompare(b.route_number, "vi", { numeric: true }));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy danh sách tuyến xe" });
  }
});

// --------------------------------------------------------------------
// LỘ TRÌNH TIM ĐƯỜNG (LineString, GeoJSON)
// --------------------------------------------------------------------
app.get("/api/v1/routes/:route_id/path", async (req, res) => {
  const direction = parseDirection(req.query.direction || 1);
  if (!direction) return res.status(400).json({ error: "direction phải là 1 hoặc 2" });
  try {
    const [rows] = await dbPool.query(
      `SELECT p.path_id, p.route_id, p.direction, r.route_number, r.route_name, ST_AsGeoJSON(p.geom) AS geom_json
       FROM route_paths p
       JOIN bus_routes r ON p.route_id = r.route_id
       WHERE p.route_id = ? AND p.direction = ? LIMIT 1`,
      [req.params.route_id, direction]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy lộ trình tim đường của tuyến này" });
    }
    const { geom_json, ...properties } = rows[0];
    res.json({ type: "Feature", geometry: JSON.parse(geom_json), properties });
  } catch (error) {
    res.status(500).json({ error: "Lỗi truy vấn lộ trình tim đường" });
  }
});

// Ghi đè lộ trình của một chiều. Body: { direction, coordinates: [[lon, lat], ...] }
app.post("/api/v1/routes/:route_id/path", async (req, res) => {
  const { route_id } = req.params;
  const direction = parseDirection(req.body.direction);
  const { coordinates } = req.body;

  if (!direction) return res.status(400).json({ error: "direction phải là 1 hoặc 2" });
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isLonLat)) {
    return res.status(400).json({ error: "Lộ trình cần tối thiểu 2 điểm tọa độ hợp lệ dạng [[lon, lat], ...]" });
  }

  const lineStringWkt = `LINESTRING(${coordinates.map(pt => `${pt[0]} ${pt[1]}`).join(", ")})`;
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM route_paths WHERE route_id = ? AND direction = ?", [route_id, direction]);
    await conn.query(
      "INSERT INTO route_paths (route_id, direction, geom) VALUES (?, ?, ST_GeomFromText(?, 4326))",
      [route_id, direction, lineStringWkt]
    );
    await conn.commit();
    res.status(201).json({ message: "Cập nhật lộ trình thành công", route_id, direction, points_count: coordinates.length });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: "Lỗi lưu lộ trình vào CSDL: " + error.message });
  } finally {
    conn.release();
  }
});

// --------------------------------------------------------------------
// TRẠM DỪNG
// --------------------------------------------------------------------
app.get("/api/v1/routes/:route_id/stops", async (req, res) => {
  const direction = parseDirection(req.query.direction || 1);
  if (!direction) return res.status(400).json({ error: "direction phải là 1 hoặc 2" });
  try {
    const [rows] = await dbPool.query(
      `SELECT rs.route_id, rs.stop_id, rs.direction, rs.stop_order,
              s.stop_code, s.stop_name, s.address, s.stop_type, s.status, ST_AsGeoJSON(s.geom) AS geom_json
       FROM route_stops rs
       JOIN bus_stops s ON rs.stop_id = s.stop_id
       WHERE rs.route_id = ? AND rs.direction = ?
       ORDER BY rs.stop_order ASC`,
      [req.params.route_id, direction]
    );
    res.json(rows.map(({ geom_json, ...stop }) => {
      const [longitude, latitude] = JSON.parse(geom_json).coordinates;
      return { ...stop, longitude, latitude };
    }));
  } catch (error) {
    res.status(500).json({ error: "Lỗi lấy danh sách trạm trên tuyến" });
  }
});

// Dời vị trí trạm. Body: { longitude, latitude } — trạm dùng chung cho mọi tuyến đi qua
app.put("/api/v1/stops/:stop_id", async (req, res) => {
  const { longitude, latitude } = req.body;
  if (!isLonLat([longitude, latitude])) {
    return res.status(400).json({ error: "Cần longitude, latitude hợp lệ" });
  }
  try {
    const [result] = await dbPool.query(
      "UPDATE bus_stops SET geom = ST_GeomFromText(?, 4326) WHERE stop_id = ?",
      [`POINT(${longitude} ${latitude})`, req.params.stop_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Không tìm thấy trạm" });
    res.json({ message: "Cập nhật vị trí trạm thành công" });
  } catch (error) {
    res.status(500).json({ error: "Lỗi cập nhật trạm" });
  }
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`>>> Công cụ sửa lộ trình: http://localhost:${PORT}`);
});
