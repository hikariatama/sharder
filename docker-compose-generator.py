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
    "--public-port",
    type=int,
    help="Public port for the frontend service. This is the port that will be exposed to the outside world.",
    default=80,
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

base = {
    "services": {
        "frontend": {
            "build": {"context": "./frontend"},
            "container_name": "frontend",
            "networks": ["shard_net"],
            "restart": "unless-stopped",
        },
        "server": {
            "build": {"context": "./server"},
            "container_name": "sharder-server",
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
        },
        "nginx": {
            "image": "nginx:latest",
            "ports": [f"{args.public_port}:80"],
            "depends_on": ["frontend", "server"],
            "networks": ["shard_net"],
            "restart": "unless-stopped",
            "volumes": ["./default.conf:/etc/nginx/conf.d/default.conf"],
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
    },
    "volumes": {
        "postgres-storage": {},
    },
    "networks": {"shard_net": {}},
}

for i in range(args.dev_shards):
    base["services"][f"shard-{i}"] = {
        "build": {"context": "./shard"},
        "container_name": f"shard-{i}",
        "networks": ["shard_net"],
        "restart": "unless-stopped",
        "depends_on": ["server"],
        "environment": {
            "SHARD_TOKEN": base64.b64encode(CONNECTION_SECRET).decode().strip("=")
        },
        "volumes": [
            f"shard-{i}-storage:/opt/shard/.data",
        ],
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
