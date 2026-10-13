#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include "model/location.hpp"
#include "model/road.hpp"

namespace routeforge {

class Graph {
public:
    Graph() = default;

    void add_location(const Location& loc);
    bool has_location(const std::string& id) const;
    const Location* get_location(const std::string& id) const;
    const std::unordered_map<std::string, Location>& get_locations() const;

    void add_road(const Road& road);
    const std::vector<Road>& get_roads_from(const std::string& from_id) const;
    const std::vector<Road>& get_all_roads() const;

    void clear();
    std::vector<std::string> validate_graph() const;

private:
    std::unordered_map<std::string, Location> locations_;
    std::unordered_map<std::string, std::vector<Road>> adjacency_;
    std::vector<Road> roads_;
    static const std::vector<Road> empty_roads_;
};

} // namespace routeforge
