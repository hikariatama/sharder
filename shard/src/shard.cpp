#include <iostream>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <unordered_map>
#include <thread>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <csignal>
#include <mutex>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <atomic>
#include <chrono>
#include <curl/curl.h>
#include <pwd.h>
#include <sys/types.h>

namespace fs = std::filesystem;

class FileSystem
{
    fs::path base;
    std::atomic<long long> total_size;
    std::mutex size_mutex;

public:
    FileSystem(const fs::path &base_path) : base(base_path), total_size(-1)
    {
        fs::create_directories(base);
        calculate_size();
    }

    long long size()
    {
        if (total_size == -1)
        {
            calculate_size();
        }
        return total_size;
    }

    void calculate_size()
    {
        std::lock_guard<std::mutex> lock(size_mutex);
        total_size = 0;
        for (auto &p : fs::recursive_directory_iterator(base))
        {
            if (fs::is_regular_file(p))
            {
                total_size += fs::file_size(p);
            }
        }
    }

    void save(const std::string &hmac, const std::vector<uint8_t> &chunk, uint32_t chunk_index)
    {
        fs::path dir = base / hmac.substr(0, 2) / hmac.substr(2, 2) / hmac;
        fs::create_directories(dir);

        std::ostringstream filename;
        filename << std::hex << std::setw(8) << std::setfill('0') << chunk_index;

        std::ofstream file(dir / filename.str(), std::ios::binary);
        file.write(reinterpret_cast<const char *>(chunk.data()), chunk.size());

        calculate_size();
        std::cout << "Saved chunk to " << (dir / filename.str()) << std::endl;
    }

    std::vector<uint8_t> load(const std::string &hmac, uint32_t chunk_index)
    {
        fs::path file_path = base / hmac.substr(0, 2) / hmac.substr(2, 2) / hmac / fmt_chunk_index(chunk_index);

        if (!fs::exists(file_path))
            return {};

        std::ifstream file(file_path, std::ios::binary);
        return std::vector<uint8_t>((std::istreambuf_iterator<char>(file)), {});
    }

    bool destroy(const std::string &hmac)
    {
        fs::path dir = base / hmac.substr(0, 2) / hmac.substr(2, 2) / hmac;
        if (!fs::exists(dir))
            return false;

        for (auto &entry : fs::directory_iterator(dir))
        {
            fs::remove(entry);
        }
        fs::remove(dir);

        auto parent = dir.parent_path();
        while (parent != base && fs::is_empty(parent))
        {
            fs::remove(parent);
            parent = parent.parent_path();
        }

        std::cout << "Deleted files for HMAC " << hmac << std::endl;
        return true;
    }

private:
    std::string fmt_chunk_index(uint32_t index)
    {
        std::ostringstream ss;
        ss << std::hex << std::setw(8) << std::setfill('0') << index;
        return ss.str();
    }
};

FileSystem disk(std::getenv("SHARDER_BASE") ? std::getenv("SHARDER_BASE") : "./.data");

class Shard
{
    int server_fd;
    bool running;

public:
    Shard(const std::string &host, int port) : running(false)
    {
        server_fd = socket(AF_INET, SOCK_STREAM, 0);

        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        inet_pton(AF_INET, host.c_str(), &addr.sin_addr);

        bind(server_fd, (sockaddr *)&addr, sizeof(addr));
        listen(server_fd, 5);
    }

    void start()
    {
        running = true;
        std::cout << "Shard server started." << std::endl;

        while (running)
        {
            sockaddr_in client_addr;
            socklen_t len = sizeof(client_addr);
            int client = accept(server_fd, (sockaddr *)&client_addr, &len);
            std::thread(&Shard::handle_client, this, client).detach();
        }
    }

    void stop()
    {
        running = false;
        close(server_fd);
    }

private:
    void handle_client(int client_fd)
    {
        try
        {
            uint8_t header[43]{};
            int bytes_read = recv(client_fd, header, sizeof(header), 0);
            if (bytes_read <= 0)
            {
                std::cerr << "Error: Failed to read from client, received " << bytes_read << " bytes" << std::endl;
                return;
            }

            std::cout << "Received " << bytes_read << " bytes from client, message type: 0x"
                      << std::hex << static_cast<int>(header[0]) << std::dec << std::endl;

            uint8_t msg_type = header[0];
            switch (msg_type)
            {
            case 0x01:
                std::cout << "Processing STORE request" << std::endl;
                handle_store(client_fd, header);
                break;
            case 0x02:
                std::cout << "Processing RETRIEVE request" << std::endl;
                handle_retrieve(client_fd, header);
                break;
            case 0x03:
                std::cout << "Processing DELETE request" << std::endl;
                handle_delete(client_fd, header);
                break;
            case 0x04:
                std::cout << "Processing PING request" << std::endl;
                handle_ping(client_fd);
                break;
            default:
                std::cerr << "Error: Unknown message type: 0x" << std::hex << static_cast<int>(msg_type) << std::dec << std::endl;
            }
        }
        catch (const std::exception &e)
        {
            std::cerr << "Error handling client: " << e.what() << std::endl;
        }
        catch (...)
        {
            std::cerr << "Unknown error handling client connection" << std::endl;
        }

        std::cout << "Closing client connection (fd: " << client_fd << ")" << std::endl;
        close(client_fd);
    }

    void handle_store(int fd, uint8_t *header)
    {
        uint32_t index = ntohl(*reinterpret_cast<uint32_t *>(&header[1]));
        uint16_t hmac_len = ntohs(*reinterpret_cast<uint16_t *>(&header[5]));
        uint32_t data_len = ntohl(*reinterpret_cast<uint32_t *>(&header[7]));

        std::string hmac(reinterpret_cast<char *>(&header[11]), hmac_len);
        std::vector<uint8_t> chunk(data_len);

        size_t received = 0;
        while (received < data_len)
        {
            int r = recv(fd, chunk.data() + received, data_len - received, 0);
            if (r <= 0)
                break;
            received += r;
        }

        if (received == data_len)
        {
            std::string hex_hmac;
            for (char c : hmac) {
                char buf[3];
                snprintf(buf, sizeof(buf), "%02x", static_cast<unsigned char>(c));
                hex_hmac += buf;
            }
            disk.save(hex_hmac, chunk, index);
            send(fd, "\x01", 1, 0);
        }
        else
        {
            send(fd, "\x00", 1, 0);
        }
    }

    void handle_retrieve(int fd, uint8_t *header)
    {
        uint32_t index = ntohl(*reinterpret_cast<uint32_t *>(&header[1]));
        uint16_t hmac_len = ntohs(*reinterpret_cast<uint16_t *>(&header[5]));
        std::string hmac(reinterpret_cast<char *>(&header[7]), hmac_len);
        std::string hex_hmac;
        for (char c : hmac) {
            char buf[3];
            snprintf(buf, sizeof(buf), "%02x", static_cast<unsigned char>(c));
            hex_hmac += buf;
        }
        std::vector<uint8_t> chunk = disk.load(hex_hmac, index);
        if (!chunk.empty())
        {
            uint8_t header[5];
            header[0] = 0x01;
            uint32_t len = htonl(chunk.size());
            memcpy(&header[1], &len, 4);

            send(fd, header, sizeof(header), 0);
            send(fd, chunk.data(), chunk.size(), 0);
        }
        else
        {
            uint8_t fail = 0x00;
            send(fd, &fail, 1, 0);
        }
    }

    void handle_delete(int fd, uint8_t *header)
    {
        uint16_t hmac_len = ntohs(*reinterpret_cast<uint16_t *>(&header[1]));
        std::string hmac(reinterpret_cast<char *>(&header[3]), hmac_len);
        std::string hex_hmac;
        for (char c : hmac) {
            char buf[3];
            snprintf(buf, sizeof(buf), "%02x", static_cast<unsigned char>(c));
            hex_hmac += buf;
        }
        uint8_t status = disk.destroy(hex_hmac) ? 0x01 : 0x00;
        send(fd, &status, 1, 0);
    }

    void handle_ping(int fd)
    {
        uint32_t s = htonl(disk.size());
        send(fd, &s, 4, 0);
    }
};

std::string get_public_ip()
{
    const char *env_ip = std::getenv("SHARD_PUBLIC_IP");
    if (env_ip)
        return env_ip;

    CURL *curl = curl_easy_init();
    if (!curl)
        return "127.0.0.1";

    std::string ip;
    curl_easy_setopt(curl, CURLOPT_URL, "https://ident.me");
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, +[](char *ptr, size_t size, size_t nmemb, std::string *data)
                                                  {
        data->append(ptr, size * nmemb);
        return size * nmemb; });
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &ip);
    curl_easy_perform(curl);
    curl_easy_cleanup(curl);

    return ip.empty() ? "127.0.0.1" : ip;
}

void register_shard(const std::string &url, const std::string &host, int port)
{
    CURL *curl = curl_easy_init();
    if (!curl)
        return;

    std::ostringstream json;
    json << "{" << "\"host\":\"" << host << "\"," << "\"port\":" << port << "}";
    std::string json_str = json.str();

    struct curl_slist *headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_str.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, json_str.size());
    curl_easy_setopt(curl, CURLOPT_POST, 1L);

    curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    curl_slist_free_all(headers);
}

bool setup_systemd_service(const std::string &exec_path, const std::string &url, bool override_unit)
{
    std::string service_path = "/etc/systemd/system/shard.service";

    if (fs::exists(service_path))
    {
        if (override_unit)
        {
            system("systemctl stop shard.service");
            fs::remove(service_path);
        }
        else
        {
            return false;
        }
    }

    fs::path target_dir = "/opt/shard";
    fs::create_directories(target_dir);
    fs::copy(exec_path, target_dir / fs::path(exec_path).filename(), fs::copy_options::overwrite_existing);
    system("id -u shard > /dev/null 2>&1 || useradd -r -s /bin/false shard");
    system(("chown -R shard " + target_dir.string()).c_str());
    system(("chmod -R 755 " + target_dir.string()).c_str());

    std::ofstream service_file(service_path);
    service_file << "[Unit]\nDescription=Sharder Service\nAfter=network.target\n\n"
                 << "[Service]\nType=simple\nExecStart=" << (target_dir / fs::path(exec_path).filename()).string()
                 << " " << url << "\nRestart=on-failure\nUser=shard\nWorkingDirectory=" << target_dir.string() << "\n\n"
                 << "[Install]\nWantedBy=multi-user.target\n";
    service_file.close();

    system("systemctl daemon-reload");
    system("systemctl enable --now shard.service");

    std::cout << "Systemd service installed and started." << std::endl;
    return true;
}

int main(int argc, char *argv[])
{
    bool dry_run = false;
    bool override_unit = false;
    std::string url;

    for (int i = 1; i < argc; ++i)
    {
        if (std::strcmp(argv[i], "--dry") == 0)
            dry_run = true;
        else if (std::strcmp(argv[i], "--override") == 0)
            override_unit = true;
        else
            url = argv[i];
    }

    if (url.empty())
    {
        std::cerr << "Usage: " << argv[0] << " [--dry] [--override] <url>" << std::endl;
        return 1;
    }

    if (!dry_run && setup_systemd_service(fs::canonical(argv[0]), url, override_unit))
    {
        return 0;
    }

    std::string host = get_public_ip();
    int port = 12345;

    std::thread([&]()
                {
        while (true) {
            register_shard(url, host, port);
            std::this_thread::sleep_for(std::chrono::seconds(30));
        } })
        .detach();

    Shard shard("0.0.0.0", port);
    shard.start();
    return 0;
}
