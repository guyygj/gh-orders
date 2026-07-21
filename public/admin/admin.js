// GH报单系统 v3.0 — Admin JS
(function(){
const $=s=>document.querySelector(s);
const API='/api/admin';
const platforms=['京东','淘宝','天猫','拼多多','抖音','快手','苏宁易购','唯品会','得物','小红书','闲鱼'];
let token='',user=null;

init();
function init(){
  token=localStorage.getItem('gh_token');
  user=JSON.parse(localStorage.getItem('gh_user')||'null');
  if(!token||!user||user.role!=='admin'){location.href='/';return}
  $('#displayName').textContent=user.username;
  $('#displayRole').textContent='管理员';
  bindTabs();
  bindEvents();
  loadOrdersTab();
}

function bindTabs(){
  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p=>p.style.display='none');
    $('#tab-'+b.dataset.tab).style.display='block';
    const t=b.dataset.tab;
    if(t==='orders')loadOrdersTab();
    if(t==='reviews')loadReviewsTab();
    if(t==='members')loadMembersTab();
    if(t==='stats')loadStatsTab();
  }));
}

function bindEvents(){
  $('#btnLogout').addEventListener('click',()=>{localStorage.removeItem('gh_token');localStorage.removeItem('gh_user');location.href='/'});
  $('#oexport').addEventListener('click',exportAdminCSV);
  $('#oaddBtn').addEventListener('click',()=>openOrderModal());
  $('#osearch').addEventListener('input',debounce(loadOrdersTab,300));
  $('#oplatform,#ostatus,#ouser').addEventListener('change',loadOrdersTab);
  $('#orderForm').addEventListener('submit',handleOrderSave);
  $('#ofPrice,#ofCoupon').addEventListener('input',calcActual);
  $('#memberForm').addEventListener('submit',handleAddMember);
  $('#maddBtn').addEventListener('click',()=>{$('#memberModal').style.display='flex'});
  document.querySelectorAll('.modal-close,.btn-cancel,.btn-mcancel').forEach(b=>b.addEventListener('click',closeModals));
  $('#memberModal,#orderModal').forEach?null:0;
  [$('#memberModal'),$('#orderModal')].forEach(m=>{if(m)m.addEventListener('click',e=>{if(e.target===m)m.style.display='none'})});
  $('#idPreview').addEventListener('click',()=>$('#idPreview').style.display='none');
  $('#confirmDlg').querySelector('.btn-cf-no').addEventListener('click',()=>$('#confirmDlg').style.display='none');
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#confirmDlg').style.display='none';closeModals()}});
}

function closeModals(){['orderModal','memberModal'].forEach(id=>{const el=$(id);if(el)el.style.display='none'})}

// Orders Tab
async function loadOrdersTab(){
  const q=$('#osearch').value,p=$('#oplatform').value,s=$('#ostatus').value,u=$('#ouser').value;
  const params=new URLSearchParams({search:q||'',platform:p,status:s,userId:u});
  const res=await fetch(API+'/orders?'+params,{headers:{Authorization:'Bearer '+token}});
  const d=await res.json();
  let html='';
  d.list.forEach(o=>{
    const pf=(o.selling_price||0)-o.actual_payment;
    html+=`<tr><td>${esc(o.username||'')}</td><td><span class="tag tag-platform ${o.platform}">${o.platform}</span></td><td>${esc(o.product_name)}</td><td class="amount spend">${fmt(o.actual_payment)}</td><td class="amount">${o.selling_price?fmt(o.selling_price):'-'}</td><td class="amount profit ${pf>=0?'pos':'neg'}">${o.selling_price?fmt(pf):'-'}</td><td class="tracking">${esc(o.tracking_no)}</td><td><span class="status-tag ${o.order_status}">${o.order_status}</span></td><td style="font-size:11px;color:#888">${(o.created_at||'').slice(0,10)}</td><td><button class="btn btn-default btn-sm btn-oedit" data-id="${o.id}">编辑</button> <button class="btn btn-default btn-sm btn-odel" data-id="${o.id}" style="color:var(--red)">删除</button></td></tr>`;
  });
  $('#otbody').innerHTML=html||'';
  $('#oempty').style.display=d.list.length?'none':'block';
  document.querySelectorAll('.btn-oedit').forEach(b=>b.addEventListener('click',()=>openOrderModal(b.dataset.id)));
  document.querySelectorAll('.btn-odel').forEach(b=>b.addEventListener('click',()=>cf(()=>fetch(API+'/orders/'+b.dataset.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}}).then(()=>{loadOrdersTab();toast('已删除')}))));
  loadAdminStats();
  const res2=await fetch('/api/admin/users?'+new URLSearchParams(),{headers:{Authorization:'Bearer '+token}});
  const users=await res2.json();
  $('#ouser').innerHTML='<option value="">全部用户</option>'+users.map(u=>`<option value="${u.id}">${esc(u.username)}</option>`).join('');
  fillSelect('oplatform',platforms);
}

async function loadAdminStats(){
  const res=await fetch(API+'/stats',{headers:{Authorization:'Bearer '+token}});
  const d=await res.json();
  const g=d.global||d;
  $('#sSpend').textContent=fmt(g.spend);
  $('#sSold').textContent=fmt(g.sold);
  $('#sProfit').textContent=fmt(g.profit);
  $('#sOrders').textContent=g.orders;
  $('#sMembers').textContent=g.members||'0';
}

// Reviews Tab
async function loadReviewsTab(){
  const res=await fetch(API+'/reviews',{headers:{Authorization:'Bearer '+token}});
  const list=await res.json();
  let html='';
  list.forEach(u=>{
    html+=`<tr><td>${esc(u.username)}</td><td>${u.id_card_front?`<img class="review-id-card" src="/uploads/id_cards/${u.id_card_front}" onclick="document.getElementById('idPreviewImg').src=this.src;document.getElementById('idPreview').style.display='flex'">`:'无'}</td><td>${u.id_card_back?`<img class="review-id-card" src="/uploads/id_cards/${u.id_card_back}" onclick="document.getElementById('idPreviewImg').src=this.src;document.getElementById('idPreview').style.display='flex'">`:'无'}</td><td style="font-size:11px;color:#888">${(u.created_at||'').slice(0,10)}</td><td><span class="status-tag ${u.status==='pending'?'已下单':''}">${u.status==='pending'?'待审核':u.status==='rejected'?'已拒绝':'已通过'}</span></td><td><button class="btn btn-default btn-sm" style="color:var(--green)" data-id="${u.id}" data-act="approve">通过</button> <button class="btn btn-default btn-sm" style="color:var(--red)" data-id="${u.id}" data-act="reject">拒绝</button></td></tr>`;
  });
  $('#rtbody').innerHTML=html||'';
  $('#rempty').style.display=list.length?'none':'block';
  document.querySelectorAll('button[data-act]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.id,act=b.dataset.act;
    await fetch(API+'/reviews/'+id+'/'+act,{method:'POST',headers:{Authorization:'Bearer '+token}});
    loadReviewsTab();toast(act==='approve'?'已通过':'已拒绝');
  }));
}

// Members Tab
async function loadMembersTab(){
  const res=await fetch(API+'/users',{headers:{Authorization:'Bearer '+token}});
  const list=await res.json();
  let html='';
  list.forEach(u=>{
    html+=`<div class="user-card"><div class="user-header"><span class="username">${esc(u.username)}</span><span class="role-badge ${u.role}">${u.role==='admin'?'管理员':'成员'}</span></div><div class="user-stats"><div>订单：<span class="val">${u.oCnt||0}</span></div><div>花费：<span class="val" style="color:var(--amber)">${fmt(u.spend||0)}</span></div><div>卖出：<span class="val" style="color:var(--green)">${fmt(u.sold||0)}</span></div><div>利润：<span class="val" style="color:${(u.profit||0)>=0?'var(--green)':'var(--red)'}">${fmt(u.profit||0)}</span></div></div><div class="card-actions">${u.role!=='admin'?`<button class="btn btn-default btn-sm" style="color:var(--red)" data-del="${u.id}">删除</button>`:''}</div></div>`;
  });
  $('#mcards').innerHTML=html||'';
  document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>cf(()=>fetch(API+'/users/'+b.dataset.del,{method:'DELETE',headers:{Authorization:'Bearer '+token}}).then(()=>{loadMembersTab();toast('已删除')}))));
}

async function handleAddMember(e){
  e.preventDefault();
  const body={username:$('#mUser').value,password:$('#mPass').value};
  const res=await fetch(API+'/users',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  if(!res.ok){const d=await res.json();return toast(d.error,'error')}
  $('#memberModal').style.display='none';
  loadMembersTab();toast('添加成功');
}

// Stats Tab
async function loadStatsTab(){
  const res=await fetch(API+'/stats',{headers:{Authorization:'Bearer '+token}});
  const d=await res.json();
  let html='';
  (d.members||[]).forEach(m=>{
    const pf=(m.profit||m.profit_||0);
    const spend=m.spend||m.spend_||m.total_spend||0;
    const sold=m.sold||m.sold_||m.total_sold||0;
    html+=`<tr><td>${esc(m.username)}</td><td>${m.cnt||m.oCnt||0}</td><td class="amount spend">${fmt(spend)}</td><td class="amount">${fmt(sold)}</td><td class="amount profit ${pf>=0?'pos':'neg'}">${fmt(pf)}</td><td><span class="tag tag-platform" style="background:#f5f5f5;color:#888">${m.role}</span></td></tr>`;
  });
  $('#sttbody').innerHTML=html||'<tr><td colspan="6" style="text-align:center;color:#888">暂无成员数据</td></tr>';
}

// Order Modal
async function openOrderModal(id){
  fillSelect('ofPlatform',platforms);
  fillSelect('ofSellingPlatform',platforms);
  fillSelect('ofLogistics',['运输中','已揽收','派送中','已签收','退回中']);
  fillSelect('ofStatus',['已下单','已发货','已签收','已卖出','已退货','已作废']);
  fillSelect('ofSettlement',['未结算','已结算']);
  if(id){
    $('#modalTitle').textContent='编辑订单';
    const res=await fetch(API+'/orders?userId='+id.split('_')[0]);
    const d=await res.json();
    let o=d.list?d.list.find(x=>x.id==id):null;
    if(!o){const r2=await fetch(API+'/orders?search='+id);const d2=await r2.json();o=d2.list?d2.list[0]:null}
    if(!o){const r3=await fetch(API+'/orders/'+id,{headers:{Authorization:'Bearer '+token}});o=await r3.json()}
    if(!o||!o.id)return toast('找不到订单','error');
    setVal('ofPlatform',o.platform);setVal('ofProduct',o.product_name);setVal('ofSpec',o.product_spec||'');
    setVal('ofPrice',o.purchase_price);setVal('ofCoupon',o.coupon_amount||0);
    setVal('ofSellingPrice',o.selling_price||'');setVal('ofSellingPlatform',o.selling_platform||'');
    setVal('ofTracking',o.tracking_no);setVal('ofLogistics',o.logistics_status);
    setVal('ofStatus',o.order_status);setVal('ofBuyerName',o.buyer_name||'');
    setVal('ofBuyerContact',o.buyer_contact||'');setVal('ofSettlement',o.settlement_status);
    setVal('ofNote',o.note||'');calcActual();$('#orderModal')._editId=o.id;
  }else{
    $('#modalTitle').textContent='新增订单';$('#orderForm').reset();
    setVal('ofLogistics','运输中');setVal('ofStatus','已下单');setVal('ofSettlement','未结算');setVal('ofCoupon','0');
    $('#orderModal')._editId=null;
  }
  $('#orderModal').style.display='flex';
}

async function handleOrderSave(e){
  e.preventDefault();
  const body={platform:$('#ofPlatform').value,product_name:$('#ofProduct').value,product_spec:$('#ofSpec').value,purchase_price:parseFloat($('#ofPrice').value)||0,coupon_amount:parseFloat($('#ofCoupon').value)||0,selling_price:$('#ofSellingPrice').value?parseFloat($('#ofSellingPrice').value):null,selling_platform:$('#ofSellingPlatform').value,tracking_no:$('#ofTracking').value,logistics_status:$('#ofLogistics').value,order_status:$('#ofStatus').value,buyer_name:$('#ofBuyerName').value,buyer_contact:$('#ofBuyerContact').value,settlement_status:$('#ofSettlement').value,note:$('#ofNote').value};
  const id=$('#orderModal')._editId;
  const url=id?API+'/orders/'+id:API+'/orders';
  const res=await fetch(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  if(!res.ok){const d=await res.json();return toast(d.error,'error')};
  closeModals();loadOrdersTab();toast(id?'已更新':'已创建');
}

function calcActual(){const p=parseFloat($('#ofPrice').value)||0,c=parseFloat($('#ofCoupon').value)||0;$('#actualDisplay').textContent='实付金额：'+fmt(p-c)}

async function exportAdminCSV(){const res=await fetch(API+'/export',{headers:{Authorization:'Bearer '+token}});const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='admin_orders_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}

function cf(fn){$('#confirmMsg').textContent='确认删除？';$('#confirmDlg').style.display='flex';const y=$('#confirmDlg').querySelector('.btn-cf-yes');y.onclick=()=>{fn();$('#confirmDlg').style.display='none'}}

function fillSelect(id,arr){const sel=$(id);if(sel)sel.innerHTML='<option value="">请选择</option>'+arr.map(v=>`<option>${v}</option>`).join('')}
function setVal(id,v){const el=$(id);if(!el)return;if(el.tagName==='SELECT'){Array.from(el.options).forEach(o=>{if(o.value===v)o.selected=true});return}el.value=v}
function fmt(n){return Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function debounce(fn,ms){let t;return function(...args){clearTimeout(t);t=setTimeout(()=>fn.apply(this,args),ms)}}
function toast(msg,type='success'){const t=$('#toast');if(!t)return;t.textContent=msg;t.className='toast '+type;t.style.display='block';setTimeout(()=>t.style.display='none',2000)}
})();
