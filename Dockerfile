# Manors & Menaces online server + web client in one image (spec §58, §75).
# Build:  docker build -t manors-menaces .
# Run:    docker run -p 8787:8787 -v manors-data:/data manors-menaces

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @manors-menaces/web build && pnpm --filter @manors-menaces/server build

FROM node:22-slim
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/manors.sqlite WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /app/apps/server/dist/server.mjs ./server.mjs
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
