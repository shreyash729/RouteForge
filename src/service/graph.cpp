#include "service/graph.hpp"
#include <algorithm>
#include <sstream>

namespace routeforge {

const std::vector<Road> Graph::empty_roads_{};

void Graph::add_location(const Location& loc) {
    if (loc.id.empty()) return;
    locations_[loc.id] = loc;
}

bool Graph::has_location(const std::string& id) const {
    return locations_.find(id) != locations_.end();
}

const Location* Graph::get_location(const std::string& id) const {
    auto it = locations_.find(id);
    if (it != locations_.end()) {
        return &it->second;
    }
    return nullptr;
}

const std::unordered_map<std::string, Location>& Graph::get_locations() const {
    return locations_;
}

void Graph::add_road(const Road& road) {
    if (road.from_id.empty() || road.to_id.empty() || road.distance_km < 0.0) {
        return;
    }
    roads_.push_back(road);
    adjacency_[road.from_id].push_back(road);

   
    Road reverse_road = road;
    reverse_road.id = road.id + "_rev";
    reverse_road.from_id = road.to_id;
    reverse_road.to_id = road.from_id;
    adjacency_[road.to_id].push_back(reverse_road);
}

const std::vector<Road>& Graph::get_roads_from(const std::string& from_id) const {
    auto it = adjacency_.find(from_id);
    if (it != adjacency_.end()) {
        return it->second;
    }
    return empty_roads_;
}

const std::vector<Road>& Graph::get_all_roads() const {
    return roads_;
}

void Graph::clear() {
    locations_.clear();
    adjacency_.clear();
    roads_.clear();
}

std::vector<std::string> Graph::validate_graph() const {
    std::vector<std::string> issues;

    for (const auto& road : roads_) {
        if (!has_location(road.from_id)) {
            issues.push_back("Road " + road.id + " references unknown origin: " + road.from_id);
        }
        if (!has_location(road.to_id)) {
            issues.push_back("Road " + road.id + " references unknown destination: " + road.to_id);
        }
        if (road.distance_km < 0.0) {
            issues.push_back("Road " + road.id + " has negative distance: " + std::to_string(road.distance_km));
        }
    }

    for (const auto& pair : locations_) {
        const auto& id = pair.first;
        bool has_edges = (adjacency_.find(id) != adjacency_.end() && !adjacency_.at(id).empty());
        if (!has_edges) {
            // Check if any road leads to it
            bool has_incoming = false;
            for (const auto& r : roads_) {
                if (r.to_id == id || (r.from_id == id && r.is_bidirectional)) {
                    has_incoming = true;
                    break;
                }
            }
            if (!has_incoming) {
                issues.push_back("Location " + id + " is disconnected from the network.");
            }
        }
    }

    return issues;
}

} // namespace routeforge
