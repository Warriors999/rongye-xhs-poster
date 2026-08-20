# 绒页部署说明

## Deploy Configuration (configured by /setup-deploy)
- Platform: Render Free single Web
- Production URL: 待 Render 首次部署后填写
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: Next.js web app with server-side AI API routes
- Post-deploy health check: `https://<render-domain>/api/health`

### Custom deploy hooks
- Pre-merge: `pnpm typecheck && pnpm test && pnpm build`
- Deploy trigger: automatic on push to main
- Deploy status: poll production URL
- Health check: `GET /api/health` should return HTTP 200

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- QA/testing site behavior → invoke /qa or /qa-only
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Bugs/errors → invoke /investigate
