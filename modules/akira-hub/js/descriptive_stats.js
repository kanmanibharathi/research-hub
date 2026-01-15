/**
 * Descriptive Statistics Logic for Research Hub
 * Translated from R Shiny implementation to JavaScript
 */

const DescriptiveStats = {
    // Utility for numeric parsing similar to R's numeric_from
    parseNumeric: (vec) => {
        return vec.map(v => {
            if (v === null || v === undefined) return NaN;
            let s = v.toString().trim();
            if (s === "" || ["na", "n/a", "null", "nan"].includes(s.toLowerCase())) return NaN;
            let n = parseFloat(s);
            return isNaN(n) ? NaN : n;
        });
    },

    // Variance calculation
    variance: (nums) => {
        const n = nums.length;
        if (n < 2) return NaN;
        const mean = nums.reduce((a, b) => a + b, 0) / n;
        return nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    },

    // Standard Deviation
    sd: (nums) => Math.sqrt(DescriptiveStats.variance(nums)),

    // Skewness (Fisher)
    skewnessFisher: (nums) => {
        const n = nums.length;
        if (n < 3) return NaN;
        const mean = nums.reduce((a, b) => a + b, 0) / n;
        const s = DescriptiveStats.sd(nums);
        if (s === 0) return 0;
        const m3_sum = nums.reduce((a, b) => a + Math.pow(b - mean, 3), 0);
        const coeff = n / ((n - 1) * (n - 2));
        return coeff * (m3_sum / Math.pow(s, 3));
    },

    // Kurtosis (Excess)
    kurtosisExcess: (nums) => {
        const n = nums.length;
        if (n < 4) return NaN;
        const mean = nums.reduce((a, b) => a + b, 0) / n;
        const m2 = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        const m4 = nums.reduce((a, b) => a + Math.pow(b - mean, 4), 0);
        const s2 = m2 / (n - 1);
        if (s2 <= 0) return NaN;
        const s4 = Math.pow(s2, 2);
        const term = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * (m4 / s4);
        const correction = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
        return term - correction;
    },

    // Histogram bins for sparkline
    histogramBins: (nums, bins = 12) => {
        if (nums.length === 0) return new Array(bins).fill(0);
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        if (min === max) {
            const out = new Array(bins).fill(0);
            out[0] = nums.length;
            return out;
        }
        const binWidth = (max - min) / bins;
        const counts = new Array(bins).fill(0);
        nums.forEach(n => {
            let binIdx = Math.floor((n - min) / binWidth);
            if (binIdx === bins) binIdx = bins - 1; // handle edge case where n == max
            counts[binIdx]++;
        });
        return counts;
    },

    // Sparkline SVG generator
    generateSparkline: (counts, width = 80, height = 20) => {
        const maxc = Math.max(...counts, 1);
        const n = counts.length;
        const barW = width / n;
        const bars = counts.map((c, i) => {
            const h = (c / maxc) * (height - 2);
            const x = i * barW;
            const y = height - h;
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(barW * 0.8).toFixed(2)}" height="${h.toFixed(2)}" />`;
        }).join('');
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><g fill="#00a651">${bars}</g></svg>`;
    },

    // Core summarization
    summarize: (name, rawVec, rounding = 4, histBins = 12, extras = []) => {
        const nums = DescriptiveStats.parseNumeric(rawVec);
        const nonNa = nums.filter(n => !isNaN(n));
        const n = nonNa.length;
        const naCount = nums.length - n;

        const mean = n > 0 ? nonNa.reduce((a, b) => a + b, 0) / n : NaN;
        const sd = n > 1 ? DescriptiveStats.sd(nonNa) : NaN;
        const se = n > 1 ? sd / Math.sqrt(n) : NaN;
        const cv = (n > 1 && mean !== 0) ? (sd / mean) * 100 : NaN;

        let result = {
            variable: name,
            mean: mean,
            sd: sd,
            se: se,
            cv_percent: cv,
            skewness: n > 2 ? DescriptiveStats.skewnessFisher(nonNa) : NaN,
            kurtosis: n > 3 ? DescriptiveStats.kurtosisExcess(nonNa) : NaN,
            percent_na: (naCount / nums.length) * 100,
            n: n,
            histogram: DescriptiveStats.histogramBins(nonNa, histBins)
        };

        if (extras.includes("min") || true) result.min = n > 0 ? Math.min(...nonNa) : NaN;
        if (extras.includes("max") || true) result.max = n > 0 ? Math.max(...nonNa) : NaN;

        const sorted = [...nonNa].sort((a, b) => a - b);
        const getQuantile = (p) => {
            if (n === 0) return NaN;
            const pos = (n - 1) * p;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (sorted[base + 1] !== undefined) {
                return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
            } else {
                return sorted[base];
            }
        };

        if (extras.includes("median") || extras.includes("quartiles")) result.median = getQuantile(0.5);
        if (extras.includes("quartiles")) {
            result.q1 = getQuantile(0.25);
            result.q3 = getQuantile(0.75);
        }
        if (extras.includes("range")) result.range = n > 0 ? (Math.max(...nonNa) - Math.min(...nonNa)) : NaN;
        if (extras.includes("sum")) result.sum = nonNa.reduce((a, b) => a + b, 0);

        // Geometric Mean
        if (extras.includes("gmean")) {
            const pos = nonNa.filter(x => x > 0);
            result.gmean = (pos.length === n && n > 0) ? Math.exp(pos.reduce((a, b) => a + Math.log(b), 0) / n) : NaN;
        }

        // Geometric SD factor
        if (extras.includes("gsd")) {
            const pos = nonNa.filter(x => x > 0);
            if (pos.length === n && n > 1) {
                const logSd = DescriptiveStats.sd(pos.map(x => Math.log(x)));
                result.gsd = Math.exp(logSd);
            } else {
                result.gsd = NaN;
            }
        }

        // Harmonic Mean
        if (extras.includes("hmean")) {
            const pos = nonNa.filter(x => x > 0);
            result.hmean = (pos.length === n && n > 0) ? n / pos.reduce((a, b) => a + (1 / b), 0) : NaN;
        }

        // RMS
        if (extras.includes("rms")) {
            result.rms = n > 0 ? Math.sqrt(nonNa.reduce((a, b) => a + Math.pow(b, 2), 0) / n) : NaN;
        }

        return result;
    }
};

window.DescriptiveStats = DescriptiveStats;
