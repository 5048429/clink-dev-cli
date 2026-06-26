# Clink Integ CLI 中文需求说明

## 1. 项目定位

`clink-integ-cli` 是面向 ClinkBill 商户开发者和 AI Coding Agent 的命令行工具。

它的核心目标是：让开发者在拿到 ClinkBill sandbox Secret Key 后，可以尽量少进入 Dashboard，通过 CLI 完成支付接入的技术配置、代码生成、接口调用、本地 webhook 验证和 smoke test。

本项目不是 ClinkBill Dashboard 的替代品，也不负责开户注册、MFA、生产审批、银行账户绑定、法律协议确认等人工或合规流程。

## 2. 目标用户

主要用户包括：

- 独立开发者
- 使用 ClinkBill 接入支付的网站开发者
- 帮用户改代码的 AI Coding Agent
- ClinkBill 官方集成支持人员
- 需要快速验证 checkout、subscription、webhook 的内部工程师

用户通常具备：

- 一个已有 Web 项目
- 一个 ClinkBill sandbox Secret Key
- 一个本地或测试环境服务端
- 基本命令行使用能力

## 3. 需要解决的问题

当前支付接入通常会遇到这些摩擦：

- 开发者需要频繁查文档、组装 API payload
- Dashboard 手动配置和代码实现之间容易脱节
- webhook 签名校验、raw body、时间戳容忍等细节容易写错
- AI Agent 缺少稳定 CLI 接口，很难端到端验证接入结果
- checkout、subscription、product、price、webhook 的流程分散
- 不同框架需要重复写相似的 starter 代码

`clink-integ-cli` 要把这些动作收敛成稳定、可脚本化、AI 友好的命令。

## 4. 第一阶段目标

第一阶段目标是交付一个可演示、可测试、可被 AI 调用的 merchant developer CLI。

最小闭环如下：

```bash
clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox
clink product create ...
clink price create ...
clink checkout create ...
clink subscription create ...
clink webhook simulate ...
clink doctor
clink smoke-test
```

完成后应支持：

- 创建 checkout session
- 创建和查询 product
- 创建和查询 price
- 创建 subscription
- 本地生成、签名、验证 webhook fixture
- 生成 Next.js、Express、FastAPI starter
- 通过 `doctor` 检查配置和环境
- 通过 `smoke-test` 验证基本链路
- 通过 `--json` 输出稳定机器可读结果

## 5. 功能范围

### 5.1 配置与认证

CLI 应支持：

- 默认使用 sandbox 环境
- 通过环境变量读取 Secret Key
- 支持本地 profile
- 支持 `env:CLINK_SECRET_KEY` 形式引用密钥
- 普通输出中隐藏真实 secret
- `--dry-run` 模式下生成请求但不真实调用 API

不应支持：

- 自动生成生产 Secret Key
- 自动替用户登录 Dashboard
- 在代码或日志中打印真实密钥

### 5.2 Checkout

CLI 应支持：

- 创建 hosted checkout session
- 使用 inline `priceDataList` 创建一次性付款
- 支持 customer email
- 支持 success URL 和 cancel URL
- 支持 registered product / price 模式
- 输出 curl 示例
- 支持 `--dry-run`

### 5.3 Product / Price

CLI 应支持：

- 创建 product
- 上传或引用 product image
- 查询 product 列表
- 创建 one-time price
- 创建 recurring price
- 查询 price 列表

这些能力用于减少订阅场景中对 Dashboard 手动创建 Product / Price 的依赖。

### 5.4 Subscription

CLI 应支持：

- 使用已有 product、price、payment instrument 创建 subscription
- 支持 customer id、customer email、reference customer id
- 支持 metadata
- 输出 curl 示例
- 支持 `--dry-run`

第一阶段不要求 CLI 负责 payment instrument 绑定流程。

### 5.5 Webhook

CLI 应支持：

- 生成本地 webhook fixture
- 对 fixture 进行 HMAC SHA-256 签名
- 校验 `X-Clink-Timestamp`
- 校验 `X-Clink-Signature`
- 支持 timestamp tolerance，默认 300 秒
- 将签名后的事件转发到本地 webhook endpoint

签名规则：

```text
HMAC_SHA256(secret, X-Clink-Timestamp + "." + rawBody)
```

需要覆盖的事件类型包括：

- `session.complete`
- `session.expired`
- `order.created`
- `order.succeeded`
- `order.failed`
- `subscription.created`
- `subscription.activated`
- `subscription.past_due`
- `invoice.open`
- `invoice.paid`
- `invoice.void`

### 5.6 Framework Starters

CLI 应支持生成常见服务端框架 starter：

- Next.js App Router
- Express
- FastAPI

每个 starter 应包含：

- checkout route
- subscription route
- webhook route
- raw body 签名校验示例
- `.env.example`
- curl examples
- 简短接入说明

CLI 自身不应把这些框架作为运行时依赖。

### 5.7 OpenAPI 类型

CLI 应接入 ClinkBill 官方 OpenAPI：

```text
https://docs.clinkbill.com/api-reference/openapi.json
```

目标：

- 生成 TypeScript 类型
- 降低手写 payload 和官方文档漂移的风险
- 支持 `npm run openapi:refresh`
- 在 checkout、product、price、subscription 等命令中逐步使用类型约束

### 5.8 Doctor / Smoke Test

`doctor` 应检查：

- 当前环境
- API key 是否存在
- webhook signing key 是否存在
- API 基本连通性
- 可选本地 webhook endpoint 测试

`smoke-test` 应支持：

- 创建最小 checkout session
- 可选发送本地签名 webhook
- 输出结构化结果

## 6. AI 友好要求

本 CLI 需要优先服务 AI Agent，因此必须满足：

- 所有关键命令支持 `--json`
- 错误输出在 `--json` 下保持稳定结构
- 支持稳定 exit code
- 支持 `--dry-run`
- 命令帮助足够清晰
- 不依赖交互式输入完成核心流程
- 不要求 AI 读取 Dashboard 页面才能完成普通技术验证

JSON 错误示例：

```json
{
  "ok": false,
  "error": "Missing Clink Secret Key",
  "exitCode": 77
}
```

## 7. 非目标

第一阶段明确不做：

- 商户账号注册
- MFA 自动化
- 生产环境审批
- 生产 Secret Key 自动生成
- 银行账户绑定
- 自动接受法律协议
- 托管 webhook relay
- 远程 event replay
- 完整替代现有 customer wallet CLI
- 默认引入 OpenCLI 浏览器自动化
- 默认引入 Ink 交互式 UI

## 8. Dashboard 自动化原则

如果某些能力暂时没有公开 API，可以研究 OpenCLI 作为 Dashboard 自动化兜底。

但原则是：

- 不进入核心依赖
- 不默认启用
- 不自动处理 MFA、密码、生产 key、法律确认
- 必须标注为 experimental
- 高风险操作必须人工确认

优先级始终是：

```text
官方 API > CLI 能力 > 文档指导 > 可选 Dashboard 自动化
```

## 9. 验收标准

代码层面必须通过：

```bash
npm run check
npm run build
npm test
```

关键命令应可运行：

```bash
node dist/index.js --help
node dist/index.js auth status --json
node dist/index.js --dry-run checkout create --customer-email test@example.com --amount 1 --currency USD --json
node dist/index.js webhook simulate invoice.paid --secret test_secret --json
node dist/index.js init --framework nextjs --out .tmp-next --force --json
node dist/index.js --json unknown
```

期望结果：

- TypeScript 编译通过
- 测试通过
- dry-run 不需要真实 Secret Key
- webhook 签名输出包含 timestamp、signature、headers、rawBody
- 未知命令在 `--json` 下返回稳定错误结构
- 生成 starter 后不提交临时目录

## 10. 版本路线

### v0.1.0

目标：完成基础可演示版本。

包含：

- 基础 CLI
- checkout/product/price/subscription 命令
- webhook 本地工具
- doctor/smoke-test
- framework starters
- OpenAPI 类型生成
- 测试和 exit code 基础设施
- Dashboard automation 研究文档

### v0.2.0

目标：提升真实项目接入体验。

候选能力：

- 更多框架 starter
- 更完整的 OpenAPI typed client
- webhook endpoint 管理 API 支持后接入 `clink webhook create`
- event list / replay / trigger API 支持后接入 `clink events`
- 生成集成报告

### v0.3.0+

目标：AI 原生集成体验。

候选能力：

- MCP server
- `clink listen`
- production validation gate
- optional `clink wizard`
- optional Dashboard automation adapter

