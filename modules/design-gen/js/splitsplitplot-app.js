/**
 * Split-Split Plot Design Logic
 * premium implementation for Research Hub
 */
'use strict';

class SplitSplitPlotDesign {
    constructor() {
        this.initEventListeners();
        this.mulberry = null;
        this.lastData = null;
        this.lastInfo = null;
    }

    initEventListeners() {
        const genBtn = document.getElementById('generate-btn');
        const expBtn = document.getElementById('export-btn');
        const excelBtn = document.getElementById('download-excel-btn');

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                try {
                    this.generate();
                    // Show simulate and export buttons after generation
                    const simulateBtn = document.getElementById('simulate-btn');
                    const exportBtn = document.getElementById('export-btn');
                    if (simulateBtn) simulateBtn.classList.remove('d-none');
                    if (exportBtn) exportBtn.classList.remove('d-none');
                } catch (e) {
                    console.error(e);
                    alert("Error: " + e.message);
                }
            });
        }

        if (expBtn) {
            expBtn.addEventListener('click', () => this.exportCSV());
        }

        if (excelBtn) {
            excelBtn.addEventListener('click', () => this.exportCSV());
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

        if (typeof html2canvas !== 'function') {
            alert("Export library not loaded.");
            btn.innerHTML = oldText;
            return;
        }

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

                    // Explicitly remove border from WP units (intermediate hierarchy)
                    const intermediateContainers = clonedContainer.querySelectorAll('.wp-unit');
                    intermediateContainers.forEach(c => {
                        c.style.border = 'none';
                        c.style.background = 'transparent';
                    });

                    // Ensure Block/Rep containers HAVE a border (black)
                    const repContainers = clonedContainer.querySelectorAll('.rep-container');
                    repContainers.forEach(rc => {
                        rc.style.border = '2px solid #000000';
                        rc.style.background = 'transparent';
                    });

                    // Ensure Sub Plot containers HAVE a border (black)
                    const spContainers = clonedContainer.querySelectorAll('.sp-unit');
                    spContainers.forEach(sc => {
                        sc.style.border = '1px solid #000000';
                        sc.style.background = 'transparent';
                    });

                    // Ensure the actual plot box (.ssp-plot) keeps its border but is high contrast and transparent bg
                    const plots = clonedContainer.querySelectorAll('.ssp-plot');
                    plots.forEach(p => {
                        p.style.border = '1px solid #000000';
                        p.style.background = 'transparent';
                        p.style.color = '#000000';
                    });
                }
            }
        }).then(canvas => {
            const a = document.createElement('a');
            a.download = 'split_split_plot_map.png';
            a.href = canvas.toDataURL();
            a.click();
            btn.innerHTML = oldText;
        }).catch(err => {
            console.error(err);
            alert("Error exporting map");
            btn.innerHTML = oldText;
        });
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
        const sspInputEl = document.getElementById('ssp-input');
        const repsInputEl = document.getElementById('reps-input');
        const locInputEl = document.getElementById('loc-input');
        const plotInputEl = document.getElementById('plot-input');
        const seedInputEl = document.getElementById('seed-input');

        if (!typeEl || !wpInputEl || !spInputEl || !sspInputEl) return;

        const type = parseInt(typeEl.value); // 1 = CRD, 2 = RCBD
        const wpInput = wpInputEl.value;
        const spInput = spInputEl.value;
        const sspInput = sspInputEl.value;
        const reps = parseInt(repsInputEl.value);
        const lCount = parseInt(locInputEl.value);
        const startPlot = parseInt(plotInputEl.value);
        const rawSeed = seedInputEl.value;
        let seed = (rawSeed !== "" && rawSeed !== null) ? parseInt(rawSeed) : Math.floor(Math.random() * 999999);

        if (isNaN(seed)) seed = Math.floor(Math.random() * 999999);
        this.mulberry = this.mulberry32(seed);

        const wholePlots = this.parseFactor(wpInput, "WP");
        const subPlots = this.parseFactor(spInput, "SP");
        const subSubPlots = this.parseFactor(sspInput, "SSP");

        if (wholePlots.length < 2 || subPlots.length < 1 || subSubPlots.length < 1 || reps < 1 || lCount < 1) {
            alert("Ensure valid whole plots (min 2), sub plots (min 1), and sub-sub plots (min 1).");
            return;
        }

        const data = [];
        const wpCount = wholePlots.length;
        const spCount = subPlots.length;
        const sspCount = subSubPlots.length;

        for (let l = 1; l <= lCount; l++) {
            const locName = lCount === 1 ? "Main Site" : `Location ${l}`;
            let plotCounter = startPlot + (l - 1) * 1000;

            if (type === 2) {
                // RCBD: Block -> WP -> SP -> SSP
                for (let r = 1; r <= reps; r++) {
                    // 1. Randomize Blocks (Implied by iteration order, but contents randomized)
                    // 2. Randomize A (WP) within each block
                    const randomizedWPs = this.shuffle([...wholePlots]);

                    randomizedWPs.forEach(wp => {
                        // 3. Randomize B (SP) within each A
                        const randomizedSPs = this.shuffle([...subPlots]);

                        randomizedSPs.forEach(sp => {
                            // 4. Randomize C (SSP) within each B
                            const randomizedSSPs = this.shuffle([...subSubPlots]);

                            randomizedSSPs.forEach(ssp => {
                                const currentPlot = plotCounter++;
                                data.push({
                                    id: data.length + 1,
                                    location: locName,
                                    plot: currentPlot,
                                    rep: r, // Block ID
                                    wp: wp,
                                    sp: sp,
                                    ssp: ssp,
                                    combo: `${wp} | ${sp} | ${ssp}`
                                });
                            });
                        });
                    });
                }
            } else {
                // CRD: Field-wide randomization of A, then nested B, then nested C
                // 1. Create pool of all A units (A levels * Reps) and Randomize over whole field
                let wpPool = [];
                for (let r = 0; r < reps; r++) {
                    wpPool = wpPool.concat(wholePlots);
                }
                wpPool = this.shuffle(wpPool);

                // Iterate through the randomized linear layout of Whole Plots
                // We assign a virtual "Rep" index just to track it, but practically it's one large field
                // For visualization, we will group them later or show as 'Field'

                wpPool.forEach((wp, index) => {
                    // 2. Randomize B within A
                    const randomizedSPs = this.shuffle([...subPlots]);

                    randomizedSPs.forEach(sp => {
                        // 3. Randomize C within B
                        const randomizedSSPs = this.shuffle([...subSubPlots]);

                        randomizedSSPs.forEach(ssp => {
                            const currentPlot = plotCounter++;
                            data.push({
                                id: data.length + 1,
                                location: locName,
                                plot: currentPlot,
                                rep: 1, // Logically 1 large field/block for CRD
                                crd_index: Math.floor(index / wholePlots.length) + 1, // Just for tracking internal rep if needed
                                wp: wp,
                                sp: sp,
                                ssp: ssp,
                                combo: `${wp} | ${sp} | ${ssp}`
                            });
                        });
                    });
                });
            }
        }

        this.lastData = data;
        this.lastInfo = {
            type,
            wpCount,
            spCount,
            sspCount,
            reps,
            lCount,
            totalCombinations: data.length,
            totalPlots: data.length / sspCount
        };
        this.render();
    }

    simulate() {
        if (!this.lastData) {
            alert("Please generate a design first.");
            return;
        }

        const traits = [
            { name: "Yield", unit: "kg/ha", mean: 4500, std: 500, decimals: 1 },
            { name: "Plant Height", unit: "cm", mean: 120, std: 15, decimals: 1 },
            { name: "Flowering Time", unit: "days", mean: 65, std: 5, decimals: 0 }
        ];

        this.lastData.forEach(row => {
            row.simulatedValues = {};
            traits.forEach(trait => {
                // Box-Muller transform for normal distribution
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

    render() {
        const results = document.getElementById('results');
        if (results) results.style.display = 'block';

        // Summary Info
        if (document.getElementById('info-type')) document.getElementById('info-type').innerText = this.lastInfo.type === 2 ? "RCBD" : "CRD";
        if (document.getElementById('info-factors')) document.getElementById('info-factors').innerText = `${this.lastInfo.wpCount} WP × ${this.lastInfo.spCount} SP × ${this.lastInfo.sspCount} SSP`;
        if (document.getElementById('info-total')) document.getElementById('info-total').innerText = this.lastInfo.totalCombinations;

        // Table
        const thead = document.querySelector('#field-book-table thead tr');
        if (thead) {
            let headerHTML = `
                <th>ID</th>
                <th>Location</th>
                <th>Plot</th>
                <th>Rep/Block</th>
                <th>Whole Plot</th>
                <th>Sub Plot</th>
                <th>Sub-Sub Plot</th>
                <th>Treatment Combined</th>
            `;
            if (this.lastTraits) {
                this.lastTraits.forEach(t => {
                    headerHTML += `<th>${t.name} (${t.unit})</th>`;
                });
            }
            thead.innerHTML = headerHTML;
        }

        const tbody = document.querySelector('#field-book-table tbody');
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
                    <td>${row.ssp}</td>
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

        locations.forEach(loc => {
            const locDiv = document.createElement('div');
            locDiv.className = 'location-block';
            locDiv.innerHTML = `<h2 class="location-title">${loc}</h2>`;

            const locData = this.lastData.filter(d => d.location === loc);
            const reps = [...new Set(locData.map(d => d.rep))];

            reps.forEach(rep => {
                const repDiv = document.createElement('div');
                repDiv.className = 'rep-container';
                repDiv.innerHTML = `<div class="rep-title">Replicate / Block ${rep}</div>`;

                const repData = locData.filter(d => d.rep === rep);
                const wpGrid = document.createElement('div');
                wpGrid.className = 'wp-grid';

                const wpsInRep = [...new Set(repData.map(d => d.wp))];
                wpsInRep.forEach(wp => {
                    const wpData = repData.filter(d => d.wp === wp);
                    const wpUnit = document.createElement('div');
                    wpUnit.className = 'wp-unit';
                    wpUnit.innerHTML = `<div class="wp-label">${wp}</div>`;

                    const spGrid = document.createElement('div');
                    // spGrid logic
                    const spsInWp = [...new Set(wpData.map(d => d.sp))];
                    spsInWp.forEach(sp => {
                        const spData = wpData.filter(d => d.sp === sp);
                        const spUnit = document.createElement('div');
                        spUnit.className = 'sp-unit';
                        spUnit.innerHTML = `<div class="sp-label">${sp}</div>`;

                        const sspList = document.createElement('div');
                        sspList.className = 'ssp-list';
                        spData.forEach(sspRow => {
                            const sspItem = document.createElement('div');
                            sspItem.className = 'ssp-plot';
                            sspItem.innerHTML = `<span class="plot-id" style="font-size:0.5rem; opacity:0.6;">P-${sspRow.plot}</span> ${sspRow.ssp}`;
                            sspList.appendChild(sspItem);
                        });

                        spUnit.appendChild(sspList);
                        spGrid.appendChild(spUnit);
                    });

                    wpUnit.appendChild(spGrid);
                    wpGrid.appendChild(wpUnit);
                });

                repDiv.appendChild(wpGrid);
                locDiv.appendChild(repDiv);
            });

            container.appendChild(locDiv);
        });
    }

    exportCSV() {
        if (!this.lastData) return;
        let header = "ID,LOCATION,PLOT,REP,WHOLE_PLOT,SUB_PLOT,SUB_SUB_PLOT,TRT_COMB";
        // Add trait headers
        if (this.lastTraits) {
            this.lastTraits.forEach(t => header += `,${t.name}_${t.unit.replace('/', '_')}`);
        }
        let csv = header + "\n";

        this.lastData.forEach(r => {
            let rowStr = `${r.id},${r.location},${r.plot},${r.rep},"${r.wp}","${r.sp}","${r.ssp}","${r.combo}"`;
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
        a.download = 'split_split_plot_design.csv';
        a.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (document.getElementById('generate-btn')) {
            new SplitSplitPlotDesign();
        }
    } catch (e) {
        console.error("Split Split Plot Init Error", e);
    }
});
