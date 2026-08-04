FROM node:24.15.0-alpine AS fe
WORKDIR /builder
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM rust:1-alpine3.20 AS be
WORKDIR /builder
COPY api ./
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/builder/target \
    cargo build --release && \
    cp target/release/gcd_api /tmp/gcd_api

FROM gcr.io/distroless/cc-debian13:nonroot
WORKDIR /app
ARG VERSION_ARG
ENV GLCIDBR__VERSION=$VERSION_ARG
ENV RUST_LOG="info"
COPY --from=fe /builder/dist/gitlab-ci-dashboard/browser ./spa
COPY --from=be /tmp/gcd_api ./gcd_api
CMD ["/app/gcd_api"]
