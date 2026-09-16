# syntax=docker/dockerfile:1
# Multi-target build:
#   - migrate  : full dependency set, runs Sequelize migrations then exits.
#   - runtime  : production image with dev dependencies pruned.
#
# Build with:  docker build -t ridewing-api --target runtime .
# Migrations:  docker build -t ridewing-api-migrate --target migrate .

FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS migrate
COPY . .
CMD ["sh", "-c", "npx sequelize-cli db:migrate"]

FROM deps AS runtime
COPY . .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node src/server.js"]