import base64
import os
import yaml
import argparse

parser = argparse.ArgumentParser(description="Generate a docker-compose.yml file.")
parser.add_argument(
    "--chunks-per-file",
    type=int,
    help="Number of chunks per file. This is the number of chunks in which the file will be split before replicating on the shards.",
    default=3,
)
parser.add_argument(
    "--replicas",
    type=int,
    help="Number of replicas. This is the number of copies of each chunk that will be stored on different shards.",
    default=2,
)
parser.add_argument(
    "--dev-shards",
    type=int,
    help="Number of local shards to deploy. This is the number of shards that will be deployed locally for development purposes.",
    default=0,
)
args = parser.parse_args()

PG_PASSWORD = os.urandom(16).hex()
CONNECTION_SECRET = os.urandom(16)
while "/" in base64.b64encode(CONNECTION_SECRET).decode().strip("="):
    CONNECTION_SECRET = os.urandom(16)

base = {
    "services": {
        "frontend": {
            "build": {"context": "./frontend"},
            "networks": ["shard_net"],
            "restart": "unless-stopped",
        },
        "server": {
            "build": {"context": "./server"},
            "depends_on": ["postgres"],
            "networks": ["shard_net"],
            "restart": "unless-stopped",
            "environment": {
                "CHUNKS_PER_FILE": args.chunks_per_file,
                "REPLICAS": args.replicas,
                "HMAC_SECRET": os.urandom(16).hex(),
                "CONNECTION_SECRET": CONNECTION_SECRET.hex(),
                "DB_URL": f"postgresql://shard:{PG_PASSWORD}@postgres/shard",
            },
            "volumes": ["./prometheus/file_sd:/file_sd"],
        },
        "nginx": {
            "image": "nginx:latest",
            "depends_on": ["frontend", "server"],
            "networks": ["shard_net"],
            "restart": "unless-stopped",
            "volumes": ["./default.conf:/etc/nginx/conf.d/default.conf"],
        },
        "nginx-exporter": {
            "image": "nginx/nginx-prometheus-exporter:latest",
            "command": "--nginx.scrape-uri=http://nginx:9113/nginx_status --web.listen-address=:9113",
            "depends_on": ["nginx"],
            "networks": ["shard_net"],
        },
        "postgres": {
            "image": "postgres:latest",
            "networks": ["shard_net"],
            "restart": "unless-stopped",
            "volumes": ["postgres-storage:/var/lib/postgresql/data"],
            "environment": {
                "POSTGRES_DB": "shard",
                "POSTGRES_USER": "shard",
                "POSTGRES_PASSWORD": PG_PASSWORD,
            },
        },
        "prometheus": {
            "image": "prom/prometheus:latest",
            "volumes": [
                "./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
                "./prometheus/file_sd:/etc/prometheus/file_sd",
            ],
            "networks": ["shard_net"],
        },
        "grafana": {
            "image": "grafana/grafana:latest",
            "environment": {
                "GF_SECURITY_ADMIN_PASSWORD": os.urandom(16).hex(),
                "GF_INSTALL_PLUGINS": "grafana-piechart-panel,grafana-clock-panel",
            },
            "volumes": [
                "grafana-data:/var/lib/grafana",
                "./grafana/provisioning:/etc/grafana/provisioning:ro",
            ],
            "depends_on": ["prometheus"],
            "networks": ["shard_net"],
        },
        "socket-proxy": {
            "image": "docker.io/alpine/socat",
            "volumes": ["./socks:/socks", "./socat-entrypoint.sh:/socat-entrypoint.sh"],
            "entrypoint": ["/bin/sh"],
            "command": "/socat-entrypoint.sh",
            "depends_on": ["grafana", "nginx", "prometheus"],
            "networks": ["shard_net"],
        },
    },
    "volumes": {
        "postgres-storage": {},
        "grafana-data": {},
    },
    "networks": {"shard_net": {}},
}

for i in range(args.dev_shards):
    token = base64.b64encode(CONNECTION_SECRET).decode().strip("=")
    base["services"][f"shard-{i}"] = {
        "build": {"context": "./shard"},
        "networks": ["shard_net"],
        "restart": "unless-stopped",
        "depends_on": ["server"],
        "volumes": [
            f"shard-{i}-storage:/opt/shard/.data",
        ],
        "command": f"sh -c 'export SHARD_PUBLIC_IP=$(hostname -i) && ./shard \"http://nginx/api/connect/{token}\" --dry'",
    }
    base["volumes"][f"shard-{i}-storage"] = {}

if (
    os.path.exists("docker-compose.yml")
    and input(
        "docker-compose.yml already exists. You will need to `docker compose down -v`. Overwrite? (y/N): "
    ).lower()
    != "y"
):
    exit(0)

with open("docker-compose.yml", "w") as f:
    yaml.dump(base, f, default_flow_style=False)

print("docker-compose.yml generated successfully.")
