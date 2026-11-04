# Web3Hot 部署

## 准备

推荐 Docker Compose；构建时建议至少 2 核、4 GB 内存。Node.js 需要 24.22.1 或以上版本；数据库使用 PostgreSQL 17。

```bash
git clone https://github.com/axiba053/Web3Hot.git
cd Web3Hot
cp .env.example .env
```

填写 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`。后三项分别用 `openssl rand -hex 32` 生成，勿共用。设置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`；不同服务商的参数见 `.env.example`。不要提交 `.env`。

也可用 `node scripts/init-env.ts` 初始化随机凭据；运行后逐项检查 `.env`，特别是采集和模型开关。默认 `SITE_URL=http://localhost:3000`，服务器上改成自己的公开地址。仓库保留 Web3Hot 的站点身份信息，自行部署需在 `site/site.ts` 调整。

## 启动

```bash
docker compose up -d --build
```

Compose 启动数据库、迁移与信源初始化任务、api、worker、web。网站默认端口 3000，后台 `/admin`。首次没有历史文章。确认预算后设置 `COLLECT_ENABLED=true` 和 `MODEL_CALLS_ENABLED=true`，BTC 另设 `BTC_MONITOR_ENABLED=true`。邮件与推送开关按需单独启用。

`.env` 更改后，必须重建使用环境文件的容器，单纯 restart 不会加载新配置：

```bash
docker compose up -d --force-recreate api worker web
```

采集信源能否访问取决于部署地区和上游限制。当前 X 信源使用站点 RSS 中转，自行部署应核实或替换；BTC 某些来源可能缺失或过期，应以页面显示的来源时间和状态为准。

## 域名与 HTTPS

DNS 指向自己的服务器，然后设置：

```dotenv
SITE_URL=https://your-domain.example
SITE_DOMAIN=your-domain.example
PORT=127.0.0.1:3000
TRUST_PROXY=true
```

启用内置 Caddy 自动签发证书：

```bash
docker compose --profile https up -d --build
```

已有 Nginx 时，反向代理到 `http://127.0.0.1:3000`，设置 Host、X-Forwarded-For、X-Forwarded-Proto。可以在 HTTPS server 中 include `deploy/agent-access-paused.conf`，作为与线上相同的额外拦截。不要公开 api 容器的 3001 端口。

## 暂停的对外接入

公开版本在 `apps/web/server.ts` 的入口拦截 Agent 页面及其 `.data` 请求、`/api/mcp`、`/api/v1/*`、RSS/Atom、`llms.txt` 和 OpenAPI 说明，返回 404/no-store。此限制在普通 Compose 和 HTTPS 部署都生效，不依赖操作者额外安装 Nginx。网站 `/api/site`、管理员功能及内部 SSR 使用的 API 不受影响。

保留实现与数据结构以供未来恢复，无需删除数据库。恢复时移除网页服务中的暂停拦截和 Nginx 对应规则，恢复导航、RSS 自动发现、站点地图、robots 与条款中的可用性说明，调整冒烟检查并重新构建。不能只添加导航链接。

## 验收与更新

```bash
node scripts/smoke.ts --base https://your-domain.example
node deploy/check-agent-access-paused.mjs https://your-domain.example
```

验收后检查后台任务、信源状态、最新文章及 BTC 数据时间；HTTP 200 不代表每个来源都已更新。全套测试可能仍有上游示例站断言或环境依赖问题，不能仅凭容器启动就判断所有功能正常。

升级前备份数据库及 data 卷：

```bash
mkdir -p .data/backups
docker compose exec -T db pg_dump -U aihot -d aihot -Fc > .data/backups/before-update.dump
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

不要执行 `docker compose down -v`，它会删除运行数据。迁移失败时先解决错误，再启动新版服务；普通代码回退不应直接覆盖数据库。BTC 模块迁移随 setup 自动执行。
