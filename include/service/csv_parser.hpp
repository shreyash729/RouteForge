#pragma once
#include <string>
#include <vector>
#include "model/delivery.hpp"

namespace routeforge {

struct CsvParseResult {
    std::vector<Delivery> deliveries;
    std::vector<std::string> errors;
    std::vector<std::string> warnings;
    size_t total_rows_read = 0;
};

class CsvParser {
public:
    CsvParser() = default;

    CsvParseResult parse_deliveries(const std::string& csv_content) const;

private:
    static std::vector<std::string> split_line(const std::string& line);
    static std::string trim(const std::string& str);
};

} // namespace routeforge
