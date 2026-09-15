# Espejo Firebase → Postgres. Se construye desde la RAÍZ del monorepo:
#   docker build -f apps/mirror/Dockerfile -t renew-mirror .
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/mirror/package.json apps/mirror/
RUN pnpm install --frozen-lockfile --filter @carbid/mirror...
COPY apps/mirror apps/mirror
RUN pnpm --filter @carbid/mirror build

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/mirror/package.json apps/mirror/
# --ignore-scripts: el `prepare: husky` del package.json raíz corre en cada
# install y husky es devDependency, así que en una instalación --prod no
# existe y el build muere con "husky: not found". Ninguna dependencia del
# mirror necesita un script de instalación (pg y firebase-admin son JS puro).
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @carbid/mirror... && pnpm store prune
COPY --from=build /repo/apps/mirror/dist apps/mirror/dist
WORKDIR /repo/apps/mirror
# Corre como usuario sin privilegios; /data es el volumen de Storage.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
ENV NODE_ENV=production MIRROR_STORAGE_DIR=/data/storage MIRROR_HEALTH_PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1
CMD ["node", "dist/index.js"]
