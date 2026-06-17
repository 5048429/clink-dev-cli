# Clink Dev CLI 产品需求文档

## 1. 文档目的

本文档从 Clink 产品经理视角定义 `clink-dev-cli` 的产品目标、用户价值、功能范围、优先级、验收标准和后续演进方向。

`clink-dev-cli` 的核心定位是：为 ClinkBill 商户、独立开发者和 AI Coding Agent 提供一个稳定、可脚本化、AI 友好的开发者命令行工具，降低支付接入过程中的 Dashboard 操作成本、文档理解成本和本地调试成本。

## 2. 背景

ClinkBill 目前已经具备 checkout、subscription、product、price、webhook、refund、test clock、customer portal 等支付与计费能力。

但对新商户和独立开发者来说，接入过程仍然存在明显摩擦：

- 需要在 Dashboard、API 文档、代码项目之间频繁切换
- checkout、subscription、webhook 的概念分散，缺少统一本地工作流
- webhook 签名校验、raw body、时间戳容忍、幂等处理等细节容易出错
- AI Agent 可以写代码，但缺少稳定 CLI 工具来验证接入是否正确
- 当前 Dashboard 中的 API key、webhook endpoint 等能力尚未完全 API 化
- Stripe 已经在 AI workflow、CLI、MCP、sandbox、webhook 本地调试方面形成较强心智，Clink 需要建立自己的开发者体验壁垒

因此，Clink 需要一个面向开发者和 AI Agent 的官方 CLI，将 ClinkBill 的支付接入能力包装成稳定命令。

## 3. 产品定位

`clink-dev-cli` 是 ClinkBill 的 merchant developer CLI。

它不是：

- 商户开户注册工具
- Dashboard 替代品
- 生产审批工具
- 钱包用户支付 CLI 的替代品
- 浏览器自动化工具

它是：

- ClinkBill API 的开发者封装层
- 本地 webhook 调试工具
- starter 代码生成器
- 集成健康检查工具
- AI Agent 可调用的支付接入工作台

产品定位可以概括为：

```text
帮助开发者和 AI Agent 在本地快速完成 ClinkBill 支付接入验证。
```

## 4. 目标用户

### 4.1 独立开发者

他们希望在个人项目、SaaS、小型电商网站中快速接入 ClinkBill。

核心诉求：

- 少看文档
- 少进 Dashboard
- 快速生成可用代码
- 能本地验证 webhook
- 能复制 curl 示例调试

### 4.2 AI Coding Agent

包括 Codex、Claude Code、Cursor、OpenClaw 等可以操作代码库的 agent。

核心诉求：

- 有稳定 CLI 命令
- 有 `--json` 输出
- 有稳定 exit code
- 有 `--dry-run`
- 可以生成 starter
- 可以验证 webhook 签名

### 4.3 Clink 内部集成支持团队

他们需要帮助商户快速排查接入问题。

核心诉求：

- 统一排查命令
- 快速复现 webhook 签名问题
- 生成标准 starter
- 降低重复答疑成本

### 4.4 商户工程团队

他们希望将 Clink 接入流程放进 CI 或内部开发脚本。

核心诉求：

- 可脚本化
- 可测试
- 可审计
- 不泄露密钥

## 5. 用户问题

### 问题一：API 能力存在，但开发者不知道如何正确组合

Clink API 已经提供 checkout、product、price、subscription 等接口，但开发者需要自己理解字段、环境、header、payload 和返回结果。

CLI 应通过命令抽象降低理解成本。

### 问题二：webhook 是支付接入的高风险环节

webhook 涉及 raw body、签名、时间戳、幂等、乱序、重试。如果商户实现不正确，可能导致重复发货、漏记订单或误判支付状态。

CLI 应提供本地模拟、签名、验证和 fixture 生成。

### 问题三：AI Agent 写代码容易，但验证链路困难

AI Agent 可以修改项目代码，但没有一个稳定工具来判断“Clink 接入是否真的跑通”。

CLI 应提供 JSON 输出、dry-run、doctor、smoke-test 和 starter，帮助 Agent 闭环。

### 问题四：Dashboard 操作尚未完全 API 化

API key 初始化、webhook endpoint 注册、生产审批等操作当前仍依赖 Dashboard 或人工流程。

CLI 应明确边界：能自动化技术验证，不能绕过必要的人类授权和合规确认。

## 6. 产品目标

### 6.1 第一阶段目标

交付一个可用的 `v0.1.0` CLI，让开发者在 sandbox 环境中完成基础支付集成验证。

需要支持：

- checkout session 创建
- product / price 管理
- subscription 创建
- webhook 本地模拟和签名验证
- Next.js、Express、FastAPI starter 生成
- doctor 和 smoke-test
- OpenAPI 类型生成
- 测试和 exit code 基础设施

### 6.2 中期目标

让 CLI 成为 ClinkBill 官方推荐的开发者接入入口。

需要支持：

- webhook endpoint 管理 API
- event list / replay / trigger API
- 更完整的 production validation
- 更多框架 starter
- CI 集成示例

### 6.3 长期目标

让 ClinkBill 具备 AI-native payment integration 能力。

需要支持：

- 官方 MCP server
- Agent skill / plugin
- Dashboard-less sandbox setup
- `clink listen`
- `clink trigger`
- production readiness gate

## 7. 核心用户路径

### 7.1 无真实 key 的体验路径

用户可以在没有真实 Clink key 的情况下体验 CLI：

```bash
clink checkout create --dry-run --customer-email test@example.com --amount 19.99 --currency USD --json
clink webhook simulate invoice.paid --secret test_secret --json
clink init --framework nextjs --out .demo-next --force --json
```

产品价值：

- 降低首次体验门槛
- 让开发者快速理解 Clink API 请求结构
- 让 AI Agent 可以先生成集成代码

### 7.2 sandbox 真实 API 验证路径

用户配置 sandbox Secret Key：

```bash
clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox
clink doctor --json
clink checkout create ...
clink smoke-test --json
```

产品价值：

- 真实调用 Clink sandbox
- 验证 API key、base URL、payload 和返回结果
- 帮助商户在上线前发现配置问题

### 7.3 框架 starter 路径

用户生成 starter：

```bash
clink init --framework nextjs --out ./clink-next-demo --force
```

产品价值：

- 提供可复制的标准实现
- 降低 webhook raw body 实现错误
- 给 AI Agent 一个可参考模板

### 7.4 webhook 本地调试路径

用户生成并验证 webhook：

```bash
clink webhook fixture order.succeeded --out ./fixtures/order.json
clink webhook sign --body-file ./fixtures/order.json --secret env:CLINK_WEBHOOK_SIGNING_KEY --json
clink webhook verify --body-file ./fixtures/order.json --timestamp <timestamp> --signature <signature> --secret env:CLINK_WEBHOOK_SIGNING_KEY --json
```

产品价值：

- 本地验证签名逻辑
- 不依赖 Dashboard webhook endpoint
- 支持 CI 和自动化测试

## 8. 功能需求

### P0：必须完成

#### 8.1 基础 CLI 框架

要求：

- 使用 TypeScript
- 使用 Commander 作为命令路由
- 支持 Node.js 20+
- 支持 ESM
- 支持 `--json`
- 支持 `--dry-run`

验收：

```bash
clink --help
clink auth status --json
```

#### 8.2 API client

要求：

- 支持 sandbox / production base URL
- 默认 sandbox
- 自动设置 `X-API-KEY`
- 自动设置 `X-Timestamp`
- 支持 JSON body
- 支持 multipart product image upload
- dry-run 时不真实请求远端

#### 8.3 Checkout 命令

命令：

```bash
clink checkout create
```

要求：

- 支持 inline one-time product
- 支持 registered product / price
- 支持 customer email
- 支持 success URL / cancel URL
- 输出 curl 示例
- 支持 dry-run

#### 8.4 Product / Price 命令

命令：

```bash
clink product create
clink product list
clink price create
clink price list
```

要求：

- 支持 product image id
- 支持 product image upload
- 支持 one-time price
- 支持 recurring price
- 支持 active price 查询

#### 8.5 Subscription 命令

命令：

```bash
clink subscription create
```

要求：

- 支持 product id
- 支持 price id
- 支持 payment instrument id
- 支持 customer id / customer email / reference customer id
- 支持 metadata
- 支持 curl 示例

#### 8.6 Webhook 工具

命令：

```bash
clink webhook fixture
clink webhook simulate
clink webhook sign
clink webhook verify
```

要求：

- 支持生成 fixture
- 支持签名
- 支持验证签名
- 支持 timestamp tolerance
- 支持转发到本地 endpoint
- 使用 Clink 兼容签名算法

#### 8.7 Framework starters

命令：

```bash
clink init --framework nextjs
clink init --framework express
clink init --framework fastapi
```

要求：

- 生成 checkout route
- 生成 subscription route
- 生成 webhook route
- 生成 `.env.example`
- 生成 curl examples
- 生成接入说明
- CLI 自身不引入对应框架为运行时依赖

#### 8.8 Doctor / Smoke Test

命令：

```bash
clink doctor
clink smoke-test
```

要求：

- 检查环境
- 检查 API key
- 检查 webhook signing key
- 可选检查 API 连通性
- 可选发送本地签名 webhook

#### 8.9 OpenAPI 类型

要求：

- 支持 `npm run openapi:refresh`
- 从官方 OpenAPI 生成类型
- 在 API 命令中逐步使用类型约束
- 文档说明刷新方式和覆盖范围

#### 8.10 测试和 exit code

要求：

- 支持 `npm test`
- 测试 dry-run
- 测试 webhook signature
- 测试 secret masking
- 测试 exit code
- JSON 错误输出包含 `exitCode`

### P1：下一阶段

#### 8.11 `checkout create --open`

创建 checkout session 后自动打开 hosted checkout URL。

价值：

- 降低测试支付入口成本
- 更接近 Stripe Checkout 的开发者体验

依赖：

- 当前 checkout API 已返回 URL，可直接实现

#### 8.12 Production doctor

命令：

```bash
clink production doctor
```

检查：

- 是否仍使用 sandbox URL
- 是否配置 production key
- webhook endpoint 是否 HTTPS
- 是否缺少 signing key
- starter 中是否存在硬编码 secret

#### 8.13 Webhook endpoint API 支持

如果 ClinkBill 后端提供 API：

```http
POST /webhook-endpoints
GET /webhook-endpoints
DELETE /webhook-endpoints/{id}
```

CLI 可新增：

```bash
clink webhook create
clink webhook list
clink webhook delete
```

### P2：长期能力

#### 8.14 Event trigger / replay

如果 ClinkBill 后端提供 API：

```http
GET /events
POST /events/{id}/replay
POST /test/events/trigger
```

CLI 可新增：

```bash
clink events list
clink events replay
clink trigger order.succeeded
```

#### 8.15 MCP server

为 AI Agent 提供正式工具层。

能力：

- 搜索文档
- 创建 checkout session
- 创建 product / price
- 创建 subscription
- 验证 webhook
- 查询事件
- 运行 doctor

#### 8.16 Optional Dashboard automation

在公开 API 暂不支持时，可以研究 OpenCLI 作为实验兜底。

但必须满足：

- 不进入核心路径
- 不自动处理 MFA
- 不自动读取生产 secret
- 不自动点击高风险操作
- 明确标注 experimental

## 9. 非功能需求

### 9.1 安全

- 不打印真实 Secret Key
- 不提交 `.env`
- 不把 secret 写入 starter
- dry-run 输出必须 mask key
- 生产相关操作必须明确确认

### 9.2 可维护性

- 命令模块按领域拆分
- API client 统一处理请求
- OpenAPI 类型可刷新
- starter 模板集中维护
- 文档随命令变更同步更新

### 9.3 AI 友好

- 稳定 JSON 输出
- 稳定 exit code
- 命令 help 自描述
- 避免交互式阻塞
- 所有核心流程可脚本化

### 9.4 开发者体验

- 默认 sandbox
- 支持 dry-run
- 命令命名直观
- 错误信息可读
- README 示例可复制

## 10. 成功指标

### 10.1 开发效率指标

- 新开发者完成第一个 checkout dry-run 时间小于 5 分钟
- 新开发者生成 starter 时间小于 2 分钟
- webhook 签名本地验证时间小于 5 分钟

### 10.2 接入质量指标

- webhook 签名错误相关支持问题减少
- checkout payload 配置错误减少
- sandbox 接入问题可以通过 `doctor` 初步定位

### 10.3 AI Agent 指标

- Agent 可以通过 CLI 完成 dry-run 验证
- Agent 可以解析 JSON 输出
- Agent 可以根据 exit code 判断失败类型
- Agent 可以生成 starter 并运行测试

### 10.4 产品采用指标

- CLI 被纳入官方 Quickstart
- CLI 被纳入 clink-integ-skills 推荐流程
- 内部支持团队使用 CLI 复现商户问题

## 11. 风险和限制

### 11.1 公开 API 缺口

当前部分 Dashboard 操作没有公开 API，例如：

- 自动创建 API key
- 自动注册 webhook endpoint
- 自动注册 merchant
- 自动完成生产审批

这些能力不能仅靠 CLI 完成，需要后端产品化支持。

### 11.2 Dashboard 自动化风险

通过浏览器自动化 Dashboard 可以补一部分缺口，但存在：

- 登录态不稳定
- 页面结构变化
- MFA 阻塞
- secret 泄露风险
- 高风险操作误触

因此只能作为实验方向，不应进入默认路径。

### 11.3 支付完成自动化边界

CLI 可以打开 checkout URL，也可以在已有 payment instrument 和用户授权下调用支付能力。

但 CLI 不应默认绕过：

- 用户授权
- 3DS
- 钱包确认
- 验证码
- 风控拦截

## 12. 发布计划

### v0.1.0

目标：完成可演示版本。

内容：

- 基础 CLI
- checkout / product / price / subscription
- webhook 本地工具
- starter 生成
- OpenAPI 类型
- doctor / smoke-test
- 测试和 exit code
- 中文需求说明
- PM PRD

### v0.2.0

目标：增强真实接入体验。

候选：

- `checkout create --open`
- `production doctor`
- 更多 starter
- 更完整 OpenAPI 覆盖
- CI examples

### v0.3.0

目标：向 AI-native integration 演进。

候选：

- MCP server
- webhook endpoint API 支持
- events replay / trigger
- `clink listen`
- production validation gate

## 13. 结论

`clink-dev-cli` 的第一阶段不应追求“完全替代 Dashboard”，而应优先建立一个稳定、可信、AI 可调用的技术接入工作流。

短期价值是降低 ClinkBill checkout、subscription、webhook 的接入门槛。

中期价值是将 ClinkBill 的开发者体验从“查文档 + 写代码 + 手动试错”升级为“CLI 驱动 + 本地验证 + AI 自动化”。

长期价值是为 ClinkBill 建立与 AI Agent 深度集成的支付基础设施入口。

