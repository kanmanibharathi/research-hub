/**
 * One-Way ANOVA Logic for Analytics Hub
 * Standalone JavaScript implementation
 */

let anovaFullData = null;
let anovaTreatmentCol = null;
let anovaNumericCols = [];
let anovaResultsGlobal = {};

const anovaFmt = (val, digits = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return val.toFixed(digits);
};

/**
 * Robust helper to calculate F-distribution P-value
 */
const oneWayAnovaGetFPValue = (fVal, df1, df2) => {
    if (fVal <= 0 || isNaN(fVal) || df1 <= 0 || df2 <= 0) return 1;
    try {
        if (typeof jStat === 'undefined' || !jStat) return 1;
        // Correct upper-tail probability calculation (Pr > F)
        const fDist = jStat.centralF || jStat.distribution.f || jStat.f || (jStat.distributions ? jStat.distributions.f : null);
        if (fDist && typeof fDist.cdf === 'function') {
            const p = 1 - fDist.cdf(fVal, df1, df2);
            return isNaN(p) ? 1 : p;
        }
        return 1;
    } catch (e) {
        console.error("p-value calculation error:", e);
        return 1;
    }
};

function loadAnovaExample() {
    const exampleCsv = `Treatments,parameter 1,parameter 2,parameter 3,parameter 4,parameter 5
T1,28.4,135.2,42.1,12.4,14.8
T1,30.1,142.8,45.3,13.2,15.5
T1,27.6,128.4,40.9,11.7,13.9
T1,29.8,150.1,47.2,12.9,16.4
T2,31.2,155.6,48.5,14.1,17
T2,26.9,120.3,38.7,10.9,12.8
T2,25.4,118.7,37.5,10.2,12.1
T2,32.7,160.4,49.1,14.8,17.8
T3,33.4,168.2,51.3,15.2,18.4
T3,29.1,140.6,44.2,12.6,15.2
T3,24.8,110.4,36.9,9.8,11.7
T3,27.3,130.5,41.7,11.3,13.5
T4,30.9,148.9,46.8,13.5,16.2
T4,28.6,136.7,43.1,12.2,14.6
T4,26.1,122.5,39.2,10.7,12.9
T4,31.7,152.4,48,13.9,17.1`;
    Papa.parse(exampleCsv, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
            handleAnovaData(results.data);
            document.getElementById('anovaUploadText').innerText = "Example Data Loaded";
        }
    });
}

// Global listener for file input (moved into a function to be safe)
function initAnovaListeners() {
    const el = document.getElementById('anovaCsvFile');
    if (el) {
        el.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('anovaUploadText').innerText = `File: ${file.name}`;
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    handleAnovaData(results.data);
                }
            });
        });
    }
}

// Run init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnovaListeners);
} else {
    initAnovaListeners();
}

function handleAnovaData(data) {
    if (!data || data.length === 0) return;
    anovaFullData = data;
    const cols = Object.keys(data[0]);

    // Auto-detect numeric columns
    anovaNumericCols = cols.filter(c => {
        return data.some(row => typeof row[c] === 'number');
    });

    // Auto-detect treatment (first non-numeric or column with low unique count)
    anovaTreatmentCol = cols.find(c => !anovaNumericCols.includes(c)) || cols[0];

    // Populate Treatment Select
    const treatSelect = document.getElementById('anovaTreatmentCol');
    if (treatSelect) {
        treatSelect.innerHTML = cols.map(c => `<option value="${c}" ${c === anovaTreatmentCol ? 'selected' : ''}>${c}</option>`).join('');
    }

    // Populate Traits Checkboxes
    const traitsContainer = document.getElementById('anovaTraitsSelector');
    if (traitsContainer) {
        traitsContainer.innerHTML = anovaNumericCols.map(c => `
            <div class="extra-row">
                <input type="checkbox" value="${c}" class="anova-trait-chk" checked>
                <label>${c}</label>
            </div>
        `).join('');
    }

    document.getElementById('anovaSetupArea').style.display = 'block';
    document.getElementById('anovaResultArea').style.display = 'none';
    updateAnovaPreview();
}

function updateAnovaPreview() {
    const container = document.getElementById('anovaPreviewTableContainer');
    if (!anovaFullData || anovaFullData.length === 0) return;

    const cols = Object.keys(anovaFullData[0]);
    let html = `<table><thead><tr><th>#</th>`;
    cols.forEach(c => html += `<th>${c}</th>`);
    html += `</tr></thead><tbody>`;

    anovaFullData.slice(0, 10).forEach((row, idx) => {
        html += `<tr><td>${idx + 1}</td>`;
        cols.forEach(c => html += `<td>${row[c] !== null ? row[c] : '-'}</td>`);
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    document.getElementById('anovaPreviewArea').style.display = 'block';
}

function runAnovaAnalysis() {
    if (!anovaFullData) return alert("Please upload data first!");

    const treatSelect = document.getElementById('anovaTreatmentCol');
    if (!treatSelect) return;
    const treatCol = treatSelect.value;

    const selectedTraits = Array.from(document.querySelectorAll('.anova-trait-chk:checked')).map(cb => cb.value);
    const digits = parseInt(document.getElementById('anovaRoundDigits').value) || 2;

    if (selectedTraits.length === 0) return alert("Please select at least one trait!");

    anovaResultsGlobal = {};
    const summaryRows = [];

    selectedTraits.forEach(trait => {
        try {
            const result = performOneWayAnova(anovaFullData, treatCol, trait);
            const leveneP = calculateLeveneP(anovaFullData, treatCol, trait);

            anovaResultsGlobal[trait] = { ...result, leveneP };

            summaryRows.push({
                Trait: trait,
                Df: result.df_groups,
                MS: result.MSG,
                F: result.F,
                P: result.P,
                LeveneP: leveneP
            });
        } catch (err) {
            console.error(`Analysis failed for ${trait}:`, err);
        }
    });

    if (summaryRows.length === 0) {
        return alert("Analysis could not be performed. Ensure your data has at least two groups with valid numeric entries.");
    }

    renderAnovaSummaryTable(summaryRows, digits);

    // Setup detail trait select
    const detailSelect = document.getElementById('anovaTraitDetailSelect');
    if (detailSelect) {
        const availableTraits = Object.keys(anovaResultsGlobal);
        detailSelect.innerHTML = availableTraits.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    document.getElementById('anovaResultArea').style.display = 'block';
    renderAnovaDetail();
}

function performOneWayAnova(data, treatCol, traitCol) {
    const groups = {};
    data.forEach(row => {
        const t = String(row[treatCol]);
        const v = parseFloat(row[traitCol]);
        if (isNaN(v)) return;
        if (!groups[t]) groups[t] = [];
        groups[t].push(v);
    });

    const k = Object.keys(groups).length;
    if (k < 2) throw new Error("At least two groups are required.");

    let n_total = 0;
    let sumX = 0;
    let sumX2 = 0;
    const groupSummaries = [];

    for (const [t, vals] of Object.entries(groups)) {
        const n = vals.length;
        if (n === 0) continue;
        const mean = vals.reduce((a, b) => a + b, 0) / n;
        const var_calc = n > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
        const sd = Math.sqrt(var_calc);
        const se = sd / Math.sqrt(n);

        groupSummaries.push({ t, n, mean, sd, se, vals });

        n_total += n;
        vals.forEach(v => {
            sumX += v;
            sumX2 += v * v;
        });
    }

    const grandMean = sumX / n_total;
    const CF = (sumX * sumX) / n_total;
    const SST = sumX2 - CF;

    let SSG = 0;
    groupSummaries.forEach(g => {
        const groupSum = g.vals.reduce((a, b) => a + b, 0);
        SSG += (groupSum * groupSum) / g.n;
    });
    SSG -= CF;

    // Ensure precision
    if (SSG < 0) SSG = 0;
    const SSE = Math.max(0, SST - SSG);

    const df_groups = k - 1;
    const df_error = Math.max(0, n_total - k);
    const MSG = SSG / df_groups;
    const MSE = df_error > 0 ? SSE / df_error : 0;
    const F = MSE > 0 ? MSG / MSE : 0;

    const P = oneWayAnovaGetFPValue(F, df_groups, df_error);

    return { SSG, SSE, SST, df_groups, df_error, MSG, MSE, F, P, groupSummaries, grandMean, n_total };
}

function calculateLeveneP(data, treatCol, traitCol) {
    try {
        const groups = {};
        data.forEach(row => {
            const t = String(row[treatCol]);
            const v = parseFloat(row[traitCol]);
            if (isNaN(v)) return;
            if (!groups[t]) groups[t] = [];
            groups[t].push(v);
        });

        const zData = [];
        for (const [t, vals] of Object.entries(groups)) {
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            vals.forEach(v => zData.push({ t_lev: t, z_lev: Math.abs(v - mean) }));
        }

        const lev = performOneWayAnova(zData, 't_lev', 'z_lev');
        return lev.P;
    } catch (e) {
        return null;
    }
}

function renderAnovaSummaryTable(rows, digits) {
    const container = document.getElementById('anovaSummaryTable');
    if (!container) return;
    let html = `<table><thead><tr>
        <th>Parameter</th>
        <th>Df (Groups)</th>
        <th>Mean Square</th>
        <th>F-value</th>
        <th>p-value</th>
        <th>Levene p</th>
    </tr></thead><tbody>`;

    rows.forEach(r => {
        html += `<tr>
            <td><strong>${r.Trait}</strong></td>
            <td>${r.Df}</td>
            <td>${anovaFmt(r.MS, digits)}</td>
            <td>${anovaFmt(r.F, digits)}</td>
            <td style="color: ${r.P < 0.05 ? '#d63384' : '#ccc'}">${anovaFmt(r.P, 4)}</td>
            <td>${anovaFmt(r.LeveneP, 4)}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderAnovaDetail() {
    const detailSelect = document.getElementById('anovaTraitDetailSelect');
    if (!detailSelect) return;
    const trait = detailSelect.value;
    const res = anovaResultsGlobal[trait];
    const digits = parseInt(document.getElementById('anovaRoundDigits').value) || 2;
    if (!res) return;

    // ANOVA Table
    const tableContainer = document.getElementById('anovaDetailTable');
    if (tableContainer) {
        tableContainer.innerHTML = `<table><thead><tr>
            <th>Source of Variation</th>
            <th>Df</th>
            <th>Sum of Squares</th>
            <th>Mean Square</th>
            <th>F-value</th>
            <th>Pr(>F)</th>
        </tr></thead><tbody>
            <tr><td>Groups</td><td>${res.df_groups}</td><td>${anovaFmt(res.SSG, digits)}</td><td>${anovaFmt(res.MSG, digits)}</td><td>${anovaFmt(res.F, digits)}</td><td>${anovaFmt(res.P, 4)}</td></tr>
            <tr><td>Residuals (Error)</td><td>${res.df_error}</td><td>${anovaFmt(res.SSE, digits)}</td><td>${anovaFmt(res.MSE, digits)}</td><td>-</td><td>-</td></tr>
            <tr style="border-top: 1px solid #555;"><td>Total</td><td>${res.df_groups + res.df_error}</td><td>${anovaFmt(res.SST, digits)}</td><td>-</td><td>-</td><td>-</td></tr>
        </tbody></table>`;
    }

    // Stats Note
    const statsNote = document.getElementById('anovaDetailStats');
    if (statsNote) {
        statsNote.innerHTML = `
            <div class="d-flex gap-4">
                <span><strong>Grand Mean:</strong> ${anovaFmt(res.grandMean, digits)}</span>
                <span><strong>N:</strong> ${res.n_total}</span>
                <span><strong>Levene's Test (p):</strong> ${anovaFmt(res.leveneP, 4)} 
                      ${res.leveneP !== null && res.leveneP < 0.05 ? '<span style="color:#DE1A58">(Heteroscedastic)</span>' : '<span style="color:#00a651">(Homogeneous)</span>'}
                </span>
            </div>
        `;
    }

    // Boxplot with Plotly (rendered as PNG)
    const plotContainer = document.getElementById('anovaPlotArea');
    if (plotContainer) {
        const plotData = res.groupSummaries.map(g => ({
            y: g.vals,
            name: g.t,
            type: 'box',
            boxpoints: 'all',
            jitter: 0.3,
            pointpos: -1.8,
            marker: { color: 'rgba(0,0,0,0.5)', size: 4 },
            line: { width: 1.5, color: '#00a651' },
            fillcolor: 'rgba(0, 166, 81, 0.1)',
            meanline: { visible: true, color: '#d63384', width: 2 }
        }));

        const layout = {
            title: { text: `Boxplot - ${trait}`, font: { color: '#eee', size: 16, family: 'Poppins' } },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 60, b: 50, l: 60, r: 30 },
            font: { family: 'Poppins', size: 12, color: '#ccc' },
            yaxis: {
                title: { text: trait, font: { color: '#aaa' } },
                gridcolor: 'rgba(255,255,255,0.1)',
                zeroline: false,
                tickfont: { color: '#999' }
            },
            xaxis: {
                title: { text: 'Treatment', font: { color: '#aaa' } },
                gridcolor: 'transparent',
                tickfont: { color: '#999' }
            },
            showlegend: false
        };

        // Create temporary div for rendering
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '800px';
        tempDiv.style.height = '450px';
        document.body.appendChild(tempDiv);

        Plotly.newPlot(tempDiv, plotData, layout, { staticPlot: true }).then(() => {
            return Plotly.toImage(tempDiv, { format: 'png', width: 800, height: 450 });
        }).then(url => {
            plotContainer.innerHTML = `<img src="${url}" style="width: 100%; height: auto; display: block;">`;
            document.body.removeChild(tempDiv);
        });
    }
}

function exportAnovaXLSX() {
    if (!anovaResultsGlobal || Object.keys(anovaResultsGlobal).length === 0) return;
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = Object.keys(anovaResultsGlobal).map(trait => {
        const res = anovaResultsGlobal[trait];
        return {
            Parameter: trait,
            Df_Groups: res.df_groups,
            SS_Groups: res.SSG,
            MS_Groups: res.MSG,
            F_Value: res.F,
            P_Value: res.P,
            LeveneP: res.leveneP,
            SS_Error: res.SSE,
            MS_Error: res.MSE,
            Df_Error: res.df_error
        };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "ANOVA Summary");

    // Descriptive Sheet
    const descData = [];
    Object.keys(anovaResultsGlobal).forEach(trait => {
        anovaResultsGlobal[trait].groupSummaries.forEach(g => {
            descData.push({
                Parameter: trait,
                Treatment: g.t,
                n: g.n,
                Mean: g.mean,
                SD: g.sd,
                SE: g.se
            });
        });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(descData), "Descriptive Stats");

    XLSX.writeFile(wb, `OneWay_ANOVA_${new Date().getTime()}.xlsx`);
}
