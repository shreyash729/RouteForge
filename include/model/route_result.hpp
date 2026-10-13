#pragma once
#include <string>
#include <vector>
#include "model/delivery.hpp"

namespace routeforge {

struct RouteResult {
    bool success = false;
    std::string delivery_id;
    std::string origin_id;
    std::string destination_id;
    std::vector<std::string> path;
    double total_distance_km = 0.0;
    double estimated_cost = 0.0;
    DeliveryStatus status = DeliveryStatus::PENDING;
    std::string error_message;
    std::vector<std::string> warnings;

    // Detailed Cost Breakdown
    double base_fee = 0.0;
    double distance_cost = 0.0;
    double priority_surcharge = 0.0;
};

} // namespace routeforge
