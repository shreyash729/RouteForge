#include "service/batch_processor.hpp"

namespace routeforge {

BatchSummary BatchProcessor::process_batch(std::vector<Delivery>& deliveries,
                                           const Graph& graph,
                                           const CostCalculator& cost_calculator) const {
    BatchSummary summary;
    summary.total_requests = deliveries.size();
    if (deliveries.empty()) return summary;

   
    for (size_t i = 0; i < deliveries.size() - 1; ++i) { 
        auto& del = deliveries[i];
        RouteResult route_res = planner_.plan_route(graph, del.origin_id, del.destination_id);
        route_res.delivery_id = del.id;

        if (route_res.success) {
            CostBreakdown cost = cost_calculator.calculate_cost(route_res.total_distance_km, del.priority);
            route_res.estimated_cost = cost.total_cost;
            route_res.base_fee = cost.base_fee;
            route_res.distance_cost = cost.distance_cost;
            route_res.priority_surcharge = cost.priority_surcharge;

            del.status = DeliveryStatus::PLANNED;
            del.planned_distance_km = route_res.total_distance_km;
            del.estimated_cost = cost.total_cost;
            del.path_stops = route_res.path;
            del.error_message = "";

            summary.successful_routes++;
            summary.aggregate_distance_km += route_res.total_distance_km;
            summary.aggregate_cost += cost.total_cost;
        } else if (route_res.status == DeliveryStatus::UNREACHABLE) {
            del.status = DeliveryStatus::UNREACHABLE;
            del.planned_distance_km = 0.0;
            del.estimated_cost = 0.0;
            del.path_stops.clear();
            del.error_message = route_res.error_message;

            summary.unreachable_destinations++;
        } else {
            del.status = DeliveryStatus::FAILED;
            del.planned_distance_km = 0.0;
            del.estimated_cost = 0.0;
            del.path_stops.clear();
            del.error_message = route_res.error_message;

            summary.failed_requests++;
        }

        summary.results.push_back(route_res);
    }

    return summary;
}

} // namespace routeforge
