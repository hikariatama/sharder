<img width="200" src="https://github.com/user-attachments/assets/d7a874a5-296a-4192-94cd-f4cb9271ebb8" />

![academic project](https://img.shields.io/badge/academic%20project-3DB420)
![source only](https://img.shields.io/badge/source%20only-545454)

> Sharder is a distributed file storage platform that splits your files into encrypted chunks and spreads them across multiple storage nodes—so your data is safe, private, and always available.

<img width="2144" height="1280" alt="sharder" src="https://github.com/user-attachments/assets/5b7eff4c-0732-4017-aa86-d8246f91eedd" />

## 🛠️ Installation

**Quick Start (with Docker)**

1. **Clone the repo:**
    ```bash
    git clone https://github.com/hikariatama/sharder
    ```

2. **Generate a Docker Compose file:**
    ```bash
    python3 docker-compose-generator.py \
        --chunks-per-file 2 \
        --replicas 3 \
        --dev-shards 7
    ```

3. **Start everything up:**
    ```bash
    sudo docker compose up -d --build
    ```

### Custom Setup

You can tweak your deployment with these options:

- `--chunks-per-file`: How many chunks to split each file into (default: 3)
- `--replicas`: How many copies of each chunk to keep (default: 2)
- `--dev-shards`: How many local shards to spin up for testing (default: 0)

---

### 📦 Want to Run a Shard?

1. **Build the shard binary:**
    ```bash
    mkdir /tmp/shard
    cd /tmp/shard
    wget https://sharder.dgazizullin.dev/bin/shard.tar.gz
    tar xvf shard.tar.gz
    sudo apt install build-essential libcurl4-openssl-dev
    make
    cd bin
    ```

2. **Get your connection URL:**  
    Open the "Management" menu (just type "chimera" anywhere in the web UI).

3. **Start your shard:**  
    Use the command provided in the UI. The shard will install itself as a systemd service and move to `/opt/shard`.  
    *Tip: The first run should be as `root`, or use the `--dry` flag for a test run.*

---

## 🚀 Features

- **End-to-End Encryption:** Files are encrypted on your device with ChaCha20 before being split and uploaded.
- **Distributed Storage:** Files are broken into chunks and distributed across independent shards.
- **Redundancy:** You choose how many copies of each chunk to keep, so your data survives outages.
- **REST API:** Simple endpoints for uploading, downloading, and managing files.
- **Modern Web UI:** Built with Next.js and Tailwind CSS for a smooth experience.
- **Live Health Monitoring:** See the status of all shards in real time on the dashboard.

## 🏗️ Architecture

Sharder is made up of three main parts:

- **Frontend:** Next.js app for the user interface
- **Server:** FastAPI backend that handles file operations
- **Shards:** C++ services that store encrypted file chunks

## 🧩 Tech Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL
- **Shard:** C++17, POSIX sockets, libcurl (`libcurl4-openssl-dev` required)
- **Infrastructure:** Docker, Nginx

## 📝 License

MIT License. See the LICENSE file for details.
