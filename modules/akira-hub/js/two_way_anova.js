/**
 * Two-Way ANOVA Logic for Analytics Hub
 * Standalone JavaScript implementation
 * Formula-based calculations matching breeder-level precision.
 */

let twoWayAnovaFullData = null;
let twoWayAnovaNumericCols = [];
let twoWayAnovaResultsGlobal = {};

const twFmt = (val, digits = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return val.toFixed(digits);
};

/**
 * Professional P-value formatter with significance stars
 */
const formatPWithStars = (p) => {
    if (p === null || p === undefined || isNaN(p)) return '-';
    let stars = "<sup>ns</sup>";
    if (p <= 0.001) stars = "<sup>***</sup>";
    else if (p <= 0.01) stars = "<sup>**</sup>";
    else if (p <= 0.05) stars = "<sup>*</sup>";

    if (p < 0.001) return `< 0.001${stars}`;
    return p.toFixed(4) + stars;
};

/**
 * Robust helper to calculate F-distribution P-value
 */
const twAnovaGetFPValue = (fVal, df1, df2) => {
    if (fVal <= 0 || isNaN(fVal) || df1 <= 0 || df2 <= 0) return 1;
    try {
        if (typeof jStat === 'undefined' || !jStat) return 1;
        // The strictly correct method for Pr(>F) is the upper-tail probability: 1 - CDF
        // Using jStat.centralF for maximum scientific accuracy
        const fDist = jStat.centralF || jStat.f || (jStat.distributions ? jStat.distributions.f : null);
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

/**
 * Robust helper for Student's T-distribution Inverse
 */
const twAnovaGetTInv = (p, df) => {
    if (df <= 0 || isNaN(df)) return 2.0; // Fallback
    try {
        if (typeof jStat === 'undefined' || !jStat) return 2.0;
        const tDist = jStat.t || (jStat.distributions ? jStat.distributions.t : null);
        if (tDist && typeof tDist.inv === 'function') {
            const val = tDist.inv(p, df);
            return isNaN(val) ? 2.0 : val;
        }
        if (typeof jStat.tinv === 'function') {
            const val = jStat.tinv(p, df);
            return isNaN(val) ? 2.0 : val;
        }
        return 2.0;
    } catch (e) {
        return 2.0;
    }
};

window.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('twoWayAnovaCsvFile');
    if (el) {
        el.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('twoWayAnovaUploadText').innerText = `File: ${file.name}`;
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    handleTwoWayAnovaData(results.data);
                }
            });
        });
    }
});

function loadTwoWayAnovaExample() {
    const exampleCsv = `Groups,Variety,Sample1,Sample2,Sample3
G1,V1,50.82,49.12,51.1
G1,V1,48.77,52.21,49.95
G1,V1,51.42,49.67,50.31
G2,V1,56.33,54.11,58.09
G2,V1,55.02,53.47,56.71
G2,V1,59.2,57.88,56.45
G3,V1,46.3,47.88,45.17
G3,V1,46.95,44.83,45.6
G3,V1,47.12,45.4,46.55
G1,V2,54.2,53.01,56.12
G1,V2,52.48,56.3,55.02
G1,V2,55.66,54.08,53.59
G2,V2,60.45,59.3,61.11
G2,V2,58.97,62.22,60.18
G2,V2,62.8,60.99,61.54
G3,V2,50.34,49.16,50.89
G3,V2,49.75,51.02,48.88
G3,V2,51.44,50.72,49.61`;
    Papa.parse(exampleCsv, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
            handleTwoWayAnovaData(results.data || results);
            document.getElementById('twoWayAnovaUploadText').innerText = "Example Data Loaded";
            // Run analysis automatically for 'full load'
            setTimeout(() => {
                if (typeof runTwoWayAnovaAnalysis === 'function') {
                    runTwoWayAnovaAnalysis();
                }
            }, 800);
        }
    });
}

function handleTwoWayAnovaData(data) {
    if (!data || data.length === 0) return;
    twoWayAnovaFullData = data;
    const cols = Object.keys(data[0]);
    // Improved factor vs trait detection
    twoWayAnovaNumericCols = cols.filter(c => {
        return data.some(row => {
            const val = row[c];
            if (val === null || val === undefined) return false;
            // Handle strings with commas like "1,200.50"
            const cleaned = String(val).replace(/,/g, '').trim();
            return cleaned !== "" && !isNaN(parseFloat(cleaned));
        });
    });

    // Factor candidates are columns that are NOT strictly numeric or have few unique values
    const factorCandidates = cols.filter(c => {
        const uniqueValues = new Set(data.map(row => row[c])).size;
        return !twoWayAnovaNumericCols.includes(c) || (uniqueValues < data.length / 2 && uniqueValues > 1);
    });

    const factorA = document.getElementById('twoWayAnovaFactorA');
    const factorB = document.getElementById('twoWayAnovaFactorB');
    const traitsSelector = document.getElementById('twoWayAnovaTraitsSelector');

    if (factorA && factorB) {
        const factorOptions = (factorCandidates.length > 0 ? factorCandidates : cols)
            .map(c => `<option value="${c}">${c}</option>`).join('');
        factorA.innerHTML = factorOptions;
        factorB.innerHTML = factorOptions;

        if (factorCandidates.length >= 2) {
            factorA.value = factorCandidates[0];
            factorB.value = factorCandidates[1];
        } else if (cols.length >= 2) {
            factorA.selectedIndex = 0;
            factorB.selectedIndex = 1;
        }
    }

    if (traitsSelector) {
        traitsSelector.innerHTML = twoWayAnovaNumericCols.map(c => `
            <div class="extra-row">
                <input type="checkbox" value="${c}" class="two-way-anova-trait-chk" checked>
                <label>${c}</label>
            </div>
        `).join('');
    }

    document.getElementById('twoWayAnovaSetupArea').style.display = 'block';
    document.getElementById('twoWayAnovaResultArea').style.display = 'none';
    updateTwoWayAnovaPreview();
}

function updateTwoWayAnovaPreview() {
    const container = document.getElementById('twoWayAnovaPreviewTableContainer');
    if (!twoWayAnovaFullData || twoWayAnovaFullData.length === 0) return;

    const cols = Object.keys(twoWayAnovaFullData[0]);
    let html = `<table><thead><tr><th>#</th>`;
    cols.forEach(c => html += `<th>${c}</th>`);
    html += `</tr></thead><tbody>`;

    twoWayAnovaFullData.slice(0, 10).forEach((row, idx) => {
        html += `<tr><td>${idx + 1}</td>`;
        cols.forEach(c => html += `<td>${row[c] !== null ? row[c] : '-'}</td>`);
        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    document.getElementById('twoWayAnovaPreviewArea').style.display = 'block';
}

function runTwoWayAnovaAnalysis() {
    if (!twoWayAnovaFullData) return alert("Please upload data first!");

    // Check libraries
    if (typeof jStat === 'undefined') return alert("Error: Statistical library (jStat) not loaded. Please check your internet connection and refresh the page.");
    if (typeof Plotly === 'undefined') console.warn("Plotly library not loaded. Interaction plots will be disabled.");

    const factorACol = document.getElementById('twoWayAnovaFactorA').value;
    const factorBCol = document.getElementById('twoWayAnovaFactorB').value;
    const selectedTraits = Array.from(document.querySelectorAll('.two-way-anova-trait-chk:checked')).map(cb => cb.value);
    const digits = parseInt(document.getElementById('twoWayAnovaRoundDigits').value) || 2;

    if (!factorACol || !factorBCol) return alert("Please select both Factor A and Factor B.");
    if (factorACol === factorBCol) return alert("Factor A and Factor B must be different columns.");
    if (selectedTraits.length === 0) return alert("Please select at least one numeric trait.");

    twoWayAnovaResultsGlobal = {};
    const summaryRows = [];
    let failureReason = "";

    selectedTraits.forEach(trait => {
        try {
            const result = performTwoWayAnova(twoWayAnovaFullData, factorACol, factorBCol, trait);
            twoWayAnovaResultsGlobal[trait] = result;

            summaryRows.push({
                Trait: trait,
                Fa: factorACol,
                Fb: factorBCol,
                Fa_P: result.pA,
                Fb_P: result.pB,
                Int_P: result.pAB
            });
        } catch (err) {
            console.error(`Two-Way ANOVA failed for ${trait}:`, err);
            failureReason = err.message;
        }
    });

    if (summaryRows.length === 0) {
        const message = failureReason || "Check your data format.";
        return alert(`Analysis failed for all selected traits.\n\nReason: ${message}\n\nTips:\n1. Interaction analysis requires replicates (multiple rows for the same A & B combination).\n2. Factor A and B must each have at least 2 distinct levels.\n3. Verify that trait columns contain numeric values.`);
    }

    renderTwoWayAnovaSummaryTable(summaryRows, digits);

    const detailSelect = document.getElementById('twoWayAnovaTraitDetailSelect');
    if (detailSelect) {
        detailSelect.innerHTML = Object.keys(twoWayAnovaResultsGlobal).map(t => `<option value="${t}">${t}</option>`).join('');
    }

    document.getElementById('twoWayAnovaResultArea').style.display = 'block';
    renderTwoWayAnovaDetail();
}

function performTwoWayAnova(data, factorACol, factorBCol, traitCol) {
    if (!data || !Array.isArray(data)) throw new Error("Scientific engine: Invalid dataset format.");
    const observations = [];
    data.forEach(row => {
        if (!row) return;
        const fa = row[factorACol] !== undefined && row[factorACol] !== null ? String(row[factorACol]).trim() : "";
        const fb = row[factorBCol] !== undefined && row[factorBCol] !== null ? String(row[factorBCol]).trim() : "";
        let rawVal = row[traitCol];
        if (rawVal !== null && rawVal !== undefined) {
            rawVal = String(rawVal).replace(/[^0-9.\-]/g, '').trim();
        }
        const val = parseFloat(rawVal);

        if (!isNaN(val) && fa !== "" && fb !== "") {
            observations.push({ fa, fb, val });
        }
    });

    if (observations.length < 4) throw new Error(`Trait "${traitCol}" has insufficient numeric observations (found ${observations.length}). Check the column for non-numeric characters.`);

    // Grouping
    const statsA = {};
    const statsB = {};
    const statsAB = {};

    observations.forEach(o => {
        if (!statsA[o.fa]) statsA[o.fa] = { sum: 0, n: 0 };
        if (!statsB[o.fb]) statsB[o.fb] = { sum: 0, n: 0 };
        const keyAB = o.fa + "||" + o.fb;
        if (!statsAB[keyAB]) statsAB[keyAB] = { sum: 0, n: 0 };

        statsA[o.fa].sum += o.val; statsA[o.fa].n++;
        statsB[o.fb].sum += o.val; statsB[o.fb].n++;
        statsAB[keyAB].sum += o.val; statsAB[keyAB].n++;
    });

    const levelsA = [...new Set(observations.map(o => o.fa))];
    const levelsB = [...new Set(observations.map(o => o.fb))];
    const a = levelsA.length;
    const b = levelsB.length;
    const N = observations.length;

    const dfA = a - 1;
    const dfB = b - 1;
    const activeCells = Object.keys(statsAB).length;
    const dfAB = (a - 1) * (b - 1);
    const dfE = N - activeCells;
    const dfT = N - 1;

    // Replication check (n)
    const n_avg = N / activeCells;
    if (activeCells === N) {
        // Unreplicated case (n=1)
        throw new Error("Interaction is not testable with only one replication (n=1). Please provide replicates for each cell to estimate Error and Interaction.");
    }

    if (a < 2 || b < 2) throw new Error("Each factor must have at least 2 levels for ANOVA.");
    if (dfE <= 0) throw new Error("Degrees of Freedom for Error is 0. Replicates are required to perform significant testing.");

    const grandMean = observations.reduce((s, o) => s + o.val, 0) / N;
    const sumSqTotal = observations.reduce((s, o) => s + Math.pow(o.val, 2), 0);
    const sumTotal = observations.reduce((s, o) => s + o.val, 0);
    const CF = Math.pow(sumTotal, 2) / N;
    const SST = sumSqTotal - CF;

    // SS Factor A
    let SSA = 0;
    for (const fa in statsA) { SSA += (Math.pow(statsA[fa].sum, 2) / statsA[fa].n); }
    SSA = Math.max(0, SSA - CF);

    // SS Factor B
    let SSB = 0;
    for (const fb in statsB) { SSB += (Math.pow(statsB[fb].sum, 2) / statsB[fb].n); }
    SSB = Math.max(0, SSB - CF);

    // SS Cells (Total Treatment SS)
    let SSCells = 0;
    for (const key in statsAB) { SSCells += (Math.pow(statsAB[key].sum, 2) / statsAB[key].n); }
    SSCells = Math.max(0, SSCells - CF);

    // SS Interaction (A x B)
    const SSAB = Math.max(0, SSCells - SSA - SSB);
    const SSE = Math.max(0, SST - SSCells);

    const MSA = SSA / dfA;
    const MSB = SSB / dfB;
    const MSAB = dfAB > 0 ? SSAB / dfAB : 0;
    const MSE = dfE > 0 ? SSE / dfE : 0;

    const FA = MSE > 0 ? MSA / MSE : 0;
    const FB = MSE > 0 ? MSB / MSE : 0;
    const FAB = (MSE > 0 && dfAB > 0) ? MSAB / MSE : 0;

    const pA = twAnovaGetFPValue(FA, dfA, dfE);
    const pB = twAnovaGetFPValue(FB, dfB, dfE);
    const pAB = twAnovaGetFPValue(FAB, dfAB, dfE);

    // Logic-based Interpretation Helper
    let interpretation = "";
    const pValLog = (pAB < 0.001) ? "< 0.001" : pAB.toFixed(4);
    if (pAB <= 0.05) {
        interpretation = `Significant interaction detected (p=${pValLog}). The effect of ${factorACol} depends on the levels of ${factorBCol}. Main effects should be interpreted cautiously; focus on interaction plots.`;
    } else {
        interpretation = `No significant interaction detected (p=${pValLog}). You may interpret the main effects of ${factorACol} and ${factorBCol} independently.`;
    }

    // Precision Statistics (Scientific Accuracy for Breeding)
    const CV = (Math.sqrt(MSE) / grandMean) * 100;

    // t-values for CD calculation
    const t05 = twAnovaGetTInv(0.975, dfE);
    const t01 = twAnovaGetTInv(0.995, dfE);

    // SEm and CD for Factor A
    const nA = N / a;
    const semA = Math.sqrt(MSE / nA);
    const cdA05 = t05 * Math.sqrt(2) * semA;
    const cdA01 = t01 * Math.sqrt(2) * semA;

    // SEm and CD for Factor B
    const nB = N / b;
    const semB = Math.sqrt(MSE / nB);
    const cdB05 = t05 * Math.sqrt(2) * semB;
    const cdB01 = t01 * Math.sqrt(2) * semB;

    // SEm and CD for Interaction AB
    const nAB = N / (a * b);
    const semAB = Math.sqrt(MSE / nAB);
    const cdAB05 = t05 * Math.sqrt(2) * semAB;
    const cdAB01 = t01 * Math.sqrt(2) * semAB;

    // Interaction data for plot
    const interactionGrouped = [];
    for (const uA of levelsA) {
        for (const uB of levelsB) {
            const key = uA + "||" + uB;
            const s = statsAB[key] || { sum: 0, n: 0 };
            const m = s.n > 0 ? s.sum / s.n : null;
            interactionGrouped.push({ fa: uA, fb: uB, mean: m, n: s.n });
        }
    }

    return {
        SSA, SSB, SSAB, SSE, SST,
        dfA, dfB, dfAB, dfE, dfT,
        MSA, MSB, MSAB, MSE,
        FA, FB, FAB,
        pA, pB, pAB,
        CV, semA, cdA05, cdA01, semB, cdB05, cdB01, semAB, cdAB05, cdAB01,
        observations, interactionGrouped, levelsA, levelsB, grandMean, N,
        interpretation
    };
}

function renderTwoWayAnovaSummaryTable(rows, digits) {
    const container = document.getElementById('twoWayAnovaSummaryTable');
    if (!container) return;

    let html = `<table><thead><tr>
        <th>Trait</th>
        <th>Factor A Pr(>F)</th>
        <th>Factor B Pr(>F)</th>
        <th>Interaction Pr(>F)</th>
    </tr></thead><tbody>`;

    rows.forEach(r => {
        html += `<tr>
            <td><strong>${r.Trait}</strong></td>
            <td style="color: ${r.Fa_P < 0.05 ? '#DE1A58' : '#ccc'}">${formatPWithStars(r.Fa_P)}</td>
            <td style="color: ${r.Fb_P < 0.05 ? '#DE1A58' : '#ccc'}">${formatPWithStars(r.Fb_P)}</td>
            <td style="color: ${r.Int_P < 0.05 ? '#DE1A58' : '#ccc'}">${formatPWithStars(r.Int_P)}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderTwoWayAnovaDetail() {
    const detailSelect = document.getElementById('twoWayAnovaTraitDetailSelect');
    if (!detailSelect) return;
    const trait = detailSelect.value;
    const res = twoWayAnovaResultsGlobal[trait];
    const digits = parseInt(document.getElementById('twoWayAnovaRoundDigits').value) || 2;
    if (!res) return;

    // Detail ANOVA Table
    const tableContainer = document.getElementById('twoWayAnovaDetailTable');
    if (tableContainer) {
        tableContainer.innerHTML = `<table><thead><tr>
            <th>Source</th>
            <th>Df</th>
            <th>Sum Sq</th>
            <th>Mean Sq</th>
            <th>F value</th>
            <th>Pr(>F)</th>
        </tr></thead><tbody>
            <tr><td>Factor A</td><td>${res.dfA}</td><td>${twFmt(res.SSA, digits)}</td><td>${twFmt(res.MSA, digits)}</td><td>${twFmt(res.FA, digits)}</td><td>${formatPWithStars(res.pA)}</td></tr>
            <tr><td>Factor B</td><td>${res.dfB}</td><td>${twFmt(res.SSB, digits)}</td><td>${twFmt(res.MSB, digits)}</td><td>${twFmt(res.FB, digits)}</td><td>${formatPWithStars(res.pB)}</td></tr>
            <tr><td>Interaction</td><td>${res.dfAB}</td><td>${twFmt(res.SSAB, digits)}</td><td>${twFmt(res.MSAB, digits)}</td><td>${twFmt(res.FAB, digits)}</td><td>${formatPWithStars(res.pAB)}</td></tr>
            <tr><td>Error</td><td>${res.dfE}</td><td>${twFmt(res.SSE, digits)}</td><td>${twFmt(res.MSE, digits)}</td><td>-</td><td>-</td></tr>
            <tr style="border-top: 1px solid #555;"><td>Total</td><td>${res.dfT}</td><td>${twFmt(res.SST, digits)}</td><td>-</td><td>-</td><td>-</td></tr>
        </tbody></table>`;
    }

    // Precision Statistics Table
    const precisionContainer = document.getElementById('twoWayAnovaPrecisionTable');
    if (precisionContainer) {
        precisionContainer.innerHTML = `
            <h6 style="font-size: 14px; color: #DE1A58; margin-top: 20px;">Precision & Critical Difference (CD)</h6>
            <table><thead><tr>
                <th>Factor</th>
                <th>SEm (±)</th>
                <th>CD (5%)</th>
                <th>CD (1%)</th>
                <th>CV (%)</th>
            </tr></thead><tbody>
                <tr><td>Factor A</td><td>${twFmt(res.semA, 3)}</td><td>${twFmt(res.cdA05, 3)}</td><td>${twFmt(res.cdA01, 3)}</td><td rowspan="3" style="vertical-align: middle; text-align: center; font-weight: bold; background: rgba(222, 26, 88, 0.05);">${twFmt(res.CV, 2)}%</td></tr>
                <tr><td>Factor B</td><td>${twFmt(res.semB, 3)}</td><td>${twFmt(res.cdB05, 3)}</td><td>${twFmt(res.cdB01, 3)}</td></tr>
                <tr><td>Interaction (A×B)</td><td>${twFmt(res.semAB, 3)}</td><td>${twFmt(res.cdAB05, 3)}</td><td>${twFmt(res.cdAB01, 3)}</td></tr>
            </tbody></table>
            <div style="background: rgba(222, 26, 88, 0.1); padding: 15px; border-left: 4px solid #DE1A58; border-radius: 4px; margin-top: 20px;">
                <h6 style="color: #DE1A58; font-size: 14px; margin-bottom: 5px;"><i class="fa fa-info-circle"></i> Statistical Conclusion</h6>
                <p style="margin: 0; font-size: 13px; color: #eee; line-height: 1.5;">${res.interpretation}</p>
            </div>
        `;
    }

    // Stats Note
    const statsNote = document.getElementById('twoWayAnovaDetailStats');
    if (statsNote) {
        statsNote.innerHTML = `
            <div class="d-flex gap-4">
                <span><strong>Grand Mean:</strong> ${twFmt(res.grandMean, digits)}</span>
                <span><strong>N:</strong> ${res.N}</span>
            </div>
        `;
    }

    // Interaction / Distribution Box Plot
    const plotContainer = document.getElementById('twoWayAnovaPlotArea');
    if (plotContainer) {
        // Prepare box plot data: Grouped by Factor B
        const plotData = res.levelsB.map(lb => {
            const groupObs = res.observations.filter(o => o.fb === lb);
            return {
                y: groupObs.map(o => o.val),
                x: groupObs.map(o => o.fa),
                name: String(lb),
                type: 'box',
                boxpoints: 'all', // show all points
                jitter: 0.3,
                pointpos: -1.8,
                marker: { size: 4, opacity: 0.6 },
                line: { width: 1.5 }
            };
        });

        const layout = {
            title: { text: `Trait Distribution: ${trait} by Factors`, font: { color: '#eee', size: 16, family: 'Poppins' } },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { t: 60, b: 60, l: 60, r: 40 },
            font: { family: 'Poppins', size: 12, color: '#ccc' },
            boxmode: 'group', // group boxes by Factor A levels
            yaxis: { title: { text: trait, font: { color: '#aaa' } }, gridcolor: 'rgba(255,255,255,0.1)', zeroline: false },
            xaxis: { title: { text: 'Factor A Levels', font: { color: '#aaa' } }, gridcolor: 'transparent' },
            showlegend: true,
            legend: { font: { color: '#ccc' }, orientation: 'h', y: -0.2 }
        };

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '850px';
        tempDiv.style.height = '520px';
        document.body.appendChild(tempDiv);

        Plotly.newPlot(tempDiv, plotData, layout, { staticPlot: true }).then(() => {
            return Plotly.toImage(tempDiv, { format: 'png', width: 850, height: 520 });
        }).then(url => {
            plotContainer.innerHTML = `<img src="${url}" style="width: 100%; height: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">`;
            document.body.removeChild(tempDiv);
        });
    }
}

function exportTwoWayAnovaXLSX() {
    if (!twoWayAnovaResultsGlobal || Object.keys(twoWayAnovaResultsGlobal).length === 0) return;
    const wb = XLSX.utils.book_new();

    // Summary
    const summaryData = Object.keys(twoWayAnovaResultsGlobal).map(trait => {
        const res = twoWayAnovaResultsGlobal[trait];
        return {
            Parameter: trait,
            SS_A: res.SSA, Df_A: res.dfA, F_A: res.FA, P_A: res.pA,
            SS_B: res.SSB, Df_B: res.dfB, F_B: res.FB, P_B: res.pB,
            SS_Int: res.SSAB, Df_Int: res.dfAB, F_Int: res.FAB, P_Int: res.pAB,
            SS_Error: res.SSE, Df_Error: res.dfE
        };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "ANOVA Summary");

    // Descriptive
    const descData = [];
    Object.keys(twoWayAnovaResultsGlobal).forEach(trait => {
        const res = twoWayAnovaResultsGlobal[trait];
        res.interactionGrouped.forEach(ig => {
            descData.push({
                Parameter: trait,
                FactorA: ig.fa,
                FactorB: ig.fb,
                Mean: ig.mean,
                n: ig.n
            });
        });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(descData), "Descriptives");

    XLSX.writeFile(wb, `TwoWay_ANOVA_${new Date().getTime()}.xlsx`);
}
