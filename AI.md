# AI.md — RouteForge Architecture & Bug Crux Reference

## 1. Problem Overview

**RouteForge** is a production-grade C++ logistics and delivery route optimization platform with an interactive web dashboard. Dispatchers manage delivery requests, visualize road network topology, calculate shortest-path routes, estimate delivery costs, and process batches of deliveries.

The application serves as a realistic debugging challenge adhering to the **`cpp-cmake` Execution Engine** architecture standard:
- **Backend:** C++17 modular service layer compiled into a static library (`core_services`) and exposed via an embedded single-header HTTP server (`httplib.h` in `src/main.cpp` listening on `0.0.0.0:8080`).
- **Frontend:** Vanilla HTML5/CSS/JS dashboard in `public/` using an interactive SVG map (no external map dependencies) and relative API endpoints (`fetch('api/state')`).
- **Testing:** Lightweight, native zero-dependency test runner in `tests/test_suite.cpp` emitting pure schema-compliant JSON to `stdout`.

---

## 2. Crux of Intentional Bugs & File Locations

### Bug 1: Premature Dijkstra Visited Marking
- **File:** `src/service/route_planner.cpp`
- **Crux:** In Dijkstra's algorithm, neighbor nodes are marked as `visited` upon insertion into the priority queue (`visited.insert(v)`) rather than when popped from the queue. If a suboptimal direct edge (e.g., `WH_01 → LOC_D` = 20.0 km) is inspected first, `LOC_D` is locked in the `visited` set prematurely, preventing subsequent distance relaxation when the shorter path (`WH_01 → LOC_B → LOC_C → LOC_D` = 14.0 km) is explored.
- **Fix:** Remove premature visited insertion at queue push time; check/mark visited only when nodes are popped from the priority queue.
- **Associated Test:** `test_shortest_path_dijkstra_relaxation`

---

### Bug 2: Unconditional Reverse Edges for One-Way Roads
- **File:** `src/service/graph.cpp`
- **Crux:** In `Graph::add_road()`, the engine unconditionally creates and inserts a reverse road edge into the adjacency list, completely ignoring the `road.is_bidirectional` boolean flag. This causes strictly directed one-way roads (e.g., `LOC_G → LOC_F`) to be treated as bidirectional roads, allowing illegal reverse traversal.
- **Fix:** Guard the reverse edge insertion with `if (road.is_bidirectional) { ... }`.
- **Associated Test:** `test_one_way_road_traversal_direction`

---

### Bug 3: Integer Truncation in Fractional Mileage Cost Calculation
- **File:** `src/service/cost_calculator.cpp`
- **Crux:** In `CostCalculator::calculate_cost()`, `distance_km` is cast to an integer (`int int_distance = static_cast<int>(distance_km);`) prior to rate multiplication. This discards fractional kilometers (e.g., 8.5 km is truncated to 8 km), producing incorrect mileage charges and totals.
- **Fix:** Multiply using full floating-point precision: `breakdown.distance_cost = distance_km * config_.rate_per_km;`.
- **Associated Test:** `test_cost_calculation_fractional_precision`

---

### Bug 4: Rejection of Valid CSV Rows with Empty Optional Fields
- **File:** `src/service/csv_parser.cpp`
- **Crux:** In `CsvParser::parse_deliveries()`, the parser checks `if (tokens.size() > 3 && tokens[3].empty())` and misclassifies an empty optional `priority` column as a missing required field, logging an error and skipping the entire row instead of falling back to the default priority (`Priority::NORMAL`).
- **Fix:** When `tokens[3]` is empty or omitted, set `delivery.priority = Priority::NORMAL;` and continue parsing the record.
- **Associated Test:** `test_csv_parser_empty_optional_fields`

---

### Bug 5: Off-by-One Loop Termination in Batch Processor
- **File:** `src/service/batch_processor.cpp`
- **Crux:** In `BatchProcessor::process_batch()`, the loop termination condition is written as `for (size_t i = 0; i < deliveries.size() - 1; ++i)`. The off-by-one boundary causes the final delivery request in any batch collection to be skipped, leaving it in `Pending` status.
- **Fix:** Change loop condition to `for (size_t i = 0; i < deliveries.size(); ++i)`.
- **Associated Test:** `test_batch_processor_boundary_coverage`
