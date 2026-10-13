// Single-header JSON serializer & parser (nlohmann/json compatible)
#pragma once
#include <cctype>
#include <cstddef>
#include <cstdlib>
#include <iomanip>
#include <initializer_list>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <variant>
#include <vector>

namespace nlohmann {

class json {
public:
    using object_t = std::map<std::string, json>;
    using array_t = std::vector<json>;

    json() : value_(nullptr) {}
    json(std::nullptr_t) : value_(nullptr) {}
    json(bool v) : value_(v) {}
    json(int v) : value_(static_cast<double>(v)) {}
    json(unsigned int v) : value_(static_cast<double>(v)) {}
    json(long v) : value_(static_cast<double>(v)) {}
    json(unsigned long v) : value_(static_cast<double>(v)) {}
    json(long long v) : value_(static_cast<double>(v)) {}
    json(unsigned long long v) : value_(static_cast<double>(v)) {}
    json(float v) : value_(static_cast<double>(v)) {}
    json(double v) : value_(v) {}
    json(const char* v) : value_(std::string(v ? v : "")) {}
    json(const std::string& v) : value_(v) {}
    json(std::string&& v) : value_(std::move(v)) {}
    json(const object_t& v) : value_(v) {}
    json(object_t&& v) : value_(std::move(v)) {}
    json(const array_t& v) : value_(v) {}
    json(array_t&& v) : value_(std::move(v)) {}

    // Support nested initializer list:
    // e.g. json j = { {"Status", "passed"}, {"Code", 200} };
    json(std::initializer_list<json> init) {
        bool is_key_value = (init.size() > 0);
        for (const auto& item : init) {
            if (!item.is_array() || item.size() != 2 || !item[0].is_string()) {
                is_key_value = false;
                break;
            }
        }
        if (is_key_value) {
            object_t obj;
            for (const auto& item : init) {
                obj[item[0].get<std::string>()] = item[1];
            }
            value_ = std::move(obj);
        } else {
            array_t arr;
            for (const auto& item : init) {
                arr.push_back(item);
            }
            value_ = std::move(arr);
        }
    }

    static json object() { return json(object_t{}); }
    static json array() { return json(array_t{}); }

    bool is_null() const { return std::holds_alternative<std::nullptr_t>(value_); }
    bool is_boolean() const { return std::holds_alternative<bool>(value_); }
    bool is_number() const { return std::holds_alternative<double>(value_); }
    bool is_string() const { return std::holds_alternative<std::string>(value_); }
    bool is_object() const { return std::holds_alternative<object_t>(value_); }
    bool is_array() const { return std::holds_alternative<array_t>(value_); }

    size_t size() const {
        if (is_object()) return std::get<object_t>(value_).size();
        if (is_array()) return std::get<array_t>(value_).size();
        return 0;
    }

    bool empty() const {
        if (is_object()) return std::get<object_t>(value_).empty();
        if (is_array()) return std::get<array_t>(value_).empty();
        if (is_string()) return std::get<std::string>(value_).empty();
        return is_null();
    }

    bool contains(const std::string& key) const {
        if (!is_object()) return false;
        const auto& obj = std::get<object_t>(value_);
        return obj.find(key) != obj.end();
    }

    json& operator[](const std::string& key) {
        if (!is_object()) value_ = object_t{};
        return std::get<object_t>(value_)[key];
    }

    const json& operator[](const std::string& key) const {
        if (!is_object()) {
            static const json null_json;
            return null_json;
        }
        const auto& obj = std::get<object_t>(value_);
        auto it = obj.find(key);
        if (it != obj.end()) return it->second;
        static const json null_json;
        return null_json;
    }

    json& operator[](size_t index) {
        if (!is_array()) value_ = array_t{};
        auto& arr = std::get<array_t>(value_);
        if (index >= arr.size()) arr.resize(index + 1);
        return arr[index];
    }

    const json& operator[](size_t index) const {
        if (!is_array()) {
            static const json null_json;
            return null_json;
        }
        const auto& arr = std::get<array_t>(value_);
        if (index < arr.size()) return arr[index];
        static const json null_json;
        return null_json;
    }

    void push_back(const json& val) {
        if (!is_array()) value_ = array_t{};
        std::get<array_t>(value_).push_back(val);
    }

    template <typename T>
    T get() const {
        if constexpr (std::is_same_v<T, std::string>) {
            if (is_string()) return std::get<std::string>(value_);
            if (is_number()) {
                std::ostringstream ss;
                ss << std::get<double>(value_);
                return ss.str();
            }
            if (is_boolean()) return std::get<bool>(value_) ? "true" : "false";
            return "";
        } else if constexpr (std::is_same_v<T, bool>) {
            if (is_boolean()) return std::get<bool>(value_);
            if (is_number()) return std::get<double>(value_) != 0.0;
            return false;
        } else if constexpr (std::is_integral_v<T>) {
            if (is_number()) return static_cast<T>(std::get<double>(value_));
            if (is_string()) {
                try { return static_cast<T>(std::stoll(std::get<std::string>(value_))); } catch (...) { return 0; }
            }
            return 0;
        } else if constexpr (std::is_floating_point_v<T>) {
            if (is_number()) return static_cast<T>(std::get<double>(value_));
            if (is_string()) {
                try { return static_cast<T>(std::stod(std::get<std::string>(value_))); } catch (...) { return 0.0; }
            }
            return 0.0;
        } else {
            return T{};
        }
    }

    // Overloads for string/char* to prevent template array deduction issues
    std::string value(const std::string& key, const char* fallback) const {
        return value(key, std::string(fallback ? fallback : ""));
    }

    std::string value(const std::string& key, const std::string& fallback) const {
        if (!is_object()) return fallback;
        const auto& obj = std::get<object_t>(value_);
        auto it = obj.find(key);
        if (it == obj.end()) return fallback;
        if (it->second.is_string()) return it->second.get<std::string>();
        return fallback;
    }

    template <typename T>
    T value(const std::string& key, const T& fallback) const {
        if (!is_object()) return fallback;
        const auto& obj = std::get<object_t>(value_);
        auto it = obj.find(key);
        if (it == obj.end()) return fallback;
        return it->second.get<T>();
    }

    const object_t& get_object() const {
        static const object_t empty_obj;
        return is_object() ? std::get<object_t>(value_) : empty_obj;
    }

    const array_t& get_array() const {
        static const array_t empty_arr;
        return is_array() ? std::get<array_t>(value_) : empty_arr;
    }

    std::string dump(int indent = -1) const {
        std::ostringstream out;
        write(out, indent, 0);
        return out.str();
    }

    static json parse(const std::string& input) {
        Parser parser(input);
        json result = parser.read_value();
        parser.skip_space();
        return result;
    }

private:
    using storage_t = std::variant<std::nullptr_t, bool, double, std::string, object_t, array_t>;
    storage_t value_;

    static void write_string(std::ostringstream& out, const std::string& s) {
        out << '"';
        for (unsigned char ch : s) {
            switch (ch) {
                case '"': out << "\\\""; break;
                case '\\': out << "\\\\"; break;
                case '\b': out << "\\b"; break;
                case '\f': out << "\\f"; break;
                case '\n': out << "\\n"; break;
                case '\r': out << "\\r"; break;
                case '\t': out << "\\t"; break;
                default:
                    if (ch < 0x20) out << "\\u00" << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(ch);
                    else out << static_cast<char>(ch);
            }
        }
        out << '"';
    }

    void write(std::ostringstream& out, int indent, int current_level) const {
        if (is_null()) {
            out << "null";
        } else if (is_boolean()) {
            out << (std::get<bool>(value_) ? "true" : "false");
        } else if (is_number()) {
            double num = std::get<double>(value_);
            if (num == static_cast<long long>(num) && std::abs(num) < 1e14) {
                out << static_cast<long long>(num);
            } else {
                std::ostringstream ss;
                ss << std::setprecision(10) << num;
                std::string s = ss.str();
                out << s;
            }
        } else if (is_string()) {
            write_string(out, std::get<std::string>(value_));
        } else if (is_object()) {
            const auto& obj = std::get<object_t>(value_);
            if (obj.empty()) {
                out << "{}";
                return;
            }
            out << "{";
            bool first = true;
            for (const auto& pair : obj) {
                if (!first) out << ",";
                first = false;
                if (indent >= 0) {
                    out << "\n" << std::string((current_level + 1) * indent, ' ');
                }
                write_string(out, pair.first);
                out << (indent >= 0 ? ": " : ":");
                pair.second.write(out, indent, current_level + 1);
            }
            if (indent >= 0) {
                out << "\n" << std::string(current_level * indent, ' ');
            }
            out << "}";
        } else if (is_array()) {
            const auto& arr = std::get<array_t>(value_);
            if (arr.empty()) {
                out << "[]";
                return;
            }
            out << "[";
            bool first = true;
            for (const auto& item : arr) {
                if (!first) out << ",";
                first = false;
                if (indent >= 0) {
                    out << "\n" << std::string((current_level + 1) * indent, ' ');
                }
                item.write(out, indent, current_level + 1);
            }
            if (indent >= 0) {
                out << "\n" << std::string(current_level * indent, ' ');
            }
            out << "]";
        }
    }

    class Parser {
    public:
        explicit Parser(const std::string& input) : input_(input) {}

        void skip_space() {
            while (pos_ < input_.size()) {
                char c = input_[pos_];
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    ++pos_;
                } else {
                    break;
                }
            }
        }

        json read_value() {
            skip_space();
            if (pos_ >= input_.size()) return nullptr;
            char c = input_[pos_];
            if (c == '{') return read_object();
            if (c == '[') return read_array();
            if (c == '"') return json(read_string());
            if (c == 't' || c == 'f') return read_bool();
            if (c == 'n') return read_null();
            if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return read_number();
            return nullptr;
        }

    private:
        const std::string& input_;
        size_t pos_ = 0;

        std::string read_string() {
            ++pos_; // skip opening "
            std::string s;
            while (pos_ < input_.size()) {
                char c = input_[pos_++];
                if (c == '"') return s;
                if (c == '\\' && pos_ < input_.size()) {
                    char esc = input_[pos_++];
                    switch (esc) {
                        case '"': s.push_back('"'); break;
                        case '\\': s.push_back('\\'); break;
                        case '/': s.push_back('/'); break;
                        case 'b': s.push_back('\b'); break;
                        case 'f': s.push_back('\f'); break;
                        case 'n': s.push_back('\n'); break;
                        case 'r': s.push_back('\r'); break;
                        case 't': s.push_back('\t'); break;
                        default: s.push_back(esc); break;
                    }
                } else {
                    s.push_back(c);
                }
            }
            return s;
        }

        json read_object() {
            ++pos_; // skip {
            object_t obj;
            skip_space();
            if (pos_ < input_.size() && input_[pos_] == '}') {
                ++pos_;
                return json(obj);
            }
            while (pos_ < input_.size()) {
                skip_space();
                if (pos_ >= input_.size() || input_[pos_] != '"') break;
                std::string key = read_string();
                skip_space();
                if (pos_ < input_.size() && input_[pos_] == ':') ++pos_;
                json val = read_value();
                obj[key] = val;
                skip_space();
                if (pos_ < input_.size() && input_[pos_] == ',') {
                    ++pos_;
                } else if (pos_ < input_.size() && input_[pos_] == '}') {
                    ++pos_;
                    break;
                } else {
                    break;
                }
            }
            return json(obj);
        }

        json read_array() {
            ++pos_; // skip [
            array_t arr;
            skip_space();
            if (pos_ < input_.size() && input_[pos_] == ']') {
                ++pos_;
                return json(arr);
            }
            while (pos_ < input_.size()) {
                json val = read_value();
                arr.push_back(val);
                skip_space();
                if (pos_ < input_.size() && input_[pos_] == ',') {
                    ++pos_;
                } else if (pos_ < input_.size() && input_[pos_] == ']') {
                    ++pos_;
                    break;
                } else {
                    break;
                }
            }
            return json(arr);
        }

        json read_bool() {
            if (input_.compare(pos_, 4, "true") == 0) {
                pos_ += 4;
                return json(true);
            }
            if (input_.compare(pos_, 5, "false") == 0) {
                pos_ += 5;
                return json(false);
            }
            return json(false);
        }

        json read_null() {
            if (input_.compare(pos_, 4, "null") == 0) {
                pos_ += 4;
            }
            return json(nullptr);
        }

        json read_number() {
            size_t start = pos_;
            if (input_[pos_] == '-') ++pos_;
            while (pos_ < input_.size() && (std::isdigit(static_cast<unsigned char>(input_[pos_])) ||
                   input_[pos_] == '.' || input_[pos_] == 'e' || input_[pos_] == 'E' ||
                   input_[pos_] == '+' || input_[pos_] == '-')) {
                ++pos_;
            }
            double val = std::strtod(input_.substr(start, pos_ - start).c_str(), nullptr);
            return json(val);
        }
    };
};

} // namespace nlohmann
