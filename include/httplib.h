// Lightweight single-header HTTP/1.1 server (cpp-httplib compatible)
#pragma once
#include <algorithm>
#include <cctype>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace httplib {

struct Request {
    std::string method;
    std::string path;
    std::string body;
    std::map<std::string, std::string> headers;
};

struct Response {
    int status = 200;
    std::string body;
    std::string content_type = "text/plain; charset=utf-8";

    void set_content(const std::string& value, const std::string& type) {
        body = value;
        content_type = type;
    }
};

using Handler = std::function<void(const Request&, Response&)>;

#ifdef _WIN32
using socket_handle = SOCKET;
constexpr socket_handle invalid_socket = INVALID_SOCKET;
inline void close_socket(socket_handle socket) { ::closesocket(socket); }
#else
using socket_handle = int;
constexpr socket_handle invalid_socket = -1;
inline void close_socket(socket_handle socket) { ::close(socket); }
#endif

class Server {
public:
    void Get(const std::string& path, Handler handler) {
        get_handlers_[path] = std::move(handler);
    }

    void Post(const std::string& path, Handler handler) {
        post_handlers_[path] = std::move(handler);
    }

    bool set_mount_point(const std::string& mount, const std::string& directory) {
        mount_ = mount;
        directory_ = std::filesystem::absolute(directory);
        return std::filesystem::is_directory(directory_);
    }

    bool listen(const std::string& host, int port) {
#ifdef _WIN32
        WSADATA data{};
        if (::WSAStartup(MAKEWORD(2, 2), &data) != 0) return false;
#endif
        const socket_handle listener = ::socket(AF_INET, SOCK_STREAM, 0);
        if (listener == invalid_socket) return false;

        int reuse = 1;
#ifdef _WIN32
        ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));
#else
        ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
#endif

        sockaddr_in address{};
        address.sin_family = AF_INET;
        address.sin_port = htons(static_cast<unsigned short>(port));
        if (::inet_pton(AF_INET, host.c_str(), &address.sin_addr) != 1 ||
            ::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0 ||
            ::listen(listener, 64) < 0) {
            close_socket(listener);
            return false;
        }

        std::cout << "[Server] Successfully started on http://" << host << ":" << port << std::endl;

        for (;;) {
            const socket_handle client = ::accept(listener, nullptr, nullptr);
            if (client == invalid_socket) continue;
            std::thread([this, client] { serve(client); }).detach();
        }
    }

private:
    std::map<std::string, Handler> get_handlers_, post_handlers_;
    std::string mount_ = "/";
    std::filesystem::path directory_;

    static void write_all(socket_handle fd, const std::string& data) {
        std::size_t offset = 0;
        while (offset < data.size()) {
#ifdef _WIN32
            const int sent = ::send(fd, data.data() + offset,
                                   static_cast<int>(std::min<std::size_t>(data.size() - offset, 0x7fffffff)), 0);
#else
            const auto sent = ::send(fd, data.data() + offset, data.size() - offset, MSG_NOSIGNAL);
#endif
            if (sent <= 0) return;
            offset += static_cast<std::size_t>(sent);
        }
    }

    static std::string mime_type(const std::filesystem::path& path) {
        const auto ext = path.extension().string();
        if (ext == ".html") return "text/html; charset=utf-8";
        if (ext == ".css") return "text/css; charset=utf-8";
        if (ext == ".js") return "application/javascript; charset=utf-8";
        if (ext == ".svg") return "image/svg+xml";
        if (ext == ".json") return "application/json; charset=utf-8";
        if (ext == ".png") return "image/png";
        if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
        if (ext == ".ico") return "image/x-icon";
        if (ext == ".csv") return "text/csv; charset=utf-8";
        return "application/octet-stream";
    }

    void respond(socket_handle fd, int status, const std::string& type, const std::string& body) {
        const char* reason = status == 200 ? "OK" :
                             status == 201 ? "Created" :
                             status == 400 ? "Bad Request" :
                             status == 404 ? "Not Found" : "Internal Server Error";
        std::ostringstream head;
        head << "HTTP/1.1 " << status << ' ' << reason << "\r\n"
             << "Content-Type: " << type << "\r\n"
             << "Content-Length: " << body.size() << "\r\n"
             << "Access-Control-Allow-Origin: *\r\n"
             << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
             << "Access-Control-Allow-Headers: Content-Type\r\n"
             << "Connection: close\r\n"
             << "X-Content-Type-Options: nosniff\r\n\r\n";
        write_all(fd, head.str());
        write_all(fd, body);
    }

    bool read_request(socket_handle fd, Request& request) {
        std::string bytes;
        char buffer[4096];
        std::size_t header_end = std::string::npos;
        while ((header_end = bytes.find("\r\n\r\n")) == std::string::npos && bytes.size() < 1024 * 1024) {
            const auto count = ::recv(fd, buffer, sizeof(buffer), 0);
            if (count <= 0) return false;
            bytes.append(buffer, static_cast<std::size_t>(count));
        }
        if (header_end == std::string::npos) return false;

        const std::string headers = bytes.substr(0, header_end);
        std::istringstream lines(headers);
        std::string first_line;
        if (!std::getline(lines, first_line)) return false;

        std::istringstream start(first_line);
        start >> request.method >> request.path;

        std::size_t content_length = 0;
        std::string line;
        while (std::getline(lines, line)) {
            const auto colon = line.find(':');
            if (colon != std::string::npos) {
                std::string name = line.substr(0, colon);
                std::string val = line.substr(colon + 1);
                while (!val.empty() && (val.front() == ' ' || val.front() == '\t')) val.erase(val.begin());
                while (!val.empty() && (val.back() == '\r' || val.back() == ' ')) val.pop_back();
                std::string lower_name = name;
                std::transform(lower_name.begin(), lower_name.end(), lower_name.begin(),
                               [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
                request.headers[lower_name] = val;
                if (lower_name == "content-length") {
                    try { content_length = static_cast<std::size_t>(std::stoul(val)); } catch (...) { return false; }
                }
            }
        }

        const std::size_t body_start = header_end + 4;
        while (bytes.size() - body_start < content_length) {
            const auto count = ::recv(fd, buffer, sizeof(buffer), 0);
            if (count <= 0) return false;
            bytes.append(buffer, static_cast<std::size_t>(count));
        }
        request.body = bytes.substr(body_start, content_length);

        const auto query = request.path.find('?');
        if (query != std::string::npos) request.path.resize(query);

        return true;
    }

    void serve(socket_handle fd) {
        Request request;
        Response response;
        if (!read_request(fd, request)) {
            respond(fd, 400, "text/plain", "Bad Request");
            close_socket(fd);
            return;
        }

        if (request.method == "OPTIONS") {
            respond(fd, 200, "text/plain", "OK");
            close_socket(fd);
            return;
        }

        auto& routes = request.method == "POST" ? post_handlers_ : get_handlers_;
        const auto route = routes.find(request.path);
        if (route != routes.end()) {
            try {
                route->second(request, response);
            } catch (const std::exception& error) {
                response.status = 500;
                response.set_content(std::string("{\"error\":\"") + error.what() + "\"}", "application/json");
            }
            respond(fd, response.status, response.content_type, response.body);
        } else if (request.method == "GET" && serve_static(request.path, fd)) {
            // Static response served directly
        } else {
            respond(fd, 404, "text/plain; charset=utf-8", "Not Found");
        }
        close_socket(fd);
    }

    bool serve_static(const std::string& url_path, socket_handle fd) {
        if (directory_.empty() || (url_path.rfind(mount_, 0) != 0)) return false;
        std::string relative = url_path.substr(mount_.size());
        if (relative.empty() || relative.back() == '/') relative += "index.html";
        std::filesystem::path rel(relative);
        for (const auto& part : rel) {
            if (part == "..") return false;
        }
        const auto path = std::filesystem::weakly_canonical(directory_ / rel);
        const auto root = std::filesystem::weakly_canonical(directory_);
        const auto path_string = path.string(), root_string = root.string();
        if (path_string.compare(0, root_string.size(), root_string) != 0 || !std::filesystem::is_regular_file(path)) {
            return false;
        }
        std::ifstream file(path, std::ios::binary);
        if (!file.is_open()) return false;
        std::ostringstream content;
        content << file.rdbuf();
        const std::string body = content.str();
        respond(fd, 200, mime_type(path), body);
        return true;
    }
};

} // namespace httplib
