# 安全报告 | Security reporting

请勿在公开 issue 中发布 API key、访问密码、含用户照片的任务链接或可复现私密数据。若发现安全问题，优先使用 GitHub 仓库的 **Security → Report a vulnerability** 私下报告，并说明影响、复现步骤和受影响版本。若该入口尚未启用，请先联系仓库所有者，避免公开披露细节。

仓库中的 `.env.example` 仅提供空值或示例；生产密钥只应放在托管平台的服务端环境变量。若怀疑密钥已经泄露，应立即在原服务商撤销并轮换，随后检查 Git 历史及部署日志。删除当前文件不能清除 Git 历史中的秘密。

## English

Do not post credentials, private task URLs, or user images in public issues. Prefer GitHub's private **Security → Report a vulnerability** flow. If unavailable, contact the repository owner before sharing exploit details. Rotate any exposed key at its provider, and inspect repository history and deployment logs; deleting a file in a new commit does not remove it from Git history.
