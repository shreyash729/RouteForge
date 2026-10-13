#include "httplib.h"
#include "json.hpp"
#include "model/location.hpp"
#include "model/road.hpp"
#include "model/delivery.hpp"
#include "model/route_result.hpp"
#include "service/graph.hpp"
#include "service/route_planner.hpp"
#include "service/cost_calculator.hpp"
#include "service/csv_parser.hpp"
#include "service/batch_processor.hpp"

#include <iostream>
#include <cstdlib>
#include <mutex>
#include <chrono>
#include <iomanip>

using json = nlohmann::json;
using namespace routeforge;

class RouteForgeApp {
public:
    RouteForgeApp() {
        reset_to_default_scenario();
    }

    void reset_to_default_scenario() {
        std::lock_guard<std::mutex> lock(mutex_);
        graph_.clear();
        deliveries_.clear();
        diagnostics_logs_.clear();
        validation_errors_.clear();
        selected_delivery_id_ = "DEL_01";
        selected_route_ = RouteResult{};
        last_batch_summary_ = BatchSummary{};

        log_event("ENGINE", "Resetting system scenario to default logistics network.");

        // 1. Locations
        graph_.add_location(Location{"WH_01", "Central Distribution Center", 220, 260, true});
        graph_.add_location(Location{"LOC_B", "North Distribution Hub", 380, 150, false});
        graph_.add_location(Location{"LOC_C", "East Logistics Park", 540, 220, false});
        graph_.add_location(Location{"LOC_D", "South-East Depot", 500, 380, false});
        graph_.add_location(Location{"LOC_E", "South Terminal", 320, 440, false});
        graph_.add_location(Location{"LOC_F", "West Industrial Zone", 140, 380, false});
        graph_.add_location(Location{"LOC_G", "North-West Port", 150, 140, false});
        graph_.add_location(Location{"LOC_H", "Central Metro Center", 340, 280, false});
        graph_.add_location(Location{"LOC_ISO", "Isolated Mountain Outpost", 720, 120, false});

        // 2. Roads
        // Notice: Suboptimal direct road added first for Bug 1 demonstration
        graph_.add_road(Road{"RD_DIRECT", "WH_01", "LOC_D", 20.0, true, 65});
        graph_.add_road(Road{"RD_01", "WH_01", "LOC_B", 5.0, true, 50});
        graph_.add_road(Road{"RD_02", "LOC_B", "LOC_C", 5.0, true, 50});
        graph_.add_road(Road{"RD_03", "LOC_C", "LOC_D", 4.0, true, 50});

        // One-way road for Bug 2 demonstration (LOC_G -> LOC_F is allowed, LOC_F -> LOC_G is forbidden)
        graph_.add_road(Road{"RD_ONEWAY", "LOC_G", "LOC_F", 12.0, false, 45});

        // Other network links
        graph_.add_road(Road{"RD_05", "WH_01", "LOC_G", 8.5, true, 55});  // Fractional distance for Bug 3
        graph_.add_road(Road{"RD_06", "WH_01", "LOC_E", 11.2, true, 50});
        graph_.add_road(Road{"RD_07", "LOC_E", "LOC_D", 9.8, true, 50});
        graph_.add_road(Road{"RD_08", "WH_01", "LOC_H", 6.0, true, 40});
        graph_.add_road(Road{"RD_09", "LOC_H", "LOC_C", 7.5, true, 50});

        // 3. Default Deliveries
        deliveries_.push_back(Delivery{"DEL_01", "WH_01", "LOC_D", Priority::HIGH, 12.0, "Priority retail freight"});
        deliveries_.push_back(Delivery{"DEL_02", "LOC_F", "LOC_G", Priority::NORMAL, 8.5, "Restricted corridor delivery"});
        deliveries_.push_back(Delivery{"DEL_03", "WH_01", "LOC_G", Priority::NORMAL, 15.0, "Port cargo with fractional distance"});
        deliveries_.push_back(Delivery{"DEL_04", "WH_01", "LOC_H", Priority::LOW, 4.0, "Local depot restock"});
        deliveries_.push_back(Delivery{"DEL_05", "WH_01", "LOC_ISO", Priority::URGENT, 2.5, "High-priority remote outpost package"});
        deliveries_.push_back(Delivery{"DEL_06", "LOC_B", "LOC_C", Priority::NORMAL, 20.0, "Inter-hub container dispatch"});

        validation_errors_ = graph_.validate_graph();
        log_event("GRAPH", "Network loaded with " + std::to_string(graph_.get_locations().size()) +
                           " locations and " + std::to_string(graph_.get_all_roads().size()) + " roads.");

        // Automatically calculate initial route preview for DEL_01
        internal_optimize_single("DEL_01");
    }

    json get_state_json() {
        std::lock_guard<std::mutex> lock(mutex_);
        json state;

        // Service & Engine info
        state["service_status"] = "ONLINE";
        state["engine_version"] = "RouteForge C++ v2.4.0-prod";

        // Locations
        json locs = json::array();
        for (const auto& pair : graph_.get_locations()) {
            const auto& loc = pair.second;
            json l;
            l["id"] = loc.id;
            l["name"] = loc.name;
            l["x"] = loc.x;
            l["y"] = loc.y;
            l["is_warehouse"] = loc.is_warehouse;
            locs.push_back(l);
        }
        state["locations"] = locs;

        // Roads
        json roads = json::array();
        for (const auto& road : graph_.get_all_roads()) {
            json r;
            r["id"] = road.id;
            r["from_id"] = road.from_id;
            r["to_id"] = road.to_id;
            r["distance_km"] = road.distance_km;
            r["is_bidirectional"] = road.is_bidirectional;
            r["speed_limit_kmh"] = road.speed_limit_kmh;
            roads.push_back(r);
        }
        state["roads"] = roads;

        // Deliveries & KPIs
        json dels = json::array();
        int active_count = 0;
        int unassigned_count = 0;
        double total_distance = 0.0;
        double total_cost = 0.0;

        for (const auto& d : deliveries_) {
            json item;
            item["id"] = d.id;
            item["origin_id"] = d.origin_id;
            item["destination_id"] = d.destination_id;
            item["priority"] = priority_to_string(d.priority);
            item["package_weight_kg"] = d.package_weight_kg;
            item["notes"] = d.notes;
            item["status"] = status_to_string(d.status);
            item["planned_distance_km"] = d.planned_distance_km;
            item["estimated_cost"] = d.estimated_cost;
            item["error_message"] = d.error_message;

            json stops = json::array();
            for (const auto& stop : d.path_stops) stops.push_back(stop);
            item["path_stops"] = stops;

            if (d.status == DeliveryStatus::PLANNED) {
                active_count++;
                total_distance += d.planned_distance_km;
                total_cost += d.estimated_cost;
            } else {
                unassigned_count++;
            }

            dels.push_back(item);
        }
        state["deliveries"] = dels;

        // KPIs
        json kpi;
        kpi["active_deliveries"] = active_count;
        kpi["unassigned_deliveries"] = unassigned_count;
        kpi["total_planned_distance_km"] = total_distance;
        kpi["estimated_delivery_cost"] = total_cost;
        state["kpis"] = kpi;

        // Selected delivery & route
        state["selected_delivery_id"] = selected_delivery_id_;
        json route_json;
        route_json["delivery_id"] = selected_route_.delivery_id;
        route_json["origin_id"] = selected_route_.origin_id;
        route_json["destination_id"] = selected_route_.destination_id;
        route_json["success"] = selected_route_.success;
        route_json["status"] = status_to_string(selected_route_.status);
        route_json["total_distance_km"] = selected_route_.total_distance_km;
        route_json["estimated_cost"] = selected_route_.estimated_cost;
        route_json["base_fee"] = selected_route_.base_fee;
        route_json["distance_cost"] = selected_route_.distance_cost;
        route_json["priority_surcharge"] = selected_route_.priority_surcharge;
        route_json["error_message"] = selected_route_.error_message;

        json path_stops = json::array();
        for (const auto& p : selected_route_.path) path_stops.push_back(p);
        route_json["path"] = path_stops;

        json warnings = json::array();
        for (const auto& w : selected_route_.warnings) warnings.push_back(w);
        route_json["warnings"] = warnings;
        state["selected_route"] = route_json;

        // Diagnostics
        json diag;
        json logs = json::array();
        for (const auto& l : diagnostics_logs_) logs.push_back(l);
        diag["recent_logs"] = logs;

        json errs = json::array();
        for (const auto& e : validation_errors_) errs.push_back(e);
        diag["validation_errors"] = errs;

        json batch_s;
        batch_s["total_requests"] = static_cast<int>(last_batch_summary_.total_requests);
        batch_s["successful_routes"] = static_cast<int>(last_batch_summary_.successful_routes);
        batch_s["unreachable_destinations"] = static_cast<int>(last_batch_summary_.unreachable_destinations);
        batch_s["failed_requests"] = static_cast<int>(last_batch_summary_.failed_requests);
        batch_s["aggregate_distance_km"] = last_batch_summary_.aggregate_distance_km;
        batch_s["aggregate_cost"] = last_batch_summary_.aggregate_cost;
        diag["last_batch_summary"] = batch_s;

        state["diagnostics"] = diag;

        return state;
    }

    json optimize_single(const std::string& delivery_id) {
        std::lock_guard<std::mutex> lock(mutex_);
        return internal_optimize_single(delivery_id);
    }

    json optimize_batch() {
        std::lock_guard<std::mutex> lock(mutex_);
        log_event("BATCH", "Initiating batch optimization for " + std::to_string(deliveries_.size()) + " requests.");

        BatchProcessor processor;
        last_batch_summary_ = processor.process_batch(deliveries_, graph_, cost_calculator_);

        log_event("BATCH", "Batch optimization concluded: " +
                           std::to_string(last_batch_summary_.successful_routes) + " planned, " +
                           std::to_string(last_batch_summary_.unreachable_destinations) + " unreachable, " +
                           std::to_string(last_batch_summary_.failed_requests) + " failed. Total processed: " +
                           std::to_string(last_batch_summary_.results.size()) + "/" +
                           std::to_string(last_batch_summary_.total_requests));

        // Update selected route if currently selected delivery was in batch
        for (const auto& res : last_batch_summary_.results) {
            if (res.delivery_id == selected_delivery_id_) {
                selected_route_ = res;
                break;
            }
        }

        json res;
        res["success"] = true;
        res["total_requests"] = static_cast<int>(last_batch_summary_.total_requests);
        res["successful_routes"] = static_cast<int>(last_batch_summary_.successful_routes);
        res["unreachable_destinations"] = static_cast<int>(last_batch_summary_.unreachable_destinations);
        res["failed_requests"] = static_cast<int>(last_batch_summary_.failed_requests);
        res["aggregate_distance_km"] = last_batch_summary_.aggregate_distance_km;
        res["aggregate_cost"] = last_batch_summary_.aggregate_cost;
        return res;
    }

    json select_delivery(const std::string& delivery_id) {
        std::lock_guard<std::mutex> lock(mutex_);
        selected_delivery_id_ = delivery_id;
        for (const auto& d : deliveries_) {
            if (d.id == delivery_id) {
                selected_route_ = planner_.plan_route(graph_, d.origin_id, d.destination_id);
                selected_route_.delivery_id = d.id;
                if (selected_route_.success) {
                    CostBreakdown cost = cost_calculator_.calculate_cost(selected_route_.total_distance_km, d.priority);
                    selected_route_.estimated_cost = cost.total_cost;
                    selected_route_.base_fee = cost.base_fee;
                    selected_route_.distance_cost = cost.distance_cost;
                    selected_route_.priority_surcharge = cost.priority_surcharge;
                }
                break;
            }
        }
        json res;
        res["selected_delivery_id"] = selected_delivery_id_;
        return res;
    }

    json import_dataset(const std::string& format, const std::string& raw_content) {
        std::lock_guard<std::mutex> lock(mutex_);
        log_event("IMPORT", "Receiving dataset payload (format: " + format + ")");

        if (format == "csv") {
            CsvParser parser;
            CsvParseResult parse_res = parser.parse_deliveries(raw_content);

            for (const auto& err : parse_res.errors) {
                validation_errors_.push_back(err);
                log_event("VALIDATION", "CSV Error: " + err);
            }

            if (!parse_res.deliveries.empty()) {
                deliveries_ = parse_res.deliveries;
                selected_delivery_id_ = deliveries_[0].id;
                internal_optimize_single(selected_delivery_id_);
                log_event("IMPORT", "Successfully imported " + std::to_string(deliveries_.size()) + " deliveries from CSV.");
            }

            json res;
            res["imported_count"] = static_cast<int>(parse_res.deliveries.size());
            res["errors_count"] = static_cast<int>(parse_res.errors.size());
            res["success"] = !parse_res.deliveries.empty();
            return res;
        }

        json res;
        res["success"] = false;
        res["error"] = "Unsupported format: " + format;
        return res;
    }

private:
    std::mutex mutex_;
    Graph graph_;
    std::vector<Delivery> deliveries_;
    RoutePlanner planner_;
    CostCalculator cost_calculator_;
    std::string selected_delivery_id_;
    RouteResult selected_route_;
    BatchSummary last_batch_summary_;
    std::vector<std::string> diagnostics_logs_;
    std::vector<std::string> validation_errors_;

    void log_event(const std::string& category, const std::string& message) {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::tm tm_buf{};
#ifdef _WIN32
        localtime_s(&tm_buf, &time);
#else
        localtime_r(&time, &tm_buf);
#endif
        std::ostringstream ss;
        ss << "[" << std::setfill('0') << std::setw(2) << tm_buf.tm_hour << ":"
           << std::setfill('0') << std::setw(2) << tm_buf.tm_min << ":"
           << std::setfill('0') << std::setw(2) << tm_buf.tm_sec << "] "
           << "[" << category << "] " << message;

        diagnostics_logs_.push_back(ss.str());
        if (diagnostics_logs_.size() > 50) {
            diagnostics_logs_.erase(diagnostics_logs_.begin());
        }
    }

    json internal_optimize_single(const std::string& delivery_id) {
        Delivery* target = nullptr;
        for (auto& d : deliveries_) {
            if (d.id == delivery_id) {
                target = &d;
                break;
            }
        }

        if (!target) {
            json err;
            err["success"] = false;
            err["error"] = "Delivery not found: " + delivery_id;
            return err;
        }

        selected_delivery_id_ = delivery_id;
        log_event("ROUTER", "Computing shortest path for " + delivery_id +
                            " from " + target->origin_id + " to " + target->destination_id);

        selected_route_ = planner_.plan_route(graph_, target->origin_id, target->destination_id);
        selected_route_.delivery_id = delivery_id;

        if (selected_route_.success) {
            CostBreakdown cost = cost_calculator_.calculate_cost(selected_route_.total_distance_km, target->priority);
            selected_route_.estimated_cost = cost.total_cost;
            selected_route_.base_fee = cost.base_fee;
            selected_route_.distance_cost = cost.distance_cost;
            selected_route_.priority_surcharge = cost.priority_surcharge;

            target->status = DeliveryStatus::PLANNED;
            target->planned_distance_km = selected_route_.total_distance_km;
            target->estimated_cost = cost.total_cost;
            target->path_stops = selected_route_.path;
            target->error_message = "";

            log_event("ROUTER", "Route computed: " + std::to_string(selected_route_.total_distance_km) +
                               " km, Cost: $" + std::to_string(cost.total_cost));
        } else if (selected_route_.status == DeliveryStatus::UNREACHABLE) {
            target->status = DeliveryStatus::UNREACHABLE;
            target->planned_distance_km = 0.0;
            target->estimated_cost = 0.0;
            target->path_stops.clear();
            target->error_message = selected_route_.error_message;

            log_event("ROUTER", "Destination unreachable: " + selected_route_.error_message);
        } else {
            target->status = DeliveryStatus::FAILED;
            target->planned_distance_km = 0.0;
            target->estimated_cost = 0.0;
            target->path_stops.clear();
            target->error_message = selected_route_.error_message;

            log_event("ROUTER", "Route planning failed: " + selected_route_.error_message);
        }

        json res;
        res["success"] = selected_route_.success;
        res["delivery_id"] = delivery_id;
        res["status"] = status_to_string(target->status);
        res["distance_km"] = selected_route_.total_distance_km;
        res["cost"] = selected_route_.estimated_cost;
        return res;
    }
};

int main() {
    httplib::Server svr;
    RouteForgeApp app;

    // 1. Mount public directory for CSS/JS/HTML static assets
    svr.set_mount_point("/", "./public");

    // 2. Health & Status APIs
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"status":"ok"})", "application/json");
    });

    // 3. Application State Endpoint (Polled by public/js/app.js)
    svr.Get("/api/state", [&app](const httplib::Request&, httplib::Response& res) {
        json state = app.get_state_json();
        res.set_content(state.dump(), "application/json");
    });

    // 4. Optimize Single Route
    svr.Post("/api/optimize", [&app](const httplib::Request& req, httplib::Response& res) {
        std::string del_id;
        try {
            json body = json::parse(req.body);
            del_id = body.value("delivery_id", "");
        } catch (...) {}

        json result = app.optimize_single(del_id);
        res.set_content(result.dump(), "application/json");
    });

    // 5. Optimize Batch
    svr.Post("/api/optimize_batch", [&app](const httplib::Request&, httplib::Response& res) {
        json result = app.optimize_batch();
        res.set_content(result.dump(), "application/json");
    });

    // 6. Select Delivery
    svr.Post("/api/select_delivery", [&app](const httplib::Request& req, httplib::Response& res) {
        std::string del_id;
        try {
            json body = json::parse(req.body);
            del_id = body.value("delivery_id", "");
        } catch (...) {}

        json result = app.select_delivery(del_id);
        res.set_content(result.dump(), "application/json");
    });

    // 7. Import Dataset
    svr.Post("/api/import", [&app](const httplib::Request& req, httplib::Response& res) {
        std::string format = "csv";
        std::string content = req.body;
        try {
            json body = json::parse(req.body);
            if (body.contains("content")) {
                content = body.value("content", "");
                format = body.value("format", "csv");
            }
        } catch (...) {
            // Raw body payload
        }

        json result = app.import_dataset(format, content);
        res.set_content(result.dump(), "application/json");
    });

    // 8. Reset Scenario
    svr.Post("/api/reset", [&app](const httplib::Request&, httplib::Response& res) {
        app.reset_to_default_scenario();
        json result = {{"status", "reset_ok"}};
        res.set_content(result.dump(), "application/json");
    });

    // 9. Resolve port and BIND TO 0.0.0.0 (blueprint mandatory rule)
    int port = 8080;
    const char* env_port = std::getenv("PORT");
    if (env_port) {
        port = std::atoi(env_port);
    }

    std::cout << "[Server] Listening on 0.0.0.0:" << port << std::endl;
    svr.listen("0.0.0.0", port);

    return 0;
}
