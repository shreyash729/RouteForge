#pragma once
#include <string>

namespace routeforge {

struct Road {
    std::string id;
    std::string from_id;
    std::string to_id;
    double distance_km = 0.0;
    bool is_bidirectional = true;
    int speed_limit_kmh = 50;
};

} // namespace routeforge
