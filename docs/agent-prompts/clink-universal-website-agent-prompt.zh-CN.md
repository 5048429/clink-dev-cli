# ClinkBill 通用建站 Agent 提示词

把下面这段复制给任意可以帮你构建、修改或部署网站的 AI agent。

```text
请帮我把 ClinkBill 支付接入到当前网站项目。

在动代码前，请先读取并严格遵守这份官方接入提示词：
https://raw.githubusercontent.com/5048429/agent-prompts/main/clink-ai-auto-integration.zh-CN.md

目标：
尽量全自动完成 ClinkBill UAT 支付接入。

认证方式请按环境选择：
- 优先使用已有或用户手动提供的 `CLINK_SECRET_KEY`，并通过 `clink auth secret set --api-key env:CLINK_SECRET_KEY --env sandbox` 保存到 CLI profile。
- 如果你在本地/桌面环境运行、没有现成 Secret Key，并且可以打开浏览器，才运行 `clink login`，让我在打开的 Dashboard 登录页里手动完成登录，用于让 CLI 读取或创建 Secret Key。
- 如果你在云 IDE、低代码编辑器、sandbox 或其他没有可用浏览器的环境运行，不要卡在 `clink login`。请让我自己登录 ClinkBill Dashboard 后把 Secret Key 提供给你，然后你把它只写入安全的服务端环境变量、平台 Secret 或本地 `.env`。
- 无浏览器环境下，只能先向我索取 `CLINK_SECRET_KEY`。不要初始索取 `CLINK_WEBHOOK_SIGNING_KEY`；当前 CLI 已支持用 Secret Key 管理 webhook endpoint，webhook signing key 应该由你运行 `clink webhook endpoint ensure --save-secret` 后自动生成/保存，再由你写入平台 Secret。
- Lovable Cloud、低代码平台或云 IDE 场景下，如果你能运行 CLI 并写入平台 Secret，不要让我本地运行 bootstrap 脚本来粘贴 `CLINK_WEBHOOK_SIGNING_KEY`；必须用 `clink webhook endpoint ensure --save-secret --show-secret --json` 获取 signing key 并自动写入 backend Secret。只有平台不允许 agent 写 Secret 时，才把这一步列为明确的权限阻塞。

除了上述认证步骤，不要让我手动复制 productId、priceId、webhook signing key，或手动配置 Dashboard webhook，除非当前 CLI/平台能力确实无法自动完成，并且你已明确说明原因。

重要要求：

1. 不要预设我的网站使用什么后端架构。请先自行侦察项目结构、启动方式、服务端入口、路由位置、环境变量方式、订单/购买入口和 webhook raw body 能力，再决定怎么接入。

2. 如果项目没有可信的服务端、serverless function、edge function 或其他安全后端能力，不要把 `CLINK_SECRET_KEY` 或 webhook signing key 放进前端代码，也不要让浏览器直接请求 Clink UAT API。请明确告诉我当前缺少安全后端能力，并给出最小可行后端方案。

3. 必须实现：
   - 创建 checkout session 的服务端接口
   - 创建 subscription 的服务端接口
   - 如果网站已有价格页、付费产品或订阅套餐，先由你扫描这些产品并生成 `clink-catalog.json`，再用 `clink catalog validate/plan/import` 创建 Clink product/price；不要让我手动复制 productId/priceId
   - webhook 接收接口，并使用 raw body 校验签名
   - 本地启动/验证方式
   - curl 示例
   - 自动测试或 smoke test

4. Clink Secret Key、Webhook Signing Key 等真实密钥只能写入本地环境变量或平台 Secret，不能写入源码、README、前端变量、测试 fixture 或最终回复。

5. 每次成功运行 `clink webhook endpoint ensure --save-secret` 后，必须同步最新 webhook signing key 到项目运行环境，并重启服务，否则 webhook 验签会失败。低代码/云平台如果要求部署前填写 `CLINK_WEBHOOK_SIGNING_KEY`，可以先用占位值部署 webhook endpoint；随后用真实 signing key 覆盖并重新部署。

6. webhook URL 选择策略：
   - 如果当前网站已有公网 HTTPS 域名，包括低代码编辑器/云 IDE/sandbox 自动生成的预览域名，或客户自己已有域名，请直接使用该域名配置 Dashboard webhook。
   - 只有纯本地 `localhost` / `127.0.0.1` 环境才需要 cloudflared tunnel。
   - 不要在已有公网域名的情况下额外创建 tunnel。

7. webhook 自动配置要求：
   - 不要把“Dashboard webhook endpoint（请你配置）”作为默认交付结果。
   - 你应先安装/更新最新 `clink` CLI，并验证 `clink auth secret set --help`、`clink api request --help`、`clink catalog import --help`、`clink webhook endpoint ensure --help` 可用。
   - 在低代码/云平台已有公网域名时，使用 `CLINK_SECRET_KEY` 自动创建/更新 webhook endpoint，并把 signing key 写入平台 Secret：`CLINK_WEBHOOK_SIGNING_KEY`，再重新部署/重启。
   - 不要把 webhook endpoint 管理说成 Dashboard-only；`clink dashboard webhook ensure` 只是兼容别名，优先使用 `clink webhook endpoint ensure`。
   - 不要让我手动创建 webhook，也不要让我把 webhook signing key 复制给你，除非自动配置已经尝试失败并且你已说明具体失败原因。

8. 请明确区分：
   - 本地 mock 测试
   - 签名模拟 webhook 测试
   - 真实 UAT checkout session 创建成功
   - 真实 UAT 支付完成后的真实 webhook

如果没有人打开 `checkoutUrl` 并完成 UAT 测试支付，不要把“真实 checkout session 创建成功 + 模拟 webhook 通过”说成“真实付款全链路完成”。

完成后请交付：

1. 架构侦察结果
2. 修改文件列表
3. 新增 API route / service 说明
4. 环境变量说明和 `.env.example`
5. 一键启动命令
6. curl 示例
7. CLI 验证结果摘要
8. Dashboard webhook endpoint
9. tunnel URL / 本地 URL（如果仍在运行）
10. 测试结果，并标明哪些是真实 UAT、哪些是模拟
11. 剩余需要我人工完成的步骤

如果你无法访问 GitHub raw 文件，请先停止并告诉我需要提供完整提示词内容，不要凭记忆或猜测接入。
```
