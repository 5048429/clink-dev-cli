# Clink Integ CLI 最小 MVP API 契约：AI 生成 UAT Secret Key 并接入支付

## 1. 目标闭环

本契约面向后端最小可实现版本，用于支持 AI Agent 在 UAT / sandbox 环境完成：

```text
查询当前认证身份 -> 创建 UAT secret key -> 拿到 secret key -> 使用 secret key 调用 checkout/session
```

MVP 要回答两个审计问题：

- 谁创建了 key：由 Console access token 解析出 `tenantId`、`merchantId`、`userId`。
- 谁在使用 key：由支付请求的 `X-API-KEY` 反查 `keyId`，再关联 `merchantId`、`createdByUserId`、`agent`、`runId`。

本 MVP 不替代完整 Dashboard，不支持生产环境 key 自动创建，也不设计复杂 scope / 权限矩阵。

## 2. 认证边界

### 2.1 管理类 API 认证

以下接口使用 Console access token：

```http
GET /identity/me
POST /uat/secret-keys
GET /uat/secret-keys
POST /uat/secret-keys/{keyId}/revoke
Authorization: Bearer <clink_console_access_token>
```

Console access token 代表当前登录的商户用户身份。后端至少需要从 token 或会话上下文中解析：

- `tenantId`
- `merchantId`
- `userId`
- `email`
- `roles`
- `permissions`
- `environment`

AI 创建 UAT secret key 时，不需要再传 `merchantId`；后端必须使用 token 绑定的 merchant，避免 AI 越权为其他 merchant 创建 key。

### 2.2 支付 API 认证

`POST /checkout/session` 等支付调用使用 secret key：

```http
POST /checkout/session
X-API-KEY: ck_uat_xxx
Content-Type: application/json
```

支付网关或后端服务必须通过 `X-API-KEY` 反查 key 记录，并把请求关联到：

- `keyId`
- `tenantId`
- `merchantId`
- `createdByUserId`
- `agent`
- `runId`

### 2.3 Dashboard cookie 的限制

Dashboard cookie 或浏览器登录态可以作为早期调研、手动验证或换取 Console access token 的输入，但不能作为 `clink-integ-cli` 的正式长期认证方案。

原因：

- CLI 不应依赖浏览器 cookie jar、页面 store 或 Dashboard 前端实现细节。
- Dashboard 内部接口没有稳定公开契约。
- cookie 生命周期、MFA、CSRF、同站策略和浏览器环境耦合，不适合作为 AI/CLI 自动化凭证。
- 正式 CLI 认证应收敛到 `Authorization: Bearer <clink_console_access_token>`，当前 MVP 先由 `clink login` 获取并保存 UAT Dashboard Console token，后续可演进为稳定的 `clink login --uat`。

### 2.4 当前 CLI 登录实现

在后端正式开放 `GET /identity/me` 和 `POST /uat/secret-keys` 前，CLI 先实现一个人工浏览器授权流程，用于拿到 Dashboard Console 身份：

```bash
clink login
clink dashboard whoami
clink dashboard apikey list
clink dashboard apikey ensure-secret --save
```

`clink login` 的边界：

- 使用 Playwright 打开 `https://uat-dashboard.clinkbill.com/auth/login`。
- 不自动输入账号密码，不绕过 MFA，不处理验证码。
- 用户手动登录完成后，优先监听 `/platform/user/getInfo` 网络请求，从请求头提取 `Authorization: Bearer <token>` 和 `ClientID`。
- 如果错过网络请求，可从浏览器 storage 尝试读取 Sa-Token access token；ClientID 优先来自请求头或 storage，兜底使用当前 UAT Dashboard 前端的 ClientID。
- 提取后调用 `GET https://uat-dashboard.clinkbill.com/prod-api/platform/user/getInfo` 验证身份。
- 请求头固定包含 `Authorization`、`ClientID`、`Accept-Language: zh_CN`、`Content-Language: zh_CN`。
- 验证成功后保存 Dashboard `baseUrl`、`clientId`、token 和用户身份摘要到本地 profile。
- CLI 输出必须 mask token；`clink dashboard whoami --dry-run --json` 中也只输出 `Authorization: Bearer [masked]`。
- `clink dashboard apikey ensure-secret --save` 会先读取 Dashboard API key 列表。如果已经存在 `SK`，直接保存该 Secret Key；如果不存在，则调用 Dashboard 标准 key 初始化接口创建 Publishable Key 和 Secret Key。
- Secret Key 默认脱敏输出；只有显式传入 `--show-secret` 才会打印明文。

这个实现仍然是 Dashboard Console 身份复用，不等价于正式公开 API。它的用途是让 CLI 在 MVP 阶段能调用 Dashboard API 验证身份，并为后续 `GET /identity/me` / UAT key API 做集成准备。

## 3. Dashboard 现有接口与建议正式接口差异

基于 `docs/dashboard-api-discovery.zh-CN.md`，Dashboard 当前已有 API key / secret key 相关内部接口，但不建议 CLI 直接依赖。正式 MVP API 应另起 UAT 专用契约。

| 能力 | 现有接口 | 建议正式接口 | 关键差异 |
| --- | --- | --- | --- |
| 查询当前身份 | `GET /prod-api/platform/user/getInfo` | `GET /identity/me` | 现有接口是 Dashboard 用户会话模型；正式接口返回 CLI/AI 需要的 `tenantId`、`merchantId`、`userId`、`environment`。 |
| 查询 key 列表 | `GET /prod-api/platform/apikey/list` | `GET /uat/secret-keys` | 现有接口返回 `keyValue`，可能包含 secret key 明文；正式接口只返回 `maskedSecretKey` 和审计元数据。 |
| 创建 secret key | `POST /prod-api/platform/apikey/standard` | `POST /uat/secret-keys` | 现有接口无请求体，语义是初始化当前 merchant 的标准 PK/SK；正式接口按 `name`、`agent`、`runId` 创建临时 UAT secret key。 |
| 查看单个 key | `GET /prod-api/platform/apikey/{apikeyId}` | 不纳入 MVP | 现有详情仍可能返回明文 key；MVP 不提供明文重读能力，secret key 只在创建响应返回一次。 |
| 轮换 key | `PUT /prod-api/platform/apikey/roll/{apikeyId}` | 不纳入 MVP | 现有轮换会影响已有集成并返回新明文 key；MVP 暂不做轮换，只支持创建和 revoke。 |
| 删除/撤销 key | `DELETE /prod-api/platform/apikey/{apikeyId}` | `POST /uat/secret-keys/{keyId}/revoke` | 现有接口是 Dashboard 删除动作；正式接口使用明确的 revoke 语义，返回状态并保留审计记录。 |
| IP 白名单 | `PUT /prod-api/platform/apikey` | 不纳入 MVP | 现有字段是 Dashboard 表单形态；MVP 不做 IP 白名单管理。 |

正式接口的核心约束：

- 只允许 UAT / sandbox。
- 管理类接口只接受 Console access token。
- 支付类接口只接受 `X-API-KEY`。
- `secretKey` 只在创建成功时返回一次。
- 列表、日志、错误响应都不能返回完整 secret key。
- 所有 key 创建和使用都必须可按 `merchantId`、`userId`、`keyId`、`agent`、`runId` 检索。

## 4. 最小 API 契约

### 4.1 查询当前认证身份

```http
GET /identity/me
Authorization: Bearer <clink_console_access_token>
```

用途：让 AI 确认当前代表哪个 merchant / user 操作。

响应：

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "tenantId": "tnt_xxx",
    "merchantId": "mcht_xxx",
    "userId": "usr_xxx",
    "email": "dev@example.com",
    "roles": ["owner"],
    "permissions": ["uat:secret-key:create"],
    "environment": "uat"
  },
  "requestId": "req_xxx"
}
```

后端要求：

- 必须校验 token 有效性。
- 必须返回 token 实际绑定的 `tenantId` / `merchantId`，不能使用客户端传入值覆盖。
- 如果 token 不属于 UAT / sandbox 上下文，应返回 403 或 422。

CLI 映射：

```bash
# 当前 Dashboard Console MVP
clink dashboard whoami --json

# 后端正式 API 就绪后
clink identity me --json
```

### 4.2 创建 UAT Secret Key

```http
POST /uat/secret-keys
Authorization: Bearer <clink_console_access_token>
Content-Type: application/json
```

用途：创建一个可调用 ClinkBill UAT 支付 API 的临时 secret key。

请求：

```json
{
  "name": "codex-local-test",
  "agent": "codex",
  "runId": "run_20260617_001",
  "projectPath": "D:/Clink_intern/AutoCliSurvey/clink-integ-cli",
  "expiresInSeconds": 604800
}
```

字段约束：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 人类可读名称，用于列表和日志检索。 |
| `agent` | 是 | 创建方，例如 `codex`、`cursor`、`claude-code`。 |
| `runId` | 是 | 单次 AI run 标识；建议同一 `merchantId + agent + runId` 幂等或防重复。 |
| `projectPath` | 否 | 本地项目路径，只用于审计和排查；后端不应基于它做权限判断。 |
| `expiresInSeconds` | 否 | 默认 604800 秒，即 7 天；后端可设置最大值。 |

响应：

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "keyId": "key_xxx",
    "secretKey": "ck_uat_xxx",
    "maskedSecretKey": "ck_uat_****abcd",
    "environment": "uat",
    "tenantId": "tnt_xxx",
    "merchantId": "mcht_xxx",
    "createdByUserId": "usr_xxx",
    "createdByEmail": "dev@example.com",
    "agent": "codex",
    "runId": "run_20260617_001",
    "status": "active",
    "createdAt": "2026-06-17T00:00:00Z",
    "expiresAt": "2026-06-24T00:00:00Z"
  },
  "requestId": "req_xxx"
}
```

后端要求：

- 必须使用 Console access token 创建 key。
- 必须只创建 UAT / sandbox key，禁止创建 production key。
- 必须保存 secret key 哈希或等价安全凭证，不应明文持久化可还原 secret key。
- `secretKey` 只在创建响应返回一次，后续查询不再返回。
- 必须记录 `createdByUserId`，用于回答“谁创建了 key”。
- 必须记录 `agent`、`runId`，用于关联 AI run。
- 推荐限制同一 `merchantId + agent + runId` 只能有一个 active key，重复创建返回 409 或返回已有 key 的非明文字段。

CLI 映射：

```bash
clink keys create-uat --name codex-local-test --agent codex --expires-in 7d --json
```

### 4.3 查询 UAT Secret Key 列表

```http
GET /uat/secret-keys
Authorization: Bearer <clink_console_access_token>
```

用途：查看当前 token 绑定 merchant 下由 AI/CLI 创建过的 UAT secret key。

可选查询参数：

| 参数 | 说明 |
| --- | --- |
| `status` | `active`、`revoked`、`expired`。 |
| `agent` | 按创建方过滤。 |
| `runId` | 按 AI run 过滤。 |

响应：

```json
{
  "code": 200,
  "msg": "Success",
  "data": [
    {
      "keyId": "key_xxx",
      "name": "codex-local-test",
      "maskedSecretKey": "ck_uat_****abcd",
      "environment": "uat",
      "tenantId": "tnt_xxx",
      "merchantId": "mcht_xxx",
      "createdByUserId": "usr_xxx",
      "createdByEmail": "dev@example.com",
      "agent": "codex",
      "runId": "run_20260617_001",
      "createdAt": "2026-06-17T00:00:00Z",
      "expiresAt": "2026-06-24T00:00:00Z",
      "lastUsedAt": "2026-06-17T00:10:00Z",
      "status": "active"
    }
  ],
  "requestId": "req_xxx"
}
```

后端要求：

- 列表必须按当前 token 绑定的 `merchantId` 隔离。
- 不返回完整 `secretKey` 或 Dashboard 风格的 `keyValue`。
- `lastUsedAt` 来自支付 API 使用记录，用于回答“key 有没有被使用”。

CLI 映射：

```bash
clink keys list-uat --json
```

### 4.4 撤销 UAT Secret Key

```http
POST /uat/secret-keys/{keyId}/revoke
Authorization: Bearer <clink_console_access_token>
Content-Type: application/json
```

用途：结束一次 AI 接入测试，使 key 不能继续调用支付 API。

请求体可为空。可选传入原因：

```json
{
  "reason": "test finished"
}
```

响应：

```json
{
  "code": 200,
  "msg": "Success",
  "data": {
    "keyId": "key_xxx",
    "status": "revoked",
    "revokedByUserId": "usr_xxx",
    "revokedAt": "2026-06-17T01:00:00Z"
  },
  "requestId": "req_xxx"
}
```

后端要求：

- 必须校验 `keyId` 属于当前 token 绑定的 `merchantId`。
- revoke 后支付 API 必须拒绝该 key。
- revoke 应保留 key 记录和审计日志，不应物理删除审计信息。
- 重复 revoke 可以幂等返回 `status: "revoked"`。

CLI 映射：

```bash
clink keys revoke-uat key_xxx --json
```

## 5. 使用 Secret Key 调用 Checkout Session

拿到 `secretKey` 后，AI 使用现有支付 API 创建 checkout session。

```http
POST /checkout/session
X-API-KEY: ck_uat_xxx
Content-Type: application/json
```

最小请求：

```json
{
  "customerEmail": "test@example.com",
  "originalAmount": 1,
  "originalCurrency": "USD",
  "successUrl": "http://localhost:3000/success",
  "cancelUrl": "http://localhost:3000/cancel",
  "uiMode": "hostedPage",
  "priceDataList": [
    {
      "name": "AI UAT Test Product",
      "quantity": 1,
      "unitAmount": 1,
      "currency": "USD"
    }
  ]
}
```

支付后端要求：

- 必须从 `X-API-KEY` 反查 `keyId`，并校验 key 状态为 `active`、环境为 UAT、未过期。
- 必须把 checkout 请求归因到 key 记录中的 `tenantId` / `merchantId`，不能由请求体覆盖。
- 必须记录本次使用的 `keyId`、`createdByUserId`、`agent`、`runId`、`requestId`、`path`。
- key 被 revoke 或过期后，必须拒绝继续创建 checkout session。

CLI 映射：

```bash
clink checkout create \
  --customer-email test@example.com \
  --amount 1 \
  --currency USD \
  --name "AI UAT Test Product" \
  --success-url http://localhost:3000/success \
  --cancel-url http://localhost:3000/cancel \
  --json
```

## 6. 最小 CLI 流程

```bash
clink login
clink dashboard whoami --json

# 后端正式身份 API 就绪后，可替换为：
clink identity me --json

clink keys create-uat \
  --name codex-local-test \
  --agent codex \
  --expires-in 7d \
  --json

clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox

clink checkout create \
  --customer-email test@example.com \
  --amount 1 \
  --currency USD \
  --name "AI UAT Test Product" \
  --success-url http://localhost:3000/success \
  --cancel-url http://localhost:3000/cancel \
  --json
```

后续可以包装为：

```bash
clink setup uat-minimal --agent codex --create-key --create-checkout --json
```

## 7. 最小数据模型

后端可以按现有表结构调整命名，但必须能表达以下字段。

### 7.1 Secret key 记录

| 字段 | 说明 |
| --- | --- |
| `keyId` | 后端生成的稳定 ID。 |
| `secretKeyHash` | secret key 哈希或等价安全存储值。 |
| `maskedSecretKey` | 列表和日志中使用的脱敏值。 |
| `environment` | 固定为 `uat` / `sandbox`。 |
| `tenantId` | 创建者 token 绑定的 tenant。 |
| `merchantId` | 创建者 token 绑定的 merchant。 |
| `createdByUserId` | 创建 key 的用户。 |
| `createdByEmail` | 创建 key 的用户邮箱，便于排查。 |
| `name` | key 名称。 |
| `agent` | AI/CLI 创建方。 |
| `runId` | AI run 标识。 |
| `projectPath` | 可选审计字段。 |
| `status` | `active`、`revoked`、`expired`。 |
| `createdAt` | 创建时间。 |
| `expiresAt` | 过期时间。 |
| `lastUsedAt` | 最近一次支付调用时间。 |
| `revokedAt` | 撤销时间。 |
| `revokedByUserId` | 撤销用户。 |

### 7.2 Key 使用日志

每次使用 `X-API-KEY` 调用支付 API，至少记录：

- `requestId`
- `keyId`
- `tenantId`
- `merchantId`
- `createdByUserId`
- `agent`
- `runId`
- `method`
- `path`
- `statusCode`
- `createdAt`
- `ip`
- `userAgent`

MVP 不要求完整审计后台，只要求这些字段能被日志检索。

## 8. 错误结构

统一返回：

```json
{
  "code": 401,
  "msg": "Invalid console access token",
  "data": null,
  "requestId": "req_xxx"
}
```

常见错误：

| code | msg | 含义 |
| --- | --- | --- |
| 401 | Invalid console access token | 管理类 API 使用的 Console access token 无效。 |
| 401 | Invalid API key | 支付 API 使用的 `X-API-KEY` 无效。 |
| 403 | UAT key creation is not allowed for this user | 当前用户无权创建 UAT key。 |
| 403 | API key has been revoked | key 已撤销，不能继续用于支付调用。 |
| 409 | Active key already exists for this run | 同一个 run 重复创建 active key。 |
| 422 | Production key creation is not supported by this API | 禁止通过该 API 创建生产 key。 |
| 422 | Secret key is expired | key 已过期。 |
| 500 | Internal server error | 服务端异常。 |

## 9. MVP 验收标准

验收通过的定义：

- AI 可以用 Console access token 调用 `GET /identity/me` 确认当前认证身份。
- AI 可以用 Console access token 调用 `POST /uat/secret-keys` 创建 UAT secret key。
- 创建响应只在本次返回完整 `secretKey`。
- AI 可以用 `X-API-KEY: <secretKey>` 调用现有 `POST /checkout/session`。
- 后端能从 key 创建记录查到 `createdByUserId`，回答“谁创建了 key”。
- 后端能从支付请求日志查到 `keyId`、`merchantId`、`createdByUserId`、`agent`、`runId`，回答“谁在使用 key”。
- AI 可以调用 `POST /uat/secret-keys/{keyId}/revoke` 撤销这个 UAT secret key。
- 撤销或过期后的 key 不能继续调用 `POST /checkout/session`。

完成后，Clink Integ CLI 的最短路径是：

```text
AI 查询身份 -> AI 创建 UAT key -> AI 调 checkout/session -> AI 拿到 checkout URL -> 用户测试支付页
```
