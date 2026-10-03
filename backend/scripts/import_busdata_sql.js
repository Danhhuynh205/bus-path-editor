// ====================================================================
// NẠP database/busdata.sql VÀO CSDL
// - Tạo database và bảng (database/schema.sql) nếu chưa có
// - Thay toàn bộ dữ liệu bus_routes, bus_stops, route_paths, route_stops
// - Cả file dữ liệu chạy trong 1 transaction: lỗi giữa chừng thì dữ liệu cũ giữ nguyên
//
// Chạy: cd backend && npm run db:import
// ====================================================================
const fs = require("fs");
const { connectDbCreatingIfMissing, BUSDATA_SQL_FILE, SCHEMA_SQL_FILE } = require("./busdata_db");

const TABLES = ["bus_routes", "bus_stops", "route_paths", "route_stops"];

// Số dòng kỳ vọng ghi ở đầu file: "-- Số dòng: bus_routes: 178, bus_stops: 5898, ..."
function expectedCounts(sql) {
  const header = sql.match(/^-- Số dòng: (.*)$/m);
  if (!header) return {};
  return Object.fromEntries(header[1].split(", ").map(part => {
    const [table, n] = part.split(": ");
    return [table, Number(n)];
  }));
}

async function main() {
  const sql = fs.readFileSync(BUSDATA_SQL_FILE, "utf8");
  const expected = expectedCounts(sql);
  const conn = await connectDbCreatingIfMissing({ multipleStatements: true });

  let ok = true;
  try {
    await conn.query(fs.readFileSync(SCHEMA_SQL_FILE, "utf8"));
    await conn.query(sql);
    for (const table of TABLES) {
      const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
      const match = expected[table] === undefined || row.n === expected[table];
      ok = ok && match;
      console.log(`    ${match ? "✔" : "✘"} ${table}: ${row.n}${expected[table] !== undefined ? ` / ${expected[table]}` : ""}`);
    }
  } finally {
    await conn.end();
  }

  if (!ok) throw new Error("Số dòng sau khi nạp không khớp file");
  console.log(">>> Nạp busdata.sql thành công.");
}

main().catch(err => {
  console.error(">>> Nạp busdata.sql thất bại:", err.message);
  process.exit(1);
});
