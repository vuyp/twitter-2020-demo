FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/realtime/package.json apps/realtime/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm build

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@twitter2020/web", "start"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@twitter2020/worker", "start"]

FROM build AS realtime
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@twitter2020/realtime", "start"]
