# 数据处理与隐私 | Privacy and data handling

本文件描述当前代码的数据流，不代替部署者对其实际托管环境和第三方服务进行核查。

| 数据 | 用途与位置 | 保留与限制 |
| --- | --- | --- |
| 玩偶照片、可选风格参考、创作想法、提示词 | 浏览器中编辑；确认流程后提交到本应用服务端，真实模式下再由配置的 AI 服务处理 | 浏览器草稿存于 IndexedDB，仅限当前浏览器；清除浏览器数据会丢失 |
| 海报和文案 | 返回浏览器用于预览、下载和本地保存 | 最近一次结果自动暂存；没有账号或跨设备同步 |
| 服务端异步任务和临时图像 | 支持生成、重试与恢复查询 | 默认存在 Web 进程内存；服务休眠或重启会丢失。若启用 Redis 和 R2，任务与图像存于部署者配置的服务，需由部署者配置过期与清理策略 |
| API 密钥和可选访问密码 | 服务端调用供应商和访问控制 | 只应保存在服务端环境变量，不能放进仓库、客户端代码或 `NEXT_PUBLIC_` 变量 |

Mock 模式不调用外部研究或 AI 服务。真实模式会把用户提交的图片与相关文本发送给部署者配置的视觉/文字模型和图片模型；可选参考研究服务接收由关键词和创作想法整理的查询。不同部署的供应商、价格、所在地和保留规则可能不同，应查看实际供应商条款。

公开本源码仓库不会自动公开用户在网站上传的照片或生成结果。请勿在 issue、日志或支持请求中粘贴私密图片、访问密码或 API key。

## English summary

Rongye keeps drafts and the latest result in this browser's IndexedDB and has no account or cross-device sync. Real AI mode sends uploaded images and relevant text to the configured providers. Temporary server tasks use process memory by default, or Redis and R2 when the distributed setup is enabled. Hosting operators must manage provider terms, server-side secrets, retention, and deletion. Clearing browser storage removes locally stored work.
