// RouteForge — Logistics Dashboard Client Logic
// Strictly uses relative fetch calls per Execution Engine standards: fetch('api/...')

(function() {
    'use strict';

    // Application State
    let appState = {
        service_status: "CONNECTING",
        locations: [],
        roads: [],
        deliveries: [],
        kpis: {},
        selected_delivery_id: "DEL_01",
        selected_route: {},
        diagnostics: {
            recent_logs: [],
            validation_errors: [],
            last_batch_summary: {}
        }
    };

    let activeFilter = 'all';
    let searchQuery = '';
    let activeDiagTab = 'route-json';
    let isDiagnosticsCollapsed = false;

    // Map view parameters for zoom/pan
    let mapZoom = 1.0;
    const baseViewBox = { x: 50, y: 50, width: 750, height: 480 };

    // DOM Elements
    const elements = {
        // KPIs
        kpiActiveVal: document.getElementById('kpi-active-val'),
        kpiDistanceVal: document.getElementById('kpi-distance-val'),
        kpiCostVal: document.getElementById('kpi-cost-val'),
        kpiUnassignedVal: document.getElementById('kpi-unassigned-val'),

        // Map
        routeMapSvg: document.getElementById('route-map'),
        svgRoadsBg: document.getElementById('svg-roads-bg'),
        svgRoadsActive: document.getElementById('svg-roads-active'),
        svgNodes: document.getElementById('svg-nodes'),
        svgStops: document.getElementById('svg-stops'),
        mapRouteIndicator: document.getElementById('map-indicator-text'),
        mapUnreachableAlert: document.getElementById('map-unreachable-alert'),
        mapUnreachableMsg: document.getElementById('map-unreachable-msg'),
        btnZoomIn: document.getElementById('btn-zoom-in'),
        btnZoomOut: document.getElementById('btn-zoom-out'),
        btnZoomReset: document.getElementById('btn-zoom-reset'),

        // Selected Route Details
        routeDetailDelId: document.getElementById('route-detail-del-id'),
        routeDetailStatus: document.getElementById('route-detail-status'),
        routeOriginName: document.getElementById('route-origin-name'),
        routeDestName: document.getElementById('route-dest-name'),
        routeDetailDist: document.getElementById('route-detail-dist'),
        routeDetailCost: document.getElementById('route-detail-cost'),
        routeDetailStopsCount: document.getElementById('route-detail-stops-count'),
        routeStopsTimeline: document.getElementById('route-stops-timeline'),
        costBaseFee: document.getElementById('cost-base-fee'),
        costDistCalc: document.getElementById('cost-dist-calc'),
        costDistanceRate: document.getElementById('cost-distance-rate'),
        costPrioName: document.getElementById('cost-prio-name'),
        costPrioSurcharge: document.getElementById('cost-prio-surcharge'),
        costTotalAmount: document.getElementById('cost-total-amount'),
        btnOptimizeCurrent: document.getElementById('btn-optimize-current'),

        // Deliveries Table
        deliveriesTableBody: document.getElementById('deliveries-table-body'),
        deliverySearchInput: document.getElementById('delivery-search-input'),
        navDeliveriesCount: document.getElementById('nav-deliveries-count'),
        filterPills: document.querySelectorAll('.tab-pill'),

        // Filter Counts
        countFilterAll: document.getElementById('count-filter-all'),
        countFilterPlanned: document.getElementById('count-filter-planned'),
        countFilterPending: document.getElementById('count-filter-pending'),
        countFilterUnreachable: document.getElementById('count-filter-unreachable'),
        countFilterFailed: document.getElementById('count-filter-failed'),

        // Header Actions
        btnOptimizeAll: document.getElementById('btn-optimize-all'),
        btnImportDataset: document.getElementById('btn-import-dataset'),
        btnResetScenario: document.getElementById('btn-reset-scenario'),

        // Diagnostics
        diagnosticsToggle: document.getElementById('diagnostics-toggle'),
        diagnosticsBody: document.getElementById('diagnostics-body'),
        diagStatusBadge: document.getElementById('diag-status-badge'),
        diagRouteJsonText: document.getElementById('diag-route-json-text'),
        diagEngineLogsList: document.getElementById('diag-engine-logs-list'),
        diagInputDataText: document.getElementById('diag-input-data-text'),
        diagValidationList: document.getElementById('diag-validation-list'),
        btnCopyRouteJson: document.getElementById('btn-copy-route-json'),
        btnClearLogs: document.getElementById('btn-clear-logs'),
        diagTabs: document.querySelectorAll('.diag-tab'),

        // Modal
        modalImport: document.getElementById('modal-import'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelImport: document.getElementById('btn-cancel-import'),
        btnSubmitImport: document.getElementById('btn-submit-import'),
        csvInputArea: document.getElementById('csv-input-area'),
        btnPresetDefault: document.getElementById('btn-preset-default'),
        btnPresetCsvOptional: document.getElementById('btn-preset-csv-optional'),
        btnPresetFractional: document.getElementById('btn-preset-fractional'),

        // Sidebar Navigation
        navItems: document.querySelectorAll('.nav-item'),

        // Toast Container
        toastContainer: document.getElementById('toast-container')
    };

    // Initialize Application
    async function init() {
        bindEvents();
        await fetchState();
        setInterval(fetchState, 4000); // Periodic live poll
    }

    // Fetch Full System State from C++ Engine
    async function fetchState() {
        try {
            // Relative endpoint without leading slash
            const response = await fetch('api/state');
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const data = await response.json();
            appState = data;
            renderAll();
        } catch (error) {
            console.error('Failed to fetch state from C++ backend:', error);
            if (elements.diagStatusBadge) {
                elements.diagStatusBadge.textContent = 'Engine Offline';
                elements.diagStatusBadge.style.backgroundColor = 'rgba(244, 63, 94, 0.2)';
                elements.diagStatusBadge.style.color = '#f43f5e';
            }
        }
    }

    // Main Render Pipeline
    function renderAll() {
        renderKPIs();
        renderMap();
        renderRouteDetails();
        renderDeliveriesTable();
        renderDiagnostics();
    }

    // 1. Render KPI Cards
    function renderKPIs() {
        const kpis = appState.kpis || {};
        elements.kpiActiveVal.textContent = kpis.active_deliveries ?? 0;
        elements.kpiDistanceVal.textContent = `${Number(kpis.total_planned_distance_km || 0).toFixed(1)} km`;
        elements.kpiCostVal.textContent = `$ ${Number(kpis.estimated_delivery_cost || 0).toFixed(2)}`;
        elements.kpiUnassignedVal.textContent = kpis.unassigned_deliveries ?? 0;

        if (elements.navDeliveriesCount) {
            elements.navDeliveriesCount.textContent = (appState.deliveries || []).length;
        }

        // Update table filter badge counts
        const dels = appState.deliveries || [];
        const counts = { all: dels.length, planned: 0, pending: 0, unreachable: 0, failed: 0 };
        dels.forEach(d => {
            const st = (d.status || '').toLowerCase();
            if (counts[st] !== undefined) counts[st]++;
        });

        elements.countFilterAll.textContent = counts.all;
        elements.countFilterPlanned.textContent = counts.planned;
        elements.countFilterPending.textContent = counts.pending;
        elements.countFilterUnreachable.textContent = counts.unreachable;
        elements.countFilterFailed.textContent = counts.failed;
    }

    // 2. Render Interactive SVG Map
    function renderMap() {
        const locations = appState.locations || [];
        const roads = appState.roads || [];
        const selectedRoute = appState.selected_route || {};
        const activePath = selectedRoute.path || [];

        // Map location lookup
        const locMap = {};
        locations.forEach(loc => { locMap[loc.id] = loc; });

        // Update view badge
        elements.mapRouteIndicator.textContent = `Viewing ${appState.selected_delivery_id || 'Route'}`;

        // Handle Unreachable State banner
        if (selectedRoute.status === 'Unreachable' || selectedRoute.success === false) {
            elements.mapUnreachableAlert.classList.remove('hidden');
            elements.mapUnreachableMsg.textContent = selectedRoute.error_message ||
                `Destination ${selectedRoute.destination_id} cannot be reached from ${selectedRoute.origin_id} via directed network roads.`;
        } else {
            elements.mapUnreachableAlert.classList.add('hidden');
        }

        // --- Render Background Roads ---
        let roadsBgHtml = '';
        roads.forEach(road => {
            const from = locMap[road.from_id];
            const to = locMap[road.to_id];
            if (!from || !to) return;

            const isOneWay = !road.is_bidirectional;
            const lineClass = isOneWay ? 'road-oneway-line' : 'road-bg-line';
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            roadsBgHtml += `
                <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
                      class="${lineClass}"
                      ${isOneWay ? 'marker-end="url(#arrow-oneway)"' : ''} />
                <text x="${midX}" y="${midY - 4}" class="road-label">${road.distance_km.toFixed(1)} km</text>
            `;
        });
        elements.svgRoadsBg.innerHTML = roadsBgHtml;

        // --- Render Active Route Highlight ---
        let activeRoadsHtml = '';
        if (selectedRoute.success && activePath.length > 1) {
            for (let i = 0; i < activePath.length - 1; i++) {
                const u = locMap[activePath[i]];
                const v = locMap[activePath[i + 1]];
                if (u && v) {
                    activeRoadsHtml += `
                        <line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}"
                              class="road-active-line"
                              marker-end="url(#arrow-selected)" />
                    `;
                }
            }
        }
        elements.svgRoadsActive.innerHTML = activeRoadsHtml;

        // --- Render Nodes ---
        let nodesHtml = '';
        locations.forEach(loc => {
            const isWarehouse = loc.is_warehouse;
            const isInActivePath = activePath.includes(loc.id);

            nodesHtml += `
                <g class="map-node" data-id="${loc.id}" transform="translate(${loc.x}, ${loc.y})">
                    ${isWarehouse ? `
                        <rect x="-14" y="-14" width="28" height="28" rx="6" class="node-wh-circle" />
                        <text x="0" y="4" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="bold">WH</text>
                    ` : `
                        <circle cx="0" cy="0" r="10" class="node-cust-circle" style="${isInActivePath ? 'stroke:#2563eb; stroke-width:4.5;' : ''}" />
                    `}
                    <text x="0" y="${isWarehouse ? 26 : 22}" class="node-text">${loc.id}</text>
                </g>
            `;
        });
        elements.svgNodes.innerHTML = nodesHtml;

        // --- Render Numbered Stop Markers along Route ---
        let stopsHtml = '';
        if (selectedRoute.success && activePath.length > 0) {
            activePath.forEach((stopId, idx) => {
                const loc = locMap[stopId];
                if (!loc) return;
                const stopLabel = idx === 0 ? 'START' : idx === activePath.length - 1 ? 'DROP' : `#${idx}`;
                stopsHtml += `
                    <g transform="translate(${loc.x + 14}, ${loc.y - 14})">
                        <rect x="-14" y="-9" width="28" height="18" rx="9" class="stop-marker-badge" />
                        <text x="0" y="4" class="stop-marker-text">${stopLabel}</text>
                    </g>
                `;
            });
        }
        elements.svgStops.innerHTML = stopsHtml;
    }

    // 3. Render Selected Route Details Panel
    function renderRouteDetails() {
        const delId = appState.selected_delivery_id || 'None';
        const selectedRoute = appState.selected_route || {};
        const delivery = (appState.deliveries || []).find(d => d.id === delId) || {};

        elements.routeDetailDelId.textContent = `Delivery: ${delId}`;

        // Status Badge
        const status = selectedRoute.status || delivery.status || 'Pending';
        elements.routeDetailStatus.textContent = status;
        elements.routeDetailStatus.className = `status-badge badge-${status.toLowerCase()}`;

        // Origin and Destination Names
        const locMap = {};
        (appState.locations || []).forEach(l => { locMap[l.id] = l.name; });

        elements.routeOriginName.textContent = `${delivery.origin_id || selectedRoute.origin_id || 'WH_01'} (${locMap[delivery.origin_id] || 'Origin'})`;
        elements.routeDestName.textContent = `${delivery.destination_id || selectedRoute.destination_id || '-'} (${locMap[delivery.destination_id] || 'Destination'})`;

        // Metrics
        const distance = selectedRoute.total_distance_km ?? delivery.planned_distance_km ?? 0.0;
        const cost = selectedRoute.estimated_cost ?? delivery.estimated_cost ?? 0.0;
        const stopsCount = (selectedRoute.path || delivery.path_stops || []).length;

        elements.routeDetailDist.textContent = `${Number(distance).toFixed(1)} km`;
        elements.routeDetailCost.textContent = `$ ${Number(cost).toFixed(2)}`;
        elements.routeDetailStopsCount.textContent = stopsCount > 0 ? `${stopsCount} stops` : '0 stops';

        // Stops Timeline
        const path = selectedRoute.path || delivery.path_stops || [];
        if (path.length > 0) {
            elements.routeStopsTimeline.innerHTML = path.map((stop, i) => `
                <div class="timeline-step">
                    <span class="step-num">${i + 1}</span>
                    <span class="step-name">${stop} - ${locMap[stop] || 'Network Hub'}</span>
                    <span class="step-dist">${i === 0 ? 'Origin' : i === path.length - 1 ? 'Destination' : 'Transit'}</span>
                </div>
            `).join('');
        } else {
            elements.routeStopsTimeline.innerHTML = `
                <div style="font-size:0.8rem; color:#94a3b8; padding:8px 0;">No path computed for this delivery request.</div>
            `;
        }

        // Cost Breakdown Card
        const baseFee = selectedRoute.base_fee || 12.50;
        const distCost = selectedRoute.distance_cost || 0.0;
        const prioSurcharge = selectedRoute.priority_surcharge || 0.0;
        const prioName = delivery.priority || 'NORMAL';

        elements.costBaseFee.textContent = `$ ${Number(baseFee).toFixed(2)}`;
        elements.costDistCalc.textContent = `${Number(distance).toFixed(1)} km × $1.75`;
        elements.costDistanceRate.textContent = `$ ${Number(distCost).toFixed(2)}`;
        elements.costPrioName.textContent = prioName;
        elements.costPrioSurcharge.textContent = `$ ${Number(prioSurcharge).toFixed(2)}`;
        elements.costTotalAmount.textContent = `$ ${Number(cost).toFixed(2)}`;
    }

    // 4. Render Deliveries Management Table
    function renderDeliveriesTable() {
        const deliveries = appState.deliveries || [];
        const query = searchQuery.trim().toLowerCase();

        const filtered = deliveries.filter(d => {
            // Status Tab Filter
            if (activeFilter !== 'all' && (d.status || '').toLowerCase() !== activeFilter) {
                return false;
            }
            // Text Search Filter
            if (query) {
                const matchId = (d.id || '').toLowerCase().includes(query);
                const matchOrigin = (d.origin_id || '').toLowerCase().includes(query);
                const matchDest = (d.destination_id || '').toLowerCase().includes(query);
                const matchPrio = (d.priority || '').toLowerCase().includes(query);
                return matchId || matchOrigin || matchDest || matchPrio;
            }
            return true;
        });

        if (filtered.length === 0) {
            elements.deliveriesTableBody.innerHTML = `
                <tr><td colspan="9" style="text-align:center; padding:32px; color:#94a3b8;">No matching delivery requests found.</td></tr>
            `;
            return;
        }

        elements.deliveriesTableBody.innerHTML = filtered.map(d => {
            const isSelected = d.id === appState.selected_delivery_id;
            const prioClass = `prio-${(d.priority || 'NORMAL').toLowerCase()}`;
            const statusClass = `badge-${(d.status || 'Pending').toLowerCase()}`;
            const stopsCount = (d.path_stops || []).length;

            return `
                <tr class="${isSelected ? 'row-selected' : ''}" data-id="${d.id}">
                    <td><strong>${d.id}</strong></td>
                    <td>${d.origin_id}</td>
                    <td>${d.destination_id}</td>
                    <td><span class="prio-badge ${prioClass}">${d.priority}</span></td>
                    <td class="mono-num">${d.planned_distance_km ? `${d.planned_distance_km.toFixed(1)} km` : '-'}</td>
                    <td class="mono-num">${d.estimated_cost ? `$ ${d.estimated_cost.toFixed(2)}` : '-'}</td>
                    <td><span class="status-badge ${statusClass}">${d.status}</span></td>
                    <td>${stopsCount > 0 ? `${stopsCount} stops` : '-'}</td>
                    <td class="text-right">
                        <button class="btn btn-xs btn-outline btn-select-row" data-id="${d.id}">View</button>
                        <button class="btn btn-xs btn-primary btn-opt-row" data-id="${d.id}">Optimize</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 5. Render Diagnostics Console
    function renderDiagnostics() {
        const diag = appState.diagnostics || {};

        // Tab: Route JSON
        elements.diagRouteJsonText.textContent = JSON.stringify(appState.selected_route || {}, null, 2);

        // Tab: Engine Output Logs
        const logs = diag.recent_logs || [];
        if (logs.length > 0) {
            elements.diagEngineLogsList.innerHTML = logs.map(log => {
                let cssClass = 'log-entry';
                if (log.includes('[ROUTER]')) cssClass += ' log-router';
                else if (log.includes('[BATCH]')) cssClass += ' log-batch';
                else if (log.includes('[VALIDATION]')) cssClass += ' log-validation';
                else cssClass += ' log-engine';
                return `<div class="${cssClass}">${escapeHtml(log)}</div>`;
            }).join('');
            elements.diagEngineLogsList.scrollTop = elements.diagEngineLogsList.scrollHeight;
        } else {
            elements.diagEngineLogsList.innerHTML = `<div class="log-entry">// No log messages received yet.</div>`;
        }

        // Tab: Graph & Input Data
        elements.diagInputDataText.textContent = JSON.stringify({
            nodes_count: (appState.locations || []).length,
            roads_count: (appState.roads || []).length,
            locations: appState.locations,
            roads: appState.roads,
            active_delivery_request: (appState.deliveries || []).find(d => d.id === appState.selected_delivery_id)
        }, null, 2);

        // Tab: Validation Errors
        const errors = diag.validation_errors || [];
        if (errors.length > 0) {
            elements.diagValidationList.innerHTML = errors.map(err => `
                <div class="validation-item">⚠️ ${escapeHtml(err)}</div>
            `).join('');
        } else {
            elements.diagValidationList.innerHTML = `
                <div style="font-size:0.8rem; color:#10b981; padding:8px 12px; background:rgba(16,185,129,0.1); border-radius:4px;">
                    ✅ All road endpoints and active delivery requests validated without structural errors.
                </div>
            `;
        }
    }

    // Event Bindings
    function bindEvents() {
        // Table Selection
        elements.deliveriesTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row) return;
            const delId = row.getAttribute('data-id');
            if (!delId) return;

            if (e.target.classList.contains('btn-opt-row')) {
                optimizeSingle(delId);
            } else {
                selectDelivery(delId);
            }
        });

        // Filter Pills
        elements.filterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                elements.filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activeFilter = pill.getAttribute('data-filter') || 'all';
                renderDeliveriesTable();
            });
        });

        // Search Input
        elements.deliverySearchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderDeliveriesTable();
        });

        // Optimize Current Delivery Button
        elements.btnOptimizeCurrent.addEventListener('click', () => {
            if (appState.selected_delivery_id) {
                optimizeSingle(appState.selected_delivery_id);
            }
        });

        // Header Action: Optimize All (Batch)
        elements.btnOptimizeAll.addEventListener('click', async () => {
            elements.btnOptimizeAll.disabled = true;
            elements.btnOptimizeAll.textContent = 'Optimizing Batch...';
            try {
                const res = await fetch('api/optimize_batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                showToast(`Batch optimization complete: ${data.successful_routes} planned, ${data.unreachable_destinations} unreachable. Total: ${data.total_requests}`, 'success');
                await fetchState();
            } catch (err) {
                showToast(`Batch optimization failed: ${err.message}`, 'error');
            } finally {
                elements.btnOptimizeAll.disabled = false;
                elements.btnOptimizeAll.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span>Optimize Routes</span>
                `;
            }
        });

        // Header Action: Reset Scenario
        elements.btnResetScenario.addEventListener('click', async () => {
            try {
                await fetch('api/reset', { method: 'POST' });
                showToast('Scenario successfully reset to default logistics network.', 'info');
                await fetchState();
            } catch (err) {
                showToast(`Failed to reset scenario: ${err.message}`, 'error');
            }
        });

        // Diagnostics Accordion Toggle
        elements.diagnosticsToggle.addEventListener('click', () => {
            isDiagnosticsCollapsed = !isDiagnosticsCollapsed;
            elements.diagnosticsBody.classList.toggle('collapsed', isDiagnosticsCollapsed);
        });

        // Diagnostics Tabs
        elements.diagTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.diagTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-diag');

                document.querySelectorAll('.diag-content-pane').forEach(p => p.classList.remove('active'));
                const pane = document.getElementById(`pane-${target}`);
                if (pane) pane.classList.add('active');
            });
        });

        // Copy Route JSON
        elements.btnCopyRouteJson.addEventListener('click', () => {
            const text = elements.diagRouteJsonText.textContent;
            navigator.clipboard.writeText(text).then(() => {
                showToast('Route JSON copied to clipboard!', 'success');
            });
        });

        // Clear Engine Logs View
        elements.btnClearLogs.addEventListener('click', () => {
            elements.diagEngineLogsList.innerHTML = `<div class="log-entry">// Logs cleared from display.</div>`;
        });

        // Map Zoom Controls
        elements.btnZoomIn.addEventListener('click', () => updateMapZoom(0.85));
        elements.btnZoomOut.addEventListener('click', () => updateMapZoom(1.15));
        elements.btnZoomReset.addEventListener('click', () => {
            mapZoom = 1.0;
            elements.routeMapSvg.setAttribute('viewBox', `${baseViewBox.x} ${baseViewBox.y} ${baseViewBox.width} ${baseViewBox.height}`);
        });

        // Import Dataset Modal
        elements.btnImportDataset.addEventListener('click', () => {
            elements.modalImport.classList.remove('hidden');
        });
        elements.btnCloseModal.addEventListener('click', () => {
            elements.modalImport.classList.add('hidden');
        });
        elements.btnCancelImport.addEventListener('click', () => {
            elements.modalImport.classList.add('hidden');
        });

        // Presets in Import Modal
        elements.btnPresetDefault.addEventListener('click', () => {
            elements.csvInputArea.value = 
`id,origin,destination,priority,notes
DEL_01,WH_01,LOC_D,HIGH,Priority freight
DEL_02,LOC_F,LOC_G,NORMAL,One-way corridor test
DEL_03,WH_01,LOC_G,NORMAL,Port cargo
DEL_04,WH_01,LOC_H,LOW,Local depot restock
DEL_05,WH_01,LOC_ISO,URGENT,Isolated outpost package
DEL_06,LOC_B,LOC_C,NORMAL,Inter-hub transfer`;
        });

        elements.btnPresetCsvOptional.addEventListener('click', () => {
            elements.csvInputArea.value = 
`id,origin,destination,priority,notes
DEL_101,WH_01,LOC_B,HIGH,Medical vaccines
DEL_102,WH_01,LOC_C,,Standard retail shipment (empty priority)
DEL_103,LOC_B,LOC_D,NORMAL,Consumer appliances
DEL_104,LOC_C,LOC_E,URGENT,Fresh produce
DEL_105,WH_01,LOC_F,,Industrial hardware (empty priority)`;
        });

        elements.btnPresetFractional.addEventListener('click', () => {
            elements.csvInputArea.value = 
`id,origin,destination,priority,notes
DEL_FRAC_01,WH_01,LOC_G,NORMAL,Fractional distance corridor (8.5 km)
DEL_FRAC_02,WH_01,LOC_E,NORMAL,South corridor delivery (11.2 km)`;
        });

        // Submit Import
        elements.btnSubmitImport.addEventListener('click', async () => {
            const content = elements.csvInputArea.value.trim();
            if (!content) {
                showToast('Please enter or select CSV dataset content', 'error');
                return;
            }

            try {
                const res = await fetch('api/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ format: 'csv', content: content })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`Imported ${data.imported_count} delivery records successfully!`, 'success');
                    elements.modalImport.classList.add('hidden');
                    await fetchState();
                } else {
                    showToast(`Dataset import encountered ${data.errors_count || 1} errors. Check diagnostics.`, 'error');
                    await fetchState();
                }
            } catch (err) {
                showToast(`Failed to parse dataset: ${err.message}`, 'error');
            }
        });
    }

    // Zoom Helper
    function updateMapZoom(factor) {
        mapZoom *= factor;
        const currentVb = elements.routeMapSvg.viewBox.baseVal;
        const newW = baseViewBox.width * mapZoom;
        const newH = baseViewBox.height * mapZoom;
        const newX = baseViewBox.x + (baseViewBox.width - newW) / 2;
        const newY = baseViewBox.y + (baseViewBox.height - newH) / 2;
        elements.routeMapSvg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
    }

    // Select Delivery Request
    async function selectDelivery(deliveryId) {
        try {
            await fetch('api/select_delivery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delivery_id: deliveryId })
            });
            await fetchState();
        } catch (err) {
            console.error('Failed to select delivery:', err);
        }
    }

    // Optimize Single Delivery Request
    async function optimizeSingle(deliveryId) {
        try {
            const res = await fetch('api/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delivery_id: deliveryId })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Route optimized for ${deliveryId}: ${data.distance_km.toFixed(1)} km ($${data.cost.toFixed(2)})`, 'success');
            } else {
                showToast(`Route optimization for ${deliveryId}: ${data.status || 'Failed'}`, 'error');
            }
            await fetchState();
        } catch (err) {
            showToast(`Optimization failed: ${err.message}`, 'error');
        }
    }

    // Toast Notifications
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3800);
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Boot on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
