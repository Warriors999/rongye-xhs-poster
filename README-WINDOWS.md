# 绒页｜Windows 运行说明

## 1. 安装环境

- Windows 10/11
- Node.js 22.x

安装 Node.js 后，在 PowerShell 中启用 pnpm：

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

## 2. 安装项目依赖

在本文件夹打开 PowerShell，执行：

```powershell
pnpm install
```

## 3. 先用免费 Mock 模式运行

项目默认不调用真实 AI，也不会产生费用：

```powershell
pnpm dev
```

浏览器打开：

```text
http://localhost:3000
```

## 4. 接入真实 AI

复制配置模板：

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

在 `.env.local` 中填写视觉模型、图片模型和 API 地址。`.env.local` 只保存在本机，不要上传到 GitHub 或发送给别人。

配置完成后运行：

```powershell
pnpm dev
```

## 5. 生产模式本地运行

```powershell
pnpm build
pnpm start
```

然后打开 `http://localhost:3000`。

## 常见问题

- `pnpm` 不存在：重新执行 `corepack enable`，然后重启 PowerShell。
- 端口 3000 被占用：关闭占用该端口的 Node 进程，或使用 `pnpm dev -- -p 3001`。
- 图片生成失败：先确认 Mock 模式能正常运行，再检查 `.env.local` 中的模型地址、模型名称和 API key。
