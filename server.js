/* 瞬间图册 · 云端服务器
 * 单进程 Express：静态托管前端 + 数据同步 + 账号鉴权 + 媒体上传
 * 存储：文件系统 JSON（data/）+ 上传文件（uploads/），无外部数据库依赖
 */
'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
// 存储根可自定义：便于把数据/图片直接落到本机指定目录（如 Windows D:\1【图片】）
// DATA_ROOT：账号/作品/资料 JSON；UPLOAD_ROOT：上传的图片视频文件
const DATA_DIR = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.join(ROOT, 'data');
const WORKS_DIR = path.join(DATA_DIR, 'works');
const UPLOAD_DIR = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

const MAX_UPLOAD = 30 * 1024 * 1024; // 单文件 30MB
const PHONE_RE = /^1\d{10}$/;

/* ---------- 目录初始化 ---------- */
[DATA_DIR, WORKS_DIR, UPLOAD_DIR, PUBLIC_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ---------- 小工具：原子读写 JSON ---------- */
function readJSON(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : def;
  } catch (e) {
    return def;
  }
}
function writeJSON(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function safePhone(p) {
  return typeof p === 'string' && PHONE_RE.test(p) ? p : null;
}
function hashPwd(pwd, salt) {
  return crypto.createHmac('sha256', salt).update(String(pwd)).digest('hex');
}
function newId() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

/* ---------- 媒体上传 ---------- */
const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname) || '.bin';
    cb(null, newId() + ext.toLowerCase());
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) cb(null, true);
    else cb(new Error('不支持的文件类型'));
  },
});

/* ---------- 应用 ---------- */
const app = express();
app.use(express.json({ limit: '20mb' }));

// 上传文件静态托管（长缓存：文件名含随机 id，内容不可变）
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true }));
// 前端静态资源
app.use(express.static(PUBLIC_DIR, { extensions: ['.html'] }));

/* 健康检查 */
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- 账号鉴权（服务端，修复跨设备登录覆盖问题） ---------- */
// 查询手机号是否已注册（供前端切换「登录 / 注册并登录」文案）
app.get('/api/accounts', (req, res) => {
  const phone = safePhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  const acc = readJSON(ACCOUNTS_FILE, {});
  res.json({ exists: !!acc[phone] });
});

// 登录 / 注册：已存在则校验密码，不存在则创建
app.post('/api/auth', (req, res) => {
  const phone = safePhone(req.body && req.body.phone);
  const pwd = req.body && req.body.pwd;
  if (!phone) return res.status(400).json({ ok: false, error: '请输入 11 位手机号' });
  if (typeof pwd !== 'string' || pwd.length < 6) {
    return res.status(400).json({ ok: false, error: '密码至少 6 位' });
  }
  const acc = readJSON(ACCOUNTS_FILE, {});
  const salt = newId();
  if (acc[phone]) {
    if (hashPwd(pwd, acc[phone].salt) !== acc[phone].hash) {
      return res.status(401).json({ ok: false, error: '密码不正确' });
    }
    return res.json({ ok: true, created: false, phone });
  }
  acc[phone] = { salt, hash: hashPwd(pwd, salt), nick: '', created_at: Date.now() };
  writeJSON(ACCOUNTS_FILE, acc);
  res.json({ ok: true, created: true, phone });
});

/* ---------- 作品数据同步（按手机号，一账号一文件） ---------- */
function worksFile(phone) {
  return path.join(WORKS_DIR, phone + '.json');
}
app.get('/api/works', (req, res) => {
  const phone = safePhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  const rec = readJSON(worksFile(phone), null);
  if (!rec) return res.json({ data: null, updated_at: 0 });
  res.json({ data: rec.data || null, updated_at: rec.updated_at || 0 });
});
app.post('/api/works', (req, res) => {
  const phone = safePhone(req.body && req.body.phone);
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  const data = req.body && req.body.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'invalid data' });
  }
  const updated_at = Date.now();
  writeJSON(worksFile(phone), { data, updated_at });
  res.json({ ok: true, updated_at });
});

/* ---------- 个人资料：头像 / 背景（存 URL） ---------- */
app.get('/api/profile', (req, res) => {
  const phone = safePhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  const map = readJSON(PROFILE_FILE, {});
  const p = map[phone] || {};
  res.json({ avatar: p.avatar || '', bg: p.bg || '' });
});
app.post('/api/profile', (req, res) => {
  const phone = safePhone(req.body && req.body.phone);
  if (!phone) return res.status(400).json({ error: 'invalid phone' });
  const map = readJSON(PROFILE_FILE, {});
  const cur = map[phone] || {};
  if ('avatar' in req.body) cur.avatar = String(req.body.avatar || '');
  if ('bg' in req.body) cur.bg = String(req.body.bg || '');
  map[phone] = cur;
  writeJSON(PROFILE_FILE, map);
  res.json({ ok: true });
});

/* ---------- 媒体上传：返回可长期访问的 URL ---------- */
app.post('/api/media', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const url = '/uploads/' + req.file.filename;
    res.json({ ok: true, url, kind: /^video\//.test(req.file.mimetype) ? 'video' : 'image' });
  });
});

/* ---------- SPA 兜底：其它 GET 一律回首页 ---------- */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ---------- 错误处理 ---------- */
app.use((err, req, res, next) => {
  console.error('[error]', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`瞬间图册 server 已启动: http://0.0.0.0:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`上传目录: ${UPLOAD_DIR}`);
});
