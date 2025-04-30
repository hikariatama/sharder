FROM alpine:latest

RUN apk update && apk add --no-cache \
    build-base \
    gcc \
    g++ \
    make \
    curl-dev \
    openssl-dev \
    autoconf \
    automake \
    libtool \
    pkgconfig \
    git

WORKDIR /tmp/shard
COPY . .
RUN make

RUN mkdir -p /opt/shard
RUN cp /tmp/shard/bin/shard /opt/shard/
WORKDIR /opt/shard

ARG SHARD_TOKEN
EXPOSE 12345

CMD export SHARD_PUBLIC_IP=$(hostname -i) && ./shard "https://sharder.dgazizullin.dev/api/connect/$SHARD_TOKEN" --dry
