#include "service/route_planner.hpp"
#include <queue>
#include <unordered_map>
#include <unordered_set>
#include <limits>
#include <algorithm>

namespace routeforge {

struct QueueNode {
    double distance;
    std::string id;

    bool operator>(const QueueNode& other) const {
        return distance > other.distance;
    }
};

RouteResult RoutePlanner::plan_route(const Graph& graph,
                                     const std::string& origin_id,
                                     const std::string& destination_id) const {
    RouteResult result;
    result.origin_id = origin_id;
    result.destination_id = destination_id;

    if (!graph.has_location(origin_id)) {
        result.success = false;
        result.status = DeliveryStatus::FAILED;
        result.error_message = "Unknown origin location: " + origin_id;
        return result;
    }

    if (!graph.has_location(destination_id)) {
        result.success = false;
        result.status = DeliveryStatus::FAILED;
        result.error_message = "Unknown destination location: " + destination_id;
        return result;
    }

    if (origin_id == destination_id) {
        result.success = true;
        result.status = DeliveryStatus::PLANNED;
        result.path = {origin_id};
        result.total_distance_km = 0.0;
        return result;
    }

    // Dijkstra's Algorithm
    std::unordered_map<std::string, double> dist;
    std::unordered_map<std::string, std::string> prev;
    std::unordered_set<std::string> visited;

    std::priority_queue<QueueNode, std::vector<QueueNode>, std::greater<QueueNode>> pq;

    for (const auto& pair : graph.get_locations()) {
        dist[pair.first] = std::numeric_limits<double>::infinity();
    }

    dist[origin_id] = 0.0;
    pq.push({0.0, origin_id});

    while (!pq.empty()) {
        QueueNode current = pq.top();
        pq.pop();

        std::string u = current.id;
        double d = current.distance;

        // If we found the destination, we can break early
        if (u == destination_id) {
            break;
        }

        if (d > dist[u]) {
            continue;
        }

        for (const auto& road : graph.get_roads_from(u)) {
            const std::string& v = road.to_id;
            double weight = road.distance_km;

            // =========================================================================
            // BUG 1 (Intentional): Incorrect Dijkstra Relaxation / Premature Visited Marking
            // The algorithm marks `v` as visited upon first queue insertion (like in BFS)
            // instead of when popped from the priority queue.
            // As a result, if a suboptimal direct edge (e.g., A -> D = 20 km) is examined
            // first, `D` is marked visited, preventing subsequent relaxation from discovering
            // the shorter path via intermediate hubs (e.g., A -> B -> C -> D = 14 km).
            //
            // Candidate fix:
            // Remove `visited.insert(v)` below, and instead mark/check visited when `u` is
            // popped from `pq`, or rely strictly on standard distance relaxation:
            //
            // if (dist[u] + weight < dist[v]) {
            //     dist[v] = dist[u] + weight;
            //     prev[v] = u;
            //     pq.push({dist[v], v});
            // }
            // =========================================================================
            if (visited.find(v) != visited.end()) {
                continue;
            }

            if (dist[u] + weight < dist[v]) {
                dist[v] = dist[u] + weight;
                prev[v] = u;
                pq.push({dist[v], v});
                visited.insert(v); // <-- BUG: Prematurely marks neighbor visited at insertion time!
            }
        }
    }

    // Check if destination was reached
    if (dist[destination_id] == std::numeric_limits<double>::infinity()) {
        result.success = false;
        result.status = DeliveryStatus::UNREACHABLE;
        result.error_message = "Destination " + destination_id + " is unreachable from " + origin_id;
        return result;
    }

    // Reconstruct ordered path
    std::vector<std::string> path;
    for (std::string at = destination_id; !at.empty(); at = prev[at]) {
        path.push_back(at);
        if (at == origin_id) break;
    }
    std::reverse(path.begin(), path.end());

    if (path.empty() || path.front() != origin_id) {
        result.success = false;
        result.status = DeliveryStatus::UNREACHABLE;
        result.error_message = "Failed to reconstruct path from " + origin_id + " to " + destination_id;
        return result;
    }

    result.success = true;
    result.status = DeliveryStatus::PLANNED;
    result.path = path;
    result.total_distance_km = dist[destination_id];

    return result;
}

} // namespace routeforge
