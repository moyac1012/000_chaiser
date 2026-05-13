FROM oven/bun:1-debian AS bun-source

FROM mcr.microsoft.com/devcontainers/base:trixie

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        sqlite3 \
        nodejs npm \
        libglib2.0-0t64 libnspr4 libnss3 libdbus-1-3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
        libxcb1 libxkbcommon0 libatspi2.0-0t64 libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
        libxrandr2 libgbm1 libcairo2 libpango-1.0-0 libasound2t64 \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

COPY --from=bun-source /usr/local/bin/bun /usr/local/bin/bun

RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
