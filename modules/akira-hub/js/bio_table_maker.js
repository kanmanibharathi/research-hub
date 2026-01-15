/**
 * Bio-Table Maker Logic for Research Hub
 * Implements One-Way ANOVA with Tukey HSD/Dunnett Post-hoc and CLD
 */

const BioTableMaker = {
    // Critical Values for Tukey Q (alpha = 0.05) - Simplified table for common DF
    // Columns: k=2 to 10
    // Rows: df=1 to 100+
    qTable05: {
        5: [5.70, 6.98, 7.80, 8.42, 8.91, 9.32, 9.67, 9.97, 10.24], // df=5
        10: [3.15, 3.88, 4.33, 4.65, 4.91, 5.12, 5.30, 5.46, 5.60], // df=10
        20: [2.95, 3.58, 3.96, 4.23, 4.45, 4.62, 4.77, 4.90, 5.01], // df=20
        30: [2.89, 3.49, 3.85, 4.10, 4.30, 4.46, 4.60, 4.72, 4.82], // df=30
        60: [2.83, 3.40, 3.74, 3.98, 4.16, 4.31, 4.44, 4.55, 4.65], // df=60
        120: [2.80, 3.36, 3.68, 3.92, 4.10, 4.24, 4.36, 4.47, 4.56], // df=120
        999: [2.77, 3.31, 3.63, 3.86, 4.03, 4.17, 4.29, 4.39, 4.47]  // df=inf
    },

    getQValue: (k, df, alpha = 0.05) => {
        const table = BioTableMaker.qTable05; // Defaulting to 0.05 for simplicity in this version
        const dfKeys = Object.keys(table).map(Number).sort((a, b) => a - b);
        let bestDf = dfKeys.find(d => d >= df) || 999;
        const kIdx = Math.min(Math.max(k, 2), 10) - 2;
        return table[bestDf][kIdx];
    },

    // CLD Algorithm (Compact Letter Display)
    // Based on the Piepho (2004) algorithm
    generateCLD: (comparisons, treatmentNames, alpha = 0.05, reverse = false) => {
        // comparisons: array of {t1, t2, p}
        // treatmentNames: sorted by mean (desc if reverse=true)

        const n = treatmentNames.length;
        const adjMatrix = Array(n).fill().map(() => Array(n).fill(true)); // true = non-significant

        comparisons.forEach(c => {
            const i = treatmentNames.indexOf(c.t1);
            const j = treatmentNames.indexOf(c.t2);
            if (i !== -1 && j !== -1) {
                const isSig = c.p < alpha;
                adjMatrix[i][j] = !isSig;
                adjMatrix[j][i] = !isSig;
            }
        });

        // Simple grouping algorithm
        let groups = [];
        for (let i = 0; i < n; i++) {
            let found = false;
            for (let g = 0; g < groups.length; g++) {
                let canJoin = true;
                for (let member of groups[g]) {
                    if (!adjMatrix[i][member]) {
                        canJoin = false;
                        break;
                    }
                }
                if (canJoin) {
                    groups[g].push(i);
                    found = true;
                    // Don't break, allow multiple group membership for overlapping non-sig ranges
                }
            }
            if (!found || true) { // Always allow starting a new group if overlapping logic is needed
                groups.push([i]);
            }
        }

        // Clean up redundant groups (subset check)
        groups = groups.filter((g1, i) => !groups.some((g2, j) => i !== j && g1.every(val => g2.includes(val))));

        // Assign letters
        const letters = "abcdefghijklmnopqrstuvwxyz";
        const res = {};
        treatmentNames.forEach(name => res[name] = "");

        groups.sort((a, b) => Math.min(...a) - Math.min(...b)); // Sort groups for logical letter sequence

        groups.forEach((g, idx) => {
            const char = letters[idx % 26];
            g.forEach(memberIdx => {
                res[treatmentNames[memberIdx]] += char;
            });
        });

        return res;
    },

    analyze: (data, treatCol, traitCol, options) => {
        // Perform ANOVA first
        const anova = BioTableMaker.performAnova(data, treatCol, traitCol);
        const { groupSummaries, df_error, MSE, df_groups } = anova;
        const k = groupSummaries.length;
        const alpha = options.alpha || 0.05;

        // Perform Post-hoc
        const comparisons = [];
        if (options.type === 'tukey') {
            const qCritical = BioTableMaker.getQValue(k, df_error, alpha);

            for (let i = 0; i < k; i++) {
                for (let j = i + 1; j < k; j++) {
                    const g1 = groupSummaries[i];
                    const g2 = groupSummaries[j];
                    const diff = Math.abs(g1.mean - g2.mean);

                    // Tukey HSD LSD calculation
                    const se_diff = Math.sqrt((MSE / 2) * (1 / g1.n + 1 / g2.n));
                    const hsd_val = qCritical * se_diff;

                    // Significant if diff > HSD
                    const p = diff > hsd_val ? 0.0001 : 1.0;
                    comparisons.push({ t1: g1.t, t2: g2.t, p });
                }
            }

            // Labels using CLD
            const sortedNames = [...groupSummaries].sort((a, b) => options.reverse ? a.mean - b.mean : b.mean - a.mean).map(g => g.t);
            const cld = BioTableMaker.generateCLD(comparisons, sortedNames, alpha);
            groupSummaries.forEach(g => g.label = cld[g.t]);

        } else if (options.type === 'dunnett') {
            const ctrl = groupSummaries.find(g => g.t === options.control);
            // Dunnett approximation using t-dist and alpha adjustment
            const tCritical = jStat.studentt.inv(1 - (alpha / (k - 1)), df_error);

            groupSummaries.forEach(g => {
                if (g.t === options.control) {
                    g.label = "(Ctrl)";
                } else {
                    const diff = Math.abs(g.mean - ctrl.mean);
                    const se_diff = Math.sqrt(MSE * (1 / g.n + 1 / ctrl.n));
                    const tVal = diff / se_diff;
                    const isSig = tVal > tCritical;

                    // Simple star assignment for Dunnett
                    if (isSig) {
                        const pVal = (1 - jStat.studentt.cdf(tVal, df_error)) * (k - 1);
                        g.label = BioTableMaker.getPStar(pVal);
                    } else {
                        g.label = "ns";
                    }
                }
            });
        }

        return { anova, groupSummaries };
    },

    performAnova: (data, treatCol, traitCol) => {
        const groups = {};
        data.forEach(row => {
            const t = String(row[treatCol]);
            const v = parseFloat(row[traitCol]);
            if (isNaN(v)) return;
            if (!groups[t]) groups[t] = [];
            groups[t].push(v);
        });

        const k = Object.keys(groups).length;
        let n_total = 0, sumX = 0, sumX2 = 0;
        const groupSummaries = [];

        for (const [t, vals] of Object.entries(groups)) {
            const n = vals.length;
            const mean = vals.reduce((a, b) => a + b, 0) / n;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
            const se = sd / Math.sqrt(n);
            groupSummaries.push({ t, n, mean, sd, se, vals });
            n_total += n;
            vals.forEach(v => { sumX += v; sumX2 += v * v; });
        }

        const CF = (sumX ** 2) / n_total;
        const SST = sumX2 - CF;
        let SSG = 0;
        groupSummaries.forEach(g => {
            const gs = g.vals.reduce((a, b) => a + b, 0);
            SSG += (gs ** 2) / g.n;
        });
        SSG -= CF;
        const SSE = Math.max(0, SST - SSG);
        const df_groups = k - 1;
        const df_error = n_total - k;
        const MSG = SSG / df_groups;
        const MSE = SSE / df_error;
        const F = MSG / MSE;

        return { groupSummaries, df_groups, df_error, SSG, SSE, SST, MSG, MSE, F };
    },

    approxTukeyP: (t, k, df) => {
        // Very rough approximation of p-value for Tukey derived from t-dist
        const p = 1 - jStat.studentt.cdf(t, df);
        return p * (k - 1); // Bonferroni-like penalty for many-way comparisons
    },

    approxDunnettP: (t, k, df) => {
        const p = 1 - jStat.studentt.cdf(t, df);
        return p * 1.5; // Rough scaling
    },

    getPStar: (p) => {
        if (p < 0.001) return "***";
        if (p < 0.01) return "**";
        if (p < 0.05) return "*";
        return "ns";
    }
};

window.BioTableMaker = BioTableMaker;
