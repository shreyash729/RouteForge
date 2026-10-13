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
    let isDiagnosticsCollapsed = false;
    let showRoadLabels = true;

    // Map Pan & Zoom State
    let viewBox = { x: 50, y: 40, width: 760, height: 480 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let viewStart = { x: 0, y: 0 };

    // DOM Elements
    const elements = {
        // KPIs
        kpiActiveVal: document.getElementById('kpi-active-val'),
        kpiDistanceVal: document.getElementById('kpi-distance-val'),
        kpiCostVal: document.getElementById('kpi-cost-val'),
        kpiUnassignedVal: document.getElementById('kpi-unassigned-val'),

        // Map
        routeMapSvg: document.getElementById('route-map'),
        mapContainer: document.getElementById('map-container'),
        svgRoadsBg: document.getElementById('svg-roads-bg'),
        svgRoadsActive: document.getElementById('svg-roads-active'),
        svgRoadPills: document.getElementById('svg-road-pills'),
        svgNodes: document.getElementById('svg-nodes'),
        svgStops: document.getElementById('svg-stops'),
        mapRouteIndicator: document.getElementById('map-indicator-text'),
        mapUnreachableAlert: document.getElementById('map-unreachable-alert'),
        mapUnreachableMsg: document.getElementById('map-unreachable-msg'),
        mapTooltip: document.getElementById('map-tooltip'),
        tooltipNodeId: document.getElementById('tooltip-node-id'),
        tooltipNodeName: document.getElementById('tooltip-node-name'),
        tooltipNodeRoads: document.getElementById('tooltip-node-roads'),
        btnZoomIn: document.getElementById('btn-zoom-in'),
        btnZoomOut: document.getElementById('btn-zoom-out'),
        btnZoomReset: document.getElementById('btn-zoom-reset'),
        btnCenterRoute: document.getElementById('btn-center-route'),
        btnToggleLabels: document.getElementById('btn-toggle-labels'),

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

        // Sidebar & SPA Layout
        sidebar: document.getElementById('sidebar'),
        appLayout: document.getElementById('app-layout'),
        btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
        navItems: document.querySelectorAll('.nav-item'),
        spaPages: document.querySelectorAll('.spa-page'),

        // Network Topology & Deliveries Page Stats
        roadsTableBody: document.getElementById('roads-table-body'),
        netNodesCount: document.getElementById('net-nodes-count'),
        netRoadsCount: document.getElementById('net-roads-count'),
        netOnewayCount: document.getElementById('net-oneway-count'),
        delivKpiTotal: document.getElementById('deliv-kpi-total'),
        delivKpiPlanned: document.getElementById('deliv-kpi-planned'),
        delivKpiPending: document.getElementById('deliv-kpi-pending'),
        delivKpiUnreachable: document.getElementById('deliv-kpi-unreachable'),

        // Toast Container
        toastContainer: document.getElementById('toast-container')
    };

    // Helper: Wrap async action with button loading spinner animation
    async function withButtonLoading(btn, asyncFn) {
        if (!btn) return asyncFn();
        btn.classList.add('is-loading');
        btn.disabled = true;
        try {
            return await asyncFn();
        } finally {
            btn.classList.remove('is-loading');
            btn.disabled = false;
        }
    }

    // SPA Tab Switching Handler
    function switchTab(tabId) {
        if (!tabId) tabId = 'planner';

        // Update active nav-item
        elements.navItems.forEach(item => {
            const itemTab = item.getAttribute('data-tab');
            item.classList.toggle('active', itemTab === tabId);
        });

        // Update active spa-page
        document.querySelectorAll('.spa-page').forEach(page => {
            const pageTab = page.getAttribute('data-page');
            page.classList.toggle('active', pageTab === tabId);
        });

        // Sync URL hash
        if (window.location.hash.slice(1) !== tabId) {
            history.replaceState(null, null, `#${tabId}`);
        }

        // Auto-fit network if entering planner
        if (tabId === 'planner') {
            setTimeout(() => {
                fitToNetwork();
            }, 60);
        }
    }

    // Sidebar Collapse / Expand Handler
    function toggleSidebar(forceState) {
        if (!elements.sidebar) return;
        const isCollapsed = forceState !== undefined 
            ? forceState 
            : !elements.sidebar.classList.contains('collapsed');

        elements.sidebar.classList.toggle('collapsed', isCollapsed);
        if (elements.appLayout) {
            elements.appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
        }

        try {
            localStorage.setItem('routeforge_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        } catch (e) {}

        // Adjust SVG viewport after CSS width transition finishes
        setTimeout(() => {
            fitToNetwork();
        }, 270);
    }

    // Initialize Application
    async function init() {
        bindEvents();
        setupMapInteractions();

        // Restore sidebar collapse state
        try {
            if (localStorage.getItem('routeforge_sidebar_collapsed') === 'true') {
                toggleSidebar(true);
            }
        } catch (e) {}

        // Route to initial page from URL hash
        const initialHash = window.location.hash.slice(1);
        if (initialHash && ['planner', 'deliveries', 'overview', 'reports', 'fleet'].includes(initialHash)) {
            switchTab(initialHash);
        } else {
            switchTab('planner');
        }

        await fetchState();
        fitToNetwork(true);
        setInterval(fetchState, 5000); // Periodic live polling
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
        renderRoadsTable();
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

        // Update Deliveries Page stats
        if (elements.delivKpiTotal) elements.delivKpiTotal.textContent = dels.length;
        if (elements.delivKpiPlanned) elements.delivKpiPlanned.textContent = counts.planned;
        if (elements.delivKpiPending) elements.delivKpiPending.textContent = counts.pending;
        if (elements.delivKpiUnreachable) elements.delivKpiUnreachable.textContent = counts.unreachable;

        // Update Network Infrastructure page stats
        if (elements.netNodesCount) elements.netNodesCount.textContent = (appState.locations || []).length;
        if (elements.netRoadsCount) elements.netRoadsCount.textContent = (appState.roads || []).length;
        if (elements.netOnewayCount) elements.netOnewayCount.textContent = (appState.roads || []).filter(r => !r.is_bidirectional).length;
    }

    // Render Road Network Corridors Registry Table
    function renderRoadsTable() {
        if (!elements.roadsTableBody) return;
        const roads = appState.roads || [];
        if (roads.length === 0) {
            elements.roadsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">No road corridor records found.</td></tr>`;
            return;
        }

        elements.roadsTableBody.innerHTML = roads.map(r => {
            const isOneway = !r.is_bidirectional;
            const dirBadge = isOneway 
                ? `<span class="badge-tag badge-warning">One-Way (&rarr;)</span>` 
                : `<span class="badge-tag badge-success">Two-Way (&harr;)</span>`;
            return `
                <tr>
                    <td><strong>${escapeHtml(r.id)}</strong></td>
                    <td>${escapeHtml(r.from_id)}</td>
                    <td>${escapeHtml(r.to_id)}</td>
                    <td class="mono-num">${r.distance_km.toFixed(1)} km</td>
                    <td>${dirBadge}</td>
                    <td class="mono-num">${r.speed_limit_kmh} km/h</td>
                    <td class="text-right">
                        <span class="status-badge badge-planned">Active Corridor</span>
                    </td>
                </tr>
            `;
        }).join('');
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

        // --- Render Background & Core Roads ---
        let roadsBgHtml = '';
        let roadPillsHtml = '';

        roads.forEach(road => {
            const from = locMap[road.from_id];
            const to = locMap[road.to_id];
            if (!from || !to) return;

            const isOneWay = !road.is_bidirectional;
            const casingClass = isOneWay ? 'road-oneway-casing' : 'road-casing';
            const coreClass = isOneWay ? 'road-oneway-core' : 'road-core';

            roadsBgHtml += `
                <g class="road-group" data-road-id="${road.id}">
                    <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${casingClass}" />
                    <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${coreClass}"
                          ${isOneWay ? 'marker-end="url(#arrow-oneway)"' : ''} />
                </g>
            `;

            // Calculate midpoint for distance pill
            if (showRoadLabels) {
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                const distText = `${road.distance_km.toFixed(1)} km`;
                const pillWidth = distText.length * 7 + 14;

                roadPillsHtml += `
                    <g transform="translate(${midX}, ${midY})">
                        <rect x="-${pillWidth / 2}" y="-9" width="${pillWidth}" height="18" class="road-pill-bg" />
                        <text x="0" y="0" class="road-pill-text">${distText}</text>
                    </g>
                `;
            }
        });

        elements.svgRoadsBg.innerHTML = roadsBgHtml;
        elements.svgRoadPills.innerHTML = roadPillsHtml;

        // --- Render Active Route Highlight ---
        let activeRoadsHtml = '';
        if (selectedRoute.success && activePath.length > 1) {
            for (let i = 0; i < activePath.length - 1; i++) {
                const u = locMap[activePath[i]];
                const v = locMap[activePath[i + 1]];
                if (u && v) {
                    activeRoadsHtml += `
                        <g>
                            <line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" class="road-active-glow" />
                            <line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" class="road-active-core" marker-end="url(#arrow-selected)" />
                            <line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" class="road-active-pulse" />
                        </g>
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
            const isOrigin = activePath.length > 0 && activePath[0] === loc.id;
            const isDest = activePath.length > 0 && activePath[activePath.length - 1] === loc.id;

            let nodeClass = 'node-cust-circle';
            if (isDest) nodeClass += ' node-cust-dest';
            else if (isInActivePath) nodeClass += ' node-cust-active';

            const labelWidth = loc.id.length * 7 + 14;

            nodesHtml += `
                <g class="map-node" data-id="${loc.id}" data-name="${loc.name}" transform="translate(${loc.x}, ${loc.y})">
                    ${isWarehouse ? `
                        <circle cx="0" cy="0" r="16" class="radar-wave" />
                        <rect x="-18" y="-18" width="36" height="36" class="node-wh-badge" />
                        <text x="0" y="0" class="node-wh-text">WH</text>
                    ` : `
                        <circle cx="0" cy="0" r="13" class="${nodeClass}" />
                    `}
                    <!-- Bottom Label Pill -->
                    <g transform="translate(0, ${isWarehouse ? 28 : 23})">
                        <rect x="-${labelWidth / 2}" y="-8" width="${labelWidth}" height="16" class="node-label-pill" />
                        <text x="0" y="0" class="node-label-text">${loc.id}</text>
                    </g>
                </g>
            `;
        });
        elements.svgNodes.innerHTML = nodesHtml;

        // --- Render Numbered Stop Flags along Route ---
        let stopsHtml = '';
        if (selectedRoute.success && activePath.length > 0) {
            activePath.forEach((stopId, idx) => {
                const loc = locMap[stopId];
                if (!loc) return;

                const isStart = idx === 0;
                const isDrop = idx === activePath.length - 1;
                const stopLabel = isStart ? 'START' : isDrop ? 'DROP' : `STOP ${idx}`;
                const badgeWidth = stopLabel.length * 6.5 + 16;
                const badgeClass = isStart ? 'stop-badge-start' : isDrop ? 'stop-badge-drop' : '';

                // Offset cleanly above node to prevent overlapping
                stopsHtml += `
                    <g transform="translate(${loc.x}, ${loc.y - 28})">
                        <rect x="-${badgeWidth / 2}" y="-10" width="${badgeWidth}" height="20" class="stop-badge-rect ${badgeClass}" />
                        <text x="0" y="0" class="stop-badge-text">${stopLabel}</text>
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

    // Map Pan, Zoom & Interaction Handler
    function setupMapInteractions() {
        const svg = elements.routeMapSvg;
        const container = elements.mapContainer;
        const tooltip = elements.mapTooltip;

        function updateSvgViewBox() {
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }

        // Mouse Drag to Pan
        svg.addEventListener('mousedown', (e) => {
            if (e.target.closest('.map-floating-controls')) return;
            isDragging = true;
            svg.classList.add('is-dragging');
            dragStart = { x: e.clientX, y: e.clientY };
            viewStart = { x: viewBox.x, y: viewBox.y };
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - dragStart.x) * (viewBox.width / svg.clientWidth);
            const dy = (e.clientY - dragStart.y) * (viewBox.height / svg.clientHeight);
            viewBox.x = viewStart.x - dx;
            viewBox.y = viewStart.y - dy;
            updateSvgViewBox();
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                svg.classList.remove('is-dragging');
            }
        });

        // Mouse Wheel to Zoom Centered at Cursor
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mouseSvgX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
            const mouseSvgY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;

            const zoomFactor = e.deltaY < 0 ? 0.88 : 1.14;
            const newWidth = Math.max(200, Math.min(2200, viewBox.width * zoomFactor));
            const newHeight = Math.max(140, Math.min(1500, viewBox.height * zoomFactor));

            viewBox.x = mouseSvgX - ((e.clientX - rect.left) / rect.width) * newWidth;
            viewBox.y = mouseSvgY - ((e.clientY - rect.top) / rect.height) * newHeight;
            viewBox.width = newWidth;
            viewBox.height = newHeight;
            updateSvgViewBox();
        }, { passive: false });

        // Node Hover Tooltips
        elements.svgNodes.addEventListener('mouseover', (e) => {
            const node = e.target.closest('.map-node');
            if (!node) return;
            const id = node.getAttribute('data-id');
            const name = node.getAttribute('data-name');
            const connectedRoads = (appState.roads || []).filter(r => r.from_id === id || r.to_id === id).length;

            elements.tooltipNodeId.textContent = id;
            elements.tooltipNodeName.textContent = name;
            elements.tooltipNodeRoads.textContent = `${connectedRoads} connected road corridor${connectedRoads === 1 ? '' : 's'}`;
            tooltip.style.display = 'flex';
        });

        elements.svgNodes.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left + 15;
            const y = e.clientY - rect.top + 15;
            tooltip.style.left = `${Math.min(rect.width - 190, x)}px`;
            tooltip.style.top = `${Math.min(rect.height - 90, y)}px`;
        });

        elements.svgNodes.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });

        // Click Node to Focus Delivery
        elements.svgNodes.addEventListener('click', (e) => {
            const node = e.target.closest('.map-node');
            if (!node) return;
            const id = node.getAttribute('data-id');
            const matchDel = (appState.deliveries || []).find(d => d.destination_id === id || d.origin_id === id);
            if (matchDel) {
                selectDelivery(matchDel.id);
            }
        });

        // Map Floating Toolbar Buttons
        elements.btnZoomIn.addEventListener('click', () => zoomBy(0.8));
        elements.btnZoomOut.addEventListener('click', () => zoomBy(1.25));
        elements.btnZoomReset.addEventListener('click', () => fitToNetwork());
        elements.btnCenterRoute.addEventListener('click', () => centerOnRoute());
        elements.btnToggleLabels.addEventListener('click', () => {
            showRoadLabels = !showRoadLabels;
            renderMap();
        });
    }

    // Zoom by Scale Factor
    function zoomBy(factor) {
        const cx = viewBox.x + viewBox.width / 2;
        const cy = viewBox.y + viewBox.height / 2;
        viewBox.width = Math.max(200, Math.min(2400, viewBox.width * factor));
        viewBox.height = Math.max(140, Math.min(1600, viewBox.height * factor));
        viewBox.x = cx - viewBox.width / 2;
        viewBox.y = cy - viewBox.height / 2;
        elements.routeMapSvg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    }

    // Auto-fit All Network Nodes with Padding
    function fitToNetwork(instant = false) {
        const locations = appState.locations || [];
        if (locations.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        locations.forEach(l => {
            if (l.x < minX) minX = l.x;
            if (l.x > maxX) maxX = l.x;
            if (l.y < minY) minY = l.y;
            if (l.y > maxY) maxY = l.y;
        });

        const padding = 75;
        const targetWidth = Math.max(500, (maxX - minX) + padding * 2);
        const targetHeight = Math.max(350, (maxY - minY) + padding * 2);
        const targetX = minX - padding;
        const targetY = minY - padding;

        viewBox = { x: targetX, y: targetY, width: targetWidth, height: targetHeight };
        elements.routeMapSvg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    }

    // Center View on Currently Selected Route Stops
    function centerOnRoute() {
        const selectedRoute = appState.selected_route || {};
        const path = selectedRoute.path || [];
        if (path.length === 0) {
            fitToNetwork();
            return;
        }

        const locMap = {};
        (appState.locations || []).forEach(l => { locMap[l.id] = l; });

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        path.forEach(nodeId => {
            const loc = locMap[nodeId];
            if (loc) {
                if (loc.x < minX) minX = loc.x;
                if (loc.x > maxX) maxX = loc.x;
                if (loc.y < minY) minY = loc.y;
                if (loc.y > maxY) maxY = loc.y;
            }
        });

        if (minX === Infinity) {
            fitToNetwork();
            return;
        }

        const padding = 100;
        const targetWidth = Math.max(450, (maxX - minX) + padding * 2);
        const targetHeight = Math.max(300, (maxY - minY) + padding * 2);
        const targetX = minX - padding;
        const targetY = minY - padding;

        viewBox = { x: targetX, y: targetY, width: targetWidth, height: targetHeight };
        elements.routeMapSvg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    }

    // Event Bindings
    function bindEvents() {
        // Sidebar Toggle Button
        if (elements.btnToggleSidebar) {
            elements.btnToggleSidebar.addEventListener('click', () => toggleSidebar());
        }

        // Global Keyboard Shortcut: Ctrl+B or Cmd+B toggles sidebar
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                toggleSidebar();
            }
        });

        // Window hash change routing
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash) switchTab(hash);
        });

        // Sidebar Navigation Links
        elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.getAttribute('data-tab');
                if (tab) switchTab(tab);
            });
        });

        // Table Selection & Row Optimization (with loading state)
        elements.deliveriesTableBody.addEventListener('click', async (e) => {
            const row = e.target.closest('tr');
            if (!row) return;
            const delId = row.getAttribute('data-id');
            if (!delId) return;

            if (e.target.classList.contains('btn-opt-row')) {
                await withButtonLoading(e.target, () => optimizeSingle(delId));
            } else if (e.target.classList.contains('btn-select-row')) {
                await withButtonLoading(e.target, async () => {
                    await selectDelivery(delId);
                    switchTab('planner');
                });
            } else {
                selectDelivery(delId);
            }
        });

        // Deliveries Table Filter Pills
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

        // Optimize Current Delivery Button (with loading spinner)
        elements.btnOptimizeCurrent.addEventListener('click', () => {
            if (appState.selected_delivery_id) {
                withButtonLoading(elements.btnOptimizeCurrent, () => optimizeSingle(appState.selected_delivery_id));
            }
        });

        // Multi-page Reset Scenario Triggers
        document.querySelectorAll('.btn-reset-action').forEach(btn => {
            btn.addEventListener('click', () => {
                withButtonLoading(btn, async () => {
                    try {
                        await fetch('api/reset', { method: 'POST' });
                        showToast('Scenario successfully reset to default logistics network.', 'info');
                        await fetchState();
                        fitToNetwork();
                    } catch (err) {
                        showToast(`Failed to reset scenario: ${err.message}`, 'error');
                    }
                });
            });
        });

        // Multi-page Batch Optimize Triggers
        document.querySelectorAll('.btn-optimize-all-action').forEach(btn => {
            btn.addEventListener('click', () => {
                withButtonLoading(btn, async () => {
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
                    }
                });
            });
        });

        // Multi-page Import Dataset Modal Openers
        document.querySelectorAll('.btn-import-action').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.modalImport.classList.remove('hidden');
            });
        });

        // Fleet Shortcut Buttons (Track in Planner)
        document.querySelectorAll('.btn-view-del-shortcut').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const delId = e.currentTarget.getAttribute('data-id');
                if (delId) {
                    await withButtonLoading(e.currentTarget, async () => {
                        await selectDelivery(delId);
                        switchTab('planner');
                    });
                }
            });
        });

        // Diagnostics Accordion Toggle
        if (elements.diagnosticsToggle) {
            elements.diagnosticsToggle.addEventListener('click', () => {
                isDiagnosticsCollapsed = !isDiagnosticsCollapsed;
                elements.diagnosticsBody.classList.toggle('collapsed', isDiagnosticsCollapsed);
            });
        }

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

        // Copy Route JSON (page header and inner pane)
        const copyBtns = [elements.btnCopyRouteJson, document.getElementById('btn-copy-route-json-inner')].filter(Boolean);
        copyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = elements.diagRouteJsonText.textContent;
                navigator.clipboard.writeText(text).then(() => {
                    showToast('Route JSON copied to clipboard!', 'success');
                });
            });
        });

        // Clear Engine Logs View (page header and inner pane)
        const clearBtns = [elements.btnClearLogs, document.getElementById('btn-clear-logs-inner')].filter(Boolean);
        clearBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.diagEngineLogsList.innerHTML = `<div class="log-entry">// Logs cleared from display.</div>`;
            });
        });

        // Import Dataset Modal Close Actions
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

        // Submit Import (with loading spinner)
        elements.btnSubmitImport.addEventListener('click', () => {
            const content = elements.csvInputArea.value.trim();
            if (!content) {
                showToast('Please enter or select CSV dataset content', 'error');
                return;
            }

            withButtonLoading(elements.btnSubmitImport, async () => {
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
                        fitToNetwork();
                    } else {
                        showToast(`Dataset import encountered ${data.errors_count || 1} errors. Check diagnostics.`, 'error');
                        await fetchState();
                    }
                } catch (err) {
                    showToast(`Failed to parse dataset: ${err.message}`, 'error');
                }
            });
        });
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
