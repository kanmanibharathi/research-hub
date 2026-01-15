/**
 * Split Plot Design Logic
 * premium implementation for Research Hub
 */
'use strict';

class SplitPlotDesign {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.lastData = null;
        this.lastInfo = null;
    }

    initEventListeners() {
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');
        const fbExpBtn = document.getElementById('download-excel-btn');

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                if (!window.requireAuth || !window.requireAuth()) {
                    console.warn("Auth required");
                    return;
                }
                try {
                    this.generate();
                    const simulateBtn = document.getElementById('simulate-btn');
                    const exportBtn = document.getElementById('export-btn');
                    if (simulateBtn) simulateBtn.classList.remove('d-none');
                    if (exportBtn) exportBtn.classList.remove('d-none');
                } catch (e) {
                    console.error(e);
                    alert("Error generating design: " + e.message);
                }
            });
        }

        if (expBtn) {
            expBtn.addEventListener('click', () => this.exportCSV());
        }

        if (fbExpBtn) {
            fbExpBtn.addEventListener('click', () => this.exportCSV());
        }

        const tabs = document.querySelectorAll('.tab');
        if (tabs) {
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-tab');
                    const content = document.getElementById(targetId);
                    if (content) content.classList.add('active');
                });
            });
        }

        const mapBtn = document.getElementById('download-map-btn');
        if (mapBtn) {
            mapBtn.addEventListener('click', () => this.exportMap(mapBtn));
        }

        const simBtn = document.getElementById('simulate-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                this.simulate();
                const fbTab = document.querySelector('.tab[data-tab="field-book"]');
                if (fbTab) fbTab.click();
            });
        }
    }

    exportMap(btn) {
        const container = document.getElementById('map-container');
        if (!container) return;

        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering...';

        html2canvas(container, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            onclone: (clonedDoc) => {
                const clonedContainer = clonedDoc.getElementById('map-container');
                if (clonedContainer) {
                    clonedContainer.style.background = 'transparent';
                    clonedContainer.style.border = 'none';
                    clonedContainer.style.color = '#000000'; // Force black text

                    // Enforce black text and borders on all child elements
                    const elements = clonedContainer.querySelectorAll('*');
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.color !== 'rgba(0, 0, 0, 0)' && style.color !== 'transparent') {
                            el.style.color = '#000000';
                        }
                        if (style.borderColor !== 'rgba(0, 0, 0, 0)' && style.borderColor !== 'transparent') {
                            el.style.borderColor = '#000000';
                        }
                    });

                    // Explicitly remove border from Rep containers as requested
                    const repContainers = clonedContainer.querySelectorAll('.rep-container');
                    repContainers.forEach(rc => rc.style.border = 'none');
                }
            }
        }).then(canvas => {
            const a = document.createElement('a');
            a.download = 'split_plot_map.png';
            a.href = canvas.toDataURL();
            a.click();
            btn.innerHTML = oldText;
        }).catch(err => {
            console.error(err);
            alert("Error exporting map");
            btn.innerHTML = oldText;
        });
    }

    simulate() {
        if (!this.lastData) {
            alert("Please generate a design first.");
            return;
        }

        // Define traits
        const traits = [
            { name: "Yield", unit: "kg/ha", mean: 4500, std: 500, decimals: 1 },
            { name: "Plant Height", unit: "cm", mean: 120, std: 15, decimals: 1 },
            { name: "Flowering Days", unit: "days", mean: 65, std: 5, decimals: 0 }
        ];

        this.lastData.forEach(row => {
            row.simulatedValues = {};
            traits.forEach(trait => {
                // standardized normal approximation
                const u1 = Math.random();
                const u2 = Math.random();
                const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                const val = trait.mean + (z * trait.std);
                row.simulatedValues[trait.name] = Math.max(0, val).toFixed(trait.decimals);
            });
        });

        this.lastTraits = traits;
        this.render();
    }

    mulberry32(a) {
        return function () {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.mulberry() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    parseFactor(val, defaultPrefix) {
        if (!val) return [];
        if (!isNaN(val) && val.toString().indexOf(',') === -1) {
            const count = parseInt(val);
            if (isNaN(count)) return [];
            return Array.from({ length: count }, (_, i) => `${defaultPrefix}-${i + 1}`);
        }
        return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    generate() {
        const typeEl = document.getElementById('type-input');
        const wpInputEl = document.getElementById('wp-input');
        const spInputEl = document.getElementById('sp-input');
        const repsInputEl = document.getElementById('reps-input');
        const locInputEl = document.getElementById('loc-input');
        const plotInputEl = document.getElementById('plot-input');
        const seedInputEl = document.getElementById('seed-input');

        if (!typeEl || !wpInputEl || !spInputEl || !repsInputEl) return;

        const type = parseInt(typeEl.value);
        const wpInput = wpInputEl.value;
        const spInput = spInputEl.value;
        const reps = parseInt(repsInputEl.value);
        const lCount = parseInt(locInputEl.value);
        const startPlot = parseInt(plotInputEl.value);

        const rawSeed = seedInputEl.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);

        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        const wholePlots = this.parseFactor(wpInput, "WP");
        const subPlots = this.parseFactor(spInput, "SP");

        if (wholePlots.length < 2 || subPlots.length < 1 || reps < 1 || lCount < 1) {
            alert("Please ensure at least 2 whole plots, 1 sub plot, and positive reps/locations.");
            return;
        }

        const data = [];
        const wpCount = wholePlots.length;
        const spCount = subPlots.length;

        // Unique ID tracker for Whole Plot Units (for visual grouping)
        let wpUnitIdCounter = 1;

        for (let l = 1; l <= lCount; l++) {
            const locName = lCount === 1 ? "Main Site" : `Location ${l}`;
            let plotCounter = startPlot + (l - 1) * 1000;

            if (type === 2) { // RCBD
                for (let r = 1; r <= reps; r++) {
                    const randomizedWPs = this.shuffle([...wholePlots]);
                    randomizedWPs.forEach(wp => {
                        const randomizedSPs = this.shuffle([...subPlots]);
                        const currentWpId = wpUnitIdCounter++;

                        randomizedSPs.forEach(sp => {
                            data.push({
                                id: data.length + 1,
                                location: locName,
                                plot: plotCounter++, // Unique ID per subplot
                                wpId: currentWpId,   // Group ID
                                rep: r,
                                wp: wp,
                                sp: sp,
                                combo: `${wp} | ${sp}`,
                                simulatedValues: null
                            });
                        });
                    });
                }
            } else { // CRD
                // Flatten all WP instances
                const wpPool = [];
                for (let r = 1; r <= reps; r++) {
                    wholePlots.forEach(wp => wpPool.push({ wp, rep: r }));
                }
                const randomizedWPPool = this.shuffle(wpPool);

                randomizedWPPool.forEach(unit => {
                    const randomizedSPs = this.shuffle([...subPlots]);
                    const currentWpId = wpUnitIdCounter++;

                    randomizedSPs.forEach(sp => {
                        data.push({
                            id: data.length + 1,
                            location: locName,
                            plot: plotCounter++, // Unique ID per subplot
                            wpId: currentWpId,   // Group ID
                            rep: unit.rep,       // Tracking rep just for awareness (optional in CRD map)
                            wp: unit.wp,
                            sp: sp,
                            combo: `${unit.wp} | ${sp}`,
                            simulatedValues: null
                        });
                    });
                });
            }
        }

        this.lastData = data;
        this.lastTraits = null;
        this.lastInfo = { type, wpCount, spCount, reps, lCount, totalUnits: data.length, totalPlots: data.length };
        this.render();
    }

    render() {
        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        // Summary Info
        if (document.getElementById('info-type')) document.getElementById('info-type').innerText = this.lastInfo.type === 2 ? "RCBD" : "CRD";
        if (document.getElementById('info-factors')) document.getElementById('info-factors').innerText = `${this.lastInfo.wpCount} WP × ${this.lastInfo.spCount} SP`;
        if (document.getElementById('info-total')) document.getElementById('info-total').innerText = this.lastInfo.totalUnits;
        if (document.getElementById('info-plots')) document.getElementById('info-plots').innerText = this.lastInfo.totalPlots;

        // Table
        const thead = document.querySelector('#field-book-table thead tr');
        const tbody = document.querySelector('#field-book-table tbody');

        if (thead) {
            let headerHTML = `
                <th>ID</th>
                <th>Location</th>
                <th>Plot</th>
                <th>Rep/Block</th>
                <th>Whole Plot</th>
                <th>Sub Plot</th>
                <th>Combined Treatment</th>
            `;
            if (this.lastTraits) {
                this.lastTraits.forEach(t => {
                    headerHTML += `<th>${t.name} (${t.unit})</th>`;
                });
            }
            thead.innerHTML = headerHTML;
        }

        if (tbody && this.lastData) {
            tbody.innerHTML = '';
            this.lastData.forEach(row => {
                const tr = document.createElement('tr');
                let rowHTML = `
                    <td>${row.id}</td>
                    <td>${row.location}</td>
                    <td>${row.plot}</td>
                    <td>${row.rep}</td>
                    <td>${row.wp}</td>
                    <td>${row.sp}</td>
                    <td><span style="color: var(--primary); font-weight: 600;">${row.combo}</span></td>
                `;

                if (row.simulatedValues) {
                    for (const trait in row.simulatedValues) {
                        rowHTML += `<td>${row.simulatedValues[trait]}</td>`;
                    }
                } else if (this.lastTraits) {
                    this.lastTraits.forEach(() => rowHTML += `<td>-</td>`);
                }

                tr.innerHTML = rowHTML;
                tbody.appendChild(tr);
            });
        }

        // Map
        this.renderMap();
    }

    renderMap() {
        const container = document.getElementById('map-container');
        if (!container || !this.lastData) return;
        container.innerHTML = '';

        const locations = [...new Set(this.lastData.map(d => d.location))];
        const isRCBD = (this.lastInfo.type === 2);

        locations.forEach(loc => {
            const locDiv = document.createElement('div');
            locDiv.className = 'location-block';
            locDiv.innerHTML = `<h2 class="location-title">${loc}</h2>`;

            const locData = this.lastData.filter(d => d.location === loc);

            if (isRCBD) {
                // RCBD: Group by Blocks
                const reps = [...new Set(locData.map(d => d.rep))];
                reps.sort((a, b) => a - b);

                reps.forEach(rep => {
                    const repDiv = document.createElement('div');
                    repDiv.className = 'rep-container';
                    repDiv.innerHTML = `<div class="rep-title">Block ${rep}</div>`;

                    const repData = locData.filter(d => d.rep === rep);
                    this._renderWPGrid(repDiv, repData);
                    locDiv.appendChild(repDiv);
                });
            } else {
                // CRD: No Blocks, just one randomized field
                const freeDiv = document.createElement('div');
                freeDiv.className = 'rep-container'; // Reuse styling
                freeDiv.innerHTML = `<div class="rep-title">Randomized Field Layout</div>`;

                // Render all data sorted by ID/Plot order (which is randomized)
                this._renderWPGrid(freeDiv, locData);
                locDiv.appendChild(freeDiv);
            }

            container.appendChild(locDiv);
        });
    }

    _renderWPGrid(container, data) {
        // Group by wpId to form Whole Plot Units
        const wpIds = [...new Set(data.map(d => d.wpId))];
        // wpIds are already in order of generation (counter), so they reflect random order

        const wpGrid = document.createElement('div');
        wpGrid.className = 'wp-grid';

        wpIds.forEach(wid => {
            const plotData = data.filter(d => d.wpId === wid);
            if (plotData.length === 0) return;

            const wpVal = plotData[0].wp;
            // Get plot range for label
            const plots = plotData.map(p => p.plot);
            const minP = Math.min(...plots);
            const maxP = Math.max(...plots);
            const plotLabel = (minP === maxP) ? minP : `${minP}-${maxP}`;

            const wpUnit = document.createElement('div');
            wpUnit.className = 'wp-unit';
            wpUnit.innerHTML = `
                <div class="wp-label">Whole Plot: ${wpVal}<br><span style="font-size:0.8em; opacity:0.7">Plots: ${plotLabel}</span></div>
                <div class="sp-list">
                    ${plotData.map(sp => `<div class="sp-plot" title="Plot ${sp.plot}">${sp.plot}: ${sp.sp}</div>`).join('')}
                </div>
            `;
            wpGrid.appendChild(wpUnit);
        });
        container.appendChild(wpGrid);
    }

    exportCSV() {
        if (!this.lastData) return;
        let header = "ID,LOCATION,PLOT,REP,WHOLE_PLOT,SUB_PLOT,TREATMENT";

        // Add trait headers
        if (this.lastTraits) {
            this.lastTraits.forEach(t => header += `,${t.name}_${t.unit.replace('/', '_')}`);
        }

        let csv = header + "\n";

        this.lastData.forEach(r => {
            let rowStr = `${r.id},${r.location},${r.plot},${r.rep},"${r.wp}","${r.sp}","${r.combo}"`;
            if (r.simulatedValues) {
                for (const trait in r.simulatedValues) {
                    rowStr += `,${r.simulatedValues[trait]}`;
                }
            }
            csv += rowStr + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'split_plot_design.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            new SplitPlotDesign();
        }
    } catch (e) {
        console.error("Split Plot Init Error", e);
    }
});
