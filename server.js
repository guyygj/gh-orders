const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'gh-report-system-2024-secret-key';
const isPG = !!process.env.DATABASE_URL;

// ── Database ──
let db;
const pgPool = isPG ? new (require('pg').Pool)({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

if (isPG) {
  // PostgreSQL
  db = {
    async get(sql, ...params) { const r = await pgPool.query(_pg(sql), params); return r.rows[0]; },
    async all(sql, ...params) { const r = await pgPool.query(_pg(sql), params); return r.rows; },
    async run(sql, ...params) { return await pgPool.query(_pg(sql), params); },
    async exec(sql) { return await pgPool.query(sql); }
  };
} else {
  // SQLite
  const { DatabaseSync } = require('node:sqlite');
  const DB_PATH = path.join(__dirname, 'gh_orders.db');
  const sqlite = new DatabaseSync(DB_PATH);
  sqlite.exec('PRAGMA journal_mode=WAL');
  sqlite.exec('PRAGMA foreign_keys=ON');
  db = {
    get(sql, ...params) { return sqlite.prepare(sql).get(...params); },
    all(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    run(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    exec(sql) { sqlite.exec(sql); }
  };
}

function _pg(sql) { let i = 1; return sql.replace(/\?/g, () => '$' + i++); }

// ── Init DB ──
(async () => {
  if (isPG) {
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending',
      id_card_front TEXT DEFAULT '',
      id_card_back TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      platform TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_spec TEXT DEFAULT '',
      purchase_price DOUBLE PRECISION NOT NULL,
      coupon_amount DOUBLE PRECISION DEFAULT 0,
      actual_payment DOUBLE PRECISION NOT NULL,
      selling_price DOUBLE PRECISION,
      selling_platform TEXT DEFAULT '',
      tracking_no TEXT NOT NULL,
      logistics_status TEXT DEFAULT '运输中',
      order_status TEXT DEFAULT '已下单',
      buyer_name TEXT DEFAULT '',
      buyer_contact TEXT DEFAULT '',
      settlement_status TEXT DEFAULT '未结算',
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const a = await db.get('SELECT id FROM users WHERE username=?', '13135629285');
    if (!a) {
      const hash = bcrypt.hashSync('13135629285', 10);
      await db.run("INSERT INTO users (username, password, role, status) VALUES (?,'" + hash + "','admin','approved')", '13135629285');
    }
  } else {
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending',
      id_card_front TEXT DEFAULT '',
      id_card_back TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_spec TEXT DEFAULT '',
      purchase_price REAL NOT NULL,
      coupon_amount REAL DEFAULT 0,
      actual_payment REAL NOT NULL,
      selling_price REAL,
      selling_platform TEXT DEFAULT '',
      tracking_no TEXT NOT NULL,
      logistics_status TEXT DEFAULT '运输中',
      order_status TEXT DEFAULT '已下单',
      buyer_name TEXT DEFAULT '',
      buyer_contact TEXT DEFAULT '',
      settlement_status TEXT DEFAULT '未结算',
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    const adminExist = db.get('SELECT id FROM users WHERE username = ?', '13135629285');
    if (!adminExist) {
      const hash = bcrypt.hashSync('13135629285', 10);
      db.run("INSERT INTO users (username, password, role, status) VALUES (?, ?, 'admin', 'approved')", '13135629285', hash);
    }
  }
  console.log(isPG ? 'PostgreSQL 已连接' : 'SQLite 已连接');
})();

// ── Middleware ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const idCardUpload = multer({ dest: path.join(__dirname, 'public', 'uploads', 'id_cards') });

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
  try { const p = jwt.verify(h.slice(7), JWT_SECRET); req.userId = p.id; req.userRole = p.role; next(); }
  catch { res.status(401).json({ error: '登录已过期' }); }
}
function adminOnly(req, res, next) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}

// ── Auth ──
app.post('/api/register', idCardUpload.fields([{ name: 'id_front' }, { name: 'id_back' }]), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 3) return res.status(400).json({ error: '用户名至少3位' });
    const ex = await db.get('SELECT id FROM users WHERE username=?', username);
    if (ex) return res.status(400).json({ error: '用户名已存在' });
    const hash = bcrypt.hashSync(password, 10);
    const front = (req.files && req.files.id_front && req.files.id_front[0]) ? req.files.id_front[0].filename : '';
    const back = (req.files && req.files.id_back && req.files.id_back[0]) ? req.files.id_back[0].filename : '';
    await db.run("INSERT INTO users (username, password, role, status, id_card_front, id_card_back) VALUES (?, ?, 'user', 'pending', ?, ?)", username, hash, front, back);
    res.json({ message: '注册成功，等待管理员审核' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE username=?', username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  if (user.status === 'pending') return res.status(403).json({ error: '账号待审核，请联系管理员' });
  if (user.status === 'rejected') return res.status(403).json({ error: '账号审核未通过' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/me', auth, async (req, res) => {
  const u = await db.get('SELECT id, username, role, status FROM users WHERE id=?', req.userId);
  res.json(u);
});

// ── Client Stats ──
app.get('/api/stats', auth, async (req, res) => {
  const all = await db.get('SELECT COALESCE(SUM(actual_payment),0) as spend, COALESCE(SUM(selling_price),0) as sold, COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit, COUNT(*) as cnt FROM orders WHERE user_id=?', req.userId);
  const now = new Date(); const m = now.getMonth()+1; const y = now.getFullYear();
  const ms = y+'-'+String(m).padStart(2,'0')+'-01';
  const me = (m===12?(y+1):y)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01';
  const lm = m===1?12:m-1; const ly = m===1?y-1:y;
  const lms = ly+'-'+String(lm).padStart(2,'0')+'-01';
  const thisM = await db.get("SELECT COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit FROM orders WHERE user_id=? AND order_status='已卖出' AND created_at>=? AND created_at<?", req.userId, ms, me);
  const lastM = await db.get("SELECT COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit FROM orders WHERE user_id=? AND order_status='已卖出' AND created_at>=? AND created_at<?", req.userId, lms, ms);
  res.json({ totalSpend: all.spend, totalSold: all.sold, totalProfit: all.profit, totalOrders: all.cnt, monthProfit: thisM.profit, lastMonthProfit: lastM.profit });
});

// ── Client Orders ──
app.get('/api/orders', auth, async (req, res) => {
  let { page=1, pageSize=20, platform, status, search, sortBy='created_at', sortOrder='DESC' } = req.query;
  page = Math.max(1, parseInt(page) || 1);
  pageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
  const ok = ['created_at','actual_payment','selling_price','purchase_price'];
  if (!ok.includes(sortBy)) sortBy = 'created_at';
  sortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  let w = 'WHERE o.user_id=?'; const p = [req.userId];
  if (platform) { w += ' AND o.platform=?'; p.push(platform); }
  if (status) { w += ' AND o.order_status=?'; p.push(status); }
  if (search) { w += ' AND (o.product_name LIKE ? OR o.tracking_no LIKE ?)'; p.push('%'+search+'%','%'+search+'%'); }
  const cnt = await db.get('SELECT COUNT(*) as total FROM orders o '+w, ...p);
  const list = await db.all('SELECT o.* FROM orders o '+w+' ORDER BY o.'+sortBy+' '+sortOrder+' LIMIT ? OFFSET ?', ...p, pageSize, (page-1)*pageSize);
  res.json({ list, total: cnt.total, page, pageSize });
});

app.post('/api/orders', auth, async (req, res) => {
  try {
    const o = req.body;
    const userId = (o.user_id && req.userRole === 'admin') ? o.user_id : req.userId;
    if (!o.platform || !o.product_name || !o.tracking_no || o.purchase_price == null) return res.status(400).json({ error: '必填字段不完整' });
    const actual = (parseFloat(o.purchase_price)||0) - (parseFloat(o.coupon_amount)||0);
    if (isPG) {
      const r = await db.get('INSERT INTO orders (user_id,platform,product_name,product_spec,purchase_price,coupon_amount,actual_payment,selling_price,selling_platform,tracking_no,logistics_status,order_status,buyer_name,buyer_contact,settlement_status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *',
        userId, o.platform, o.product_name, o.product_spec||'', parseFloat(o.purchase_price), parseFloat(o.coupon_amount)||0, actual,
        o.selling_price?parseFloat(o.selling_price):null, o.selling_platform||'', o.tracking_no, o.logistics_status||'运输中',
        o.order_status||'已下单', o.buyer_name||'', o.buyer_contact||'', o.settlement_status||'未结算', o.note||'');
      res.status(201).json(r);
    } else {
      const r = await db.run('INSERT INTO orders (user_id,platform,product_name,product_spec,purchase_price,coupon_amount,actual_payment,selling_price,selling_platform,tracking_no,logistics_status,order_status,buyer_name,buyer_contact,settlement_status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        userId, o.platform, o.product_name, o.product_spec||'', parseFloat(o.purchase_price), parseFloat(o.coupon_amount)||0, actual,
        o.selling_price?parseFloat(o.selling_price):null, o.selling_platform||'', o.tracking_no, o.logistics_status||'运输中',
        o.order_status||'已下单', o.buyer_name||'', o.buyer_contact||'', o.settlement_status||'未结算', o.note||'');
      const order = await db.get('SELECT * FROM orders WHERE id=?', r.lastInsertRowid);
      res.status(201).json(order);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', auth, async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id=? AND user_id=?', req.params.id, req.userId);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json(order);
});

app.put('/api/orders/:id', auth, async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id=? AND user_id=?', req.params.id, req.userId);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  try {
    const o = req.body;
    const pp = o.purchase_price!=null ? parseFloat(o.purchase_price) : order.purchase_price;
    const ca = o.coupon_amount!=null ? parseFloat(o.coupon_amount) : order.coupon_amount;
    const ap = pp - ca;
    const sp = o.selling_price!=null ? parseFloat(o.selling_price) : order.selling_price;
    const ss = o.order_status==='已卖出' ? (o.settlement_status||'未结算') : order.settlement_status;
    await db.run('UPDATE orders SET platform=?,product_name=?,product_spec=?,purchase_price=?,coupon_amount=?,actual_payment=?,selling_price=?,selling_platform=?,tracking_no=?,logistics_status=?,order_status=?,buyer_name=?,buyer_contact=?,settlement_status=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      o.platform||order.platform, o.product_name||order.product_name, o.product_spec||order.product_spec,
      pp, ca, ap, sp, o.selling_platform||order.selling_platform, o.tracking_no||order.tracking_no,
      o.logistics_status||order.logistics_status, o.order_status||order.order_status,
      o.buyer_name||order.buyer_name, o.buyer_contact||order.buyer_contact,
      ss, o.note||order.note, req.params.id);
    res.json(await db.get('SELECT * FROM orders WHERE id=?', req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', auth, async (req, res) => {
  const o = await db.get('SELECT * FROM orders WHERE id=? AND user_id=?', req.params.id, req.userId);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  await db.run('DELETE FROM orders WHERE id=?', req.params.id);
  res.json({ message: '已删除' });
});

app.get('/api/orders/export', auth, async (req, res) => {
  const rows = await db.all('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', req.userId);
  let csv = '﻿ID,平台,商品名,规格,进货价,优惠券,实付,卖出价,卖出平台,利润,单号,物流,状态,结算,买家,买家电话,备注,创建时间\n';
  for (const r of rows) {
    const profit = (r.selling_price||0) - r.actual_payment;
    csv += [r.id,r.platform,r.product_name,r.product_spec,r.purchase_price,r.coupon_amount,
      r.actual_payment,r.selling_price||'',r.selling_platform,profit,r.tracking_no,
      r.logistics_status,r.order_status,r.settlement_status,r.buyer_name,r.buyer_contact,
      r.note,r.created_at].join(',')+'\n';
  }
  const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'').replace('-','').replace('-','');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=orders_export_'+ts+'.csv');
  res.send(csv);
});

// ── Admin Stats ──
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  const g = await db.get("SELECT COALESCE(SUM(actual_payment),0) as spend, COALESCE(SUM(selling_price),0) as sold, COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit, COUNT(*) as cnt, COUNT(DISTINCT user_id) as members FROM orders");
  const now = new Date(); const m = now.getMonth()+1; const y = now.getFullYear();
  const ms = y+'-'+String(m).padStart(2,'0')+'-01';
  const me = (m===12?(y+1):y)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01';
  const lm = m===1?12:m-1; const ly = m===1?y-1:y;
  const lms = ly+'-'+String(lm).padStart(2,'0')+'-01';
  const tm = await db.get("SELECT COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit FROM orders WHERE order_status='已卖出' AND created_at>=? AND created_at<?", ms, me);
  const lm_ = await db.get("SELECT COALESCE(SUM(COALESCE(selling_price,0)-actual_payment),0) as profit FROM orders WHERE order_status='已卖出' AND created_at>=? AND created_at<?", lms, ms);
  const members = await db.all("SELECT u.id,u.username,u.role, (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) as oCnt, COALESCE((SELECT SUM(o2.actual_payment) FROM orders o2 WHERE o2.user_id=u.id),0) as spend, COALESCE((SELECT SUM(o2.selling_price) FROM orders o2 WHERE o2.user_id=u.id),0) as sold, COALESCE((SELECT SUM(COALESCE(o2.selling_price,0)-o2.actual_payment) FROM orders o2 WHERE o2.user_id=u.id),0) as profit FROM users u WHERE u.status='approved' ORDER BY profit DESC");
  res.json({ global:{spend:g.spend,sold:g.sold,profit:g.profit,orders:g.cnt,members:g.members}, monthProfit:tm.profit, lastMonthProfit:lm_.profit, members });
});

// ── Admin Orders ──
app.get('/api/admin/orders', auth, adminOnly, async (req, res) => {
  let { page=1, pageSize=20, platform, status, search, userId, sortBy='created_at', sortOrder='DESC' } = req.query;
  page = Math.max(1, parseInt(page)||1);
  pageSize = Math.min(100, Math.max(1, parseInt(pageSize)||20));
  const ok = ['created_at','actual_payment','selling_price','purchase_price'];
  if (!ok.includes(sortBy)) sortBy = 'created_at';
  sortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  let w = 'WHERE 1=1'; const p = [];
  if (platform) { w += ' AND o.platform=?'; p.push(platform); }
  if (status) { w += ' AND o.order_status=?'; p.push(status); }
  if (userId) { w += ' AND o.user_id=?'; p.push(parseInt(userId)); }
  if (search) { w += ' AND (o.product_name LIKE ? OR o.tracking_no LIKE ?)'; p.push('%'+search+'%','%'+search+'%'); }
  const cnt = await db.get('SELECT COUNT(*) as total FROM orders o '+w, ...p);
  const list = await db.all('SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id=u.id '+w+' ORDER BY o.'+sortBy+' '+sortOrder+' LIMIT ? OFFSET ?', ...p, pageSize, (page-1)*pageSize);
  res.json({ list, total: cnt.total, page, pageSize });
});

app.get('/api/admin/orders/:id', auth, adminOnly, async (req, res) => {
  const order = await db.get('SELECT o.*, u.username FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?', req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json(order);
});

app.put('/api/admin/orders/:id', auth, adminOnly, async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id=?', req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  try {
    const o = req.body;
    const pp = o.purchase_price!=null ? parseFloat(o.purchase_price) : order.purchase_price;
    const ca = o.coupon_amount!=null ? parseFloat(o.coupon_amount) : order.coupon_amount;
    const ap = pp - ca;
    const sp = o.selling_price!=null ? parseFloat(o.selling_price) : order.selling_price;
    const ss = o.order_status==='已卖出' ? (o.settlement_status||'未结算') : order.settlement_status;
    await db.run('UPDATE orders SET platform=?,product_name=?,product_spec=?,purchase_price=?,coupon_amount=?,actual_payment=?,selling_price=?,selling_platform=?,tracking_no=?,logistics_status=?,order_status=?,buyer_name=?,buyer_contact=?,settlement_status=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      o.platform||order.platform, o.product_name||order.product_name, o.product_spec||order.product_spec,
      pp, ca, ap, sp, o.selling_platform||order.selling_platform, o.tracking_no||order.tracking_no,
      o.logistics_status||order.logistics_status, o.order_status||order.order_status,
      o.buyer_name||order.buyer_name, o.buyer_contact||order.buyer_contact,
      ss, o.note||order.note, req.params.id);
    res.json(await db.get('SELECT * FROM orders WHERE id=?', req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/orders/:id', auth, adminOnly, async (req, res) => {
  await db.run('DELETE FROM orders WHERE id=?', req.params.id);
  res.json({ message: '已删除' });
});

app.get('/api/admin/export', auth, adminOnly, async (req, res) => {
  const rows = await db.all('SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC');
  let csv = '﻿ID,用户,平台,商品名,规格,进货价,优惠券,实付,卖出价,卖出平台,利润,单号,物流,状态,结算,买家,买家电话,备注,创建时间\n';
  for (const r of rows) {
    const profit = (r.selling_price||0) - r.actual_payment;
    csv += [r.id,r.username||'',r.platform,r.product_name,r.product_spec,r.purchase_price,r.coupon_amount,
      r.actual_payment,r.selling_price||'',r.selling_platform,profit,r.tracking_no,
      r.logistics_status,r.order_status,r.settlement_status,r.buyer_name,r.buyer_contact,
      r.note,r.created_at].join(',')+'\n';
  }
  const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'').replace('-','').replace('-','');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=orders_export_'+ts+'.csv');
  res.send(csv);
});

// ── Admin Users ──
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const users = await db.all("SELECT u.id,u.username,u.role,u.status,u.id_card_front,u.id_card_back,u.created_at,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) as oCnt, COALESCE((SELECT SUM(o2.actual_payment) FROM orders o2 WHERE o2.user_id=u.id),0) as spend, COALESCE((SELECT SUM(o2.selling_price) FROM orders o2 WHERE o2.user_id=u.id),0) as sold, COALESCE((SELECT SUM(COALESCE(o2.selling_price,0)-o2.actual_payment) FROM orders o2 WHERE o2.user_id=u.id),0) as profit FROM users u ORDER BY u.created_at DESC");
  res.json(users);
});

app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const ex = await db.get('SELECT id FROM users WHERE username=?', username);
  if (ex) return res.status(400).json({ error: '用户已存在' });
  const hash = bcrypt.hashSync(password, 10);
  await db.run("INSERT INTO users (username, password, role, status) VALUES (?,?,'user','approved')", username, hash);
  res.status(201).json({ message: '添加成功' });
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  const u = await db.get('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.role === 'admin') return res.status(403).json({ error: '不可删除管理员' });
  await db.run('DELETE FROM orders WHERE user_id=?', req.params.id);
  await db.run('DELETE FROM users WHERE id=?', req.params.id);
  res.json({ message: '已删除' });
});

// ── Admin Reviews ──
app.get('/api/admin/reviews', auth, adminOnly, async (req, res) => {
  res.json(await db.all("SELECT * FROM users WHERE status IN ('pending','rejected') ORDER BY created_at DESC"));
});

app.post('/api/admin/reviews/:id/approve', auth, adminOnly, async (req, res) => {
  await db.run("UPDATE users SET status='approved' WHERE id=?", req.params.id);
  res.json({ message: '已通过' });
});

app.post('/api/admin/reviews/:id/reject', auth, adminOnly, async (req, res) => {
  await db.run("UPDATE users SET status='rejected' WHERE id=?", req.params.id);
  res.json({ message: '已拒绝' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('GH报单系统 v3.0 启动 — http://localhost:'+PORT);
  console.log('DB: '+(isPG?'PostgreSQL':'SQLite'));
});
