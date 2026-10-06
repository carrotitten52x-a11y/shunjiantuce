# 瞬间图册 · SJ

一个支持**跨设备云端同步**的图片/视频图册应用。以手机号为账号，作品、头像、背景全部存服务器，换设备登录即可无缝继续。

- **LOGO**：`SJ`（顶栏徽标 + favicon + 登录弹窗）
- **数据跨设备生效**：账号鉴权、作品数据、媒体文件、头像背景全部上云
- **只读分享**：`?guest=手机号` 生成预览链接，访客只能浏览，绝不写回分享者账号

---

## 架构

```
shunjiantuce/
├─ server.js          # Express + multer 后端（账号鉴权 / 作品读写 / 媒体上传 / 静态托管）
├─ public/
│  └─ index.html      # 单文件前端（含全部样式与逻辑）
├─ data/              # 运行时数据（accounts.json / profile.json / works/{phone}.json）— 不入库
├─ uploads/           # 上传的图片/视频 — 不入库
├─ package.json
└─ .gitignore         # 已排除 node_modules/ data/ uploads/ *.log
```

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/accounts?phone=` | 手机号是否已注册（前端切换「登录 / 注册」文案） |
| POST | `/api/auth` | 登录 / 注册（HMAC-SHA256 加盐，已存在校验密码，否则创建） |
| GET  | `/api/works?phone=` | 拉取该账号作品（含 `updated_at`，供跨设备比较） |
| POST | `/api/works` | 保存作品（按 phone 存 `data/works/{phone}.json`） |
| GET  | `/api/profile?phone=` | 读取头像 / 背景 URL |
| POST | `/api/profile` | 保存头像 / 背景 URL |
| POST | `/api/media` | 上传图片/视频（multer，30MB 上限，仅白名单 MIME），返回 `/uploads/{id}{ext}` |

静态：`public/` 首页 + `uploads/` 长缓存；其余 GET 走 SPA 兜底回首页。

---

## 本地运行

```bash
npm install
node server.js            # 默认 3000；改端口：PORT=8080 node server.js
```

浏览器打开 `http://localhost:3000`。

## 获取可分享的公开链接（重要）

沙箱预览链接（`*.preview.iflow.cn`）受**平台会话鉴权**保护：只有当前登录该沙箱环境的浏览器能打开；分享给好友会返回 **401**（`aone-super-error-capture` 网关页）。这是平台安全门，**非应用故障**（后端本地 `/`、`/?guest=`、`/api/health` 均 200，`server.js` 唯一的 401 在 `/api/auth` 密码错误分支），也无法绕过。

要得到**任何人可打开、跨设备同步、可只读分享**的永久链接，请把后端部署到公网主机。本仓库已就绪，二选一：

### 方案 A：Render 一键部署（推荐，免运维）
1. 打开 https://dashboard.render.com → **New +** → **Blueprint**，连接本仓库 `carrotitten52x-a11y/shunjiantuce`。
2. Render 自动读取 `render.yaml` 完成部署，几分钟后给你一个 `https://shunjiantuce.onrender.com` 形式的公网域名。
3. 该域名即「可分享链接」；`https://<你的域名>/?guest=手机号` 即「只读分享链接」，好友无需登录即可查看。
> ⚠️ Render 免费实例文件系统**非持久化**，实例重启会清空 `data/`、`uploads/`（账号与图片丢失）。需长期保存请升级付费实例并挂载 Persistent Disk，或改用方案 B。

### 方案 B：自有 VPS + pm2（数据持久，见下节）

## 部署到服务器

后端需**常驻进程**（Node），并保证 `data/` 与 `uploads/` 目录可写且持久化。

```bash
# 生产建议用进程守护
npm install -g pm2
pm2 start server.js --name shunjiantuce
pm2 save && pm2 startup
```

反向代理（Nginx 示例）：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 30m;              # 与后端上传上限一致

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

> 注意：`server.js` 监听 `0.0.0.0`，容器/沙箱环境反向代理才能访问到。

---

## 安全说明

- 密码经 **HMAC-SHA256 + 随机盐** 存储，明文不落盘。
- 已**移除**「陌生访客免密自动登录管理账号」的行为——公网部署后任何人打开首页不会自动进入你的账号，需显式手机号 + 密码登录。
- 老用户由浏览器 `localStorage` 自动恢复登录态；`?guest=` 分享链接为只读，前端双重拦截（`state.guest`）任何写盘与推云操作。
- 管理账号 `13960930944` 仍保留「无限上传额度」这一产品属性，但**不再**默认登录。
- 生产环境建议：置于 HTTPS 之后，并为 `/api/*` 增加速率限制与鉴权中间件。

## 数据与额度

- 作品按手机号隔离存储，跨设备登录即同步（拉取时以 `updated_at` 判断云端是否更新）。
- 上传额度：默认账号每月 100 张，按自然月滚动；管理账号无限。
