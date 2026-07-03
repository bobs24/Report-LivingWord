const APP_CONFIG=window.APP_CONFIG||{};
const MASTER_OPTIONS={category:['Online','Offline','Free Sample','Tier 1','Tier 2','Tier 3'],channel:['Shopee','Tokopedia','WA Order','Conference'],location:['Apartemen Surabaya','Mavelyn','Gudang Jemursari','Gudang Riverside','Gibeon','Petra','LilinKecil','Insight Unlimited']};
const MONTHS=[{n:1,name:'January'},{n:2,name:'February'},{n:3,name:'March'},{n:4,name:'April'},{n:5,name:'May'},{n:6,name:'June'},{n:7,name:'July'},{n:8,name:'August'},{n:9,name:'September'},{n:10,name:'October'},{n:11,name:'November'},{n:12,name:'December'}];

const state={
  client:null,user:null,sales:[],stock:[],transfers:[],movements:[],draftLines:[],editLineIndex:null,
  reportRows:[],reportProductSummary:[],reportChannelSummary:[],reportTimeSeries:[],
  stockIndex:{allProducts:[],availableProducts:[],allSkus:[],availableSkus:[],bySku:{},byProduct:{},bySkuLocation:{},byProductLocation:{},availableSkusByLocation:{},availableProductsByLocation:{}}
};

const columns={
  sales:['status','action','sale_date','created_by','location','category','channel','order_number','sku','product_name','qty','price','discount_type','discount_value','discount','total_price','remark'],
  stock:['stock_status','location','sku','product_name','qty','price','tier1_price','tier2_price','tier3_price','cogs','updated_at'],
  transfer:['transfer_date','created_by','sku','product_name','from_location','to_location','qty','remark'],
  movement:['created_at','created_by','movement_type','location','sku','product_name','qty_change','reference_type','reference_key','remark'],
  draft:['action','sku','product_name','qty','price','discount_type','discount_value','line_total'],
  productSummary:['product_name','qty','amount'],
  channelSummary:['channel','qty','amount','transactions']
};

document.addEventListener('DOMContentLoaded',async()=>{
  init();
  setDefaultDates();
  bindEvents();
  renderReportInputs();
  renderDraftTable();
  initLiveDropdowns();
  await loadUser();
  await refreshAll();
});

function init(){
  if(!APP_CONFIG.SUPABASE_URL||!APP_CONFIG.SUPABASE_ANON_KEY){showMessage('Missing Supabase config. Check GitHub Secrets and workflow.','err');return}
  state.client=supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_ANON_KEY);
}

function bindEvents(){
  document.querySelectorAll('.tab-button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab,b));
  loginButton.onclick=signInWithGoogle;
  logoutButton.onclick=signOut;
  refreshButton.onclick=refreshAll;
  salesForm.category.addEventListener('change',()=>{
    if(['Tier 1','Tier 2','Tier 3'].includes(salesForm.category.value))salesForm.channel.value='WA Order';
    if(salesForm.category.value==='Free Sample')salesForm.order_number.value='';
    syncSkuProduct(salesForm.category);
  });
  addLineButton.onclick=addDraftLine;
  submitOrderButton.onclick=submitSalesOrder;
  stockForm.onsubmit=submitStock;
  transferForm.onsubmit=submitTransfer;
  reportType.onchange=renderReportInputs;
  loadReportButton.onclick=loadReport;
  document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportByType(b.dataset.export));
  ['salesSearch','stockSearch','transferSearch','movementSearch'].forEach(id=>document.getElementById(id).addEventListener('input',renderMainTables));
  document.querySelectorAll('[name="sku"],[name="order_number"]').forEach(i=>i.addEventListener('input',()=>{const p=i.selectionStart;i.value=i.value.toUpperCase();i.setSelectionRange(p,p)}));
}

function setDefaultDates(){const t=new Date().toISOString().slice(0,10);document.querySelectorAll('input[type="date"]').forEach(i=>i.value=t)}
async function signInWithGoogle(){if(!ensureClient())return;const{error}=await state.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href.split('#')[0]}});if(error)showMessage(error.message,'err')}
async function signOut(){if(!ensureClient())return;await state.client.auth.signOut();state.user=null;updateUserDisplay();showMessage('Signed out successfully.','ok')}
async function loadUser(){if(!ensureClient())return;const{data,error}=await state.client.auth.getUser();if(error)return showMessage(error.message,'err');state.user=data.user||null;updateUserDisplay()}
function updateUserDisplay(){userEmail.textContent=state.user?.email||'Not signed in'}

async function refreshAll(){
  if(!ensureClient())return;
  setLoading(true);await loadUser();
  const rs=await Promise.all([fetchAllRows('sales','created_at',false),fetchAllRows('stock','location',true),fetchAllRows('transfer_stock','created_at',false),fetchAllRows('stock_movements','created_at',false)]);
  setLoading(false);
  for(const r of rs){if(r.error)return showMessage(r.error.message,'err')}
  state.sales=rs[0].data||[];
  state.stock=(rs[1].data||[]).map(addStockStatus).sort((a,b)=>String(a.location).localeCompare(String(b.location))||String(a.sku).localeCompare(String(b.sku)));
  state.transfers=rs[2].data||[];
  state.movements=rs[3].data||[];
  buildStockIndex(state.stock);
  renderMainTables();
  showMessage('Data refreshed.','ok');
}

async function fetchAllRows(t,o,a=true){let all=[],from=0,b=1000;while(true){const r=await state.client.from(t).select('*').order(o,{ascending:a}).range(from,from+b-1);if(r.error)return{data:all,error:r.error};all=all.concat(r.data||[]);if(!r.data||r.data.length<b)break;from+=b}return{data:all,error:null}}

function buildStockIndex(rows){
  const allP=new Set(),availP=new Set(),allS=new Set(),availS=new Set(),bySku={},byProduct={},bySkuLocation={},byProductLocation={},skuLoc={},prodLoc={};
  (rows||[]).forEach(r=>{
    const sku=cleanText(r.sku).toUpperCase(),p=cleanText(r.product_name),l=cleanText(r.location),q=numberValue(r.qty);
    const rec={sku,product_name:p,location:l,qty:q,price:numberValue(r.price),tier1_price:numberValue(r.tier1_price),tier2_price:numberValue(r.tier2_price),tier3_price:numberValue(r.tier3_price),cogs:numberValue(r.cogs)};
    if(!sku&&!p)return;
    if(sku){allS.add(sku);if(!bySku[sku])bySku[sku]=rec;if(l)bySkuLocation[`${l}||${sku}`]=rec}
    if(p){allP.add(p);if(!byProduct[p.toLowerCase()])byProduct[p.toLowerCase()]=rec;if(l)byProductLocation[`${l}||${p.toLowerCase()}`]=rec}
    if(q>0){if(sku)availS.add(sku);if(p)availP.add(p);if(l){if(!skuLoc[l])skuLoc[l]=new Set();if(!prodLoc[l])prodLoc[l]=new Set();if(sku)skuLoc[l].add(sku);if(p)prodLoc[l].add(p)}}
  });
  state.stockIndex={allProducts:[...allP].sort(),availableProducts:[...availP].sort(),allSkus:[...allS].sort(),availableSkus:[...availS].sort(),bySku,byProduct,bySkuLocation,byProductLocation,availableSkusByLocation:Object.fromEntries(Object.entries(skuLoc).map(([k,v])=>[k,[...v].sort()])),availableProductsByLocation:Object.fromEntries(Object.entries(prodLoc).map(([k,v])=>[k,[...v].sort()]))};
}

function initLiveDropdowns(){
  document.querySelectorAll('[data-live-dropdown]').forEach(input=>{
    if(input.dataset.liveReady==='1')return;
    input.dataset.liveReady='1';input.autocomplete='off';
    const panel=document.createElement('div');panel.className='live-dropdown-floating-panel';panel.hidden=true;document.body.appendChild(panel);input._panel=panel;
    input.addEventListener('focus',()=>renderLiveDropdown(input));
    input.addEventListener('input',()=>renderLiveDropdown(input));
    input.addEventListener('change',()=>syncSkuProduct(input));
    input.addEventListener('keydown',e=>{if(e.key==='Escape')panel.hidden=true;if(e.key==='Enter'){e.preventDefault();panel.hidden=true;syncSkuProduct(input)}});
    window.addEventListener('scroll',()=>{if(!panel.hidden)positionLiveDropdown(input)},true);
    window.addEventListener('resize',()=>{if(!panel.hidden)positionLiveDropdown(input)});
    if(window.visualViewport){visualViewport.addEventListener('resize',()=>{if(!panel.hidden)positionLiveDropdown(input)});visualViewport.addEventListener('scroll',()=>{if(!panel.hidden)positionLiveDropdown(input)})}
    document.addEventListener('pointerdown',e=>{if(e.target!==input&&!panel.contains(e.target))panel.hidden=true});
  });
}

function positionLiveDropdown(input){
  const panel=input._panel;if(!panel)return;
  const vv=window.visualViewport,w=vv?vv.width:innerWidth,h=vv?vv.height:innerHeight,rect=input.getBoundingClientRect(),mobile=w<=700;
  if(mobile){panel.classList.add('mobile-mode');panel.style.maxHeight=`${Math.max(180,Math.min(h*.52,360))}px`;return}
  panel.classList.remove('mobile-mode');panel.style.right='auto';panel.style.bottom='auto';
  const margin=8,spaceBelow=h-rect.bottom-margin,spaceAbove=rect.top-margin,openBelow=spaceBelow>=140||spaceBelow>=spaceAbove,maxHeight=Math.max(120,Math.min(260,openBelow?spaceBelow:spaceAbove)),width=Math.max(rect.width,180),left=Math.min(Math.max(rect.left,margin),w-width-margin);
  panel.style.left=`${left}px`;panel.style.width=`${width}px`;panel.style.maxHeight=`${maxHeight}px`;panel.style.top=openBelow?`${rect.bottom+4}px`:`${Math.max(margin,rect.top-maxHeight-4)}px`;
}

function optionsFor(input){
  const t=input.dataset.liveDropdown,idx=state.stockIndex;
  if(t==='category')return MASTER_OPTIONS.category;if(t==='channel')return MASTER_OPTIONS.channel;if(t==='location')return MASTER_OPTIONS.location;
  if(t==='sku-stock')return idx.allSkus;if(t==='product-stock'||t==='product-report')return idx.allProducts;
  if(t==='sku-sale'||t==='sku-report'){const l=cleanText(input.closest('form')?.querySelector('[name="location"]')?.value);return l&&idx.availableSkusByLocation[l]?idx.availableSkusByLocation[l]:idx.availableSkus}
  if(t==='product-sale'){const l=cleanText(input.closest('form')?.querySelector('[name="location"]')?.value);return l&&idx.availableProductsByLocation[l]?idx.availableProductsByLocation[l]:idx.availableProducts}
  if(t==='sku-transfer'){const l=cleanText(input.closest('form')?.querySelector('[name="from_location"]')?.value);return l&&idx.availableSkusByLocation[l]?idx.availableSkusByLocation[l]:idx.availableSkus}
  if(t==='product-transfer'){const l=cleanText(input.closest('form')?.querySelector('[name="from_location"]')?.value);return l&&idx.availableProductsByLocation[l]?idx.availableProductsByLocation[l]:idx.availableProducts}
  return[];
}

function renderLiveDropdown(input){
  const panel=input._panel;if(!panel)return;
  const q=cleanText(input.value).toLowerCase(),opts=optionsFor(input).filter(x=>String(x).toLowerCase().includes(q)).slice(0,40);
  panel.innerHTML=opts.length?opts.map(o=>`<button type="button" class="live-dropdown-option">${escapeHtml(o)}</button>`).join(''):'<div class="live-dropdown-empty">No matching option</div>';
  panel.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{input.value=btn.textContent;panel.hidden=true;input.dispatchEvent(new Event('change',{bubbles:true}));syncSkuProduct(input)});
  panel.hidden=false;positionLiveDropdown(input);
}

function calculateLineTotal(line){const gross=line.qty*line.price,disc=line.discount_type==='PERCENT'?gross*line.discount_value/100:line.discount_value;return gross-disc}

function addDraftLine(){
  const f=salesForm,line={sku:cleanText(f.sku.value).toUpperCase(),product_name:cleanText(f.product_name.value),qty:numberValue(f.qty.value),price:numberValue(f.price.value),discount_type:cleanText(f.discount_type.value)||'AMOUNT',discount_value:numberValue(f.discount_value.value),remark:cleanText(f.remark.value)};
  if(!line.sku||!line.product_name||line.qty<=0||line.price<0)return showMessage('Please fill SKU, Product Name, Qty, and Price correctly.','err');
  const editIndex=Number.isInteger(state.editLineIndex)?state.editLineIndex:null;
  if(state.draftLines.some((x,i)=>x.sku===line.sku&&i!==editIndex))return showMessage('Duplicate SKU in draft. Use one line per SKU.','err');
  line.line_total=calculateLineTotal(line);
  if(editIndex!==null&&state.draftLines[editIndex]){state.draftLines[editIndex]=line;state.editLineIndex=null;addLineButton.textContent='Add Product to Draft';showMessage('Draft line updated.','ok')}
  else{state.draftLines.push(line);showMessage('Product added to draft.','ok')}
  ['sku','product_name','qty','price','discount_value','remark'].forEach(n=>{if(f[n])f[n].value=n==='qty'?1:n==='discount_value'?0:''});
  renderDraftTable();f.sku.focus();
}

function editDraftLine(i){
  const line=state.draftLines[i];if(!line)return;const f=salesForm;
  f.sku.value=line.sku||'';f.product_name.value=line.product_name||'';f.qty.value=line.qty||1;f.price.value=line.price||0;f.discount_type.value=line.discount_type||'AMOUNT';f.discount_value.value=line.discount_value||0;f.remark.value=line.remark||'';
  state.editLineIndex=i;addLineButton.textContent='Update Draft Line';f.sku.focus();showMessage('Draft line loaded for editing.','ok');
}

function removeDraftLine(i){state.draftLines.splice(i,1);if(state.editLineIndex===i){state.editLineIndex=null;addLineButton.textContent='Add Product to Draft'}renderDraftTable();showMessage('Draft line removed.','ok')}

async function submitSalesOrder(){
  if(!ensureReadyForWrite())return;if(!state.draftLines.length)return showMessage('Please add at least one product first.','err');
  const h={sale_date:salesForm.sale_date.value,location:cleanText(salesForm.location.value),category:cleanText(salesForm.category.value),channel:cleanText(salesForm.channel.value),order_number:cleanText(salesForm.order_number.value).toUpperCase()};
  if(['Tier 1','Tier 2','Tier 3'].includes(h.category))h.channel='WA Order';
  if(h.category==='Free Sample')h.order_number='';
  if(h.category!=='Free Sample'&&!h.order_number)return showMessage('Order / Invoice Number is required except for Free Sample.','err');
  const{error}=await state.client.rpc('add_sales_order',{p_header:h,p_lines:state.draftLines});if(error)return showMessage(error.message,'err');
  state.draftLines=[];state.editLineIndex=null;renderDraftTable();showMessage('Full order submitted successfully.','ok');await refreshAll();
}

function renderDraftTable(){renderTable('draftTable',state.draftLines.map((x,i)=>({...x,action:i})),columns.draft);draftSummaryText.textContent=state.draftLines.length?`${state.draftLines.length} line(s), total ${formatCurrency(state.draftLines.reduce((s,x)=>s+x.line_total,0))}`:'No draft lines yet.'}
async function submitStock(e){e.preventDefault();if(!ensureReadyForWrite())return;const p=normalizeStockPayload(formToObject(e.target));const{error}=await state.client.rpc('upsert_stock_item',{p_location:p.location,p_sku:p.sku,p_product_name:p.product_name,p_qty:p.qty,p_price:p.price,p_tier1_price:p.tier1_price,p_tier2_price:p.tier2_price,p_tier3_price:p.tier3_price,p_cogs:p.cogs});if(error)return showMessage(error.message,'err');e.target.reset();showMessage('Stock saved.','ok');await refreshAll()}
async function submitTransfer(e){e.preventDefault();if(!ensureReadyForWrite())return;const p=normalizeTransferPayload(formToObject(e.target));const{error}=await state.client.rpc('transfer_stock_transaction',{p_transfer_date:p.transfer_date,p_sku:p.sku,p_product_name:p.product_name,p_from_location:p.from_location,p_to_location:p.to_location,p_qty:p.qty,p_remark:p.remark});if(error)return showMessage(error.message,'err');e.target.reset();setDefaultDates();showMessage('Transfer saved.','ok');await refreshAll()}
async function revokeSale(id){if(!ensureReadyForWrite())return;const reason=prompt('Reason for revoke?');if(reason===null)return;if(!cleanText(reason))return showMessage('Revoke reason is required.','err');const{error}=await state.client.rpc('revoke_sales_transaction',{p_sales_id:id,p_revoke_reason:cleanText(reason)});if(error)return showMessage(error.message,'err');showMessage('Sales revoked and stock returned.','ok');await refreshAll()}
function bindRevokeButtons(){document.querySelectorAll('[data-revoke-sales-id]').forEach(b=>b.onclick=()=>revokeSale(b.dataset.revokeSalesId))}
function addStockStatus(r){const q=numberValue(r.qty);return{...r,stock_status:q<=0?'Out of Stock':q<=5?'Low Stock':'Healthy'}}
function renderMainTables(){const s=filterRows(state.sales,salesSearch.value);renderTable('salesTable',s,columns.sales);renderTable('stockTable',filterRows(state.stock,stockSearch.value),columns.stock);renderTable('transferTable',filterRows(state.transfers,transferSearch.value),columns.transfer);renderTable('movementTable',filterRows(state.movements,movementSearch.value),columns.movement);salesCountText.textContent=`Showing ${s.length.toLocaleString()} of ${state.sales.length.toLocaleString()} loaded transactions.`}

function renderReportInputs(){const type=reportType.value,today=new Date().toISOString().slice(0,10),now=new Date(),y=now.getFullYear(),m=now.getMonth()+1,ms=`<select id="reportMonth">${MONTHS.map(x=>`<option value="${x.n}" ${x.n===m?'selected':''}>${x.name}</option>`).join('')}</select>`;if(type==='daily'){reportDynamicInputs.innerHTML=`<label>Start Date<input id="reportStartDate" type="date" value="${today}"></label><label>End Date<input id="reportEndDate" type="date" value="${today}"></label>`;return}if(type==='weekly'){reportDynamicInputs.innerHTML=`<label>Week<select id="reportWeek"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><label>Month${ms}</label><label>Year<input id="reportYear" type="number" value="${y}"></label>`;return}reportDynamicInputs.innerHTML=`<label>Month${ms}</label><label>Year<input id="reportYear" type="number" value="${y}"></label>`}
async function loadReport(){if(!ensureClient())return;const r=getReportDateRange();if(!r)return;let q=state.client.from('sales').select('*').eq('status','ACTIVE').gte('sale_date',r.startDate).lte('sale_date',r.endDate).order('sale_date',{ascending:true});const sku=cleanText(reportSkuFilter.value),loc=cleanText(reportLocationFilter.value);if(sku)q=q.ilike('sku',sku);if(loc)q=q.ilike('location',loc);const{data,error}=await q;if(error)return showMessage(error.message,'err');buildReport(data||[]);showMessage('Report loaded.','ok')}
function buildReport(rows){state.reportRows=rows;const pm=new Map(),cm=new Map(),dm=new Map();let tq=0,ta=0;rows.forEach(r=>{const q=numberValue(r.qty),a=numberValue(r.total_price),p=r.product_name||'Unknown',c=r.channel||'Unknown',d=r.sale_date||'Unknown';tq+=q;ta+=a;addSummary(pm,p,{product_name:p,qty:0,amount:0},q,a);addSummary(cm,c,{channel:c,qty:0,amount:0,transactions:0},q,a,true);addSummary(dm,d,{label:d,qty:0,amount:0},q,a)});state.reportProductSummary=[...pm.values()].sort((a,b)=>b.amount-a.amount);state.reportChannelSummary=[...cm.values()].sort((a,b)=>b.amount-a.amount);state.reportTimeSeries=[...dm.values()].sort((a,b)=>String(a.label).localeCompare(String(b.label)));kpiQty.textContent=formatNumber(tq);kpiAmount.textContent=formatCurrency(ta);kpiTransactions.textContent=formatNumber(rows.length);kpiTopProduct.textContent=state.reportProductSummary[0]?.product_name||'-';renderTable('productSummaryTable',state.reportProductSummary,columns.productSummary);renderTable('channelSummaryTable',state.reportChannelSummary,columns.channelSummary);drawComboChart('trendChart',state.reportTimeSeries)}
function addSummary(m,k,i,q,a,c=false){if(!m.has(k))m.set(k,i);const x=m.get(k);x.qty+=q;x.amount+=a;if(c)x.transactions+=1}
function getReportDateRange(){const t=reportType.value;if(t==='daily'){const s=reportStartDate.value,e=reportEndDate.value;if(!s||!e||s>e){showMessage('Invalid date range.','err');return null}return{startDate:s,endDate:e}}const m=Number(reportMonth.value),y=Number(reportYear.value);if(t==='monthly')return{startDate:fd(y,m,1),endDate:fd(y,m,new Date(y,m,0).getDate())};const w=Number(reportWeek.value),sd=(w-1)*7+1,ed=w===5?new Date(y,m,0).getDate():w*7;return{startDate:fd(y,m,sd),endDate:fd(y,m,ed)}}
function fd(y,m,d){return`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}

function renderTable(id,rows,cols){
  const el=document.getElementById(id);if(!rows||!rows.length){el.innerHTML='<div class="empty-state">No data to show.</div>';return}
  el.innerHTML=`<table><thead><tr>${cols.map(c=>`<th>${escapeHtml(toLabel(c))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>{const value=(c==='action'&&id==='draftTable')?r.action:(c==='action'?r:r[c]);return`<td>${formatCellHtml(value,c)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  if(id==='salesTable')bindRevokeButtons();
  if(id==='draftTable')bindDraftActionButtons();
}

function bindDraftActionButtons(){document.querySelectorAll('[data-edit-line]').forEach(b=>b.onclick=()=>editDraftLine(Number(b.dataset.editLine)));document.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>removeDraftLine(Number(b.dataset.removeLine)))}

function drawComboChart(id,data){
  const el=document.getElementById(id);if(!data.length){el.innerHTML='<div class="empty-state">No report data.</div>';return}
  const width=980,height=390,pad={top:24,right:44,bottom:72,left:76},plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom,maxAmount=Math.max(...data.map(x=>numberValue(x.amount)),1),maxQty=Math.max(...data.map(x=>numberValue(x.qty)),1),step=plotW/Math.max(data.length,1),barW=Math.min(64,Math.max(22,step*.52)),xAt=i=>pad.left+step*i+step/2,yAmount=v=>pad.top+plotH-numberValue(v)/maxAmount*plotH,yQty=v=>pad.top+plotH-numberValue(v)/maxQty*plotH,esc=v=>escapeHtml(String(v));
  const grid=[0,.25,.5,.75,1].map(t=>{const y=pad.top+plotH-t*plotH;return`<line x1="${pad.left}" y1="${y}" x2="${width-pad.right}" y2="${y}" class="grid-line"></line><text x="${pad.left-12}" y="${y+4}" text-anchor="end">${esc(formatCurrency(maxAmount*t).replace('IDR ',''))}</text>`}).join('');
  const bars=data.map((d,i)=>{const h=pad.top+plotH-yAmount(d.amount),x=xAt(i)-barW/2,y=yAmount(d.amount),label=h>24?`<text class="amount-label" x="${xAt(i)}" y="${y-8}" text-anchor="middle">${esc(formatCurrency(d.amount).replace('IDR ',''))}</text>`:'';return`<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8"><title>${esc(d.label)} Amount: ${esc(formatCurrency(d.amount))}</title></rect>${label}`}).join('');
  const points=data.map((d,i)=>`${xAt(i)},${yQty(d.qty)}`).join(' ');
  const dots=data.map((d,i)=>`<circle cx="${xAt(i)}" cy="${yQty(d.qty)}" r="5"><title>${esc(d.label)} Qty: ${esc(formatNumber(d.qty))}</title></circle><text x="${xAt(i)+10}" y="${yQty(d.qty)-8}">${esc(formatNumber(d.qty))}</text>`).join('');
  const labels=data.map((d,i)=>`<text x="${xAt(i)}" y="${height-34}" text-anchor="end" transform="rotate(-35 ${xAt(i)} ${height-34})">${esc(d.label)}</text>`).join('');
  el.innerHTML=`<svg class="combo-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sales trend chart"><g>${grid}</g><line x1="${pad.left}" y1="${pad.top+plotH}" x2="${width-pad.right}" y2="${pad.top+plotH}" class="axis-line"></line><g class="amount-bars">${bars}</g><polyline class="qty-line" points="${points}"></polyline><g class="qty-dots">${dots}</g><g>${labels}</g></svg>`;
}

function exportByType(t){if(t==='report'){exportReportWorkbook();return}let rows=[],file='export.xlsx',cols=[];if(t==='sales'){rows=filterRows(state.sales,salesSearch.value);file='sales_export.xlsx';cols=columns.sales.filter(c=>c!=='action')}if(t==='stock'){rows=filterRows(state.stock,stockSearch.value);file='stock_export.xlsx';cols=columns.stock}if(t==='transfer'){rows=filterRows(state.transfers,transferSearch.value);file='transfer_stock_export.xlsx';cols=columns.transfer}if(t==='movements'){rows=filterRows(state.movements,movementSearch.value);file='stock_movements_export.xlsx';cols=columns.movement}exportRowsToXlsx(rows,file,'Data',cols)}
function exportReportWorkbook(){const wb=XLSX.utils.book_new();addSheet(wb,state.reportRows,'Raw Sales',columns.sales.filter(c=>c!=='action'));addSheet(wb,state.reportProductSummary,'Product Summary',columns.productSummary);addSheet(wb,state.reportChannelSummary,'Channel Summary',columns.channelSummary);addSheet(wb,state.reportTimeSeries,'Trend',['label','qty','amount']);XLSX.writeFile(wb,`sales_report_${new Date().toISOString().slice(0,10)}.xlsx`)}
function exportRowsToXlsx(rows,file,sheet,cols){if(!rows.length)return showMessage('No data available to export.','err');const wb=XLSX.utils.book_new();addSheet(wb,rows,sheet,cols);XLSX.writeFile(wb,file)}
function addSheet(wb,rows,sheet,cols){XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.map(r=>Object.fromEntries(cols.map(c=>[toLabel(c),formatExportCell(r[c],c)])))),sheet)}
function formToObject(f){return Object.fromEntries(new FormData(f).entries())}
function normalizeStockPayload(p){return{location:cleanText(p.location),sku:cleanText(p.sku).toUpperCase(),product_name:cleanText(p.product_name),qty:numberValue(p.qty),price:numberValue(p.price),tier1_price:numberValue(p.tier1_price),tier2_price:numberValue(p.tier2_price),tier3_price:numberValue(p.tier3_price),cogs:numberValue(p.cogs)}}
function normalizeTransferPayload(p){return{transfer_date:p.transfer_date,sku:cleanText(p.sku).toUpperCase(),product_name:cleanText(p.product_name),from_location:cleanText(p.from_location),to_location:cleanText(p.to_location),qty:numberValue(p.qty),remark:cleanText(p.remark)}}
function filterRows(rows,s){const q=cleanText(s).toLowerCase();return q?rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)):rows}
function showTab(id,b){document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');b.classList.add('active')}
function showMessage(t,type='ok'){messageBox.textContent=t;messageBox.className=`message ${type}`}
function setLoading(v){document.body.classList.toggle('loading',v)}
function ensureClient(){if(!state.client){showMessage('Supabase client is not ready.','err');return false}return true}
function ensureReadyForWrite(){if(!ensureClient())return false;if(!state.user){showMessage('Please login first before saving data.','err');return false}return true}
function findMatch(form){const sku=cleanText(form.querySelector('[name="sku"]')?.value).toUpperCase(),product=cleanText(form.querySelector('[name="product_name"]')?.value).toLowerCase(),loc=cleanText(form.querySelector('[name="location"]')?.value)||cleanText(form.querySelector('[name="from_location"]')?.value),idx=state.stockIndex;return(loc&&sku&&idx.bySkuLocation[`${loc}||${sku}`])||(loc&&product&&idx.byProductLocation[`${loc}||${product}`])||(sku&&idx.bySku[sku])||(product&&idx.byProduct[product])||null}
function priceForCategory(m,c){if(!m)return'';if(c==='Free Sample')return 0;if(c==='Tier 1')return m.tier1_price||0;if(c==='Tier 2')return m.tier2_price||0;if(c==='Tier 3')return m.tier3_price||0;return m.price||0}
function syncSkuProduct(input){const form=input.closest('form');if(!form)return;const skuI=form.querySelector('[name="sku"]'),prodI=form.querySelector('[name="product_name"]'),catI=form.querySelector('[name="category"]'),chanI=form.querySelector('[name="channel"]');if(catI&&chanI&&['Tier 1','Tier 2','Tier 3'].includes(catI.value)){chanI.value='WA Order';flash(chanI)}if(catI&&catI.value==='Free Sample'&&form.querySelector('[name="order_number"]'))form.querySelector('[name="order_number"]').value='';if(skuI)skuI.value=cleanText(skuI.value).toUpperCase();if(!skuI||!prodI)return;const m=findMatch(form);if(!m)return;if(input.name==='sku'||!prodI.value){prodI.value=m.product_name||prodI.value;flash(prodI)}if(input.name==='product_name'||!skuI.value){skuI.value=m.sku||skuI.value;flash(skuI)}if(catI&&form.querySelector('[name="price"]'))setVal(form,'price',priceForCategory(m,catI.value));if(form.id==='stockForm'){setVal(form,'price',m.price);setVal(form,'tier1_price',m.tier1_price);setVal(form,'tier2_price',m.tier2_price);setVal(form,'tier3_price',m.tier3_price);setVal(form,'cogs',m.cogs)}}
function setVal(form,name,value){const el=form.querySelector(`[name="${name}"]`);if(el&&value!==undefined&&value!==null&&value!==''){el.value=value;flash(el)}}
function flash(el){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}
function cleanText(v){return String(v||'').trim()}
function numberValue(v){const n=Number(v||0);return Number.isFinite(n)?n:0}
function formatNumber(v){return numberValue(v).toLocaleString('id-ID',{maximumFractionDigits:2})}
function formatCurrency(v){return'IDR '+numberValue(v).toLocaleString('id-ID',{maximumFractionDigits:2})}
function formatDateTime(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function formatCell(v,c){if(['price','tier1_price','tier2_price','tier3_price','discount','total_price','cogs','amount','line_total'].includes(c))return formatCurrency(v);if(['discount_value','qty','qty_change','transactions'].includes(c))return formatNumber(v);if(['created_at','updated_at','revoked_at'].includes(c)&&v)return formatDateTime(v);return v??''}
function formatCellHtml(v,c){
  if(c==='stock_status'){const cls=v==='Out of Stock'?'badge badge-out':v==='Low Stock'?'badge badge-low':'badge badge-ok';return`<span class="${cls}">${escapeHtml(v)}</span>`}
  if(c==='status'){const s=v||'ACTIVE',cls=s==='REVOKED'?'status-revoked':'status-active';return`<span class="${cls}">${escapeHtml(s)}</span>`}
  if(c==='action'){
    if(typeof v==='number')return`<div class="draft-actions"><button class="icon-btn edit-line-btn" type="button" title="Edit line" aria-label="Edit line" data-edit-line="${v}">✎</button><button class="icon-btn remove-line-btn" type="button" title="Remove line" aria-label="Remove line" data-remove-line="${v}">×</button></div>`;
    const r=v||{};return(r.status||'ACTIVE')==='REVOKED'?'<span class="revoke-disabled">Revoked</span>':`<button class="revoke-btn" type="button" data-revoke-sales-id="${escapeHtml(r.id)}">Revoke</button>`;
  }
  return escapeHtml(formatCell(v,c));
}
function formatExportCell(v,c){if(['price','tier1_price','tier2_price','tier3_price','discount','total_price','cogs','amount','line_total','discount_value','qty','qty_change','transactions'].includes(c))return numberValue(v);if(['created_at','updated_at','revoked_at'].includes(c)&&v)return formatDateTime(v);return v??''}
function toLabel(v){return String(v).replaceAll('_',' ')}
function escapeHtml(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
