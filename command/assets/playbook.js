/* Playbook written by the E-commerce Director agent: rule rationale & next steps, recurring duties, message templates. */
window.CCPB = {
"routines": [
{
"id": "R-T-DAILY-CHECK",
"owner": "trang",
"title": "Kiểm tra dashboard Global sau sync, xử lý mọi cảnh báo P0",
"cadence": "daily",
"due": "Hằng ngày 15:30",
"verify": "rule:G-DATA-STALE",
"evidence": ""
},
{
"id": "R-T-INC-DAILY",
"owner": "trang",
"title": "Rà case mới trên Partner Home, ghi nguyên nhân + phương án",
"cadence": "daily",
"due": "Hằng ngày 16:00",
"verify": "rule:G-INC-NEW",
"evidence": ""
},
{
"id": "R-T-INC-CHECK",
"owner": "trang",
"title": "Cập nhật dữ liệu Incidents & Returns vào dash (task thứ 5)",
"cadence": "weekly",
"due": "Thứ 5 12:00",
"verify": "rule:G-INC-CHECK",
"evidence": ""
},
{
"id": "R-T-INC-WEEKLY",
"owner": "trang",
"title": "Báo cáo incident/return/deduction tuần (số case, $, nguyên nhân, dispute)",
"cadence": "weekly",
"due": "Thứ 5 12:00",
"verify": "evidence",
"evidence": "báo cáo tuần trên dashboard + 0 case quá SLA (G-INC-NEW, G-DED-UNREC)"
},
{
"id": "R-T-DED-RECON",
"owner": "trang",
"title": "Đối soát Remittance và khấu trừ Wayfair",
"cadence": "weekly",
"due": "Thứ 3 17:00",
"verify": "rule:G-DED-LARGE",
"evidence": ""
},
{
"id": "R-T-ADS-WEEKLY",
"owner": "trang",
"title": "Tối ưu Wayfair Ads: cắt campaign/listing lãng phí, tăng campaign tốt",
"cadence": "weekly",
"due": "Thứ 2 12:00",
"verify": "rule:G-ADS-WASTE",
"evidence": ""
},
{
"id": "R-T-CONTENT",
"owner": "trang",
"title": "Cập nhật tiến độ Waymore / Premium A+ / Brand Store (tối thiểu 2 SKU/tuần)",
"cadence": "weekly",
"due": "Thứ 2 10:00",
"verify": "evidence",
"evidence": "ảnh chụp trạng thái Waymore/A+ cho >= 2 SKU mới mỗi tuần"
},
{
"id": "R-T-CG-STOCK",
"owner": "trang",
"title": "Rà đồng hồ lưu kho CastleGate theo PO và weeks of cover",
"cadence": "weekly",
"due": "Thứ 4 12:00",
"verify": "rule:G-CG-STORAGE",
"evidence": ""
},
{
"id": "R-T-TT",
"owner": "trang",
"title": "Theo dõi đơn Tried & True và review",
"cadence": "weekly",
"due": "Thứ 6 12:00",
"verify": "evidence",
"evidence": ""
},
{
"id": "R-T-MONTHLY",
"owner": "trang",
"title": "Báo cáo tháng Global: doanh thu, lãi, %mkt vs Cashflow 26+27, kế hoạch tháng sau",
"cadence": "monthly",
"due": "Ngày 3 hằng tháng 17:00",
"verify": "evidence",
"evidence": "file/link báo cáo tháng được chị Nhi duyệt"
},
{
"id": "R-P-ORDER-AM",
"owner": "phu",
"title": "Xác nhận và chuẩn bị toàn bộ đơn mới",
"cadence": "daily",
"due": "Hằng ngày 11:00",
"verify": "rule:L-ORD-UNCONFIRMED",
"evidence": ""
},
{
"id": "R-P-PICKUP",
"owner": "phu",
"title": "Bàn giao vận chuyển đơn chờ lấy hàng",
"cadence": "daily",
"due": "Hằng ngày 16:00",
"verify": "rule:L-ORD-NOT-PICKED",
"evidence": ""
},
{
"id": "R-P-REVIEW",
"owner": "phu",
"title": "Phản hồi toàn bộ đánh giá mới (1–3★ ưu tiên)",
"cadence": "daily",
"due": "Hằng ngày 17:00",
"verify": "rule:L-REV-NEG-UNREPLIED",
"evidence": ""
},
{
"id": "R-P-RETURN",
"owner": "phu",
"title": "Xử lý yêu cầu trả hàng/hoàn tiền",
"cadence": "daily",
"due": "Hằng ngày 17:00",
"verify": "rule:L-RETURN-NEW",
"evidence": ""
},
{
"id": "R-P-FS-WEEKLY",
"owner": "phu",
"title": "Đăng ký Flash Sale đủ slot 7–14 ngày tới (giá >= 315.000₫)",
"cadence": "weekly",
"due": "Thứ 2 12:00",
"verify": "rule:L-FS-NONE",
"evidence": ""
},
{
"id": "R-P-PROMO-WEEKLY",
"owner": "phu",
"title": "Rà voucher, shop discount, tồn sàn cho tuần tới",
"cadence": "weekly",
"due": "Thứ 2 15:00",
"verify": "rule:L-VOUCHER-ENDING",
"evidence": ""
},
{
"id": "R-P-ADS-WEEKLY",
"owner": "phu",
"title": "Tối ưu Shopee Ads và đối soát ví (free credit vs tiền nạp)",
"cadence": "weekly",
"due": "Thứ 3 12:00",
"verify": "rule:L-ADS-ACOS",
"evidence": ""
},
{
"id": "R-P-WH-WEEKLY",
"owner": "phu",
"title": "Đối chiếu tồn kho Suối Nghệ với tồn sàn và kế hoạch xả kho",
"cadence": "weekly",
"due": "Thứ 6 15:00",
"verify": "evidence",
"evidence": "biên bản kiểm kê tuần (số thực tế) khớp tồn sàn ± 2 kệ"
},
{
"id": "R-P-MONTHLY",
"owner": "phu",
"title": "Báo cáo tháng Local: units vs kế hoạch, thực nhận/kệ, phí, kế hoạch tháng sau",
"cadence": "monthly",
"due": "Ngày 3 hằng tháng 17:00",
"verify": "evidence",
"evidence": "file/link báo cáo tháng được chị Nhi duyệt"
},
{
"id": "R-M-WEEKLY-REVIEW",
"owner": "manager",
"title": "Họp tuần: duyệt việc quá hạn, cờ Nhắc nhở/Cảnh cáo, ghi nhận làm tốt",
"cadence": "weekly",
"due": "Thứ 6 16:00",
"verify": "evidence",
"evidence": "biên bản họp tuần trên dashboard"
}
],
"messages": {
"assign": "Chào {name},\nHệ thống ghi nhận việc cần em xử lý:\n[{taskId}] {title}\nChi tiết: {detail}\nCác bước cần làm:\n{steps}\nHạn hoàn thành: {deadline}\nĐiều kiện đóng việc: {closeWhen}\nEm xác nhận đã nhận việc và cập nhật kết quả trên dashboard trước hạn nhé. Cảm ơn em.",
"remind": "Chào {name},\nViệc [{taskId}] {title} đã quá hạn ({deadline}) và chưa đạt điều kiện đóng: {closeWhen}.\nChi tiết hiện tại: {detail}\nMức độ ưu tiên đã được nâng lên một cấp. Em phản hồi trong vòng 4 giờ: nguyên nhân chậm trễ và thời điểm hoàn thành mới.\nCác bước còn lại:\n{steps}\nChị cần em chủ động báo cáo khi có vướng mắc, không chờ hệ thống nhắc.",
"warning": "CẢNH CÁO – {name}\nVấn đề [{taskId}] {title} đã lặp lại {count} lần trong 30 ngày (các ngày: {detail}).\nĐây là lần cảnh cáo chính thức và được lưu vào hồ sơ đánh giá hiệu suất.\nYêu cầu:\n1. Nộp phân tích nguyên nhân gốc và biện pháp phòng ngừa trước {deadline}.\n2. Hoàn thành các bước: {steps}\n3. Việc chỉ được đóng khi: {closeWhen}\nNếu tái phát lần tiếp theo, chị sẽ trao đổi trực tiếp về trách nhiệm công việc.",
"praise": "Chào {name},\nChị ghi nhận em đã xử lý tốt [{taskId}] {title} — {detail}, hoàn thành trước hạn {deadline} và dữ liệu đã xác nhận kết quả.\nCách làm chủ động như vậy là đúng tinh thần chị mong muốn. Em tiếp tục phát huy nhé. Cảm ơn em!"
},
"meta": {
"G-DATA-STALE": {
"why": "Không có dữ liệu Wayfair thì mọi cảnh báo incident, tồn kho, ads đều mù — sự cố sẽ lọt.",
"steps": [
"Kiểm tra log sync và token đăng nhập Wayfair Partner Home, chạy lại sync thủ công",
"Nếu lỗi do Wayfair đổi định dạng file, tải report thủ công (Orders, CastleGate Inventory, Ads) và upload tạm",
"Báo chị Nhi nguyên nhân + thời gian khắc phục dự kiến trong 2 giờ"
],
"close": "now - global.dataFreshness <= 26h",
"trigger": "now - global.dataFreshness > 26h (lỡ lượt sync 14:23 hằng ngày)"
},
"L-DATA-STALE": {
"why": "Mất dữ liệu đơn/review/ads Shopee khiến đơn trễ, review xấu không được phát hiện kịp.",
"steps": [
"Đăng nhập lại Shopee Seller Centre trên máy chạy collector, kiểm tra cookie/phiên hết hạn",
"Chạy lại collector thủ công và xác nhận số đơn hôm qua khớp Seller Centre",
"Báo chị Nhi nếu không khắc phục được trong 2 giờ"
],
"close": "now - local.dataFreshness <= 26h",
"trigger": "now - local.dataFreshness > 26h (lỡ lượt sync 15:41 hằng ngày)"
},
"X-DATA-EMPTY": {
"why": "Pipeline 'xanh' nhưng dữ liệu sai còn nguy hiểm hơn pipeline chết vì không ai nghi ngờ.",
"steps": [
"Đối chiếu số đơn hôm qua trên Seller Centre/Partner Home với dashboard",
"Giao owner kênh kiểm tra bộ lọc, cột dữ liệu, quyền tài khoản xuất report",
"Đánh dấu dữ liệu ngày đó 'chưa xác thực' cho tới khi khớp"
],
"close": "Số đơn dashboard khớp sàn (chênh lệch <= 1 đơn) trong lần sync kế tiếp",
"trigger": "Sync thành công nhưng orders_1d = 0 trong khi avg orders 7d >= 1 trên cùng kênh, HOẶC số dòng giảm > 80% so với lần sync trước"
},
"X-TARGET-MISSING": {
"why": "Không có target thì không đo được pace, toàn bộ cảnh báo doanh số bị vô hiệu.",
"steps": [
"Cập nhật target tháng vào sheet Cashflow 26+27",
"Xác nhận với Trang/Phú target đã chốt",
"Chạy lại sync để dashboard nhận target"
],
"close": "target tháng hiện tại tồn tại và > 0 cho cả hai kênh",
"trigger": "Sheet Cashflow 26+27 không có dòng target (rev, unit, profit, mkt) cho tháng hiện tại, HOẶC local.planUnits không có tháng hiện tại"
},
"G-AMZ-API-PENDING": {
"why": "Không có dữ liệu Amazon thì đơn FBM, ads và chi phí Amazon nằm ngoài kiểm soát.",
"steps": [
"Vào Seller Central > Partner Network > Develop Apps kiểm tra trạng thái và yêu cầu bổ sung",
"Mở case Seller Support nếu quá 14 ngày không phản hồi, lưu case ID",
"Trong lúc chờ: xuất report Orders và Advertising hằng tuần thủ công gửi chị Nhi"
],
"close": "amazon.apiStatus == 'approved' AND amazon.orders có dữ liệu sync",
"trigger": "amazon.apiStatus != 'approved' AND số ngày từ khi nộp hồ sơ > 14"
},
"G-AMZ-FBM-UNSHIPPED": {
"why": "Late Shipment Rate > 4% có thể khiến Amazon khoá quyền bán.",
"steps": [
"Vào Seller Central > Orders > Manage Orders, lọc Unshipped",
"Liên hệ kho/nhà vận chuyển lấy tracking, nhập Confirm Shipment",
"Nếu không giao được, chủ động Cancel với lý do đúng trước hạn Ship-by"
],
"close": "Không còn đơn Unshipped quá 24h",
"trigger": "amazon.order.status == 'Unshipped' AND now - order.purchaseDate > 24h (chỉ chạy khi API đã có dữ liệu)"
},
"G-PACE": {
"why": "Đi chậm 10% giữa tháng gần như chắc chắn hụt target cuối tháng nếu không can thiệp.",
"steps": [
"Xác định 3 SKU kéo hụt nhiều nhất (so sánh units/ngày tháng này vs tháng trước)",
"Đề xuất hành động cụ thể: tăng bid Wayfair Sponsored Products, đăng ký Wayfair promotion/Way Day, kiểm tra tồn CastleGate",
"Gửi chị Nhi kế hoạch bù hụt kèm projection cuối tháng"
],
"close": "global pace revenue >= 90% trong 3 lần sync liên tiếp",
"trigger": "dayOfMonth >= 5 AND 75% <= global.mtd.revenue / (target.rev × dayOfMonth / daysInMonth) < 90%"
},
"G-UNIT-PACE": {
"why": "Thiếu units làm hàng nằm lâu ở CastleGate, tiến gần mốc tính phí lưu kho.",
"steps": [
"Liệt kê SKU có units/ngày giảm > 30% so với 4 tuần trước",
"Kiểm tra giá bán, Buy Box/hiển thị trên trang Wayfair của các SKU này",
"Đề xuất promotion hoặc tăng ads cho SKU tồn cao"
],
"close": "global pace units >= 90% trong 3 lần sync liên tiếp",
"trigger": "dayOfMonth >= 5 AND global.mtd.units / (target.unit × dayOfMonth / daysInMonth) < 90%"
},
"G-PROFIT-PACE": {
"why": "Doanh thu có thể đạt nhưng lãi hụt do khấu trừ, ads, giảm giá sâu.",
"steps": [
"Bóc tách lãi theo SKU: so profit thực vs kế hoạch, chỉ ra chi phí vượt (ads, deduction, promotion)",
"Cắt các campaign/promotion đang làm SKU lỗ",
"Gửi chị Nhi bảng nguyên nhân và mức lãi phục hồi dự kiến"
],
"close": "global.projection.profit >= 90% target.profit trong 3 lần sync liên tiếp",
"trigger": "dayOfMonth >= 7 AND global.projection.profit < 90% target.profit"
},
"G-MARGIN-LOW": {
"why": "Biên mỏng khiến mỗi incident hoặc deduction là lỗ ròng.",
"steps": [
"Xếp hạng SKU theo margin 14d, đánh dấu SKU < 10%",
"Kiểm tra giá wholesale, promotion đang chạy và chi phí ads của SKU đó",
"Đề xuất điều chỉnh giá hoặc dừng promotion, gửi chị Nhi duyệt"
],
"close": "global.margin 14d >= 15% AND >= target margin - 5pp",
"trigger": "global.margin (rolling 14d) < 15%, HOẶC global.margin 14d < (target.profit / target.rev) - 5pp"
},
"G-SKU-NEG-PROFIT": {
"why": "Bán càng nhiều càng lỗ — mất tiền không thu hồi được.",
"steps": [
"Bóc tách chi phí SKU: deduction, return, ads, promotion",
"Tạm dừng ads/promotion của SKU trên Wayfair Advertising",
"Đề xuất giá mới hoặc phương án xả hàng có kiểm soát cho chị Nhi"
],
"close": "sku.profit 14d >= 0",
"trigger": "sku.profit 30d < 0 AND sku.units 30d >= 3"
},
"G-MKT-OVER": {
"why": "Vượt ngân sách marketing ăn trực tiếp vào lãi tháng.",
"steps": [
"Liệt kê campaign/promotion chiếm chi phí lớn nhất MTD",
"Giảm daily budget hoặc bid các campaign ROAS thấp trong Wayfair Advertising",
"Báo chị Nhi mức %mkt dự kiến cuối tháng sau điều chỉnh"
],
"close": "global.mktPct MTD <= target.mkt% + 1pp",
"trigger": "global.mktPct MTD > target.mkt% + 2pp (target.mkt% = target.mkt / target.rev)"
},
"G-TACOS-HIGH": {
"why": "Ads chiếm quá lớn doanh thu tổng — doanh số đang 'mua' chứ không tự nhiên.",
"steps": [
"Kiểm tra campaign nào tăng spend mạnh trong 7 ngày",
"Hạ bid các keyword/listing chi tiêu cao không ra đơn",
"Cập nhật kế hoạch ads tuần gửi chị Nhi"
],
"close": "global.tacos 7d <= 10%",
"trigger": "global.tacos 7d > 12%"
},
"G-INC-NEW": {
"why": "Incident không báo cáo và không xử lý là tiền bị trừ âm thầm và rủi ro chỉ số tài khoản.",
"steps": [
"Mở case trên Partner Home > Orders & Shipping, đọc chi tiết, tải ảnh khách gửi",
"Ghi nguyên nhân (đóng gói, vận chuyển, lỗi sản phẩm, sai mô tả) và phương án vào comment case trên dashboard",
"Nếu có căn cứ, gửi dispute/claim; nếu lỗi do mình, đề xuất khắc phục gốc"
],
"close": "case.handled == true (có comment nguyên nhân + phương án) AND (deduction đã đối soát HOẶC dispute đã gửi có ID)",
"trigger": "incident.case tồn tại AND case.handled == false (chưa có comment xử lý/phương án) AND now - case.date > 24h. Nâng P0 nếu type == 'Damaged' AND deduction >= 100 USD"
},
"G-INC-EVIDENCE": {
"why": "Ảnh/video của khách là bằng chứng để claim với hãng vận chuyển hoặc dispute deduction — bỏ qua là mất tiền.",
"steps": [
"Tải toàn bộ ảnh/video, đối chiếu với ảnh đóng gói xuất kho",
"Nếu hư hỏng do vận chuyển: gửi Carrier claim/Dispute qua Partner Home > Support > Case",
"Nhập dispute ID và số tiền claim vào dashboard"
],
"close": "evidence: dispute ID/case ID Wayfair + kết quả (approved/denied) được nhập",
"trigger": "case.photos.count > 0 AND case.deduction > 0 AND không có dispute ID AND now - case.date > 5 ngày"
},
"G-INC-RATE": {
"why": "Incident rate cao làm Wayfair hạ hiển thị, tăng khấu trừ và có thể hạn chế tài khoản.",
"steps": [
"Phân loại case 30 ngày theo SKU và type (Damaged/Return/Mis-information)",
"Chỉ ra 1–2 nguyên nhân gốc chiếm > 50% case",
"Trình chị Nhi phương án khắc phục (gia cố thùng, sửa mô tả, đổi nhà vận chuyển) có deadline"
],
"close": "global.incidentRate 30d <= 3%",
"trigger": "global.incidentRate 30d > 3%; nâng P0 nếu > 5%"
},
"G-BRR-HIGH": {
"why": "Trả hàng nội thất cồng kềnh gần như mất trắng phí vận chuyển và hàng.",
"steps": [
"Đọc lý do trả hàng từng case trong Partner Home",
"Đối chiếu lý do với listing (kích thước, màu, chất liệu) để tìm sai lệch",
"Cập nhật ảnh/mô tả hoặc thông số qua Partner Home > Product Management"
],
"close": "global.BRR 30d <= 4%",
"trigger": "global.BRR 30d > 5% AND số đơn 30d >= 20"
},
"G-INC-REPEAT-SKU": {
"why": "Lỗi lặp là lỗi hệ thống (đóng gói/sản phẩm/mô tả), không xử lý gốc sẽ tiếp tục mất tiền.",
"steps": [
"Tổng hợp ảnh các case, xác định điểm hư hỏng chung",
"Làm việc với nhà máy về đóng gói/QC, lưu biên bản",
"Gửi chị Nhi báo cáo nguyên nhân gốc + hành động khắc phục"
],
"close": "evidence: báo cáo nguyên nhân gốc + xác nhận nhà máy; tự đóng hẳn khi SKU 0 case cùng type trong 30 ngày tiếp theo",
"trigger": "Cùng SKU có >= 3 case cùng type trong 30 ngày"
},
"G-INC-MISINFO": {
"why": "Sai mô tả sẽ sinh ra trả hàng liên tục cho tới khi listing được sửa.",
"steps": [
"Xác định thông tin sai (kích thước, màu, chất liệu, lắp ráp) từ comment khách",
"Gửi cập nhật qua Partner Home > Product Management > Edit Product",
"Chụp màn hình trước/sau và đính kèm vào case"
],
"close": "evidence: ảnh chụp listing đã sửa + mã yêu cầu cập nhật được Wayfair chấp nhận",
"trigger": "case.type == 'Mis-information' AND listing SKU chưa được cập nhật sau case.date"
},
"G-DED-UNREC": {
"why": "Khấu trừ không đối soát là tiền mất mà không ai chịu trách nhiệm hay đòi lại.",
"steps": [
"Khớp khoản khấu trừ với case/PO trong Partner Home > Finance > Remittance",
"Xác định khấu trừ đúng hay sai; nếu sai, mở dispute",
"Cập nhật trạng thái đối soát và ghi chú trên dashboard"
],
"close": "deduction.reconciled == true (đã gắn case/PO hoặc dispute ID)",
"trigger": "deduction.reconciled == false AND now - deduction.date > 14 ngày"
},
"G-DED-LARGE": {
"why": "Khấu trừ lớn ảnh hưởng trực tiếp dòng tiền và thường là dấu hiệu vi phạm compliance.",
"steps": [
"Xác định loại khấu trừ (chargeback, compliance, damage, ASN) trong Remittance",
"Mở dispute trong 24h nếu có căn cứ",
"Báo chị Nhi số tiền, nguyên nhân và khả năng thu hồi"
],
"close": "Khoản đã reconciled AND (dispute ID tồn tại HOẶC xác nhận khấu trừ hợp lệ có nguyên nhân ghi rõ)",
"trigger": "Một khoản deduction >= 200 USD, HOẶC tổng deduction 30d > 2% global.nmv 30d"
},
"G-CG-STORAGE": {
"why": "Quá 90 ngày CastleGate bắt đầu tính phí lưu kho trên toàn bộ tồn của PO.",
"steps": [
"Liệt kê SKU/units còn lại của PO và weeks of cover hiện tại",
"Đề xuất đẩy bán: promotion Wayfair, tăng bid ads cho các SKU này",
"Ước tính phí lưu kho nếu không bán hết, gửi chị Nhi"
],
"close": "po.remainingUnits == 0, HOẶC evidence: kế hoạch xả hàng được chị Nhi duyệt",
"trigger": "14 < (po.receiveDate + 90 - today) <= 30 AND po.remainingUnits > 0"
},
"G-CG-FEE-START": {
"why": "Từ 31/12/2026 lô hàng đầu bắt đầu chịu phí lưu kho mỗi tháng.",
"steps": [
"Tính số units lô đầu dự kiến còn lại ngày 31/12 theo tốc độ bán hiện tại",
"Ước tính phí lưu kho tháng 1/2027 theo bảng phí CastleGate",
"Gửi chị Nhi kế hoạch xả trước 31/12"
],
"close": "tồn lô đầu == 0, HOẶC evidence: kế hoạch đã duyệt + phí dự kiến được đưa vào Cashflow",
"trigger": "today >= 2026-12-01 AND today < 2026-12-31 AND tồn CastleGate thuộc lô đầu > 0"
},
"G-OOS": {
"why": "Hết hàng làm mất doanh số và tụt thứ hạng listing trên Wayfair.",
"steps": [
"Kiểm tra inbound PO và ngày nhận dự kiến",
"Tạm dừng ads của SKU để tránh lãng phí",
"Lập đề xuất đặt hàng khẩn với nhà máy, gửi chị Nhi"
],
"close": "sku.onHand > 0",
"trigger": "sku.onHand == 0 AND sku.units 30d > 0 AND không có inbound PO nhận trong 7 ngày"
},
"G-OOS-RISK": {
"why": "Lead time ~10 tuần: không đặt bây giờ thì chắc chắn đứt hàng.",
"steps": [
"Tính số lượng đặt = (lead time + 8 tuần) × units/tuần - (onHand + inbound)",
"Xác nhận năng lực và giá với nhà máy",
"Gửi đề xuất PO cho chị Nhi duyệt"
],
"close": "sku.weeksOfCover (tính cả PO đã đặt) >= 10",
"trigger": "sku.weeksOfCover (onHand + inbound) / avg units per week 28d < 10 tuần; nâng P0 nếu < 6 tuần"
},
"G-OVERSTOCK": {
"why": "Tồn > 6 tháng chắc chắn chịu phí lưu kho và chôn vốn.",
"steps": [
"Lên kế hoạch promotion/ads riêng cho SKU",
"Ngưng mọi PO bổ sung SKU này",
"Đánh giá chuyển một phần sang Amazon"
],
"close": "sku.weeksOfCover <= 20",
"trigger": "sku.weeksOfCover > 26 AND sku.onHand >= 20"
},
"G-DEAD-SKU": {
"why": "Hàng đứng yên vẫn chạy đồng hồ lưu kho CastleGate.",
"steps": [
"Kiểm tra listing có đang hiển thị (không bị suppress, giá đúng) trên Wayfair",
"Bật/tăng Sponsored Products cho SKU",
"Đề xuất promotion nếu 7 ngày tiếp vẫn 0 đơn"
],
"close": "sku.units 7d >= 1",
"trigger": "sku.onHand > 0 AND sku.units 14d == 0"
},
"G-ADS-WASTE": {
"why": "Ngân sách ads bị đốt không tạo doanh thu.",
"steps": [
"Mở Wayfair Advertising > campaign, xem listing/keyword chi tiêu cao nhất",
"Hạ bid 30% hoặc pause listing không ra đơn",
"Ghi lại thay đổi và theo dõi 7 ngày"
],
"close": "campaign.orders 7d >= 1, HOẶC campaign.spend 7d < 10 USD (đã pause/hạ bid)",
"trigger": "campaign.spend 7d >= 50 USD AND campaign.orders 7d == 0"
},
"G-ADS-ACOS": {
"why": "ACoS > 30% với biên nội thất hiện tại là bán lỗ.",
"steps": [
"Xác định listing có ACoS cao nhất trong campaign",
"Giảm bid theo công thức bid mới = bid hiện tại × (25% / ACoS hiện tại)",
"Theo dõi lại sau 7 ngày"
],
"close": "campaign ACoS 7d <= 25%",
"trigger": "campaign.spend 7d >= 30 USD AND campaign.spend / campaign.sales 7d > 30%"
},
"G-ADS-ROAS-LOW": {
"why": "ROAS < 3 không đủ bù chi phí ads với biên hiện tại.",
"steps": [
"Xếp hạng campaign theo ROAS 7d",
"Chuyển ngân sách từ campaign ROAS < 2 sang campaign ROAS >= 5",
"Báo kế hoạch phân bổ ngân sách tuần với chị Nhi"
],
"close": "ROAS tổng 7d >= 3.5",
"trigger": "sum(sales) / sum(spend) toàn bộ campaign 7d < 3 AND spend 7d >= 100 USD"
},
"G-ADS-LISTING-ZERO": {
"why": "Listing kém chuyển đổi đang ăn ngân sách của listing tốt.",
"steps": [
"Kiểm tra giá, ảnh, review của listing so với đối thủ trên Wayfair",
"Tách listing khỏi campaign hoặc hạ bid về mức tối thiểu",
"Đề xuất cải thiện content nếu clicks cao nhưng không mua"
],
"close": "listing.adOrders 14d >= 1, HOẶC listing.adSpend 7d < 5 USD",
"trigger": "listing.adSpend 14d >= 30 USD AND listing.adOrders 14d == 0"
},
"G-ADS-STOPPED": {
"why": "Ads dừng không chủ đích làm sụt traffic và doanh số ngay lập tức.",
"steps": [
"Kiểm tra trạng thái campaign và phương thức thanh toán trong Wayfair Advertising",
"Bật lại campaign hoặc xác nhận lý do dừng có chủ đích",
"Báo chị Nhi nếu dừng do thanh toán/tài khoản"
],
"close": "sum(campaign.spend) 1d > 0, HOẶC evidence: chị Nhi xác nhận dừng có chủ đích",
"trigger": "sum(campaign.spend) 3d == 0 AND target.mkt tháng > 0"
},
"G-TT-FOLLOW": {
"why": "Tried & True là nguồn review sớm quan trọng cho SKU mới; bỏ quên là phí mất trắng.",
"steps": [
"Kiểm tra trạng thái review trong Partner Home > Tried & True",
"Ghi nhận review (sao, nội dung) vào dashboard",
"Nếu review xấu, mở incident nội bộ và đề xuất khắc phục"
],
"close": "evidence: link/ảnh chụp review Tried & True hoặc xác nhận khách không review sau 30 ngày",
"trigger": "triedTrue.order đã giao AND now - deliveredDate > 14 ngày AND không có review/ghi chú theo dõi"
},
"G-CONT-WAYMORE": {
"why": "Thiếu Waymore làm listing kém hấp dẫn, giảm chuyển đổi so với đối thủ.",
"steps": [
"Lập danh sách SKU thiếu Waymore, ưu tiên top doanh số",
"Chuẩn bị ảnh lifestyle/video và gửi trong Partner Home > Waymore",
"Cập nhật tiến độ từng SKU trên dashboard mỗi thứ 2"
],
"close": "evidence: ảnh chụp trạng thái Live trong Waymore cho SKU",
"trigger": "sku.active == true AND sku.waymoreStatus != 'live'"
},
"G-CONT-APLUS": {
"why": "A+ cao cấp tăng chuyển đổi rõ rệt cho SKU giá trị cao.",
"steps": [
"Soạn module A+ (so sánh, kích thước, chất liệu) cho SKU",
"Gửi duyệt trên Seller Central > A+ Content Manager / tương đương Wayfair",
"Nộp link/ảnh chụp trạng thái lên dashboard"
],
"close": "evidence: ảnh chụp A+ trạng thái Approved/Live",
"trigger": "sku thuộc top 5 doanh thu 30d (Wayfair hoặc Amazon) AND aplusStatus != 'approved'"
},
"G-CONT-BRANDSTORE": {
"why": "Brand Store là nơi gom traffic thương hiệu và cross-sell bộ sưu tập.",
"steps": [
"Cập nhật trang theo bộ sưu tập (Kathryn, Calix, Zena, Vestra)",
"Gắn SKU mới, gỡ SKU hết hàng",
"Gửi link Brand Store cho chị Nhi duyệt"
],
"close": "evidence: link Brand Store live + ngày cập nhật",
"trigger": "brandStore.status != 'live' OR brandStore.lastUpdate > 60 ngày"
},
"G-OPP-SCALE-ADS": {
"why": "Campaign đang lãi tốt có thể tăng doanh số mà không phá biên.",
"steps": [
"Tăng daily budget 20–30% trong Wayfair Advertising",
"Thêm listing cùng bộ sưu tập vào campaign",
"Theo dõi ROAS 7 ngày sau tăng"
],
"close": "evidence: ảnh chụp budget mới, hoặc tự đóng sau 14 ngày",
"trigger": "campaign ROAS 7d >= 6 AND campaign.orders 7d >= 3 AND sku.weeksOfCover >= 10"
},
"G-OPP-CTR-CVR": {
"why": "Traffic đã có, chuyển đổi kém là do giá/ảnh/review — sửa được là lãi ngay.",
"steps": [
"So sánh giá, ảnh, số review với 3 đối thủ cùng phân khúc trên Wayfair",
"Cập nhật ảnh chính/ảnh kích thước, bổ sung Waymore",
"Thử promotion ngắn 7 ngày để đo độ nhạy giá"
],
"close": "listing CVR 14d >= 1.5%",
"trigger": "listing.clicks 14d >= 200 AND listing CTR >= 0.5% AND orders/clicks < 1%"
},
"L-PACE": {
"why": "2.700 kệ phải bán hết trước 6/2027; mỗi tháng hụt là thêm tiền thuê kho Suối Nghệ.",
"steps": [
"Kiểm tra lịch flash sale, voucher và ads 7 ngày tới trên Seller Centre",
"Đăng ký thêm slot Flash Sale của Shop và tăng ngân sách Shopee Ads",
"Gửi chị Nhi kế hoạch bù hụt có số đơn kỳ vọng/ngày"
],
"close": "local pace units >= 90% trong 3 lần sync liên tiếp",
"trigger": "dayOfMonth >= 5 AND 75% <= local.mtd.units / (planUnits[tháng] × dayOfMonth / daysInMonth) < 90%"
},
"L-NET-UNIT-LOW": {
"why": "Thực nhận dưới 189.051₫/kệ làm kế hoạch dòng tiền 2.700 kệ không đạt.",
"steps": [
"Bóc tách chi phí 7d: phí cố định, dịch vụ, giao dịch, voucher shop, PiShip, Affiliate so với kế hoạch",
"Chỉ ra khoản vượt và điều chỉnh (giảm giá trị voucher, giảm % hoa hồng Affiliate)",
"Báo chị Nhi thực nhận/kệ sau điều chỉnh"
],
"close": "thực nhận/kệ 7d >= 189.051₫",
"trigger": "sum(income) / sum(qty) đơn không hủy 7d < 189.051₫"
},
"L-BELOW-FLOOR": {
"why": "Dưới giá sàn là lỗ thực, không thu hồi được.",
"steps": [
"Xác định nguồn giá: Flash Sale, chương trình giảm giá, voucher chồng voucher",
"Sửa giá/tắt chương trình ngay trong Kênh Marketing trên Seller Centre",
"Báo chị Nhi số đơn và số tiền lỗ"
],
"close": "0 đơn dưới giá sàn trong 48h kể từ khi sửa",
"trigger": "Có đơn (không hủy) với salePrice/kệ < 315.000₫, HOẶC income/kệ < 185.000₫"
},
"L-FEE-DRIFT": {
"why": "Phí tăng âm thầm (gói dịch vụ mới, thay đổi chính sách) bào mòn thực nhận.",
"steps": [
"Đối chiếu Ví Shopee > Doanh thu chi tiết từng đơn để thấy phí tăng",
"Kiểm tra gói dịch vụ đang đăng ký (Freeship Xtra, Voucher Xtra)",
"Đề xuất tắt/giữ gói với số liệu cho chị Nhi"
],
"close": "tỷ lệ phí 7d <= 25.4%, HOẶC evidence: chị Nhi chấp nhận mức phí mới",
"trigger": "(phí cố định + phí dịch vụ + phí xử lý giao dịch) / NMV 7d > 26.4% (kế hoạch 24.4% + 2pp), HOẶC PiShip/đơn > 5.052₫"
},
"L-ORD-UNCONFIRMED": {
"why": "Đơn treo dễ bị khách hủy và tính vào tỷ lệ không hoàn thành.",
"steps": [
"Vào Seller Centre > Quản lý đơn hàng > Chờ xác nhận",
"Xác nhận đơn hoặc liên hệ khách qua Shopee Chat nếu có vấn đề",
"Ghi lý do nếu không xác nhận được"
],
"close": "Không còn đơn 'Chờ xác nhận' quá 12h",
"trigger": "order.status == 'Chờ xác nhận' AND now - order.createTime > 12h"
},
"L-ORD-NOT-PICKED": {
"why": "Giao trễ tính vào Tỷ lệ giao hàng trễ, gây điểm Sao Quả Tạ và hạn chế shop.",
"steps": [
"Kiểm tra trạng thái chuẩn bị hàng tại kho Suối Nghệ",
"Gọi đơn vị vận chuyển/đặt lại lịch lấy hàng trong Seller Centre",
"Báo chị Nhi nếu kho không xuất kịp"
],
"close": "Tất cả đơn có pickupTime trong vòng 24h kể từ createTime",
"trigger": "order.status == 'Chờ lấy hàng' AND now - order.createTime > 24h; nâng P0 nếu > 48h"
},
"L-ORD-LATE-DELIVERY": {
"why": "Đơn kẹt vận chuyển dễ thành hủy/hoàn và review 1★.",
"steps": [
"Tra hành trình đơn trong Seller Centre",
"Mở yêu cầu hỗ trợ với đơn vị vận chuyển qua Kênh Người bán",
"Nhắn khách qua Shopee Chat cập nhật tình trạng"
],
"close": "order.status thuộc {Đã giao, Hoàn thành}",
"trigger": "order.status == 'Đang giao' AND now - order.pickupTime > 7 ngày"
},
"L-CANCEL-RATE": {
"why": "Tỷ lệ không hoàn thành cao bị Shopee phạt điểm và giảm hiển thị.",
"steps": [
"Phân loại lý do hủy (khách hủy, shop hủy, giao thất bại)",
"Khắc phục nguyên nhân chính (tồn kho, thời gian giao, mô tả)",
"Báo chị Nhi tỷ lệ và hành động"
],
"close": "local.cancelRate 7d <= 4%",
"trigger": "local.cancelRate 7d > 5% AND số đơn 7d >= 10; nâng P0 nếu > 10%"
},
"L-RETURN-NEW": {
"why": "Quá hạn phản hồi Shopee tự hoàn tiền cho khách, shop mất cả hàng lẫn tiền.",
"steps": [
"Vào Seller Centre > Trả hàng/Hoàn tiền, xem ảnh/video khách gửi",
"Chấp nhận, đề xuất hoàn một phần, hoặc khiếu nại kèm bằng chứng đóng gói",
"Ghi lý do trả hàng vào dashboard"
],
"close": "Yêu cầu trả hàng có phản hồi (chấp nhận/khiếu nại) trước hạn Shopee",
"trigger": "order.status == 'Trả hàng' AND chưa có phản hồi AND now - thời điểm yêu cầu > 24h"
},
"L-RETURN-RATE": {
"why": "Trả hàng kệ cồng kềnh tốn phí vận chuyển hai chiều và hàng hư hỏng.",
"steps": [
"Tổng hợp lý do trả hàng 30 ngày",
"Đối chiếu với mô tả, hướng dẫn lắp ráp, đóng gói",
"Đề xuất cải thiện (thêm video lắp ráp, gia cố thùng) có deadline"
],
"close": "local.returnRate 30d <= 2%",
"trigger": "local.returnRate 30d > 3% AND số đơn 30d >= 20"
},
"L-REV-NEG-UNREPLIED": {
"why": "Review xấu không phản hồi kéo tụt chuyển đổi của sản phẩm duy nhất của shop.",
"steps": [
"Vào Seller Centre > Quản lý đánh giá, đọc kỹ nội dung và ảnh",
"Phản hồi công khai lịch sự, nêu giải pháp cụ thể",
"Nhắn riêng khách qua Shopee Chat đề xuất hỗ trợ (đổi linh kiện, hướng dẫn)"
],
"close": "review.replied == true",
"trigger": "review.star <= 3 AND review.replied == false AND now - review.time > 24h"
},
"L-REV-UNREPLIED-72H": {
"why": "Phản hồi đều đặn thể hiện shop chăm sóc khách và tăng niềm tin.",
"steps": [
"Lọc đánh giá chưa phản hồi trong Seller Centre",
"Phản hồi cảm ơn cá nhân hóa (không dùng một câu cho tất cả)",
"Ưu tiên review có ảnh/video"
],
"close": "review.replied == true",
"trigger": "review.replied == false AND now - review.time > 72h (mọi số sao)"
},
"L-RATING-DROP": {
"why": "Điểm sao là yếu tố chuyển đổi hàng đầu với sản phẩm duy nhất.",
"steps": [
"Tổng hợp chủ đề phàn nàn trong review 1–3★",
"Khắc phục nguyên nhân chính với kho/nhà cung cấp",
"Báo chị Nhi hành động cụ thể"
],
"close": "avg star 30d >= 4.7 AND không giảm so với 30d trước",
"trigger": "avg star 30d < 4.7, HOẶC avg star 30d giảm >= 0.1 so với 30d trước"
},
"L-REV-DEFECT": {
"why": "Lỗi lặp chỉ ra vấn đề lô hàng hoặc đóng gói tại kho.",
"steps": [
"Kiểm tra ngẫu nhiên 10 thùng tại kho Suối Nghệ",
"Lập biên bản lỗi với nhà cung cấp kèm ảnh",
"Bổ sung linh kiện dự phòng/hướng dẫn trong thùng nếu cần"
],
"close": "evidence: biên bản kiểm tra kho + ảnh; tự đóng khi 14 ngày không có review chứa từ khóa",
"trigger": ">= 2 review trong 7d chứa từ khóa: gãy, lỗi, thiếu ốc, thiếu linh kiện, móp, lung lay, bánh xe"
},
"L-FS-NONE": {
"why": "Flash Sale chiếm ~53% NMV; thiếu slot là mất một nửa doanh số.",
"steps": [
"Vào Kênh Marketing > Flash Sale của Shop, đăng ký slot cho 7 ngày tới",
"Đặt giá FS >= 315.000₫ và stock FS đủ cho trung bình bán theo slot",
"Đăng ký thêm Flash Sale Shopee (campaign) nếu đủ điều kiện"
],
"close": "có >= 1 slot FS bắt đầu trong 7 ngày tới (khuyến nghị >= 1 slot/ngày)",
"trigger": "count(flashSale.slot với start trong [now, now+7d]) == 0"
},
"L-FS-PRICE": {
"why": "Mỗi đơn FS dưới sàn là lỗ thực, nhân lên theo số lượng slot.",
"steps": [
"Sửa giá slot hoặc xóa slot trên Seller Centre trước giờ bắt đầu",
"Nếu đang chạy, giảm stock FS về 0",
"Báo chị Nhi nếu giá thấp là chủ đích (cần duyệt bằng văn bản)"
],
"close": "Không còn slot FS sắp/đang chạy với giá < 315.000₫",
"trigger": "flashSale.slot.price < 315.000₫ AND slot.end > now"
},
"L-DISCOUNT-NONE": {
"why": "Giá niêm yết 700.000₫ không cạnh tranh, chuyển đổi gần như bằng 0.",
"steps": [
"Tạo Chương trình của Shop trong Kênh Marketing với giá đã duyệt",
"Đặt thời gian chương trình nối tiếp, không để khoảng trống",
"Chụp màn hình giá hiển thị gửi chị Nhi"
],
"close": "Có shop discount hoặc FS đang chạy",
"trigger": "Không có shop discount đang chạy AND không có FS đang chạy (khách đang thấy giá 700.000₫)"
},
"L-VOUCHER-ENDING": {
"why": "Khoảng trống voucher làm giảm chuyển đổi đột ngột.",
"steps": [
"Tạo voucher mới trong Kênh Marketing > Mã giảm giá",
"Đặt start trùng end của voucher cũ",
"Giữ giá trị voucher trong ngân sách 5,2% Net GMV"
],
"close": "Có voucher cùng loại với start <= end voucher cũ",
"trigger": "voucher.end - now <= 48h AND không có voucher cùng loại start <= voucher.end"
},
"L-VOUCHER-USEDUP": {
"why": "Voucher hết lượt giữa chương trình làm khách bỏ giỏ hàng.",
"steps": [
"Tăng lượt sử dụng voucher trong Seller Centre",
"Kiểm tra chi phí voucher không vượt ngân sách",
"Ghi chú thay đổi vào dashboard"
],
"close": "voucher.used / usageLimit < 80% hoặc voucher đã được thay thế",
"trigger": "voucher.used / voucher.usageLimit >= 90% AND voucher.end > now"
},
"L-STOCK-LOW": {
"why": "Hết tồn trên sàn = mất đơn dù kho Suối Nghệ còn hàng.",
"steps": [
"Cập nhật tồn trên Seller Centre theo số thực tế tại kho",
"Kiểm tra stock đã khóa cho Flash Sale",
"Xác nhận kho đủ hàng cho 14 ngày tới"
],
"close": "product.stock >= 14 × avg units/ngày 7d",
"trigger": "product.stock < 7 × avg units/ngày 7d; nâng P0 nếu stock == 0"
},
"L-WH-BURN": {
"why": "Mỗi tháng xả chậm thêm 20.000.000₫ tiền thuê kho.",
"steps": [
"Tính số tháng thuê kho thêm dự kiến theo tốc độ hiện tại",
"Đề xuất kênh bổ sung (Affiliate, livestream, B2B sỉ) với chị Nhi",
"Cập nhật kế hoạch tháng tới có số liệu"
],
"close": "units lũy kế >= 95% kế hoạch lũy kế",
"trigger": "units lũy kế từ 11/2026 < 85% kế hoạch lũy kế tới ngày hiện tại"
},
"L-RENT-PER-UNIT": {
"why": "Tiền thuê chia trên kệ bán ra cao xóa gần hết lợi nhuận đơn vị.",
"steps": [
"Đánh giá phương án thuê kho nhỏ hơn hoặc chia sẻ kho",
"Xem xét bán sỉ lô lớn để giảm tồn",
"Chốt quyết định trong họp tháng"
],
"close": "rent/unit dự kiến tháng <= 70.000₫",
"trigger": "20.000.000₫ / local.projection.units tháng > 70.000₫/kệ"
},
"L-ADS-ACOS": {
"why": "Ads vượt làm thực nhận/kệ rơi dưới 189.051₫.",
"steps": [
"Vào Quảng cáo Shopee, xem từ khóa chi tiêu cao không ra đơn",
"Hạ giá thầu hoặc tắt từ khóa ROAS < 5",
"Đặt ROAS mục tiêu cho quảng cáo tự động"
],
"close": "ads.cost / NMV 7d <= 5% AND ROAS 7d >= 10",
"trigger": "ads.cost 7d / NMV 7d > 8% (gấp đôi kế hoạch 4%), HOẶC ads.gmv / ads.cost 7d < 8"
},
"L-ADS-ZERO-ORDER": {
"why": "Đốt ngân sách không tạo đơn hàng.",
"steps": [
"Kiểm tra quảng cáo có trỏ đúng sản phẩm và giá đang hiển thị",
"Tạm dừng nhóm quảng cáo không hiệu quả",
"Thử lại với giá thầu thấp hơn sau khi có FS/voucher"
],
"close": "ads.orders 3d >= 1, HOẶC ads.cost 3d < 100.000₫",
"trigger": "ads.cost 3d >= 300.000₫ AND ads.orders 3d == 0"
},
"L-ADS-WALLET-PAID": {
"why": "Free credit hết thì từng đồng ads là tiền thật của công ty.",
"steps": [
"Đối chiếu Ví quảng cáo: tách free credit và tiền nạp",
"Dừng nạp thêm cho tới khi ROAS >= 8",
"Báo chị Nhi số tiền đã nạp và doanh thu tạo ra"
],
"close": "ROAS 7d >= 8, HOẶC chi tiêu tiền nạp 7d == 0",
"trigger": "Chi tiêu từ tiền nạp (paid top-up, không phải free credit) 7d >= 1.000.000₫ AND ads.gmv / ads.cost 7d < 8"
},
"L-ADS-WALLET-LOW": {
"why": "Quảng cáo đang hiệu quả bị ngắt do hết tiền.",
"steps": [
"Xin duyệt nạp ví với chị Nhi kèm ROAS 7d",
"Nạp tiền vào Ví quảng cáo sau khi được duyệt",
"Ghi số tiền nạp vào sổ ledger"
],
"close": "walletBalance >= 5 × avg cost/ngày",
"trigger": "ads.walletBalance < 2 × avg ads.cost/ngày 7d AND ROAS 7d >= 10"
},
"L-PRICE-CHANGE": {
"why": "Đổi giá không duyệt có thể phá cấu trúc lợi nhuận hoặc vi phạm quy định giá ảo của Shopee.",
"steps": [
"Xác nhận ai đã đổi giá và lý do",
"Đưa giá về mức đã duyệt nếu không có phê duyệt",
"Ghi giá mới và lý do vào dashboard"
],
"close": "evidence: tin nhắn chị Nhi duyệt giá mới, hoặc giá đã về mức đã duyệt",
"trigger": "product.listPrice hoặc product.promoPrice khác so với lần sync trước, HOẶC listPrice != 700.000₫"
},
"L-OPP-CTR-CVR": {
"why": "Khách quan tâm nhưng không mua — sửa trang sản phẩm là tăng đơn không tốn thêm ads.",
"steps": [
"So sánh giá, ảnh bìa, video, số review với 3 đối thủ kệ 3 tầng",
"Cập nhật ảnh bìa/video lắp ráp, highlight review có ảnh",
"Thử voucher khách mới trong 7 ngày"
],
"close": "CVR 7d >= 2%",
"trigger": "ads CTR 7d >= 2% AND ads.orders / ads.clicks 7d < 1% AND clicks 7d >= 300"
},
"L-OPP-SURGE": {
"why": "Đà bán tốt và còn lãi là thời điểm tăng tốc xả kho.",
"steps": [
"Tăng ngân sách ads 30% và thêm slot FS",
"Đảm bảo stock sàn và năng lực xuất kho",
"Báo chị Nhi nguyên nhân tăng để nhân rộng"
],
"close": "Tự đóng sau 7 ngày hoặc evidence: hành động đã thực hiện",
"trigger": "units 3d >= 2 × (planUnits[tháng] / daysInMonth × 3) AND thực nhận/kệ 3d >= 189.051₫"
},
"L-OPP-AFFILIATE": {
"why": "Kế hoạch đã dành 10% hoa hồng Affiliate; KOC là kênh rẻ để xả kho.",
"steps": [
"Mời 10 KOC nhà cửa/đời sống qua Shopee Affiliate",
"Gửi mẫu kệ cho 3 KOC có tương tác tốt",
"Theo dõi đơn Affiliate hằng tuần"
],
"close": "đơn Affiliate 30d >= 10% tổng đơn",
"trigger": "đơn Affiliate 30d / tổng đơn 30d < 10% AND local pace units < 100%"
},
"X-TASK-OVERDUE": {
"why": "Việc quá hạn mà không ai thấy chính là vấn đề 'không chủ động' cần loại bỏ.",
"steps": [
"Gửi nhắc nhở qua Zalo bằng template remind",
"Yêu cầu nhân sự phản hồi deadline mới trong 4 giờ",
"Ghi nhận vào lịch sử hiệu suất tháng"
],
"close": "Task gốc đóng theo closeWhen của rule gốc",
"trigger": "task.open == true AND now > task.agedFrom + SLA(severity) — tự nâng 1 cấp severity và gửi template remind"
},
"X-RECURRENCE": {
"why": "Tái phát cho thấy chỉ xử lý ngọn, không xử lý gốc.",
"steps": [
"Yêu cầu owner nộp phân tích nguyên nhân gốc trong 48h",
"Trao đổi 1-1 với owner, chốt hành động phòng ngừa",
"Lần 3: gửi cảnh cáo chính thức, lưu hồ sơ"
],
"close": "evidence: phân tích nguyên nhân gốc được duyệt; cờ tự gỡ sau 30 ngày không tái phát",
"trigger": "Cùng rule id + cùng owner mở lần 2 trong 30 ngày → cờ 'Nhắc nhở'; lần 3 → cờ 'Cảnh cáo' + template warning"
},
"X-ROUTINE-MISSED": {
"why": "Việc định kỳ là nền tảng kỷ luật; bỏ lỡ là tín hiệu sớm của sự cố.",
"steps": [
"Gửi template remind cho owner",
"Yêu cầu hoàn thành trong ngày",
"Tính vào điểm tuân thủ routine tháng"
],
"close": "routine.verify thỏa mãn",
"trigger": "routine.due đã qua AND routine.verify chưa thỏa (data hoặc evidence)"
}
},
"catalog": [
{
"id": "G-DATA-STALE",
"sev": "P0",
"owner": "trang",
"title": "Dữ liệu Global không cập nhật",
"trigger": "now - global.dataFreshness > 26h (lỡ lượt sync 14:23 hằng ngày)",
"kind": "issue"
},
{
"id": "L-DATA-STALE",
"sev": "P0",
"owner": "phu",
"title": "Dữ liệu Shopee không cập nhật",
"trigger": "now - local.dataFreshness > 26h (lỡ lượt sync 15:41 hằng ngày)",
"kind": "issue"
},
{
"id": "X-DATA-EMPTY",
"sev": "P0",
"owner": "manager",
"title": "Sync chạy nhưng dữ liệu rỗng/bất thường",
"trigger": "Sync thành công nhưng orders_1d = 0 trong khi avg orders 7d >= 1 trên cùng kênh, HOẶC số dòng giảm > 80% so với lần sync trước",
"kind": "issue"
},
{
"id": "X-TARGET-MISSING",
"sev": "P1",
"owner": "manager",
"title": "Thiếu target tháng hiện tại",
"trigger": "Sheet Cashflow 26+27 không có dòng target (rev, unit, profit, mkt) cho tháng hiện tại, HOẶC local.planUnits không có tháng hiện tại",
"kind": "issue"
},
{
"id": "G-AMZ-API-PENDING",
"sev": "P2",
"owner": "trang",
"title": "Amazon API chưa được duyệt",
"trigger": "amazon.apiStatus != 'approved' AND số ngày từ khi nộp hồ sơ > 14",
"kind": "issue"
},
{
"id": "G-AMZ-FBM-UNSHIPPED",
"sev": "P0",
"owner": "trang",
"title": "Đơn Amazon FBM chưa giao vận",
"trigger": "amazon.order.status == 'Unshipped' AND now - order.purchaseDate > 24h (chỉ chạy khi API đã có dữ liệu)",
"kind": "issue"
},
{
"id": "G-PACE-P1",
"sev": "P1",
"owner": "trang",
"title": "Doanh thu Global chậm tiến độ",
"trigger": "dayOfMonth >= 5 AND 75% <= global.mtd.revenue / (target.rev × dayOfMonth / daysInMonth) < 90%",
"kind": "issue"
},
{
"id": "G-PACE-P0",
"sev": "P0",
"owner": "trang",
"title": "Doanh thu Global hụt nghiêm trọng",
"trigger": "dayOfMonth >= 5 AND global.mtd.revenue / (target.rev × dayOfMonth / daysInMonth) < 75%, HOẶC global.projection.revenue < 75% target.rev",
"kind": "issue"
},
{
"id": "G-UNIT-PACE",
"sev": "P1",
"owner": "trang",
"title": "Sản lượng Global dưới tiến độ",
"trigger": "dayOfMonth >= 5 AND global.mtd.units / (target.unit × dayOfMonth / daysInMonth) < 90%",
"kind": "issue"
},
{
"id": "G-PROFIT-PACE",
"sev": "P1",
"owner": "trang",
"title": "Lợi nhuận dự kiến thấp hơn target",
"trigger": "dayOfMonth >= 7 AND global.projection.profit < 90% target.profit",
"kind": "issue"
},
{
"id": "G-MARGIN-LOW",
"sev": "P1",
"owner": "trang",
"title": "Biên lợi nhuận Global thấp",
"trigger": "global.margin (rolling 14d) < 15%, HOẶC global.margin 14d < (target.profit / target.rev) - 5pp",
"kind": "issue"
},
{
"id": "G-SKU-NEG-PROFIT",
"sev": "P1",
"owner": "trang",
"title": "SKU lỗ trong 30 ngày",
"trigger": "sku.profit 30d < 0 AND sku.units 30d >= 3",
"kind": "issue"
},
{
"id": "G-MKT-OVER",
"sev": "P1",
"owner": "trang",
"title": "Chi phí marketing vượt kế hoạch",
"trigger": "global.mktPct MTD > target.mkt% + 2pp (target.mkt% = target.mkt / target.rev)",
"kind": "issue"
},
{
"id": "G-TACOS-HIGH",
"sev": "P1",
"owner": "trang",
"title": "TACoS vượt ngưỡng",
"trigger": "global.tacos 7d > 12%",
"kind": "issue"
},
{
"id": "G-INC-NEW",
"sev": "P1",
"owner": "trang",
"title": "Incident Wayfair mới chưa xử lý",
"trigger": "incident.case tồn tại AND case.handled == false (chưa có comment xử lý/phương án) AND now - case.date > 24h. Nâng P0 nếu type == 'Damaged' AND deduction >= 100 USD",
"kind": "issue"
},
{
"id": "G-INC-EVIDENCE",
"sev": "P1",
"owner": "trang",
"title": "Case có ảnh/video chưa dùng để claim",
"trigger": "case.photos.count > 0 AND case.deduction > 0 AND không có dispute ID AND now - case.date > 5 ngày",
"kind": "opportunity"
},
{
"id": "G-INC-RATE",
"sev": "P1",
"owner": "trang",
"title": "Tỷ lệ incident vượt ngưỡng",
"trigger": "global.incidentRate 30d > 3%; nâng P0 nếu > 5%",
"kind": "issue"
},
{
"id": "G-BRR-HIGH",
"sev": "P1",
"owner": "trang",
"title": "Tỷ lệ trả hàng (BRR) cao",
"trigger": "global.BRR 30d > 5% AND số đơn 30d >= 20",
"kind": "issue"
},
{
"id": "G-INC-REPEAT-SKU",
"sev": "P1",
"owner": "trang",
"title": "Một SKU lặp lại cùng loại incident",
"trigger": "Cùng SKU có >= 3 case cùng type trong 30 ngày",
"kind": "issue"
},
{
"id": "G-INC-MISINFO",
"sev": "P1",
"owner": "trang",
"title": "Case sai thông tin sản phẩm",
"trigger": "case.type == 'Mis-information' AND listing SKU chưa được cập nhật sau case.date",
"kind": "issue"
},
{
"id": "G-DED-UNREC",
"sev": "P1",
"owner": "trang",
"title": "Khoản khấu trừ chưa đối soát",
"trigger": "deduction.reconciled == false AND now - deduction.date > 14 ngày",
"kind": "issue"
},
{
"id": "G-DED-LARGE",
"sev": "P0",
"owner": "trang",
"title": "Khấu trừ lớn bất thường",
"trigger": "Một khoản deduction >= 200 USD, HOẶC tổng deduction 30d > 2% global.nmv 30d",
"kind": "issue"
},
{
"id": "G-CG-STORAGE-30",
"sev": "P1",
"owner": "trang",
"title": "PO sắp hết 90 ngày lưu kho miễn phí",
"trigger": "14 < (po.receiveDate + 90 - today) <= 30 AND po.remainingUnits > 0",
"kind": "issue"
},
{
"id": "G-CG-STORAGE-14",
"sev": "P0",
"owner": "trang",
"title": "PO còn ≤14 ngày miễn phí lưu kho",
"trigger": "(po.receiveDate + 90 - today) <= 14 AND po.remainingUnits > 0",
"kind": "issue"
},
{
"id": "G-CG-FEE-START",
"sev": "P1",
"owner": "trang",
"title": "Chuẩn bị phí lưu kho lô đầu (31/12/2026)",
"trigger": "today >= 2026-12-01 AND today < 2026-12-31 AND tồn CastleGate thuộc lô đầu > 0",
"kind": "issue"
},
{
"id": "G-OOS",
"sev": "P0",
"owner": "trang",
"title": "SKU đang bán đã hết hàng CastleGate",
"trigger": "sku.onHand == 0 AND sku.units 30d > 0 AND không có inbound PO nhận trong 7 ngày",
"kind": "issue"
},
{
"id": "G-OOS-RISK",
"sev": "P1",
"owner": "trang",
"title": "Nguy cơ hết hàng (cover < lead time)",
"trigger": "sku.weeksOfCover (onHand + inbound) / avg units per week 28d < 10 tuần; nâng P0 nếu < 6 tuần",
"kind": "issue"
},
{
"id": "G-OVERSTOCK",
"sev": "P2",
"owner": "trang",
"title": "Tồn kho quá nhiều",
"trigger": "sku.weeksOfCover > 26 AND sku.onHand >= 20",
"kind": "issue"
},
{
"id": "G-DEAD-SKU",
"sev": "P1",
"owner": "trang",
"title": "SKU có tồn nhưng không bán 14 ngày",
"trigger": "sku.onHand > 0 AND sku.units 14d == 0",
"kind": "issue"
},
{
"id": "G-ADS-WASTE",
"sev": "P1",
"owner": "trang",
"title": "Campaign tiêu tiền không ra đơn",
"trigger": "campaign.spend 7d >= 50 USD AND campaign.orders 7d == 0",
"kind": "issue"
},
{
"id": "G-ADS-ACOS",
"sev": "P1",
"owner": "trang",
"title": "ACoS campaign quá cao",
"trigger": "campaign.spend 7d >= 30 USD AND campaign.spend / campaign.sales 7d > 30%",
"kind": "issue"
},
{
"id": "G-ADS-ROAS-LOW",
"sev": "P1",
"owner": "trang",
"title": "ROAS tổng ads Wayfair thấp",
"trigger": "sum(sales) / sum(spend) toàn bộ campaign 7d < 3 AND spend 7d >= 100 USD",
"kind": "issue"
},
{
"id": "G-ADS-LISTING-ZERO",
"sev": "P2",
"owner": "trang",
"title": "Listing chạy ads 14 ngày không có đơn",
"trigger": "listing.adSpend 14d >= 30 USD AND listing.adOrders 14d == 0",
"kind": "issue"
},
{
"id": "G-ADS-STOPPED",
"sev": "P1",
"owner": "trang",
"title": "Ads Wayfair ngừng chạy",
"trigger": "sum(campaign.spend) 3d == 0 AND target.mkt tháng > 0",
"kind": "issue"
},
{
"id": "G-TT-FOLLOW",
"sev": "P2",
"owner": "trang",
"title": "Đơn Tried & True chưa theo dõi review",
"trigger": "triedTrue.order đã giao AND now - deliveredDate > 14 ngày AND không có review/ghi chú theo dõi",
"kind": "issue"
},
{
"id": "G-CONT-WAYMORE",
"sev": "P2",
"owner": "trang",
"title": "SKU chưa có nội dung Waymore",
"trigger": "sku.active == true AND sku.waymoreStatus != 'live'",
"kind": "issue"
},
{
"id": "G-CONT-APLUS",
"sev": "P2",
"owner": "trang",
"title": "Top SKU chưa có Premium A+",
"trigger": "sku thuộc top 5 doanh thu 30d (Wayfair hoặc Amazon) AND aplusStatus != 'approved'",
"kind": "issue"
},
{
"id": "G-CONT-BRANDSTORE",
"sev": "P2",
"owner": "trang",
"title": "Brand Store Lignarc chưa hoàn thiện",
"trigger": "brandStore.status != 'live' OR brandStore.lastUpdate > 60 ngày",
"kind": "issue"
},
{
"id": "G-OPP-REORDER",
"sev": "P1",
"owner": "trang",
"title": "SKU bán chạy, nên đặt thêm",
"trigger": "sku thuộc top 3 units 30d AND sku.weeksOfCover < 14",
"kind": "opportunity"
},
{
"id": "G-OPP-SCALE-ADS",
"sev": "P2",
"owner": "trang",
"title": "Campaign hiệu quả, nên tăng ngân sách",
"trigger": "campaign ROAS 7d >= 6 AND campaign.orders 7d >= 3 AND sku.weeksOfCover >= 10",
"kind": "opportunity"
},
{
"id": "G-OPP-CTR-CVR",
"sev": "P2",
"owner": "trang",
"title": "Listing nhiều click nhưng ít mua",
"trigger": "listing.clicks 14d >= 200 AND listing CTR >= 0.5% AND orders/clicks < 1%",
"kind": "opportunity"
},
{
"id": "L-PACE-P1",
"sev": "P1",
"owner": "phu",
"title": "Sản lượng Shopee chậm tiến độ",
"trigger": "dayOfMonth >= 5 AND 75% <= local.mtd.units / (planUnits[tháng] × dayOfMonth / daysInMonth) < 90%",
"kind": "issue"
},
{
"id": "L-PACE-P0",
"sev": "P0",
"owner": "phu",
"title": "Sản lượng Shopee hụt nghiêm trọng",
"trigger": "dayOfMonth >= 5 AND local pace units < 75%, HOẶC local.projection.units < 75% planUnits[tháng]",
"kind": "issue"
},
{
"id": "L-NET-UNIT-LOW",
"sev": "P1",
"owner": "phu",
"title": "Thực nhận/kệ dưới mục tiêu",
"trigger": "sum(income) / sum(qty) đơn không hủy 7d < 189.051₫",
"kind": "issue"
},
{
"id": "L-BELOW-FLOOR",
"sev": "P0",
"owner": "phu",
"title": "Đơn bán dưới giá sàn 315.000₫",
"trigger": "Có đơn (không hủy) với salePrice/kệ < 315.000₫, HOẶC income/kệ < 185.000₫",
"kind": "issue"
},
{
"id": "L-FEE-DRIFT",
"sev": "P2",
"owner": "phu",
"title": "Phí sàn vượt cấu trúc kế hoạch",
"trigger": "(phí cố định + phí dịch vụ + phí xử lý giao dịch) / NMV 7d > 26.4% (kế hoạch 24.4% + 2pp), HOẶC PiShip/đơn > 5.052₫",
"kind": "issue"
},
{
"id": "L-ORD-UNCONFIRMED",
"sev": "P1",
"owner": "phu",
"title": "Đơn chờ xác nhận quá lâu",
"trigger": "order.status == 'Chờ xác nhận' AND now - order.createTime > 12h",
"kind": "issue"
},
{
"id": "L-ORD-NOT-PICKED",
"sev": "P1",
"owner": "phu",
"title": "Đơn chưa bàn giao vận chuyển",
"trigger": "order.status == 'Chờ lấy hàng' AND now - order.createTime > 24h; nâng P0 nếu > 48h",
"kind": "issue"
},
{
"id": "L-ORD-LATE-DELIVERY",
"sev": "P2",
"owner": "phu",
"title": "Đơn đang giao quá lâu",
"trigger": "order.status == 'Đang giao' AND now - order.pickupTime > 7 ngày",
"kind": "issue"
},
{
"id": "L-CANCEL-RATE",
"sev": "P1",
"owner": "phu",
"title": "Tỷ lệ hủy đơn cao",
"trigger": "local.cancelRate 7d > 5% AND số đơn 7d >= 10; nâng P0 nếu > 10%",
"kind": "issue"
},
{
"id": "L-RETURN-NEW",
"sev": "P0",
"owner": "phu",
"title": "Yêu cầu trả hàng chưa phản hồi",
"trigger": "order.status == 'Trả hàng' AND chưa có phản hồi AND now - thời điểm yêu cầu > 24h",
"kind": "issue"
},
{
"id": "L-RETURN-RATE",
"sev": "P1",
"owner": "phu",
"title": "Tỷ lệ trả hàng cao",
"trigger": "local.returnRate 30d > 3% AND số đơn 30d >= 20",
"kind": "issue"
},
{
"id": "L-REV-NEG-UNREPLIED",
"sev": "P1",
"owner": "phu",
"title": "Đánh giá 1–3★ chưa phản hồi",
"trigger": "review.star <= 3 AND review.replied == false AND now - review.time > 24h",
"kind": "issue"
},
{
"id": "L-REV-UNREPLIED-72H",
"sev": "P2",
"owner": "phu",
"title": "Đánh giá chưa phản hồi quá 72h",
"trigger": "review.replied == false AND now - review.time > 72h (mọi số sao)",
"kind": "issue"
},
{
"id": "L-RATING-DROP",
"sev": "P1",
"owner": "phu",
"title": "Điểm đánh giá giảm",
"trigger": "avg star 30d < 4.7, HOẶC avg star 30d giảm >= 0.1 so với 30d trước",
"kind": "issue"
},
{
"id": "L-REV-DEFECT",
"sev": "P1",
"owner": "phu",
"title": "Review lặp lại lỗi sản phẩm",
"trigger": ">= 2 review trong 7d chứa từ khóa: gãy, lỗi, thiếu ốc, thiếu linh kiện, móp, lung lay, bánh xe",
"kind": "issue"
},
{
"id": "L-FS-NONE",
"sev": "P1",
"owner": "phu",
"title": "Không có Flash Sale trong 7 ngày tới",
"trigger": "count(flashSale.slot với start trong [now, now+7d]) == 0",
"kind": "issue"
},
{
"id": "L-FS-PRICE",
"sev": "P0",
"owner": "phu",
"title": "Slot Flash Sale đặt giá dưới sàn",
"trigger": "flashSale.slot.price < 315.000₫ AND slot.end > now",
"kind": "issue"
},
{
"id": "L-DISCOUNT-NONE",
"sev": "P1",
"owner": "phu",
"title": "Sản phẩm không có giá khuyến mãi",
"trigger": "Không có shop discount đang chạy AND không có FS đang chạy (khách đang thấy giá 700.000₫)",
"kind": "issue"
},
{
"id": "L-VOUCHER-ENDING",
"sev": "P2",
"owner": "phu",
"title": "Voucher sắp hết hạn chưa có voucher thay thế",
"trigger": "voucher.end - now <= 48h AND không có voucher cùng loại start <= voucher.end",
"kind": "issue"
},
{
"id": "L-VOUCHER-USEDUP",
"sev": "P2",
"owner": "phu",
"title": "Voucher sắp hết lượt dùng",
"trigger": "voucher.used / voucher.usageLimit >= 90% AND voucher.end > now",
"kind": "issue"
},
{
"id": "L-STOCK-LOW",
"sev": "P1",
"owner": "phu",
"title": "Tồn Shopee dưới 7 ngày bán",
"trigger": "product.stock < 7 × avg units/ngày 7d; nâng P0 nếu stock == 0",
"kind": "issue"
},
{
"id": "L-WH-BURN",
"sev": "P1",
"owner": "phu",
"title": "Tốc độ xả kho Suối Nghệ chậm kế hoạch",
"trigger": "units lũy kế từ 11/2026 < 85% kế hoạch lũy kế tới ngày hiện tại",
"kind": "issue"
},
{
"id": "L-RENT-PER-UNIT",
"sev": "P2",
"owner": "manager",
"title": "Chi phí thuê kho/kệ quá cao",
"trigger": "20.000.000₫ / local.projection.units tháng > 70.000₫/kệ",
"kind": "issue"
},
{
"id": "L-ADS-ACOS",
"sev": "P1",
"owner": "phu",
"title": "Chi phí Shopee Ads vượt ngân sách",
"trigger": "ads.cost 7d / NMV 7d > 8% (gấp đôi kế hoạch 4%), HOẶC ads.gmv / ads.cost 7d < 8",
"kind": "issue"
},
{
"id": "L-ADS-ZERO-ORDER",
"sev": "P1",
"owner": "phu",
"title": "Quảng cáo tiêu tiền không ra đơn",
"trigger": "ads.cost 3d >= 300.000₫ AND ads.orders 3d == 0",
"kind": "issue"
},
{
"id": "L-ADS-WALLET-PAID",
"sev": "P1",
"owner": "phu",
"title": "Tiền nạp ads thật không có hiệu quả",
"trigger": "Chi tiêu từ tiền nạp (paid top-up, không phải free credit) 7d >= 1.000.000₫ AND ads.gmv / ads.cost 7d < 8",
"kind": "issue"
},
{
"id": "L-ADS-WALLET-LOW",
"sev": "P2",
"owner": "phu",
"title": "Ví quảng cáo sắp hết",
"trigger": "ads.walletBalance < 2 × avg ads.cost/ngày 7d AND ROAS 7d >= 10",
"kind": "issue"
},
{
"id": "L-PRICE-CHANGE",
"sev": "P2",
"owner": "phu",
"title": "Giá sản phẩm thay đổi",
"trigger": "product.listPrice hoặc product.promoPrice khác so với lần sync trước, HOẶC listPrice != 700.000₫",
"kind": "issue"
},
{
"id": "L-OPP-CTR-CVR",
"sev": "P2",
"owner": "phu",
"title": "Click cao, chuyển đổi thấp",
"trigger": "ads CTR 7d >= 2% AND ads.orders / ads.clicks 7d < 1% AND clicks 7d >= 300",
"kind": "opportunity"
},
{
"id": "L-OPP-SURGE",
"sev": "P2",
"owner": "phu",
"title": "Đơn tăng vọt, nên đẩy mạnh",
"trigger": "units 3d >= 2 × (planUnits[tháng] / daysInMonth × 3) AND thực nhận/kệ 3d >= 189.051₫",
"kind": "opportunity"
},
{
"id": "L-OPP-AFFILIATE",
"sev": "P3",
"owner": "phu",
"title": "Chưa khai thác Affiliate đủ",
"trigger": "đơn Affiliate 30d / tổng đơn 30d < 10% AND local pace units < 100%",
"kind": "opportunity"
},
{
"id": "X-TASK-OVERDUE",
"sev": "P1",
"owner": "manager",
"title": "Việc quá hạn SLA",
"trigger": "task.open == true AND now > task.agedFrom + SLA(severity) — tự nâng 1 cấp severity và gửi template remind",
"kind": "issue"
},
{
"id": "X-RECURRENCE",
"sev": "P1",
"owner": "manager",
"title": "Vấn đề tái phát",
"trigger": "Cùng rule id + cùng owner mở lần 2 trong 30 ngày → cờ 'Nhắc nhở'; lần 3 → cờ 'Cảnh cáo' + template warning",
"kind": "issue"
},
{
"id": "X-ROUTINE-MISSED",
"sev": "P2",
"owner": "manager",
"title": "Bỏ lỡ việc định kỳ",
"trigger": "routine.due đã qua AND routine.verify chưa thỏa (data hoặc evidence)",
"kind": "issue"
}
]
};
