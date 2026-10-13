#pragma once
#include <string>

namespace routeforge {

struct Location {
    std::string id;
    std::string name;
    double x = 0.0;
    double y = 0.0;
    bool is_warehouse = false;
};

} // namespace routeforge
