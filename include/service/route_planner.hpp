#pragma once
#include <string>
#include <vector>
#include "service/graph.hpp"
#include "model/route_result.hpp"

namespace routeforge {

class RoutePlanner {
public:
    RoutePlanner() = default;

    RouteResult plan_route(const Graph& graph,
                           const std::string& origin_id,
                           const std::string& destination_id) const;
};

} // namespace routeforge
