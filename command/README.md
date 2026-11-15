# LF Command Center

Bảng điều hành tổng hợp 2 kênh: **Global** (Lignarc · Wayfair CastleGate / Amazon, phụ trách Thuỳ Trang) và **Local** (Kệ 3 tầng · Shopee, phụ trách Đình Phú).

- Live: `https://khoimr11.github.io/Lignarc-Dashboard/command/` · bản demo: thêm `?demo=1`
- Dữ liệu: đọc thẳng file mã hoá của 2 dash gốc (`../data/lignarc.enc.json`, `/LF---B2C-Local/data/data.enc.json`), giải mã trong trình duyệt nên số liệu khớp 100% với dash gốc.
- Engine (`assets/engine.js`): 60 luật tự phát hiện issue/cơ hội, chia P0–P3, người phụ trách, SLA, next steps, điều kiện tự đóng. Playbook (`assets/playbook.js`) do agent Giám đốc E-commerce soạn: 75 luật, 20 việc định kỳ, mẫu tin nhắn giao việc / nhắc nhở / cảnh cáo / ghi nhận.
- Sổ giao việc (`backend/Code.gs`): Google Apps Script + Google Sheet. Chỉ ghi thêm (append-only), thời gian lấy theo giờ máy chủ. Nhân viên chỉ thấy kênh của mình và không tự duyệt được. Gửi email bản tin lúc 08:15 mỗi sáng.

## Cài đặt lần đầu
1. Tạo Google Sheet mới "LF Command Center log" › Extensions › Apps Script › dán `backend/Code.gs` › chạy `setup()` (cấp quyền) › copy **ADMIN secret** trong Execution log.
2. Deploy › New deployment › Web app · Execute as **Me** · Who has access **Anyone** › copy URL `/exec`.
3. Mở `command/setup.html`: dán URL + ADMIN, đăng nhập 2 dash nguồn, tạo 3 tài khoản (chị Nhi, Trang, Phú).
4. Gửi link đăng nhập cho Trang & Phú. Gắn URL `/exec` vào `assets/config.js` (`API_URL`).

## Luật trách nhiệm
- Tuổi issue tính từ lúc sự việc xảy ra trên sàn. Quá SLA (P0 24h · P1 72h · P2 7 ngày) mà chưa giao việc thì tự nâng 1 bậc.
- P0/P1 tồn ≥ 24h mà nhân viên chưa bấm "Em đã nắm" thì tính **Miss báo cáo**.
- Việc quá hạn tự nâng 1 bậc. Cùng một lỗi lặp lại lần 2 trong 30 ngày thì gắn cờ **Nhắc nhở**, lần 3 thì **Cảnh cáo**.
- Nhân viên báo xong nhưng luật vẫn còn bắt lỗi thì hiện cờ **"Báo xong nhưng dữ liệu vẫn còn lỗi"**. Việc chỉ đóng khi quản lý duyệt.
