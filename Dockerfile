FROM rust:1.67 as builder
# One build job: the Anki host has 2 CPUs and under 2 GiB free RAM.
ENV CARGO_BUILD_JOBS=1
WORKDIR /usr/src/better-tactics
COPY . .

# Install node/npm using nvm.
ENV NODE_VERSION=21.1.0
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"

# Run cargo build.
RUN cargo install --locked --path .

# Dereference the CA bundle and OpenSSL runtime libs for the final stage.
RUN cp -L /etc/ssl/certs/ca-certificates.crt /tmp/ca-certificates.crt && cp -L /usr/lib/x86_64-linux-gnu/libssl.so.1.1 /tmp/libssl.so.1.1 && cp -L /usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /tmp/libcrypto.so.1.1 && cp -L /etc/ssl/openssl.cnf /tmp/openssl.cnf

# Now copy the build output to a leaner image.
FROM debian:bullseye-slim
# No apt here: bullseye-security returned 404 for ca-certificates/openssl on this host (2026-10-28).
# Take the CA bundle and OpenSSL runtime libs from the builder instead.
COPY --from=builder /tmp/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /tmp/openssl.cnf /etc/ssl/openssl.cnf
COPY --from=builder /tmp/libssl.so.1.1 /tmp/libcrypto.so.1.1 /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/local/cargo/bin/better-tactics /usr/local/bin/better-tactics
CMD ["better-tactics"]
