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
        fs::path file_path = base / hmac.substr(0, 2) / hmac.substr(2, 2) / hmac /
                             fmt_chunk_index(chunk_index);

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
                return;

            uint8_t msg_type = header[0];
            switch (msg_type)
            {
            case 0x01:
                handle_store(client_fd, header);
                break;
            case 0x02:
                handle_retrieve(client_fd, header);
                break;
            case 0x03:
                handle_delete(client_fd, header);
                break;
            case 0x04:
                handle_ping(client_fd);
                break;
            }
        }
        catch (...)
        {
            std::cerr << "Error handling client." << std::endl;
        }
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
            disk.save(hmac, chunk, index);
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

        std::vector<uint8_t> chunk = disk.load(hmac, index);
        if (!chunk.empty())
        {
            uint8_t ok = 0x01;
            send(fd, &ok, 1, 0);

            uint32_t len = htonl(chunk.size());
            send(fd, &len, 4, 0);
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

        if (disk.destroy(hmac))
        {
            uint8_t ok = 0x01;
            send(fd, &ok, 1, 0);
        }
        else
        {
            uint8_t fail = 0x00;
            send(fd, &fail, 1, 0);
        }
    }

    void handle_ping(int fd)
    {
        uint32_t s = htonl(disk.size());
        send(fd, &s, 4, 0);
    }
};

std::string get_public_ip()
{
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
    json << "{";
    json << "\"host\":\"" << host << "\",";
    json << "\"port\":" << port << "}";
    std::string json_str = json.str();

    std::cout << "Sending JSON: " << json_str << std::endl;

    struct curl_slist *headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_str.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, json_str.size());
    curl_easy_setopt(curl, CURLOPT_POST, 1L);

    std::string response;
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, +[](char *ptr, size_t size, size_t nmemb, std::string *data)
                                                  {
        data->append(ptr, size * nmemb);
        return size * nmemb; });
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK)
    {
        std::cerr << "CURL error: " << curl_easy_strerror(res) << std::endl;
    }
    else
    {
        std::cout << "Response: " << response << std::endl;
    }

    curl_easy_cleanup(curl);
    curl_slist_free_all(headers);
}

int main(int argc, char *argv[])
{
    if (argc != 2)
    {
        std::cerr << "Usage: " << argv[0] << " <url>" << std::endl;
        return 1;
    }

    std::string url = argv[1];
    std::string host = get_public_ip();
    int port = 12345;

    std::thread([&]()
                {
        while (true)
        {
            register_shard(url, host, port);
            std::this_thread::sleep_for(std::chrono::seconds(30));
        } })
        .detach();

    Shard shard(host, port);
    shard.start();
    return 0;
}
