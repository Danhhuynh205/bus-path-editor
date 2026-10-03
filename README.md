# Bus Path Editor

Công cụ kéo thả để sửa lộ trình (tim đường) và vị trí trạm dừng của mạng lưới xe buýt TP.HCM trên bản đồ ArcGIS, lưu vào MariaDB và xuất ra file SQL để quản lý bằng git.

> **Chỉ chạy local.** API không có xác thực; server mặc định chỉ lắng nghe trên `127.0.0.1`. Không mở cổng ra mạng ngoài.

## Cấu trúc

```
bus-path-editor/
├── docker-compose.yml        # MariaDB 10.4 cho local
├── backend/
│   ├── server.js             # API + phục vụ frontend tĩnh
│   ├── .env.example
│   └── scripts/
│       ├── import_busdata_sql.js   # database/busdata.sql → CSDL (npm run db:import)
│       ├── export_busdata_sql.js   # CSDL → database/busdata.sql (npm run db:export)
│       └── busdata_db.js           # Cấu hình kết nối dùng chung
├── database/
│   ├── schema.sql            # 4 bảng: bus_routes, route_paths, bus_stops, route_stops (SRID 4326)
│   └── busdata.sql           # Dữ liệu hiện hành: 178 tuyến, 5.898 trạm, 332 lộ trình
└── frontend/                 # Trang sửa lộ trình (ArcGIS Maps SDK 4.29, không cần build)
```

## Chạy

Yêu cầu: Node.js 18+, Docker (hoặc MariaDB/MySQL có hỗ trợ spatial sẵn trên máy).

```bash
# 1. CSDL (lần đầu container cần ~10–20 giây để khởi tạo)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # chỉnh nếu CSDL không chạy ở 127.0.0.1:3306, user root, không mật khẩu
npm install
npm run db:import             # tạo database + bảng nếu chưa có, nạp database/busdata.sql
npm start                     # http://localhost:3000
```

Nếu `db:import` báo `Connection lost` ngay sau `docker compose up`, CSDL chưa khởi tạo xong — đợi vài giây rồi chạy lại.

## Sửa dữ liệu

Mở `http://localhost:3000`, chọn tuyến và chiều rồi bấm **Tải**.

- **Lộ trình:** click vào đường để sửa — kéo đỉnh để dời, kéo điểm giữa đoạn để chèn đỉnh mới, chọn đỉnh rồi nhấn `Delete` để xoá.
- **Trạm:** click vào trạm rồi kéo. Trạm dùng chung cho mọi tuyến đi qua nên dời một lần là đổi ở tất cả các tuyến.
- `Ctrl+Z` / `Ctrl+Y` để hoàn tác / làm lại; nút góc dưới trái chuyển sang ảnh vệ tinh để so với đường thật.
- Viền đỏ: đoạn giữa 2 đỉnh dài hơn 300 m (thường là đường thẳng cắt ngang nhà — nhưng cũng có thể là đường cao tốc thẳng thật). Trạm màu cam: cách lộ trình hơn 30 m.
- Bấm **Lưu** để ghi vào CSDL. Rời trang khi chưa lưu sẽ có cảnh báo.

Sau khi sửa xong, ghi CSDL ngược vào file rồi commit:

```bash
cd backend
npm run db:export             # ghi đè database/busdata.sql
git diff --stat database/busdata.sql
```

`busdata.sql` sắp xếp cố định, mỗi bản ghi một dòng, hình học dạng WKT — `git diff` chỉ hiện đúng các tuyến / trạm đã sửa. Xuất lại khi dữ liệu không đổi cho ra file y hệt.

> `npm run db:import` **ghi đè** toàn bộ 4 bảng bằng nội dung file. Nhớ `db:export` trước nếu đã sửa trên editor mà chưa xuất.

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/v1/routes` | Danh sách tuyến |
| GET | `/api/v1/routes/:route_id/path?direction=1\|2` | Lộ trình (GeoJSON Feature, LineString) |
| POST | `/api/v1/routes/:route_id/path` | Ghi đè lộ trình. Body `{ direction, coordinates: [[lon, lat], ...] }` |
| GET | `/api/v1/routes/:route_id/stops?direction=1\|2` | Trạm trên tuyến theo thứ tự |
| PUT | `/api/v1/stops/:stop_id` | Dời trạm. Body `{ longitude, latitude }` |

Toạ độ luôn là WGS84 (EPSG:4326), thứ tự `[lon, lat]`.
