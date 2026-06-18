# Clink UAT Dashboard API Key 接口调研

调研日期：2026-06-17

## 结论

Clink UAT Dashboard 当前已经存在后端接口用于 API key / secret key 的列表、详情、初始化、轮换、删除和 IP 白名单管理。但这些接口看起来是 Dashboard 内部接口，不是正式开放 API。

当前页面使用的 API 基址是同域代理：

```text
https://uat-dashboard.clinkbill.com/prod-api
```

Dashboard 前端再从 `/prod-api` 转发到后端服务。接口认证主要依赖 Dashboard 登录后的 `Authorization: Bearer <access_token>`，并附带 `ClientID` 和语言头。未在前端请求封装中看到 CSRF 头或公开 API key 认证。

这意味着它们可以支持产品调研和 MVP 验证，但不建议让 `clink-dev-cli` 直接依赖这些 Dashboard 内部接口。更适合作为后端正式 UAT key API 设计的参考。

## 调研方式和边界

- 使用当前授权登录态进入 `https://uat-dashboard.clinkbill.com/developers`。
- 已确认 Developers -> API Keys 页面会加载当前商户的 Standard Key 列表。
- 除登录验证、当前用户权限、tenant / merchant 上下文识别外，本次重点接口均来自 `/developers` 页面内的 API Keys 功能。
- 前端静态包版本：`_app.config.js?v=1.3.2-0cd2effb`，入口包 `static/js/index-Da177rJn.js`。
- 未绕过登录、MFA 或权限校验。
- 未把 cookie、access token、secret key 写入仓库或本文档。
- 为避免改变账号状态，未执行真实初始化、轮换或删除动作；这些动作的 method/path 来自同版本 Dashboard 前端请求封装。

## Dashboard 请求认证方式

前端请求封装会为请求添加：

```http
Authorization: Bearer <dashboard_access_token>
ClientID: e5cd7e4891bf95d1d19206ce24a7b32e
Accept-Language: <locale>
Content-Language: <locale>
x-clink-env: staging   # 仅在前端环境判断为 staging 时添加
```

请求封装中还显示：

- `POST` / `PUT` 在配置 `encrypt: true` 时会启用前端加密并加 `encrypt-key`。
- API key 相关接口没有看到 `encrypt: true`。
- 没有看到 `X-CSRF-*` 之类的 CSRF header。
- Axios 没有显式设置 `withCredentials`；同域浏览器请求仍可能自动带同站 cookie，但代码层面的主认证是 Bearer token。

## 当前用户身份接口

### `GET /prod-api/platform/user/getInfo`

用途：Dashboard 登录后获取当前用户、角色和权限。

请求体：无。

查询参数：无。

响应体字段（前端消费后）：

```json
{
  "user": {
    "userId": "<redacted>",
    "userName": "<redacted>",
    "nickName": "<redacted>",
    "email": "<redacted>",
    "avatar": "<redacted>",
    "roles": []
  },
  "roles": [
    {
      "roleType": "0|1"
    }
  ],
  "permissions": ["portal:apikey:add", "portal:apikey:roll"]
}
```

前端把它映射为：

- `userId`
- `username`
- `realName`
- `email`
- `roles`
- `roleTypes`
- `permissions`

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议。它是 Dashboard 用户会话接口，不是 merchant API。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token；未见 CSRF；依赖前端登录态。 |
| 是否只适合调研 | 是。CLI 不应直接依赖。 |

## 当前 tenant / merchant 信息接口

### `GET /prod-api/auth/tenant/list`

用途：获取当前登录用户可访问的 tenant 列表。

请求体：无。

响应体字段（前端消费后）：

```json
{
  "voList": [
    {
      "tenantId": "<redacted>",
      "name": "<redacted>",
      "status": "<redacted>"
    }
  ]
}
```

Dashboard 前端将 `voList` 放入 `app-tenant.tenantList`，并维护 `currentTenantId` / `currentTenant` 页面状态。

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议。它是 Dashboard 登录用户的 tenant picker 数据。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token；当前 tenant 还依赖前端 store。 |
| 是否只适合调研 | 是。 |

### `GET /prod-api/platform/merchant/self-onboarding`

用途：Dashboard 路由守卫用来判断当前商户开户注册/补充信息状态。

请求体：无。

响应体字段（前端使用到）：

```json
{
  "onboardingStatus": "NEED_MFA|NEED_MERCHANT_NAME|..."
}
```

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议。它是 Dashboard onboarding 状态接口。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token。 |
| 是否只适合调研 | 是。 |

### `GET /prod-api/platform/merchant/list`

用途：平台/设置页面列出 merchant。

请求体：无。

查询参数：页面会按表格查询传入过滤和分页参数，例如 `pageNum`、`pageSize`，以及 merchant 相关过滤条件。

响应体字段（前端消费）：

```json
{
  "rows": [
    {
      "merchantId": "mcht_<redacted>",
      "merchantName": "<redacted>",
      "logoUrl": "<redacted>",
      "contactInfo": {
        "nickName": "<redacted>",
        "email": "<redacted>",
        "phonenumber": "<redacted>"
      },
      "timezone": "<redacted>",
      "status": "<redacted>",
      "createTime": "<redacted>",
      "updateTime": "<redacted>",
      "updateBy": "<redacted>",
      "remark": "<redacted>"
    }
  ],
  "total": 1
}
```

相关详情接口：

```http
GET /prod-api/platform/merchant/{merchantId}
```

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议直接开放原接口；字段更像 Dashboard 管理后台模型。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token；权限可能区分 system/admin/merchant。 |
| 是否只适合调研 | 是。 |

## API key / secret key 列表接口

### `GET /prod-api/platform/apikey/list`

用途：Developers -> API Keys 页面加载当前 merchant 的 Standard Key 列表。

请求体：无。

查询参数：前端调用时未传参数。

已登录页面确认：

- 页面路径：`/developers`
- 表格列：`Name`、`Token`、`Last Used`、`Creation Time`、`Action`
- 当前账号有两条记录：`Publishable Key` 和 `Secret Key`
- key 值在页面中直接显示；本文档已脱敏。

响应体字段（前端消费）：

```json
{
  "rows": [
    {
      "apikeyId": "<redacted>",
      "apikeyName": "Publishable Key|Secret Key",
      "keyValue": "pk_uat_<redacted>|sk_uat_<redacted>",
      "keyType": "PK|SK",
      "permissions": "<redacted>",
      "effectiveTime": "<redacted>",
      "expiryTime": "<redacted|null>",
      "recentUsageTime": "<redacted|null>",
      "updateTime": "<redacted|null>",
      "createTime": "<redacted>",
      "status": "<redacted>",
      "viewFlag": "<redacted>",
      "ipWhitelist": "<json|null>"
    }
  ]
}
```

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议原样开放。列表会返回 `keyValue`，包含 secret key 明文。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token 和当前 merchant 权限；未见 CSRF。 |
| 是否只适合调研 | 是。CLI 不能直接依赖，也不应读取明文 secret key 列表。 |

## 查看 API key / secret key 详情接口

### `GET /prod-api/platform/apikey/{apikeyId}`

用途：轮换弹窗、IP 白名单弹窗读取单个 key 详情。

请求体：无。

响应体字段（前端使用到）：

```json
{
  "apikeyId": "<redacted>",
  "apikeyName": "Secret Key",
  "keyValue": "sk_uat_<redacted>",
  "keyType": "SK",
  "permissions": "<redacted>",
  "effectiveTime": "<redacted>",
  "expiryTime": "<redacted|null>",
  "recentUsageTime": "<redacted|null>",
  "updateTime": "<redacted|null>",
  "createTime": "<redacted>",
  "status": "<redacted>",
  "viewFlag": "<redacted>",
  "ipWhitelist": "[{\"ip\":\"1.2.3.4/32\"}]|null"
}
```

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议。详情仍可能返回明文 key。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token 和权限。 |
| 是否只适合调研 | 是。 |

## 创建 UAT secret key 接口

### `POST /prod-api/platform/apikey/standard`

用途：API Keys 页面在当前 merchant 没有标准 key 时初始化 Standard Key。

请求体：无。

查询参数：无。

前端行为：

- 只有当列表为空且有 `portal:apikey:add` 权限时显示 `Init Standard Key` 按钮。
- 成功后前端重新加载列表。
- 前端从返回数组中找到 `keyType === "SK"` 的记录，并弹窗提示用户复制 secret key。

响应体字段（前端消费后）：

```json
[
  {
    "apikeyId": "<redacted>",
    "apikeyName": "Publishable Key",
    "keyValue": "pk_uat_<redacted>",
    "keyType": "PK",
    "createTime": "<redacted>"
  },
  {
    "apikeyId": "<redacted>",
    "apikeyName": "Secret Key",
    "keyValue": "sk_uat_<redacted>",
    "keyType": "SK",
    "createTime": "<redacted>"
  }
]
```

注意：

- 这不是一个“按 name 创建临时 UAT secret key”的 API。
- 它更像“为当前 merchant 初始化一组标准 PK/SK”。
- 当前已登录页面已有标准 key，所以未执行该 POST。

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议原样开放。它无请求体、无 agent/runId、会返回明文 secret key，且语义是初始化标准 key。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token、当前 merchant、`portal:apikey:add` 权限和“列表为空”的页面/业务状态。 |
| 是否只适合调研 | 是。可作为 MVP 后端接口设计参考。 |

## 轮换 secret key 接口

### `PUT /prod-api/platform/apikey/roll/{apikeyId}?validityPeriod={value}`

用途：Dashboard 的 Roll Key 动作。

请求体：无。

路径参数：

- `apikeyId`

查询参数：

| 字段 | 含义 |
| --- | --- |
| `validityPeriod` | 旧 key 过渡/失效时间选择。前端枚举值：`1` now、`2` in 1 hour、`3` in 24 hours、`4` in 3 days、`5` in 7 days。 |

响应体字段（前端使用到）：

```json
{
  "apikeyId": "<redacted>",
  "keyValue": "sk_uat_<redacted>",
  "keyType": "SK",
  "updateTime": "<redacted>",
  "expiryTime": "<redacted|null>"
}
```

前端行为：

- 轮换前会先 `GET /platform/apikey/{apikeyId}`。
- 轮换成功后如果返回 `keyType === "SK"`，前端会弹出明文新 secret key。

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议原样开放。轮换会返回明文 secret key 且会影响现有集成。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token、当前 merchant 和 `portal:apikey:roll` 权限。 |
| 是否只适合调研 | 是。 |

## 撤销或删除 key 接口

### `DELETE /prod-api/platform/apikey/{apikeyId}`

用途：API Keys 页面删除有 `expiryTime` 的 PK/SK。

请求体：无。

路径参数：

- `apikeyId`

前端行为：

- 删除前显示确认弹窗。
- 前端权限码：`portal:apikey:remove`。
- 页面代码只在 `record.expiryTime` 存在时显示删除项。
- 当前已登录页面的两条标准 key 没有显示过期时间，因此不应直接删除。

响应体字段：前端不读取业务字段，只等待成功后重新加载列表。

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议原样开放。删除 key 是高风险凭证操作。正式 API 应有独立审计、幂等/状态语义和明确 revoke 结果。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token、当前 merchant、权限和页面确认流程。 |
| 是否只适合调研 | 是。 |

## IP 白名单管理接口

### `PUT /prod-api/platform/apikey`

用途：Manage IP 弹窗保存 key 的 IP 白名单。

请求体字段：

```json
{
  "apikeyId": "<redacted>",
  "ipWhitelist": "[{\"ip\":\"203.0.113.10/32\"}]"
}
```

前端行为：

- 保存前先 `GET /platform/apikey/{apikeyId}`。
- `ipWhitelist` 是 JSON 字符串，不是 JSON 数组。
- 支持 IPv4 或 IPv4/CIDR，CIDR 范围 `0..32`。

判断：

| 项 | 结论 |
| --- | --- |
| 可作为正式开放 API | 不建议原样开放。字段形态偏 Dashboard 表单实现。 |
| 依赖 Dashboard cookie / CSRF / 页面状态 | 依赖 Dashboard Bearer token 和 `portal:apikey:edit` 权限。 |
| 是否只适合调研 | 是。 |

## Webhook endpoint 接口

### 前端来源

2026-06-17 重新抓取 UAT Dashboard 静态资源：

- 入口：`https://uat-dashboard.clinkbill.com/static/js/index-Da177rJn.js`
- Webhook 页面 chunk：`static/js/webhooks-7TXewWwA.js`
- Webhook 表单 chunk：`static/js/webhooks-drawer-DRzbrVko.js`
- Webhook 详情 chunk：`static/js/webhooks-info-drawer-Cb7_lEI1.js`

前端权限码：

- `portal:webhook:add`
- `portal:webhook:list`
- `portal:webhook:query`
- `portal:webhook:edit`
- `portal:webhook:remove`

### `GET /prod-api/platform/webhook/list?merchantId={merchantId}`

用途：Developers -> Webhooks 页面加载当前 merchant 的 webhook endpoint 列表。

请求参数：

| 字段 | 位置 | 含义 |
| --- | --- | --- |
| `merchantId` | query | 当前 merchant ID。前端从 `app-merchant.currentMechantId` 取值。 |

响应字段（前端消费）：

```json
{
  "rows": [
    {
      "webhookKeyId": "whk_<redacted>",
      "merchantId": "mcht_<redacted>",
      "endpoint": "https://example.com/api/clink/webhook",
      "remark": "Created by clink-dev-cli",
      "eventType": "order.succeeded,invoice.paid",
      "signKey": "whsec_<redacted>",
      "status": "0",
      "createTime": "<redacted>",
      "updateTime": "<redacted>"
    }
  ]
}
```

注意：列表里可能返回 `signKey` 明文。CLI 输出必须默认脱敏，只有用户显式传 `--show-secret` 才打印原值。

### `POST /prod-api/platform/webhook`

用途：创建 webhook endpoint。

前端提交体：

```json
{
  "endpoint": "https://example.com/api/clink/webhook",
  "remark": "Created by clink-dev-cli",
  "eventType": "order.succeeded,invoice.paid",
  "status": 0
}
```

CLI 当前与前端保持一致：创建和更新 body 中不携带 `merchantId`。`merchantId` 只用于列表查询 `GET /platform/webhook/list?merchantId=...`。

2026-06-17 实测发现：当前 UAT Dashboard 后端会拒绝过长的 `eventType` 逗号字符串。`96` 字符可成功，`110` 字符和 `321` 字符会返回通用 `code: 500`。同一个 endpoint URL 不能创建多条 webhook，后端会返回 `80100263: Webhook 密钥已存在`。因此 CLI 暂不应把 `all` 展开为所有事件；应使用较短的 `core` 预设或用户显式选择的短事件列表。

### `PUT /prod-api/platform/webhook`

用途：编辑已有 webhook endpoint。

前端提交体：

```json
{
  "webhookKeyId": "whk_<redacted>",
  "endpoint": "https://example.com/api/clink/webhook",
  "remark": "Created by clink-dev-cli",
  "eventType": "order.succeeded,invoice.paid"
}
```

### `PUT /prod-api/platform/webhook/updateStatus`

用途：启用或禁用 webhook endpoint。

前端提交体：

```json
{
  "webhookKeyId": "whk_<redacted>",
  "status": "0|1"
}
```

UAT 实测结果：`0` 为禁用，`1` 为启用。CLI 创建或更新 webhook 后应默认再调用 `updateStatus` 设置为 `"1"`，除非用户显式要求保留禁用状态。

### `GET /prod-api/platform/webhook/{webhookKeyId}`

用途：编辑抽屉打开时读取单个 webhook endpoint 详情。

### `DELETE /prod-api/platform/webhook/{webhookKeyId}`

用途：删除 webhook endpoint。当前 CLI MVP 未开放删除命令，避免测试时误删。

### Dashboard 当前支持的事件

来自 `webhooks-7TXewWwA.js` 页面配置：

```text
session.complete
session.expired
order.created
order.next_action
order.succeeded
order.failed
refund.created
refund.succeeded
refund.failed
subscription.created
subscription.activated
subscription.trialing
subscription.past_due
subscription.cancelled
subscription.incomplete_expired
invoice.open
invoice.paid
invoice.void
```

### 当前 CLI 映射

```bash
clink dashboard merchant list --json
clink dashboard webhook events
clink dashboard webhook list --merchant-id mcht_xxx --json
clink dashboard webhook create --merchant-id mcht_xxx --url https://example.com/api/clink/webhook --events all --save-secret --json
clink dashboard webhook ensure --merchant-id mcht_xxx --url https://example.com/api/clink/webhook --events all --save-secret --json
```

判断：

| 项 | 结论 |
| --- | --- |
| 可作正式开放 API | 不建议原样开放。它仍然是 Dashboard 内部接口，且列表/详情可能返回 signing key 明文。 |
| 是否适合 UAT MVP 验证 | 是。可以用于验证“AI 通过 CLI 配置 webhook endpoint”的闭环。 |
| 后续正式 API 建议 | 另起 `POST /webhook-endpoints`、`GET /webhook-endpoints`、`PATCH /webhook-endpoints/{id}`、`DELETE /webhook-endpoints/{id}`、`POST /webhook-endpoints/{id}/rotate-secret`。 |

## 是否适合 MVP 直接使用

不建议让 CLI 或 AI Agent 直接调用这些 `/prod-api/platform/apikey*` Dashboard 内部接口，原因：

- 认证是 Dashboard access token，不是正式 merchant API 认证。
- 接口路径和字段属于 Dashboard 内部前端包，没有稳定公开契约。
- 列表和详情会暴露 `keyValue`，包括 secret key 明文。
- `POST /platform/apikey/standard` 语义是初始化标准 key，不是创建可命名、可审计、可临时撤销的 UAT agent key。
- 轮换和删除会影响现有集成，必须有人类确认和审计。
- 没有看到 `agent`、`runId`、`projectPath`、`expiresInSeconds` 等 MVP 所需审计字段。

## 对 MVP 后端 API 的建议

可以把 Dashboard 内部接口作为后端实现参考，但建议正式给 AI/CLI 的 MVP API 另起一组 UAT 专用接口：

```http
GET /identity/me
POST /uat/secret-keys
GET /uat/secret-keys
POST /uat/secret-keys/{keyId}/revoke
```

关键差异：

- 只允许 UAT/sandbox。
- 创建请求必须包含 `name`、`agent`、`runId`、`expiresInSeconds`。
- `secretKey` 只在创建响应返回一次。
- 列表接口只返回 `maskedSecretKey`，不返回明文 `keyValue`。
- revoke 返回明确状态，例如 `{ "keyId": "...", "status": "revoked" }`。
- 后端记录 `tenantId`、`merchantId`、`userId`、`keyId`、`agent`、`runId`、`requestId`。

## 本次调研中的敏感信息处理

- 未在本文档写入任何 cookie、access token 或完整 secret key。
- 页面上观察到的 key 统一写成 `pk_uat_<redacted>` / `sk_uat_<redacted>`。
- 邮箱、merchant id、tenant id 均已脱敏。
