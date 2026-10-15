#include "service/csv_parser.hpp"
#include <sstream>
#include <algorithm>

namespace routeforge {

std::string CsvParser::trim(const std::string& str) {
    size_t start = 0;
    while (start < str.size() && (str[start] == ' ' || str[start] == '\t' || str[start] == '\r' || str[start] == '\n')) {
        ++start;
    }
    size_t end = str.size();
    while (end > start && (str[end - 1] == ' ' || str[end - 1] == '\t' || str[end - 1] == '\r' || str[end - 1] == '\n')) {
        --end;
    }
    return str.substr(start, end - start);
}

std::vector<std::string> CsvParser::split_line(const std::string& line) {
    std::vector<std::string> fields;
    std::string field;
    bool in_quotes = false;

    for (size_t i = 0; i < line.size(); ++i) {
        char c = line[i];
        if (c == '"') {
            in_quotes = !in_quotes;
        } else if (c == ',' && !in_quotes) {
            fields.push_back(trim(field));
            field.clear();
        } else {
            field.push_back(c);
        }
    }
    fields.push_back(trim(field));
    return fields;
}

CsvParseResult CsvParser::parse_deliveries(const std::string& csv_content) const {
    CsvParseResult result;
    std::istringstream stream(csv_content);
    std::string line;
    size_t row_number = 0;
    bool is_first_line = true;

    while (std::getline(stream, line)) {
        std::string trimmed = trim(line);
        if (trimmed.empty()) continue;

        ++row_number;
        std::vector<std::string> tokens = split_line(trimmed);

        if (is_first_line) {
            is_first_line = false;
            // Check if this looks like a header row
            if (!tokens.empty()) {
                std::string first_col = tokens[0];
                std::transform(first_col.begin(), first_col.end(), first_col.begin(), ::tolower);
                if (first_col == "id" || first_col == "delivery_id" || first_col == "deliveryid") {
                    continue; // Skip header
                }
            }
        }

        result.total_rows_read++;

        // Required fields: id, origin, destination
        if (tokens.size() < 3) {
            result.errors.push_back("Row " + std::to_string(row_number) + ": Insufficient columns (expected at least id, origin, destination)");
            continue;
        }

        std::string id = tokens[0];
        std::string origin = tokens[1];
        std::string destination = tokens[2];

        if (id.empty()) {
            result.errors.push_back("Row " + std::to_string(row_number) + ": Missing required delivery ID");
            continue;
        }
        if (origin.empty()) {
            result.errors.push_back("Row " + std::to_string(row_number) + ": Missing required origin for delivery " + id);
            continue;
        }
        if (destination.empty()) {
            result.errors.push_back("Row " + std::to_string(row_number) + ": Missing required destination for delivery " + id);
            continue;
        }

        Delivery delivery;
        delivery.id = id;
        delivery.origin_id = origin;
        delivery.destination_id = destination;

        
        if (tokens.size() > 3 && tokens[3].empty()) {
            result.errors.push_back("Row " + std::to_string(row_number) + ": Missing required priority field");
            continue; // <-- BUG: Skips the valid delivery row instead of defaulting priority to NORMAL!
        } else if (tokens.size() > 3) {
            delivery.priority = string_to_priority(tokens[3]);
        } else {
            delivery.priority = Priority::NORMAL;
        }

        // Optional notes (tokens[4])
        if (tokens.size() > 4) {
            delivery.notes = tokens[4];
        }

        delivery.status = DeliveryStatus::PENDING;
        result.deliveries.push_back(delivery);
    }

    return result;
}

} // namespace routeforge
