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
    git \
    cmake

WORKDIR /tmp/shard
COPY . .
RUN make deps && make

RUN mkdir -p /opt/shard
RUN cp /tmp/shard/bin/shard /opt/shard/
WORKDIR /opt/shard

EXPOSE 12345

CMD echo "This command should be overriden by the docker-compose file"
