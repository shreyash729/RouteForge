#pragma once
#include "model/delivery.hpp"

namespace routeforge {

struct CostConfig {
    double base_fee = 12.50;
    double rate_per_km = 1.75;
    double low_priority_surcharge = -2.00;
    double normal_priority_surcharge = 0.00;
    double high_priority_surcharge = 15.00;
    double urgent_priority_surcharge = 30.00;
};

struct CostBreakdown {
    double base_fee = 0.0;
    double distance_cost = 0.0;
    double priority_surcharge = 0.0;
    double total_cost = 0.0;
};

class CostCalculator {
public:
    explicit CostCalculator(CostConfig config = CostConfig()) : config_(config) {}

    CostBreakdown calculate_cost(double distance_km, Priority priority) const;

    const CostConfig& get_config() const { return config_; }
    void set_config(const CostConfig& config) { config_ = config; }

private:
    CostConfig config_;
    double get_priority_surcharge(Priority priority) const;
};

} // namespace routeforge
