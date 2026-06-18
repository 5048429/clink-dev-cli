# Agent 使用 Clink Dev CLI 接入说明

目标：让接入 ClinkBill 的 agent 不需要手动 clone 本仓库，也不需要运行 `node dist/index.js`，而是自己安装 `clink` 命令并用它完成密钥、checkout、webhook 和本地验证。

## 前置要求

- Node.js 20 或更高版本
- 可以访问 GitHub
- 可以运行 `npm install`

## 推荐安装方式

全局安装：

```bash
npm install -g github:5048429/clink-dev-cli
clink --version
clink --help
```

如果当前环境不允许全局安装，安装到项目本地：

```bash
npm install --prefix ./.clink-tools github:5048429/clink-dev-cli
./.clink-tools/node_modules/.bin/clink --help
```

Windows PowerShell 本地路径：

```powershell
.\.clink-tools\node_modules\.bin\clink.cmd --help
```

下文统一写 `clink`。如果使用本地安装，把 `clink` 替换为对应的本地 binary 路径。

## Agent 接入流程

1. 安装 CLI 并确认可运行：

```bash
clink --version
clink auth status --json
```

2. 如果已有 Secret Key，把它写入环境变量并保存到 CLI profile：

```bash
export CLINK_SECRET_KEY=sk_uat_xxx
clink auth set --api-key env:CLINK_SECRET_KEY --env sandbox
```

3. 如果没有 Secret Key，在 UAT Dashboard 登录后让 CLI 创建或读取 key：

```bash
clink login
clink dashboard apikey ensure-secret --save --json
```

4. 创建 checkout session：

```bash
clink checkout create \
  --customer-email buyer@example.com \
  --amount 10 \
  --currency USD \
  --name "AI Integration Test" \
  --quantity 1 \
  --success-url https://example.com/success \
  --cancel-url https://example.com/cancel \
  --json
```

5. 配置 webhook endpoint：

```bash
clink dashboard webhook ensure \
  --url https://your-public-host.example.com/clink/webhook \
  --events core \
  --save-secret \
  --json
```

`--events core` 会提交 UAT Dashboard webhook sender 当前需要的数字事件 code：`22,2,3,5,7,14`，对应 `session.complete`、`order.succeeded`、`order.failed`、`refund.succeeded`、`subscription.created`、`invoice.paid`。

6. 本地验证 webhook 签名：

```bash
clink webhook simulate order.succeeded \
  --forward-to http://localhost:3000/clink/webhook \
  --json
```

7. 生成 starter 示例代码：

```bash
clink init --framework nextjs --out ./clink-demo --force --json
clink init --framework express --out ./clink-demo --force --json
clink init --framework fastapi --out ./clink-demo --force --json
```

## 可直接放进接入提示词的片段

```text
你需要先安装 Clink Dev CLI。不要使用 node dist/index.js。

如果可以全局安装，请运行：
  npm install -g github:5048429/clink-dev-cli
  clink --version

如果全局安装失败，请安装到项目本地：
  npm install --prefix ./.clink-tools github:5048429/clink-dev-cli

本地安装后，Linux/macOS 使用：
  ./.clink-tools/node_modules/.bin/clink

Windows PowerShell 使用：
  .\.clink-tools\node_modules\.bin\clink.cmd

之后用 clink 完成：
1. clink login
2. clink dashboard apikey ensure-secret --save --json
3. clink checkout create ... --json
4. clink dashboard webhook ensure --url <public-webhook-url> --events core --save-secret --json
5. clink webhook simulate order.succeeded --forward-to <local-or-public-webhook-url> --json

所有涉及 Secret Key、Dashboard token、webhook signing key 的输出都必须打码，不要写入源码。
```

