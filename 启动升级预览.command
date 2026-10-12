#!/bin/zsh
cd "${0:A:h}"
export PATH="/Users/njsisuo-mini4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/njsisuo-mini4/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
export AI_PROVIDER=mock
export REFERENCE_RESEARCH_URL=
export REFERENCE_RESEARCH_API_KEY=
pnpm start --hostname 127.0.0.1 --port 3217
