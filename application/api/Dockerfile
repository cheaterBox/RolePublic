# Roletect VPS API — production image
#
# Build:    docker build -t roletect-api -f api/Dockerfile api/
# Runtime:  see ../docker-compose.yml

# ---- Builder ---------------------------------------------------------------
FROM rust:1-bookworm AS builder

WORKDIR /build

# Cache deps separately from sources.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs && \
    echo "" > src/lib.rs && \
    cargo fetch --locked

COPY . .

# Build a fully optimized release binary. Locked to Cargo.lock for reproducibility.
RUN cargo build --release --locked --bin roletect_api && \
    strip target/release/roletect_api

# ---- Runtime ---------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

ARG UID=10001
ARG GID=10001

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        tini \
        curl \
        libfontconfig1 \
        libfreetype6 \
        libgraphite2-3 \
        libharfbuzz0b \
        libicu72 \
        libpng16-16 \
        libbrotli1 \
        libbz2-1.0 \
        libexpat1 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root.
RUN groupadd --system --gid ${GID} roletect && \
    useradd  --system --uid ${UID} --gid roletect \
             --home /data --shell /usr/sbin/nologin roletect

# Bundled binary.
COPY --from=builder /build/target/release/roletect_api /usr/local/bin/roletect_api

# Bundled themes (loaded by `seed::run_seedings` when ROLETECT_THEMES_PATH is set).
COPY themes.toml /app/themes.toml

# Persistent data directory: SQLite database, master key, tectonic cache.
RUN mkdir -p /data && chown -R roletect:roletect /data

ENV RUST_LOG=info \
    BIND_ADDR=0.0.0.0:8080 \
    DB_DRIVER=sqlite \
    DATABASE_URL=/data/roletect.db \
    ROLETECT_DATA_DIR=/data \
    ROLETECT_THEMES_PATH=/app/themes.toml \
    LOG_FORMAT=json

USER roletect
WORKDIR /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/roletect_api"]