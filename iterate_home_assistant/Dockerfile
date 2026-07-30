FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm build \
    && pnpm prune --prod

FROM node:24-alpine

ARG BUILD_VERSION="0.1.0"
WORKDIR /app

ENV NODE_ENV=production
ENV BRIDGE_VERSION=${BUILD_VERSION}

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

LABEL \
    org.opencontainers.image.title="Home Assistant App: Iterate Home Assistant" \
    org.opencontainers.image.description="Stream Home Assistant events to Iterate and mount a live ITX capability." \
    org.opencontainers.image.source="https://github.com/iterate/home-assistant" \
    org.opencontainers.image.licenses="Apache-2.0"

CMD ["node", "--enable-source-maps", "dist/main.js"]

