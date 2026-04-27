FROM node:20-alpine AS base
WORKDIR /app

COPY apps/web/package.json ./apps/web/package.json
COPY package.json pnpm-workspace.yaml ./

RUN corepack enable

CMD ["sh", "-c", "echo \"Web Docker scaffold. Install dependencies before production use.\" && sleep infinity"]

