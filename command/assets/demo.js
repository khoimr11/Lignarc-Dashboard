/* Demo data (fake) so the layout can be previewed without logging in: ?demo=1 */
window.CCDEMO = function () {
const today = CCE.todayVN(), add = CCE.isoAdd, now = Math.floor(Date.now()/1000);
const parts = ['ZENA-36-DO','ZENA-48-LO','CALIX-60-DO','VESTRA-RC'];
const products = Object.fromEntries(parts.map((p,i)=>[p,{col:p.split('-')[0],name:p,base:200+i*80,fam:'L'+i,color:i%2?'Light Oak':'Walnut'}]));
const orders=[]; for(let d=0;d<45;d++) for(let k=0;k<(d%3?1:2);k++){ const p=parts[(d+k)%3]; orders.push(['PO'+d+k,null,add(today,-d),'Shipped','Wayfair','CA','US',p,null,null,null,1,(products[p].base)*0.82,'no',null,null,null,add(today,-d)+'T10:00:00Z']); }
orders.push(['TT1',null,add(today,-5),'Shipped','Wayfair','NY','US','ZENA-36-DO',null,null,null,1,150,'no']);
const G = { meta:{today, at: now-3600*18}, products, assump:{}, cgFees:{actual:{'ZENA-36-DO':25,'ZENA-48-LO':28,'CALIX-60-DO':40}},
  pos:[{id:'1st Shipment',whs:'W1',recv:add(today,-80),items:parts.map(p=>[p,60,90,140])}],
  wf:{orders, ttPOs:['TT1'], inv:[['ZENA-36-DO',0,6,6],['ZENA-48-LO',0,40,40],['CALIX-60-DO',0,30,30],['VESTRA-RC',0,25,25]], inb:[],
      ads:{daily:[...Array(10)].flatMap((_,d)=>[['C1',add(today,-d),900,30,20,0,0,0],['C2',add(today,-d),500,12,6,1,260,1]])}},
  kpi:{months:[today.slice(0,7)],rev:[30000],unit:[120],profit:[4000],mkt:[6000]},
  incidents:{asOf:add(today,-2),cases:[{po:'KFFX',part:'CALIX-60-DO',issue:'Damaged',kind:'Incident',detail:'Sink top broken',comment:'The sink top was broken',photos:7,deduction:235.62,delivered:add(today,-6),caseNo:'CS689502760'},{po:'D9YA',part:'ZENA-48-LO',issue:'Wrong size',kind:'Return',detail:'Return',comment:'Wrong size for bathroom.',photos:0,deduction:120.62,delivered:add(today,-9),caseNo:'CS689434652'}]},
  incidentStats:{incidentRate:0.16,brr:0.04,partsShipped:0}, deductions:[{date:add(today,-4),po:'KFFX',part:'CALIX-60-DO',type:'Incident',amount:235.62}]};
const H=3600, lo=[];
for(let d=0;d<40;d++){ const t=now-d*86400-5*H; lo.push(['SN'+d,t,4,d<1?'Chờ lấy hàng':'Hoàn thành',1,d%4?399000:299000,380000,'Đen',d%4?399000:299000,'Hồ Chí Minh','SPX',20000,30000,5000,12000,d%5?0:10000,0,300000,'K3T',0,1,'P','0',0,0,1,null,'','Hàng Cồng Kềnh',0,t+H*10,t+H*50]); }
lo.push(['SNX',now-30*H,1,'Chờ xác nhận',1,399000,399000,'Đen',399000,'Hà Nội','',0,0,0,0,0,0,null,'K3T',0,1]);
lo.push(['SNC',now-2*86400,5,'Đã hủy',1,399000,0,'Đen',399000,'Hà Nội','',0,0,0,0,0,0,null,'K3T',0,1]);
const L = { meta:{at: now-17*H}, products:[[1,2,'Kệ 3 tầng','Đen','K3T',700000,399000,9]], orders:lo,
  ads:[...Array(10)].map((_,d)=>[now-d*86400,1000,30,20000,0,0,0,0,0,0]), ledger:[[now-2*86400,'paid',200000,'topup','']],
  reviews:[[now-50*H,2,'Bánh xe bị gãy khi lắp',2,'SN2',0,0,0],[now-30*H,5,'Đẹp',0,'SN3',1,now-20*H,0],[now-40*H,3,'thiếu ốc',0,'SN4',0,0,0]],
  promo:{fs:[[ '111111', now-3*86400, 7200, 299000, 10, 1, 0, 0 ]], disc:[], vch:[['v1','Giảm 20k','LF20',now-86400*5,now+86400*2,0,20000,0,0,100,95,100,1]], kpi:[]} };
  return { G, L };
};
