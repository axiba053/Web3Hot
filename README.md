# Web3Hot

面向 Web3 的热点聚合网站：采集公开信源，通过模型筛选、评分、摘要和归组，提供精选、全部动态、热点、主题、日报/周报/月报，以及 BTC 市场状态看板。

- 线上站点：[web3.sqdxw.top](https://web3.sqdxw.top)
- 站长：币圈佬狗 · [@crypto_laogo](https://x.com/crypto_laogo)
- 定位：AI狂热者 加密赌狗
- 友情链接：[BN alpha 活动](https://bian.sqdxw.top/zh/) · [GitHub](https://github.com/axiba053)

本仓库公开当前站点源码，保留 Web3Hot 品牌、站长信息、Web3 分类、提示词及信源配置。不包含线上数据库、历史文章、采集记录、密钥或运行日志；首次部署从空数据库开始。复制部署时，请设置自己的域名、密码与模型凭据。

## 功能与当前状态

- Web3 新闻：精选、全部动态、事件归组、主题与周期报告。
- BTC 看板：价格、日内走势、成交、资金费率、持仓、情绪与其他风险观察，显示来源时间和数据缺失状态；不构成投资建议。
- 后台：信源管理、采集及模型任务、质量审核和运行状态。
- **Agent 接入、MCP、RSS 与公开 API 当前暂停。** 页面入口已移除，网页服务对 `/agent`、`/api/mcp`、`/api/v1/*`、订阅及接入说明返回 404。内部 API 保留供网站 SSR 使用，不能直接暴露到公网。
- `.env.example` 默认关闭采集、模型调用和邮件等开关。启用采集及付费模型调用前，请确认配置与预算。

## 快速部署

建议 Linux 服务器至少 2 核、4 GB 内存，安装 Docker 和 Docker Compose。初始化脚本需要 Node.js 24.22.1 或更高版本。

```bash
git clone https://github.com/axiba053/Web3Hot.git
cd Web3Hot
cp .env.example .env
```

按 [部署说明](docs/deploy.md) 填写随机密码、签名密钥、模型凭据及 `SITE_URL`，再启动：

```bash
docker compose up -d --build
```

默认访问 `http://localhost:3000`，管理员入口 `/admin`。空数据库没有历史新闻；确认后设置 `COLLECT_ENABLED=true`、`MODEL_CALLS_ENABLED=true` 并重建 worker/api，才会采集及处理文章。BTC 还需 `BTC_MONITOR_ENABLED=true`。费用取决于所用模型和采集量。

## 目录

| 路径 | 内容 |
| --- | --- |
| `site/` | Web3Hot 品牌、站长信息、站点配置与条款 |
| `industry/` | Web3 分类、主题、提示词、信源与评分样本 |
| `modules/btc-monitor/` | BTC 采集、指标和看板 |
| `apps/web/` | React Router 网站与网页服务 |
| `apps/api/`、`apps/worker/` | 后端 HTTP API 与任务调度 |
| `packages/` | 共享协议与后端逻辑 |
| `database/migrations/` | 数据库迁移 |

进一步阅读：[架构](docs/architecture.md) · [定制](docs/customize.md) · [信源](docs/sources.md) · [BTC 模块](modules/btc-monitor/README.md)。框架文档仍包含被暂停功能的实现说明，不代表当前对外开放。

## 开发与检查

```bash
npm ci
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/request-target.test.ts
# 完整浏览器测试需要先安装 Playwright Chromium / WebKit。
npx playwright install --with-deps chromium webkit
node --test apps/web/tests/*.test.ts
# 测试数据库必须以 _test 或 _ci 结尾；需要本地 PostgreSQL 17 及对应客户端。
DATABASE_URL=postgres://localhost:5432/web3hot_test npm test
# 网站启动后验证阅读页、资源和暂停接口。
node scripts/smoke.ts --base http://localhost:3000
node deploy/check-agent-access-paused.mjs http://localhost:3000
```

部分完整回归仍沿用上游示例站的断言；本次发布不宣称完整测试全部通过。生产部署前请检查实际信源可达性、模型兼容性和任务日志。公开来源可能限流、变更或限制地区；配置存在不代表数据源始终可用。X 信源配置使用站点的 RSS 中转地址，自行部署可替换为自己的可用信源。

## 来源与许可证

本项目基于 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 的 MIT 许可代码进行 Web3 定制，保留原版权声明，详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。这是独立发布的源码快照，不是原项目的官方版本；首次提交不包含上游提交历史。内部 npm 包名仍沿用 `@aihot/*`，以保持模块引用一致。

本项目使用 Web3Hot 品牌和自有站点 Logo。第三方字体按各自许可证使用；信源内容归原作者所有，默认仅展示摘要和原文链接。部署者需审核并调整站点条款与隐私说明。
