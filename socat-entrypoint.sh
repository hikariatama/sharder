#!/bin/sh
set -eu

rm -f /socks/nginx.sock /socks/grafana.sock /socks/prometheus.sock

socat -d -d UNIX-LISTEN:/socks/nginx.sock,fork,mode=0777 TCP:nginx:80 &
socat -d -d UNIX-LISTEN:/socks/grafana.sock,fork,mode=0777 TCP:grafana:3000 &
socat -d -d UNIX-LISTEN:/socks/prometheus.sock,fork,mode=0777 TCP:prometheus:9090 &

wait
