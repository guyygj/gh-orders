// GH报单系统 v3.0 — Client JS (fixed)
(function(){
const $=s=>document.querySelector(s);
const API='/api';
let token='',user=null,currentOrder=null;
let currentPage=1;
const PAGE_SIZE=20;
const platforms=['京东','淘宝','天猫','拼多多','抖音','快手','苏宁易购','唯品会','得物','小红书','闲鱼'];
const statuses=['已下单','已发货','已签收','已卖出','已退货','已作废'];
const logistics=['运输中','已揽收','派送中','已签收','退回中'];
const settlements=['未结算','已结算'];

init();
function init(){
  token=localStorage.getItem('gh_token');
  user=JSON.parse(localStorage.getItem('gh_user')||'null');
  if(token&&user){
    showMain();
    Promise.all([loadStats(),loadOrders(1)]).catch(function(){logout()});
    if(user.role==='admin'&&!document.getElementById('adminLink')){
      var b=$('#btnExport');if(b)b.insertAdjacentHTML('afterend',' <a href="/admin" id="adminLink" class="btn btn-default btn-sm">管理后台</a>');
    }
  }else showLogin();
  bindEvents();
}

function bindEvents(){
  var on=function(sel,evt,fn){
    var el=typeof sel==='string'?$(sel):sel;
    if(el)el.addEventListener(evt,fn);
  };
  on('#loginForm','submit',handleLogin);
  on('#registerForm','submit',handleRegister);
  on('#toggleRegister','click',showRegister);
  on('#toggleLogin','click',showLogin);
  on('#btnLogout','click',logout);
  on('#btnAdd','click',function(){openModal()});
  on('#btnExport','click',exportCSV);
  on('#searchInput','input',debounce(function(){currentPage=1;loadOrders(1)},300));
  on('#filterPlatform','change',function(){currentPage=1;loadOrders(1)});
  on('#filterStatus','change',function(){currentPage=1;loadOrders(1)});
  on('#sortBy','change',function(){currentPage=1;loadOrders(1)});
  on('#sortOrder','change',function(){currentPage=1;loadOrders(1)});
  on('#orderForm','submit',handleOrderSave);
  on('#ofPrice','input',calcActual);
  on('#ofCoupon','input',calcActual);
  document.querySelectorAll('.modal-close,.btn-cancel').forEach(function(b){on(b,'click',closeModal)});
  on('#orderModal','click',function(e){if(e.target===$('#orderModal'))closeModal()});
  var cfNo=$('#confirmDlg');if(cfNo){var nb=cfNo.querySelector('.btn-cf-no');if(nb)nb.addEventListener('click',function(){$('#confirmDlg').style.display='none'})}
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){closeModal();var d=$('#confirmDlg');if(d)d.style.display='none'}
  });
}

// Auth
function showLogin(){var lp=$('#loginPage');if(lp)lp.style.display='flex';var rp=$('#registerPage');if(rp)rp.style.display='none';var ma=$('#mainApp');if(ma)ma.style.display='none'}
function showRegister(){var rp=$('#registerPage');if(rp)rp.style.display='flex';var lp=$('#loginPage');if(lp)lp.style.display='none';var ma=$('#mainApp');if(ma)ma.style.display='none'}
function showMain(){var lp=$('#loginPage');if(lp)lp.style.display='none';var rp=$('#registerPage');if(rp)rp.style.display='none';var ma=$('#mainApp');if(ma)ma.style.display='block';var dn=$('#displayName');if(dn)dn.textContent=user.username;var dr=$('#displayRole');if(dr)dr.textContent=user.role==='admin'?'管理员':'成员';}

async function handleLogin(e){e.preventDefault();var body={username:$('#loginUser').value,password:$('#loginPass').value};try{var res=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var d=await res.json();if(!res.ok){$('#loginError').textContent=d.error;return}token=d.token;user=d.user;localStorage.setItem('gh_token',token);localStorage.setItem('gh_user',JSON.stringify(user))}catch(e){$('#loginError').textContent='网络错误';return}showMain();Promise.all([loadStats(),loadOrders(1)]).catch(function(){logout()});if(user.role==='admin'&&!document.getElementById('adminLink')){var b=$('#btnExport');if(b)b.insertAdjacentHTML('afterend',' <a href="/admin" id="adminLink" class="btn btn-default btn-sm">管理后台</a>')}}

async function handleRegister(e){e.preventDefault();var fd=new FormData();fd.append('username',$('#regUser').value);fd.append('password',$('#regPass').value);if($('#regPass').value!==$('#regPass2').value)return $('#regError').textContent='密码不一致';if($('#regIdFront').files[0])fd.append('id_front',$('#regIdFront').files[0]);if($('#regIdBack').files[0])fd.append('id_back',$('#regIdBack').files[0]);try{var res=await fetch(API+'/register',{method:'POST',body:fd});var d=await res.json();if(!res.ok){$('#regError').textContent=d.error;return}toast('注册成功，等待审核');showLogin()}catch(e){$('#regError').textContent='网络错误'}}

function logout(){localStorage.removeItem('gh_token');localStorage.removeItem('gh_user');token='';user=null;showLogin()}

// Stats
async function loadStats(){var res=await fetch(API+'/stats',{headers:{Authorization:'Bearer '+token}});var d=await res.json();var ss=$('#statSpend');if(ss)ss.textContent=fmtMoney(d.totalSpend);var sd=$('#statSold');if(sd)sd.textContent=fmtMoney(d.totalSold);var sp=$('#statProfit');if(sp)sp.textContent=fmtMoney(d.totalProfit);var so=$('#statOrders');if(so)so.textContent=d.totalOrders}

// Orders
async function loadOrders(page){var fp=$('#filterPlatform');if(!fp)return;var p=fp.value,fs=$('#filterStatus'),s=fs?fs.value:'',q=$('#searchInput'),sb=$('#sortBy'),so=$('#sortOrder');var sq=q?q.value:'';var sv=sb?sb.value:'created_at';var sv2=so?so.value:'DESC';var params=new URLSearchParams({platform:p,status:s,search:sq,sortBy:sv,sortOrder:sv2,page:page||currentPage,pageSize:PAGE_SIZE});var res=await fetch(API+'/orders?'+params,{headers:{Authorization:'Bearer '+token}});var d=await res.json();currentPage=d.page;renderOrders(d)}

function renderOrders(data){
  var tbody=$('#orderTbody'),cards=$('#orderCards'),empty=$('#emptyState');
  if(!data.list||data.list.length===0){$('#tableWrap').querySelector('table').style.display='none';cards.style.display='none';empty.style.display='block';$('#pagination').innerHTML='';return}
  $('#tableWrap').querySelector('table').style.display='';empty.style.display='none';
  var tbodyHtml='',cardsHtml='';
  data.list.forEach(function(o){
    var pp=o.selling_price||0;var pf=pp-o.actual_payment;
    tbodyHtml+='<tr><td><span class=\"tag tag-platform '+esc(o.platform)+'\">'+esc(o.platform)+'</span></td><td>'+esc(o.product_name)+'</td><td>'+esc(o.product_spec||'')+'</td><td class=\"amount spend\">'+fmtMoney(o.actual_payment)+'</td><td class=\"amount\">'+(o.selling_price?fmtMoney(o.selling_price):'-')+'</td><td class=\"amount profit '+(pf>=0?'pos':'neg')+'\">'+(o.selling_price?fmtMoney(pf):'-')+'</td><td class=\"tracking\">'+esc(o.tracking_no)+'</td><td>'+esc(o.logistics_status)+'</td><td><span class=\"status-tag '+esc(o.order_status)+'\">'+esc(o.order_status)+'</span></td><td style=\"max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">'+esc(o.note||'')+'</td><td><button class=\"btn btn-default btn-sm btn-edit\" data-id=\"'+o.id+'\">编辑</button> <button class=\"btn btn-default btn-sm btn-del\" data-id=\"'+o.id+'\" style=\"color:var(--red)\">删除</button></td></tr>';
    cardsHtml+='<div class=\"order-card\"><div class=\"oc-title\">'+esc(o.product_name)+'</div><div class=\"oc-tags\"><span class=\"tag tag-platform '+esc(o.platform)+'\">'+esc(o.platform)+'</span><span class=\"status-tag '+esc(o.order_status)+'\">'+esc(o.order_status)+'</span></div><div class=\"oc-row\"><span>花费</span><span class=\"val\" style=\"color:var(--amber)\">'+fmtMoney(o.actual_payment)+'</span></div><div class=\"oc-row\"><span>卖出</span><span class=\"val\">'+(o.selling_price?fmtMoney(o.selling_price):'-')+'</span></div><div class=\"oc-row\"><span>利润</span><span class=\"val\" style=\"color:'+(pf>=0?'var(--green)':'var(--red)')+'\">'+(o.selling_price?fmtMoney(pf):'-')+'</span></div><div class=\"oc-row\"><span>单号</span><span class=\"val\">'+esc(o.tracking_no)+'</span></div><div class=\"oc-actions\"><button class=\"btn btn-default btn-sm btn-edit\" data-id=\"'+o.id+'\">编辑</button><button class=\"btn btn-default btn-sm btn-del\" data-id=\"'+o.id+'\" style=\"color:var(--red)\">删除</button></div></div>';
  });
  tbody.innerHTML=tbodyHtml;
  cards.innerHTML=cardsHtml;
  tbody.querySelectorAll('.btn-edit').forEach(function(b){b.addEventListener('click',function(){openModal(b.dataset.id)})});
  tbody.querySelectorAll('.btn-del').forEach(function(b){b.addEventListener('click',function(){confirmDelete(b.dataset.id)})});
  cards.querySelectorAll('.btn-edit').forEach(function(b){b.addEventListener('click',function(){openModal(b.dataset.id)})});
  cards.querySelectorAll('.btn-del').forEach(function(b){b.addEventListener('click',function(){confirmDelete(b.dataset.id)})});
  renderPagination(data.page,data.total,data.pageSize);
}

function renderPagination(page,total,pageSize){
  var totalPages=Math.ceil(total/pageSize);
  if(totalPages<=1){$('#pagination').innerHTML='';return}
  var html='<button '+(page<=1?'disabled':'')+' data-page=\"'+(page-1)+'\">上一页</button><span>'+page+'/'+totalPages+'</span><button '+(page>=totalPages?'disabled':'')+' data-page=\"'+(page+1)+'\">下一页</button>';
  $('#pagination').innerHTML=html;
  $('#pagination').querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      if(!b.disabled){var nextPage=parseInt(b.dataset.page);currentPage=nextPage;loadOrders(nextPage)}
    })
  });
}

// Modal
async function openModal(id){
  if(id){currentOrder=id}else{currentOrder=null;var f=$('#orderForm');if(f)f.reset()}
  fillSelect('ofPlatform',platforms);
  fillSelect('ofSellingPlatform',platforms);
  fillSelect('ofLogistics',logistics);
  fillSelect('ofStatus',statuses);
  fillSelect('ofSettlement',settlements);
  if(id){$('#modalTitle').textContent='编辑订单';try{var res=await fetch(API+'/orders/'+id,{headers:{Authorization:'Bearer '+token}});var o=await res.json();if(!o||!o.id)return toast('找不到订单','error');setVal('ofPlatform',o.platform);setVal('ofProduct',o.product_name);setVal('ofSpec',o.product_spec||'');setVal('ofPrice',o.purchase_price);setVal('ofCoupon',o.coupon_amount||0);setVal('ofSellingPrice',o.selling_price||'');setVal('ofSellingPlatform',o.selling_platform||'');setVal('ofTracking',o.tracking_no);setVal('ofLogistics',o.logistics_status);setVal('ofStatus',o.order_status);setVal('ofBuyerName',o.buyer_name||'');setVal('ofBuyerContact',o.buyer_contact||'');setVal('ofSettlement',o.settlement_status);setVal('ofNote',o.note||'');calcActual()}catch(e){toast('加载订单失败','error');closeModal()}}
  else{$('#modalTitle').textContent='新增订单';setVal('ofLogistics','运输中');setVal('ofStatus','已下单');setVal('ofSettlement','未结算');setVal('ofCoupon','0')}
  $('#orderModal').style.display='flex';
}

function closeModal(){$('#orderModal').style.display='none';currentOrder=null}

async function handleOrderSave(e){e.preventDefault();var body={platform:$('#ofPlatform').value,product_name:$('#ofProduct').value,product_spec:$('#ofSpec').value,purchase_price:parseFloat($('#ofPrice').value)||0,coupon_amount:parseFloat($('#ofCoupon').value)||0,actual_payment:(parseFloat($('#ofPrice').value)||0)-(parseFloat($('#ofCoupon').value)||0),selling_price:$('#ofSellingPrice').value?parseFloat($('#ofSellingPrice').value):null,selling_platform:$('#ofSellingPlatform').value,tracking_no:$('#ofTracking').value,logistics_status:$('#ofLogistics').value,order_status:$('#ofStatus').value,buyer_name:$('#ofBuyerName').value,buyer_contact:$('#ofBuyerContact').value,settlement_status:$('#ofSettlement').value,note:$('#ofNote').value};if(!body.platform||!body.product_name||!body.tracking_no||!body.purchase_price)return toast('请填写必填字段','error');var method=currentOrder?'PUT':'POST';var url=currentOrder?API+'/orders/'+currentOrder:API+'/orders';var res=await fetch(url,{method:method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});if(!res.ok){var d=await res.json();return toast(d.error,'error')}closeModal();currentPage=1;loadOrders(1);loadStats();toast(currentOrder?'已更新':'已创建')}

function calcActual(){var p=parseFloat($('#ofPrice').value)||0,c=parseFloat($('#ofCoupon').value)||0;$('#actualDisplay').textContent='实付金额：'+fmtMoney(p-c)}

async function confirmDelete(id){$('#confirmMsg').textContent='确认删除该订单？';$('#confirmDlg').style.display='flex';var yes=$('#confirmDlg').querySelector('.btn-cf-yes');yes.onclick=async function(){await fetch(API+'/orders/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});$('#confirmDlg').style.display='none';currentPage=1;loadOrders(1);loadStats();toast('已删除')}}

// Export
async function exportCSV(){var res=await fetch(API+'/orders/export',{headers:{Authorization:'Bearer '+token}});var blob=await res.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='orders_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}

// Util
function fillSelect(id,arr){var sel=$('#'+id);if(!sel)return;sel.innerHTML='<option value="">请选择</option>'+arr.map(function(v){return '<option>'+v+'</option>'}).join('')}
function setVal(id,v){var el=$('#'+id);if(el){if(el.tagName==='SELECT'){Array.from(el.options).forEach(function(o){if(o.value===v)o.selected=true});return}el.value=v}}
function fmtMoney(n){return Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function debounce(fn,ms){var t;return function(){var th=this,args=arguments;clearTimeout(t);t=setTimeout(function(){fn.apply(th,args)},ms)}}
function toast(msg,type){type=type||'success';var t=$('#toast');t.textContent=msg;t.className='toast '+type;t.style.display='block';setTimeout(function(){t.style.display='none'},2000)}
})();
