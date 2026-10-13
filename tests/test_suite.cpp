#include "json.hpp"
#include "service/graph.hpp"
#include "service/route_planner.hpp"
#include "service/cost_calculator.hpp"
#include "service/csv_parser.hpp"
#include "service/batch_processor.hpp"

#include <iostream>
#include <chrono>
#include <vector>
#include <string>
#include <functional>
#include <cmath>

using json = nlohmann::json;
using namespace routeforge;

struct TestCase {
    std::string name;
    std::function<void()> test_fn;
};

// Helper to create a standard test graph
Graph create_base_test_graph() {
    Graph g;
    g.add_location(Location{"WH_A", "Warehouse A", 100, 100, true});
    g.add_location(Location{"LOC_B", "Location B", 200, 100, false});
    g.add_location(Location{"LOC_C", "Location C", 300, 100, false});
    g.add_location(Location{"LOC_D", "Location D", 400, 100, false});
    g.add_location(Location{"LOC_ISO", "Isolated Node", 800, 800, false});

    // Suboptimal direct road added first
    g.add_road(Road{"RD_DIRECT", "WH_A", "LOC_D", 20.0, true, 60});
    // Multi-hop optimal route: 5 + 5 + 4 = 14 km
    g.add_road(Road{"RD_AB", "WH_A", "LOC_B", 5.0, true, 50});
    g.add_road(Road{"RD_BC", "LOC_B", "LOC_C", 5.0, true, 50});
    g.add_road(Road{"RD_CD", "LOC_C", "LOC_D", 4.0, true, 50});

    return g;
}

int main() {
    std::vector<TestCase> test_cases;

    // --- TEST 1: Dijkstra Shortest Path Relaxation (Bug 1) ---
    test_cases.push_back({"test_shortest_path_dijkstra_relaxation", []() {
        Graph g = create_base_test_graph();
        RoutePlanner planner;
        RouteResult res = planner.plan_route(g, "WH_A", "LOC_D");

        if (!res.success) {
            throw std::runtime_error("Route planning failed unexpectedly: " + res.error_message);
        }
        if (std::abs(res.total_distance_km - 14.0) > 0.001) {
            throw std::runtime_error("Expected optimal route distance 14.0 km (via B and C), but got " +
                                     std::to_string(res.total_distance_km) + " km (suboptimal direct road selected)");
        }
        if (res.path.size() != 4) {
            throw std::runtime_error("Expected 4 stops along optimal route (WH_A -> LOC_B -> LOC_C -> LOC_D)");
        }
    }});

    // --- TEST 2: Directed Roads Used in Reverse (Bug 2) ---
    test_cases.push_back({"test_one_way_road_traversal_direction", []() {
        Graph g;
        g.add_location(Location{"GATE_IN", "Entry Gate", 100, 100, false});
        g.add_location(Location{"GATE_OUT", "Exit Gate", 200, 200, false});

        // One-way road from GATE_IN to GATE_OUT (is_bidirectional = false)
        g.add_road(Road{"RD_ONEWAY", "GATE_IN", "GATE_OUT", 8.0, false, 40});

        RoutePlanner planner;
        // Attempting to travel against the one-way road
        RouteResult reverse_res = planner.plan_route(g, "GATE_OUT", "GATE_IN");

        if (reverse_res.success || reverse_res.status != DeliveryStatus::UNREACHABLE) {
            throw std::runtime_error("One-way road was illegally traversed in reverse direction. Expected UNREACHABLE.");
        }
    }});

    // --- TEST 3: Delivery Cost Fractional Precision (Bug 3) ---
    test_cases.push_back({"test_cost_calculation_fractional_precision", []() {
        CostCalculator calculator; // base_fee = 12.50, rate_per_km = 1.75
        double distance = 14.5;    // Fractional distance
        CostBreakdown cost = calculator.calculate_cost(distance, Priority::NORMAL);

        // Expected: 12.50 + (14.5 * 1.75) + 0.00 = 12.50 + 25.375 = 37.875
        double expected_cost = 12.50 + (14.5 * 1.75);
        if (std::abs(cost.total_cost - expected_cost) > 0.001) {
            throw std::runtime_error("Expected delivery cost " + std::to_string(expected_cost) +
                                     ", but got " + std::to_string(cost.total_cost) +
                                     " (premature integer truncation detected)");
        }
    }});

    // --- TEST 4: CSV Handling of Empty Optional Fields (Bug 4) ---
    test_cases.push_back({"test_csv_parser_empty_optional_fields", []() {
        CsvParser parser;
        std::string csv_data =
            "id,origin,destination,priority,notes\n"
            "DEL_OPT_01,WH_A,LOC_B,,Standard delivery with empty priority\n";

        CsvParseResult res = parser.parse_deliveries(csv_data);

        if (res.deliveries.empty()) {
            std::string err = res.errors.empty() ? "Unknown rejection" : res.errors[0];
            throw std::runtime_error("CSV parser erroneously rejected row with empty optional priority field: " + err);
        }
        if (res.deliveries[0].priority != Priority::NORMAL) {
            throw std::runtime_error("Empty priority field should default to Priority::NORMAL");
        }
    }});

    // --- TEST 5: Batch Processor Indexing & Boundary Coverage (Bug 5) ---
    test_cases.push_back({"test_batch_processor_boundary_coverage", []() {
        Graph g = create_base_test_graph();
        CostCalculator calc;
        BatchProcessor processor;

        std::vector<Delivery> batch = {
            Delivery{"DEL_1", "WH_A", "LOC_B", Priority::NORMAL},
            Delivery{"DEL_2", "LOC_B", "LOC_C", Priority::NORMAL},
            Delivery{"DEL_3", "LOC_C", "LOC_D", Priority::NORMAL},
            Delivery{"DEL_4", "WH_A", "LOC_C", Priority::HIGH}
        };

        BatchSummary summary = processor.process_batch(batch, g, calc);

        if (summary.results.size() != 4) {
            throw std::runtime_error("Expected 4 processed delivery results, but only processed " +
                                     std::to_string(summary.results.size()) +
                                     " (final delivery in collection was skipped due to off-by-one error)");
        }
        if (batch[3].status == DeliveryStatus::PENDING) {
            throw std::runtime_error("The final delivery request in the batch was left in PENDING status");
        }
    }});



    // --- RUN & AGGREGATE RESULTS ---
    json report;
    int passed = 0;
    int failed = 0;
    auto suite_start = std::chrono::steady_clock::now();

    for (const auto& tc : test_cases) {
        auto t_start = std::chrono::steady_clock::now();
        try {
            tc.test_fn();
            auto t_end = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(t_end - t_start).count();
            report[tc.name]["Status"] = "passed";
            report[tc.name]["Execution time"] = std::to_string(elapsed) + "ms";
            passed++;
        } catch (const std::exception& ex) {
            auto t_end = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(t_end - t_start).count();
            report[tc.name]["Status"] = "failed";
            report[tc.name]["Execution time"] = std::to_string(elapsed) + "ms";
            report[tc.name]["Error"] = ex.what();
            failed++;
        }
    }

    auto suite_end = std::chrono::steady_clock::now();
    auto total_ms = std::chrono::duration_cast<std::chrono::milliseconds>(suite_end - suite_start).count();

    report["Passed"] = passed;
    report["Failed"] = failed;
    report["Total bugs"] = 5; // 5 intentional bugs
    report["total"] = static_cast<int>(test_cases.size());
    report["passed"] = passed;
    report["failed"] = failed;
    report["Total Execution time"] = std::to_string(total_ms) + "ms";

    // Output pure JSON to stdout
    std::cout << report.dump(2) << std::endl;

    // Return non-zero if any test failed
    return (failed == 0) ? 0 : 1;
}
