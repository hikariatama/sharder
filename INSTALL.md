# INSTALL.md

## 📦 Sharder Installation Guide

This guide explains how to install and run the **Sharder** distributed storage platform, either via Docker (recommended) or manually. It also includes instructions for deploying individual shards.

---

## 🚀 Quick Start (Docker-Based Deployment)

### 1. Clone the Repository

```bash
git clone https://github.com/hikariatama/sharder
cd sharder
```

### 2. Generate Docker Compose Configuration

```bash
python3 docker-compose-generator.py \
  --chunks-per-file 2 \
  --replicas 3 \
  --public-port 3333 \
  --dev-shards 7
```

**Available options:**

| Option              | Description                                          | Default |
|---------------------|------------------------------------------------------|---------|
| `--chunks-per-file` | Number of chunks to split each file into             | `3`     |
| `--replicas`        | Number of redundant copies per chunk                 | `2`     |
| `--public-port`     | Port for the public-facing API                       | `80`    |
| `--dev-shards`      | Number of local shards to run for development        | `0`     |

### 3. Launch the Stack

```bash
sudo docker compose up -d --build
```

---

## ⚙️ Manual Shard Deployment

To run a shard instance independently:

### 1. Build the Shard Binary

```bash
mkdir /tmp/shard
cd /tmp/shard
wget https://sharder.dgazizullin.dev/bin/shard.tar.gz
tar xvf shard.tar.gz
sudo apt install build-essential libcurl4-openssl-dev
make
cd bin
```

### 2. Retrieve Connection URL

Open the Sharder web UI, type `chimera`, and navigate to the "Management" menu to obtain your shard connection URL.

### 3. Launch the Shard

Use the command provided in the UI to start your shard. On first run, execute as `root`, or use the `--dry` flag to perform a test run.

> ℹ️ The shard installs itself as a `systemd` service and moves to `/opt/shard` by default.

---

For more information, visit the [project repository](https://github.com/hikariatama/sharder).
