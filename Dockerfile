# 인터넷 배포용 이미지 (Railway 등). 로컬 PC 실행에는 필요 없다.
# Node 22 LTS 고정: better-sqlite3가 이 버전용 미리 빌드된 파일을 제공한다.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# 미리 빌드된 파일을 못 받을 때를 대비한 컴파일 도구
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # DB는 영구 볼륨(/data)에 둔다. Railway에서 /data에 볼륨을 붙여야 재배포해도 데이터가 남는다
    DATABASE_PATH=/data/app.db
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data
EXPOSE 3000
# Railway가 PORT를 넘겨주면 next start가 그 포트를 쓴다
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
