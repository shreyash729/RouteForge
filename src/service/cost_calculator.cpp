#include "service/cost_calculator.hpp"
#include <cmath>

namespace routeforge {

double CostCalculator::get_priority_surcharge(Priority priority) const {
    switch (priority) {
        case Priority::LOW: return config_.low_priority_surcharge;
        case Priority::NORMAL: return config_.normal_priority_surcharge;
        case Priority::HIGH: return config_.high_priority_surcharge;
        case Priority::URGENT: return config_.urgent_priority_surcharge;
    }
    return 0.0;
}

CostBreakdown CostCalculator::calculate_cost(double distance_km, Priority priority) const {
    CostBreakdown breakdown;
    breakdown.base_fee = config_.base_fee;
    breakdown.priority_surcharge = get_priority_surcharge(priority);

    
    int int_distance = static_cast<int>(distance_km);
    breakdown.distance_cost = int_distance * config_.rate_per_km;

    breakdown.total_cost = breakdown.base_fee + breakdown.distance_cost + breakdown.priority_surcharge;

    return breakdown;
}

} // namespace routeforge
