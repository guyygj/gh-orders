(function(){
var $=function(s){return document.querySelector(s)};
var API='/api';
var token='',user=null;
var currentPage=1,PAGE_SIZE=20;
var platforms=['京东','淘宝','天猫','拼多多','抖音','快手','苏宁易购','唯品会','得物','小红书','闲鱼'];
var statuses=['已下单','已发货','已签收','已卖出','已退货','已作废'];
var logistics=['运输中','已揽收','派送中','已签收','退回中'];
var settlements=['未结算','已结算'];

// Util (self-contained)
function fmtMoney(n){return Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toast(msg,type){type=type||'success';var t=$('#toast');if(!t)return;t.textContent=msg;t.className='toast '+type;t.style.display='block';setTimeout(function(){t.style.display='none'},2000)}
function fillSelect(id,arr){var sel=$('#'+id);if(sel)sel.innerHTML='<option value="">请选择</option>'+arr.map(function(v){return '<option>'+v+'</option>'}).join('')}
function setVal(id,v){var el=$('#'+id);if(!el)return;if(el.tagName==='SELECT'){Array.from(el.options).forEach(function(o){if(o.value===v)o.selected=true});return}el.value=v}
function debounce(fn,ms){var t;return function(){var th=this,args=arguments;clearTimeout(t);t=setTimeout(function(){fn.apply(th,args)},ms)}}
function cf(fn,msg){msg=msg||'确认操作？';$('#confirmMsg').textContent=msg;$('#confirmDlg').style.display='flex';var y=$('#confirmDlg').querySelector('.btn-cf-yes');y.onclick=function(){fn();$('#confirmDlg').style.display='none'}}

// Init
function init(){
  token=localStorage.getItem('gh_token');
  user=JSON.parse(localStorage.getItem('gh_user')||'null');
  // 登录表单事件必须首屏就绑
  var admForm = $('#adminLoginForm');
  if(admForm) admForm.addEventListener('submit', handleAdminLogin);
  if(!token||!user||user.role!=='admin'){showAdminLogin();return}
  showAdminMain();
}
function showAdminLogin(){
  var m=$('#adminMain');if(m)m.style.display='none';
  var l=$('#adminLogin');if(l)l.style.display='flex';
}
function showAdminMain(){
  var l=$('#adminLogin');if(l)l.style.display='none';
  var m=$('#adminMain');if(m)m.style.display='block';
  $('#displayName').textContent=user.username;
  $('#displayRole').textContent='管理员';
  bindEvents();
  loadGlobalStats();
  loadOrdersTab();
}
async function handleAdminLogin(e){
  e.preventDefault();
  var body={username:$('#adminLoginUser').value,password:$('#adminLoginPass').value};
  try{
    var res=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var d=await res.json();
    if(!res.ok){$('#adminLoginError').textContent=d.error;return}
    if(d.user.role!=='admin'){$('#adminLoginError').textContent='该账号非管理员';return}
    token=d.token;user=d.user;
    localStorage.setItem('gh_token',token);
    localStorage.setItem('gh_user',JSON.stringify(user));
    showAdminMain();
  }catch(e){$('#adminLoginError').textContent='网络错误';}
}
function adminLogout(){
  localStorage.removeItem('gh_token');
  localStorage.removeItem('gh_user');
  token='';user=null;
  showAdminLogin();
}

function bindEvents(){
  var on=function(sel,evt,fn){var el=typeof sel==='string'?$(sel):sel;if(el)el.addEventListener(evt,fn)};
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){var name=b.dataset.tab;switchTab(name)})});
  // Orders
  on('#osearch','input',debounce(function(){currentPage=1;loadOrdersTab()},300));
  on('#oplatform','change',function(){currentPage=1;loadOrdersTab()});
  on('#ostatus','change',function(){currentPage=1;loadOrdersTab()});
  on('#ouser','change',function(){currentPage=1;loadOrdersTab()});
  on('#oaddBtn','click',function(){openOrderModal()});
  on('#oexport','click',exportAdminCSV);
  // Members
  on('#maddBtn','click',function(){$('#memberModal').style.display='flex'});
  on('#memberForm','submit',handleAddMember);
  // Order modal
  on('#orderForm','submit',handleOrderSave);
  on('#ofPrice','input',calcActual);
  on('#ofCoupon','input',calcActual);
  // Logout & Login
  on('#btnLogout','click',adminLogout);
  on('#adminLoginForm','submit',handleAdminLogin);
  // Close buttons
  document.querySelectorAll('.modal-close,.btn-cancel,.btn-mcancel').forEach(function(b){on(b,'click',closeModals)});
  [$('#memberModal'),$('#orderModal')].forEach(function(m){if(m)m.addEventListener('click',function(e){if(e.target===m)m.style.display='none'})});
  // Confirm
  var cfNo=$('#confirmDlg');if(cfNo){var nb=cfNo.querySelector('.btn-cf-no');if(nb)nb.addEventListener('click',function(){$('#confirmDlg').style.display='none'})}
  // ID preview
  on('#idPreview','click',function(){$('#idPreview').style.display='none'});
  // ESC
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){$('#confirmDlg').style.display='none';closeModals()}});
}

function closeModals(){['orderModal','memberModal'].forEach(function(id){var el=$(id);if(el)el.style.display='none'})}

// Tabs
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(function(x){x.classList.remove('active')});
  document.querySelector('.tab-btn[data-tab="'+name+'"]').classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(function(p){p.style.display='none'});
  $('#tab-'+name).style.display='block';
  if(name==='orders')loadOrdersTab();
  if(name==='reviews')loadReviewsTab();
  if(name==='members')loadMembersTab();
  if(name==='stats')loadStatsTab();
}

// Global Stats
async function loadGlobalStats(){
  try{var res=await fetch(API+'/admin/stats',{headers:{Authorization:'Bearer '+token}});var d=await res.json();var g=d.global||d;$('#sSpend').textContent=fmtMoney(g.spend);$('#sSold').textContent=fmtMoney(g.sold);$('#sProfit').textContent=fmtMoney(g.profit);$('#sOrders').textContent=g.orders;$('#sMembers').textContent=g.members||'0'}catch(e){}
}

// Orders Tab
async function loadOrdersTab(){
  var q=$('#osearch').value,p=$('#oplatform').value,s=$('#ostatus').value,u=$('#ouser').value;
  var params=new URLSearchParams({search:q||'',platform:p,status:s,userId:u,page:currentPage,pageSize:PAGE_SIZE});
  try{var res=await fetch(API+'/admin/orders?'+params,{headers:{Authorization:'Bearer '+token}});var d=await res.json();renderOrders(d)}catch(e){}
  try{
    var ur=await fetch(API+'/users',{headers:{Authorization:'Bearer '+token}});
    var users=await ur.json();
    $('#ouser').innerHTML='<option value="">全部用户</option>'+users.map(function(u){return '<option value="'+u.id+'">'+esc(u.username)+'</option>'}).join('');
  }catch(e){}
  fillSelect('oplatform',platforms);
  fillSelect('ostatus',statuses);
}

function renderOrders(data){
  var tbody=$('#otbody'),empty=$('#oempty');
  if(!data.list||data.list.length===0){tbody.innerHTML='';empty.style.display='block';$('#opagination').innerHTML='';return}
  empty.style.display='none';
  var html='';
  data.list.forEach(function(o){var pf=(o.selling_price||0)-o.actual_payment;html+='<tr><td>'+esc(o.username||'')+'</td><td><span class="tag tag-platform '+esc(o.platform)+'">'+esc(o.platform)+'</span></td><td>'+esc(o.product_name)+'</td><td class="amount spend">'+fmtMoney(o.actual_payment)+'</td><td class="amount">'+(o.selling_price?fmtMoney(o.selling_price):'-')+'</td><td class="amount profit '+(pf>=0?'pos':'neg')+'">'+(o.selling_price?fmtMoney(pf):'-')+'</td><td class="tracking">'+esc(o.tracking_no)+'</td><td><span class="status-tag '+esc(o.order_status)+'">'+esc(o.order_status)+'</span></td><td style="font-size:11px;color:var(--text3)">'+(o.created_at||'').slice(0,10)+'</td><td><button class="btn btn-default btn-sm btn-oedit" data-id="'+o.id+'">编辑</button> <button class="btn btn-default btn-sm btn-odel" data-id="'+o.id+'" style="color:var(--red)">删除</button></td></tr>'});
  tbody.innerHTML=html;
  tbody.querySelectorAll('.btn-oedit').forEach(function(b){b.addEventListener('click',function(){openOrderModal(b.dataset.id)})});
  tbody.querySelectorAll('.btn-odel').forEach(function(b){b.addEventListener('click',function(){cf(function(){fetch(API+'/admin/orders/'+b.dataset.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}}).then(function(){loadOrdersTab();toast('已删除')})},'确认删除该订单？')})});
  renderPagination(data.page,data.total,data.pageSize);
}

function renderPagination(page,total,pageSize){
  var tp=Math.ceil(total/pageSize);
  if(tp<=1){$('#opagination').innerHTML='';return}
  $('#opagination').innerHTML='<button '+(page<=1?'disabled':'')+' data-pg="'+(page-1)+'">上一页</button><span>'+page+'/'+tp+'</span><button '+(page>=tp?'disabled':'')+' data-pg="'+(page+1)+'">下一页</button>';
  $('#opagination').querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){if(!b.disabled){currentPage=parseInt(b.dataset.pg);loadOrdersTab()}})});
}

// Reviews Tab
async function loadReviewsTab(){
  try{var res=await fetch(API+'/admin/reviews',{headers:{Authorization:'Bearer '+token}});var list=await res.json();var html='';list.forEach(function(u){html+='<tr><td>'+esc(u.username)+'</td><td>'+(u.id_card_front?'<img class="review-id-card" src="/uploads/id_cards/'+u.id_card_front+'" onclick="var p=document.getElementById(\'idPreview\');var i=document.getElementById(\'idPreviewImg\');i.src=this.src;p.style.display=\'flex\'">':'无')+'</td><td>'+(u.id_card_back?'<img class="review-id-card" src="/uploads/id_cards/'+u.id_card_back+'" onclick="var p=document.getElementById(\'idPreview\');var i=document.getElementById(\'idPreviewImg\');i.src=this.src;p.style.display=\'flex\'">':'无')+'</td><td style="font-size:11px;color:var(--text3)">'+(u.created_at||'').slice(0,10)+'</td><td><span class="status-tag">'+(u.status==='pending'?'待审核':'已拒绝')+'</span></td><td><button class="btn btn-default btn-sm" style="color:var(--green)" data-rid="'+u.id+'" data-act="approve">通过</button> <button class="btn btn-default btn-sm" style="color:var(--red)" data-rid="'+u.id+'" data-act="reject">拒绝</button></td></tr>'});$('#rtbody').innerHTML=html||'';$('#rempty').style.display=list.length?'none':'block';document.querySelectorAll('button[data-act]').forEach(function(b){b.addEventListener('click',async function(){var id=b.dataset.rid,act=b.dataset.act;await fetch(API+'/admin/reviews/'+id+'/'+act,{method:'POST',headers:{Authorization:'Bearer '+token}});loadReviewsTab();toast(act==='approve'?'已通过':'已拒绝')})})}catch(e){}
}

// Members Tab
async function loadMembersTab(){
  try{var res=await fetch(API+'/admin/users?t='+Date.now(),{headers:{Authorization:'Bearer '+token}});var list=await res.json();var html='';list.forEach(function(u){html+='<div class="user-card"><div class="user-header"><span class="username">'+esc(u.username)+'</span><span class="role-badge '+(u.role||'user')+'">'+(u.role==='admin'?'管理员':'成员')+'</span></div><div class="user-stats"><div>订单：<span class="val">'+(u.oCnt||0)+'</span></div><div>花费：<span class="val" style="color:var(--amber)">'+fmtMoney(u.spend||0)+'</span></div><div>卖出：<span class="val" style="color:var(--green)">'+fmtMoney(u.sold||0)+'</span></div><div>利润：<span class="val" style="color:'+((u.profit||0)>=0?'var(--green)':'var(--red)')+'">'+fmtMoney(u.profit||0)+'</span></div></div><div class="card-actions">'+(u.role!=='admin'?'<button class="btn btn-default btn-sm" style="color:var(--red)" data-mdel="'+u.id+'">删除</button>':'')+'</div></div>'});$('#mcards').innerHTML=html||'';document.querySelectorAll('[data-mdel]').forEach(function(b){b.addEventListener('click',function(){cf(function(){fetch(API+'/admin/users/'+b.dataset.mdel,{method:'DELETE',headers:{Authorization:'Bearer '+token}}).then(function(){loadMembersTab();toast('已删除')})},'确认删除该成员及其所有订单？')})})}catch(e){}
}

async function handleAddMember(e){e.preventDefault();var body={username:$('#mUser').value,password:$('#mPass').value};var res=await fetch(API+'/admin/users',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});if(!res.ok){var d=await res.json();return toast(d.error||'添加失败','error')}$('#memberModal').style.display='none';loadMembersTab();toast('添加成功')}

// Stats Tab
async function loadStatsTab(){
  try{var res=await fetch(API+'/admin/stats',{headers:{Authorization:'Bearer '+token}});var d=await res.json();var mems=d.members||[];var html='';mems.forEach(function(m){var pf=m.profit||0;html+='<tr><td>'+esc(m.username)+'</td><td>'+(m.oCnt||0)+'</td><td class="amount spend">'+fmtMoney(m.spend||0)+'</td><td class="amount">'+fmtMoney(m.sold||0)+'</td><td class="amount profit '+(pf>=0?'pos':'neg')+'">'+fmtMoney(pf)+'</td><td><span class="tag tag-platform" style="background:#f5f5f5;color:var(--text3)">'+(m.role||'user')+'</span></td></tr>'});$('#sttbody').innerHTML=html||'<tr><td colspan="6" style="text-align:center;color:var(--text3)">暂无成员数据</td></tr>'}catch(e){}
}

// Order Modal
function openOrderModal(id){
  if(id){}else{var f=$('#orderForm');if(f)f.reset()}
  fillSelect('ofPlatform',platforms);
  fillSelect('ofSellingPlatform',platforms);
  fillSelect('ofLogistics',logistics);
  fillSelect('ofStatus',statuses);
  fillSelect('ofSettlement',settlements);
  if(id){
    $('#modalTitle').textContent='编辑订单';
    fetch(API+'/admin/orders/'+id,{headers:{Authorization:'Bearer '+token}}).then(function(r){return r.json()}).then(function(o){if(!o||!o.id)return toast('找不到订单','error');setVal('ofPlatform',o.platform);setVal('ofProduct',o.product_name);setVal('ofSpec',o.product_spec||'');setVal('ofPrice',o.purchase_price);setVal('ofCoupon',o.coupon_amount||0);setVal('ofSellingPrice',o.selling_price||'');setVal('ofSellingPlatform',o.selling_platform||'');setVal('ofTracking',o.tracking_no);setVal('ofLogistics',o.logistics_status);setVal('ofStatus',o.order_status);setVal('ofBuyerName',o.buyer_name||'');setVal('ofBuyerContact',o.buyer_contact||'');setVal('ofSettlement',o.settlement_status);setVal('ofNote',o.note||'');calcActual()}).catch(function(){toast('加载失败','error')});
  }else{
    $('#modalTitle').textContent='新增订单';setVal('ofLogistics','运输中');setVal('ofStatus','已下单');setVal('ofSettlement','未结算');setVal('ofCoupon','0');
  }
  $('#orderModal').style.display='flex';
}

async function handleOrderSave(e){
  e.preventDefault();
  var pp=parseFloat($('#ofPrice').value)||0,ca=parseFloat($('#ofCoupon').value)||0,ap=pp-ca;
  var body={platform:$('#ofPlatform').value,product_name:$('#ofProduct').value,product_spec:$('#ofSpec').value,purchase_price:pp,coupon_amount:ca,actual_payment:ap,selling_price:$('#ofSellingPrice').value?parseFloat($('#ofSellingPrice').value):null,selling_platform:$('#ofSellingPlatform').value,tracking_no:$('#ofTracking').value,logistics_status:$('#ofLogistics').value,order_status:$('#ofStatus').value,buyer_name:$('#ofBuyerName').value,buyer_contact:$('#ofBuyerContact').value,settlement_status:$('#ofSettlement').value,note:$('#ofNote').value};
  var id=$('#orderModal')._editId;
  var url=id?API+'/admin/orders/'+id:API+'/orders';
  var res=await fetch(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  if(!res.ok){var d=await res.json();return toast(d.error,'error')}
  closeModals();loadOrdersTab();toast(id?'已更新':'已创建');
}

function calcActual(){var p=parseFloat($('#ofPrice').value)||0,c=parseFloat($('#ofCoupon').value)||0;$('#actualDisplay').textContent='实付金额：'+fmtMoney(p-c)}

async function exportAdminCSV(){var res=await fetch(API+'/admin/export',{headers:{Authorization:'Bearer '+token}});var blob=await res.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='admin_orders_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}

// -- expose to admin/index.html inline onclick --
window.adminPreview=function(src){var p=document.getElementById('idPreview');var i=document.getElementById('idPreviewImg');i.src=src;p.style.display='flex'};

init();
})();
