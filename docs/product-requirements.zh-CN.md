# ClinkBill AI 自动接入产品需求文档

## 1. 一句话目标

让开发者把“接入 ClinkBill 支付”交给 AI 后，AI 能在 UAT 环境自动完成密钥准备、代码接入、checkout/订阅测试、webhook 配置和验收报告。

当前 CLI 不是最终目标，而是过渡工具：先把 Dashboard 手工步骤封装起来，证明这些步骤可以被 AI 调用；下一步再把这些能力沉淀成官方开放 API。

最终体验：

```bash
clink setup uat --project . --run-smoke-test --json
```

用户最多只做一次授权，其余步骤由 AI 自动完成。

## 2. 背景

当前官方提示词希望 Agent 完成：

- 创建 checkout session 并完成测试支付
- 创建 subscription
- 配置 webhook endpoint 并校验签名
- 把测试密钥写入 `.env`
- 给出最小 demo 和 curl 示例

问题是：这个提示词默认 Secret Key、Webhook、Signing Secret、测试事件和投递日志都已经可用。

实际接入时，这些关键资源很多只能在 Dashboard 里手动创建、复制或查看，所以 AI 只能写代码，不能完整跑通接入闭环。

## 3. 当前人工断点

| 环节 | 现在需要人工做什么 | 目标状态 |
| --- | --- | --- |
| 身份授权 | 登录 Dashboard | 用户一次授权，AI 获得 UAT Agent Key |
| Secret Key | 在 Dashboard 创建或复制 | AI 自动创建/读取并写入 `.env` |
| Publishable Key | 在 Dashboard 查找 | AI 自动创建/读取并写入前端配置 |
| Webhook Endpoint | 手动填写 URL、事件、状态 | AI 自动创建、更新、启用 |
| Webhook Signing Secret | 手动复制 | AI 自动获取并写入 `.env` |
| 本地公网回调地址 | 用户自己配置 tunnel | CLI 自动启动 listen/tunnel |
| 测试支付/订阅 | 用户手动支付或补上下文 | AI 自动创建测试 session/subscription |
| Webhook 验收 | 用户看 Dashboard 日志 | AI 查询 event、delivery、失败原因 |

核心判断：只优化提示词不够，必须把 Dashboard-only 能力变成 Agent 可调用能力。

## 4. 当前 CLI 已经做到什么

当前 `clink-integ-cli` 已经验证了“登录之后，其余很多 Dashboard 操作可以交给 AI”。

| 能力 | 当前状态 | 仍然缺什么 |
| --- | --- | --- |
| Dashboard 登录 | `clink login` 打开浏览器，用户手动登录，CLI 捕获 Sa-Token | 还没有 Agent Key 授权 |
| 获取当前商户身份 | CLI 可读取当前 user / tenant / merchant | 需要官方稳定身份 API |
| API Key | CLI 可封装 Dashboard API 获取/确保 Secret Key 并保存 | 需要官方 API Key Ensure API |
| Webhook 配置 | CLI 可创建、更新、启用、保存 signing secret | 需要官方 Webhook Endpoint API |
| Checkout | CLI 可创建 checkout session 并打开支付页 | 需要统一 smoke test 流程 |
| Webhook 签名 | CLI 可模拟、签名、校验 webhook | 需要真实 delivery 查询与重放 |
| 本地接收 | 已验证公网 tunnel + 本地 receiver 可行 | 需要产品化 `clink listen` |

当前结论：

```text
用户手动登录一次后，CLI 已经能把 Secret Key 获取、Webhook 配置、Checkout 创建、Webhook 签名验证这些步骤交给 AI。
```

## 5. 本轮 UAT 验证结果

已验证成功：

- CLI 可以保存当前商户 Secret Key
- CLI 可以创建/更新/启用 webhook endpoint
- CLI 可以创建 checkout session
- UAT 支付可以成功生成订单事件
- 本地 receiver 可以通过公网 HTTPS tunnel 收到 CLI 模拟 webhook

当前卡点：

```text
真实订单事件已生成，但 webhook delivery 为空。
```

也就是说，AI 目前能看到事件存在，但无法通过 API 判断为什么没有投递到 webhook endpoint。

这个问题需要平台提供机器可读的 event / delivery / replay / logs 能力解决。

## 6. 下一步要做的产品能力

### P0：让 AI 不再依赖 Dashboard 手工配置

必须开放 5 类能力：

| 能力 | 作用 | 最小要求 |
| --- | --- | --- |
| Agent Session API | 给 AI 一个 UAT 授权身份 | 创建、查询、撤销、过期时间、merchant 绑定 |
| API Key Ensure API | 自动准备 Secret Key / Publishable Key | 没有就创建，有就返回，支持写入 `.env` |
| Webhook Endpoint API | 自动配置 webhook | create/update/enable/disable，返回 signing secret |
| Events & Delivery API | 自动判断 webhook 是否成功 | 查询事件、投递记录、失败原因、重试/重放 |
| Trigger API | 自动触发测试事件 | checkout succeeded、subscription created、invoice paid |

对应 CLI 聚合命令：

```bash
clink setup uat --project . --run-smoke-test --json
```

### P1：让 AI 自己诊断失败

需要补充：

- request id
- structured error code
- webhook delivery 未生成原因
- replay 结果
- agent run report

目标是失败时 AI 能说清楚：

```text
失败发生在哪一步、原因是什么、下一步该调用哪个命令或 API。
```

### P2：生产上线辅助

生产环境不建议完全自动上线，但可以提供检查和引导：

- `clink production doctor`
- 生产 readiness checklist
- Dashboard deep link
- 生产权限申请状态

## 7. 升级后的 Agent 提示词

```text
帮我把 ClinkBill 支付接入到当前项目。

你可以使用 clink-integ-cli 和 Clink UAT Agent API。

请完成：
1. 识别当前项目语言、框架和环境变量方式
2. 获取 UAT Agent 授权
3. 确保当前 merchant 有 Secret Key 和 Publishable Key
4. 把 key 写入项目现有 .env / env 配置
5. 接入 checkout session
6. 接入 subscription
7. 接入 webhook raw body 验签
8. 自动创建或更新 webhook endpoint
9. 启动本地 listen tunnel
10. 触发测试 checkout / subscription / webhook 事件
11. 查询 event 和 webhook delivery
12. 输出接入报告、curl 示例和一键启动命令

约束：
- 不硬编码 secret
- 使用项目现有服务端框架
- 所有 CLI/API 调用使用 --json
- 失败时输出机器可读原因
```

## 8. 最小验收标准

当 P0 完成后，以下流程应无需用户进入 Dashboard：

```bash
clink setup uat --project . --run-smoke-test --json
```

验收通过条件：

- AI 能获得 UAT 身份
- AI 能获得或创建 Secret Key / Publishable Key
- AI 能把 key 写入项目配置
- AI 能创建 checkout session
- AI 能创建 subscription
- AI 能创建并启用 webhook endpoint
- AI 能获得 webhook signing secret
- AI 能启动公网 listen/tunnel
- AI 能触发测试事件
- AI 能收到真实 webhook
- AI 能完成签名校验
- AI 能查询 event 和 delivery
- 如果失败，AI 能拿到明确失败原因

## 9. 近期实施顺序

1. 修复或查明真实事件 `delivery` 为空的问题。
2. 设计并实现 Agent Session API。
3. 设计并实现 API Key Ensure API。
4. 设计并实现 Webhook Endpoint API。
5. 增加 Events / Delivery / Replay / Logs API。
6. 增加 Trigger API。
7. 在 CLI 中实现 `clink setup uat --run-smoke-test --json`。

这 7 步完成后，原始提示词才能真正升级成“AI 全流程自动接入 ClinkBill”。
