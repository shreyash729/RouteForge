# RouteForge — Delivery Route Optimization Application
Welcome to RouteForge, a logistics dispatch and route optimization platform built with a high-performance C++ backend engine and an interactive web dashboard. During the staging test cycle, our QA testing team discovered 5 distinct issues affecting routing accuracy, road network constraints, billing calculations, data importing, and batch processing. **As an SDE**, your objective is to investigate the C++ backend engine, diagnose the root causes, resolve each defect, and verify your fixes through the live logistics UI and automated test suite.

## Bugs Information:

### Bug 1: Suboptimal Delivery Route Selection
**Bug Description:** The QA team reported that the routing engine occasionally selects an inefficient route between certain network locations, choosing a longer highway path when a shorter sequence of connecting roads is available.

**How User Can See It in UI:** Select delivery `DEL_01` (Warehouse `WH_01` to Depot `LOC_D`) in the Deliveries table and click **Optimize This Delivery** or **Optimize Routes**. The map and route details show a 20.0 km route with 2 stops and an inflated cost of `$ 62.50`, bypassing a viable 14.0 km path across intermediate transit hubs.

**Expected Result After the Fix:** The routing engine finds the true optimal route totaling 14.0 km across 4 stops, reducing the estimated cost to `$ 52.00`.

---

### Bug 2: Vehicle Traversal Against One-Way Road Restrictions
**Bug Description:** QA testing identified a safety compliance issue where vehicles are being routed in reverse direction through one-way road corridors.

**How User Can See It in UI:** In the Deliveries table, select delivery `DEL_02` (Origin: `LOC_F`, Destination: `LOC_G`). The road connecting these locations is marked as one-way from `LOC_G` to `LOC_F`. However, the engine plans a route for `DEL_02` with status `Planned`, traversing the restricted one-way road backwards.

**Expected Result After the Fix:** The engine respects road directionality constraints. Delivery `DEL_02` is flagged as `Unreachable`, and the UI displays an unreachable alert indicating that no legal directed path exists.

---

### Bug 3: Inaccurate Delivery Mileage Pricing
**Bug Description:** During billing audits, QA noticed that delivery costs for certain trips do not match the documented pricing formula, resulting in rounding discrepancies on routes with fractional distances.

**How User Can See It in UI:** Select delivery `DEL_03` (Origin: `WH_01`, Destination: `LOC_G`), which has a planned distance of 8.5 km. Under standard rates (`$ 12.50` base + `$ 1.75`/km), the expected cost is `$ 27.38`, but the cost summary displays `$ 26.50`.

**Expected Result After the Fix:** The cost calculation maintains full decimal precision according to the documented formula, correctly yielding `$ 27.38` for the delivery.

---

### Bug 4: Import Failure on CSV Records with Empty Optional Fields
**Bug Description:** The QA team observed that importing customer delivery datasets fails or drops records when optional fields such as delivery priority are left blank, even though the specification defines priority as optional with a default value.

**How User Can See It in UI:** Click **Import Dataset**, select **Sample CSV (With Empty Priority)**, and click **Parse and Import**. Two valid records (`DEL_102` and `DEL_105`) that omit the optional priority field are rejected, and the Diagnostics panel reports validation errors for those rows.

**Expected Result After the Fix:** The parser accepts valid rows with empty optional fields, applies the documented default priority (`NORMAL`), and successfully imports all records into the deliveries table.

---

### Bug 5: Batch Optimization Skips the Final Request
**Bug Description:** In end-of-day dispatch testing, QA reported that running batch optimization across multiple delivery requests consistently leaves the last delivery unprocessed.

**How User Can See It in UI:** On the default scenario with 6 deliveries, click the **Optimize Routes** button in the header. Only 5 of the 6 deliveries are processed, and the final request (`DEL_06`: `LOC_B` to `LOC_C`) remains in `Pending` status.

**Expected Result After the Fix:** Batch optimization processes all requests in the collection, updating all valid requests to `Planned` status.

---


