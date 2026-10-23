#!/bin/zsh
cd "${0:A:h}"
if ! command -v pnpm >/dev/null 2>&1; then
  print "请先安装 Node.js 22 并通过 corepack 启用 pnpm。"
  exit 1
fi
export AI_PROVIDER=mock
export REFERENCE_RESEARCH_URL=
export REFERENCE_RESEARCH_API_KEY=
pnpm start --hostname 127.0.0.1 --port 3217
