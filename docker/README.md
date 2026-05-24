# Docker — chạy local và deploy VPS

## Cấu trúc repo

Khi build từ thư mục `docker/`, cần đủ các thư mục app cùng cấp:

```
chicstay/
  docker/
  chicstay-api/
  chicstay-merchant/
  chicstay-admin/
  chicstay-booking/
```

## 1. Tạo và quản lý file `.env`

### 1.1 Trên máy local (dev + build/push image)

1. Mở terminal, vào thư mục chứa `docker-compose.yml`:
   ```bash
   cd /đường-dẫn/chicstay/docker
   ```
2. Tạo `.env` từ mẫu:
   ```bash
   cp .env.example .env
   ```
3. Mở `.env` bằng editor (VS Code, `nano`, …) và chỉnh **tối thiểu**:
   - Bốn dòng registry: `API_IMAGE`, `MERCHANT_IMAGE`, `ADMIN_IMAGE`, `BOOKING_IMAGE` — dạng `tên-user-dockerhub/tên-repo:tag` (ví dụ `myuser/chicstay-api:v1`). Phải trùng namespace bạn sở hữu trên Docker Hub.
   - Bảo mật: `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 ký tự ASCII), `MASTER_SEED_PASSWORD`.
   - **Booking:** mặc định để `BOOKING_NEXT_PUBLIC_API_BASE_URL=/api` — trình duyệt gọi cùng origin (port booking, ví dụ 3000), Next.js rewrite sang service `api` trong Docker (**không** nhúng `http://127.0.0.1:8081` vào bundle). Nếu cần gọi thẳng API public (không qua rewrite), đặt URL tuyệt đối có `/api`, ví dụ `http://IP_VPS:8081/api`.
4. Lưu file.

Kiểm tra nhanh Compose đọc được file (từ thư mục `docker/`):

```bash
docker compose config --quiet && echo OK
```

### 1.2 Trên VPS (cùng thư mục với `docker-compose.vps.yml`)

Compose tự đọc file tên **`.env`** nằm **cùng thư mục** với file compose (ví dụ `/opt/chicstay-docker/`). Hai hướng:

**Cách A — copy `.env` từ máy local (nhanh)**

Sau khi bạn đã có `docker/.env` ổn trên máy dev:

```bash
# Đang ở trong thư mục docker/
scp .env user@IP_VPS:/opt/chicstay-docker/.env
```

Hoặc đứng ở **root repo** `chicstay/`:

```bash
scp docker/.env user@IP_VPS:/opt/chicstay-docker/.env
```

SSH vào VPS, mở lại `.env` và **rà soát production**: mật khẩu DB mạnh, `JWT_SECRET` riêng VPS, `APP_CORS_PATTERNS` (domain thật) nếu cần.

**Cách B — tạo mới trên VPS**

1. `ssh user@IP_VPS`
2. `mkdir -p /opt/chicstay-docker && cd /opt/chicstay-docker`
3. Đưa mẫu lên từ máy có repo:
   ```bash
   # Trên máy local, từ thư mục docker/
   scp .env.example user@IP_VPS:/opt/chicstay-docker/.env.example
   ```
4. Trên VPS: `cp .env.example .env` rồi `nano .env` (hoặc `vi .env`), sửa giống **mục 1.1** — đặc biệt **đủ bốn** biến `*_IMAGE` trùng tag đã push lên Hub.

### 1.3 Bảng tham chiếu biến quan trọng

| Nhóm | Biến |
|------|------|
| Registry | `API_IMAGE`, `MERCHANT_IMAGE`, `ADMIN_IMAGE`, `BOOKING_IMAGE` — `namespace/repo:tag`. Trên máy local, **thiếu một trong bốn** khi `docker compose push` dễ bị tag `:local` và registry từ chối. Trên VPS, **thiếu** `ADMIN_IMAGE` / `BOOKING_IMAGE` dễ gây lỗi compose. |
| Bảo mật | `POSTGRES_*`, `JWT_SECRET` (≥ 32 ký tự), `MASTER_SEED_PASSWORD` |
| Booking (lúc build image) | `BOOKING_NEXT_PUBLIC_API_BASE_URL` — mặc định **`/api`** (rewrite → Java trong Compose). Tuỳ chọn: URL tuyệt đối `http://IP:8081/api` nếu muốn trình duyệt gọi thẳng API. |
| Merchant / Admin (Angular) | URL API lấy từ `chicstay-merchant` / `chicstay-admin`: `src/environments/environment*.ts`, **đóng gói lúc build** (`ng build … --configuration docker`). Container trên VPS **không đọc** `docker/.env` cho `apiUrl`. Cấu hình `docker` dùng `apiUrl: "/api/"`; nginx trong image reverse-proxy `/api/` → service `api`. Trên trình duyệt, gọi API có dạng `http://IP:3001/api/...` — **`/login` chỉ là route SPA**, không phải endpoint API. |

### 1.4 Lỗi thường gặp

- Chạy `docker compose` mà **chưa `cd`** vào thư mục có `.env` → Compose không thấy biến. Luôn `cd` đúng thư mục (`docker/` trên local, `/opt/chicstay-docker/` trên VPS) hoặc dùng `--env-file /đường/dẫn/.env`.
- Tên file sai (`env`, `.env.local`) — file VPS phải đúng **`.env`** cạnh `docker-compose.vps.yml` (trừ khi bạn tự cấu hình `--env-file`).

## 2. Chạy stack trên máy local

```bash
cd docker
docker compose build
docker compose up -d
```

## 3. Build image cho VPS và đẩy lên Docker Hub

Image app dùng `platform: linux/amd64` trong `docker-compose.yml` (VPS thường amd64).

```bash
cd docker
docker login
docker compose build api merchant admin booking
docker compose push api merchant admin booking
```

Sau mỗi lần đổi code hoặc đổi tag trong `.env`, build rồi push lại.

**Build `api` trên Mac ARM (`platform: linux/amd64`):** QEMU dễ gây **SIGSEGV** hoặc **javac** NPE (`UnsharedNameTable`). `Dockerfile.api` dùng Maven **Amazon Corretto 21** cho stage compile; runtime vẫn **Temurin JRE 21** Alpine. Nếu vẫn lỗi, build API trên **Linux amd64** (CI/VPS) rồi push.

## 4. Triển khai trên VPS

Thư mục deploy (ví dụ `/opt/chicstay-docker`) cần:

- `docker-compose.vps.yml` — **trùng** `docker/docker-compose.vps.yml` trong repo (**7** service: `postgres`, `redis`, `rabbitmq`, `api`, `merchant`, `admin`, `booking`). Xem **mục 1** để có `.env` đầy đủ bốn `*_IMAGE`.

Copy compose từ máy dev (chọn đúng đường dẫn):

```bash
# Đang ở root repo chicstay/
scp docker/docker-compose.vps.yml user@IP_VPS:/opt/chicstay-docker/

# Đang ở trong thư mục docker/
scp docker-compose.vps.yml user@IP_VPS:/opt/chicstay-docker/
```

Kiểm tra trên VPS:

```bash
cd /opt/chicstay-docker
docker compose -f docker-compose.vps.yml config --services
```

### Lần đầu

```bash
ssh user@IP_VPS
sudo mkdir -p /opt/chicstay-docker
cd /opt/chicstay-docker
docker login
docker compose -f docker-compose.vps.yml pull
docker compose -f docker-compose.vps.yml up -d
```

### Cập nhật khi đã có image mới trên Hub

```bash
cd /opt/chicstay-docker
docker login
docker compose -f docker-compose.vps.yml pull
docker compose -f docker-compose.vps.yml up -d
```

Dừng toàn bộ stack:

```bash
docker compose -f docker-compose.vps.yml down
```

## 5. Log và kiểm tra nhanh

Giả sử đang ở thư mục chứa `docker-compose.vps.yml`:

```bash
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs api --tail 100
docker compose -f docker-compose.vps.yml logs api -f --tail 200
```

API (mặc định port 8081): OpenAPI `http://<host>:8081/v3/api-docs`, Swagger UI `http://<host>:8081/swagger-ui.html`.

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/v3/api-docs
```

Kiểm tra từ trong container (bỏ qua firewall máy host):

```bash
docker compose -f docker-compose.vps.yml exec api wget -qO- http://127.0.0.1:8081/v3/api-docs | head -c 200
```

Nếu `exec` báo service không chạy: `docker compose -f docker-compose.vps.yml ps -a` và `logs api --tail 400`. Trong `ps`, service `api` cần map port host (ví dụ `0.0.0.0:8081->8081`).

Lọc lỗi gần đây:

```bash
docker compose -f docker-compose.vps.yml logs api --tail 300 2>&1 | grep -E "ERROR|Exception|Caused by|Failed"
```

## 6. Database và profile API

Profile `docker` mặc định: `JPA_DDL_AUTO=update`, `FLYWAY_ENABLED=false` — phù hợp DB trống (Hibernate tạo bảng). Nếu restore dump / schema có sẵn, cân nhắc `validate` + bật Flyway trong cấu hình tương ứng.

## 7. Firewall và lưu ý cuối

- Mở các port dùng ra ngoài: `API_PORT`, `MERCHANT_PORT`, `ADMIN_PORT`, `BOOKING_PORT` (ví dụ `ufw allow 8081/tcp`).
- Repo image **private** trên Hub: VPS cần `docker login` cùng tài khoản có quyền pull.
- Đổi `JWT_SECRET` hoặc biến env khác: sửa `.env` trên VPS rồi `docker compose -f docker-compose.vps.yml up -d`.
