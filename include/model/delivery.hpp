#pragma once
#include <string>
#include <vector>

namespace routeforge {

enum class Priority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
};

enum class DeliveryStatus {
    PENDING,
    PLANNED,
    UNREACHABLE,
    FAILED
};

inline std::string priority_to_string(Priority p) {
    switch (p) {
        case Priority::LOW: return "LOW";
        case Priority::NORMAL: return "NORMAL";
        case Priority::HIGH: return "HIGH";
        case Priority::URGENT: return "URGENT";
    }
    return "NORMAL";
}

inline Priority string_to_priority(const std::string& str) {
    if (str == "LOW" || str == "low") return Priority::LOW;
    if (str == "HIGH" || str == "high") return Priority::HIGH;
    if (str == "URGENT" || str == "urgent") return Priority::URGENT;
    return Priority::NORMAL;
}

inline std::string status_to_string(DeliveryStatus s) {
    switch (s) {
        case DeliveryStatus::PENDING: return "Pending";
        case DeliveryStatus::PLANNED: return "Planned";
        case DeliveryStatus::UNREACHABLE: return "Unreachable";
        case DeliveryStatus::FAILED: return "Failed";
    }
    return "Pending";
}

inline DeliveryStatus string_to_status(const std::string& str) {
    if (str == "Planned" || str == "planned") return DeliveryStatus::PLANNED;
    if (str == "Unreachable" || str == "unreachable") return DeliveryStatus::UNREACHABLE;
    if (str == "Failed" || str == "failed") return DeliveryStatus::FAILED;
    return DeliveryStatus::PENDING;
}

struct Delivery {
    std::string id;
    std::string origin_id;
    std::string destination_id;
    Priority priority = Priority::NORMAL;
    double package_weight_kg = 5.0;
    std::string notes = "";
    DeliveryStatus status = DeliveryStatus::PENDING;
    double planned_distance_km = 0.0;
    double estimated_cost = 0.0;
    std::vector<std::string> path_stops;
    std::string error_message = "";
};

} // namespace routeforge
