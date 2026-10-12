#!/bin/zsh
cd "${0:A:h}"
export PATH="/Users/njsisuo-mini4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/njsisuo-mini4/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
if [[ ! -f .env.local ]]; then
  print "缺少本机真实模型配置 .env.local"
  exit 1
fi
print "启动真实 AI 测试：图片模型 gpt-image-2.5，生成会调用已配置的中转站。"
pnpm start --hostname 127.0.0.1 --port 3217
