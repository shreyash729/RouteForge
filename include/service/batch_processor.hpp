#pragma once
#include <vector>
#include "model/delivery.hpp"
#include "model/route_result.hpp"
#include "service/graph.hpp"
#include "service/route_planner.hpp"
#include "service/cost_calculator.hpp"

namespace routeforge {

struct BatchSummary {
    size_t total_requests = 0;
    size_t successful_routes = 0;
    size_t unreachable_destinations = 0;
    size_t failed_requests = 0;
    double aggregate_distance_km = 0.0;
    double aggregate_cost = 0.0;
    std::vector<RouteResult> results;
};

class BatchProcessor {
public:
    BatchProcessor() = default;

    BatchSummary process_batch(std::vector<Delivery>& deliveries,
                               const Graph& graph,
                               const CostCalculator& cost_calculator) const;

private:
    RoutePlanner planner_;
};

} // namespace routeforge
