document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadMsg = document.getElementById('upload-msg');
    const configPanel = document.getElementById('config-panel');
    const loading = document.getElementById('loading');
    const outputContent = document.getElementById('output-content');
    const emptyState = document.getElementById('empty-state');
    const errorBox = document.getElementById('error-box');

    // Inputs
    const colObs = document.getElementById('col-obs');
    const colVarsContainer = document.getElementById('col-vars');
    const selectAllBtn = document.getElementById('select-all-btn');
    const analyzeBtn = document.getElementById('analyze-btn');

    // Download Buttons
    const dlPlotsBtn = document.getElementById('dl-plots-btn');
    const dlTextBtn = document.getElementById('dl-text-btn');
    const dlExcelBtn = document.getElementById('dl-excel-btn');

    // State
    let csvData = [];
    let headers = [];
    let fileObj = null;

    // File Handling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#4ade80';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            showError("Please upload a CSV file.");
            return;
        }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            parseCSV(text);
        };
        reader.readAsText(file);

        // UI
        uploadMsg.innerHTML = `<p>✅ ${file.name}</p>`;
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            showError("File is empty or has only one line.");
            return;
        }
        headers = lines[0].split(',').map(h => h.trim());
        csvData = lines.slice(1).map(line => line.split(',').map(v => v.trim()));

        populateSelectors();
        configPanel.classList.remove('hidden');
        errorBox.style.display = 'none';

        // Auto-select numeric columns for vars if possible
        detectNumericColumns();
    }

    function populateSelectors() {
        // Obs ID (Single select)
        colObs.innerHTML = '';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            colObs.appendChild(opt);
        });

        // Vars (Multi Checkbox)
        colVarsContainer.innerHTML = '';
        headers.forEach(h => {
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${h}" id="chk-${h}"> <label for="chk-${h}">${h}</label>`;
            colVarsContainer.appendChild(div);
        });
    }

    function detectNumericColumns() {
        // Basic heuristic: check first 5 rows
        // If first column is text, likely Obs ID. Rest likely numeric.
        if (headers.length > 1) {
            // Assume col 0 is obs
            colObs.selectedIndex = 0;

            // Check others
            for (let i = 1; i < headers.length; i++) {
                const header = headers[i];
                // Check if numeric in first few rows
                let isNum = true;
                for (let r = 0; r < Math.min(csvData.length, 5); r++) {
                    if (isNaN(parseFloat(csvData[r][i]))) {
                        isNum = false;
                        break;
                    }
                }

                if (isNum) {
                    const chk = document.getElementById(`chk-${header}`);
                    if (chk) chk.checked = true;
                }
            }
        }
    }

    // Select All
    selectAllBtn.addEventListener('click', () => {
        const chks = colVarsContainer.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(chks).every(c => c.checked);
        chks.forEach(c => c.checked = !allChecked);
        selectAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
    });

    // Analyze
    analyzeBtn.addEventListener('click', async () => {
        // Get Inputs
        const obsCol = colObs.value;
        const varCols = Array.from(colVarsContainer.querySelectorAll('input:checked')).map(c => c.value);

        if (!obsCol) { showError("Please select an Observation identifier."); return; }
        if (varCols.length < 2) { showError("Please select at least 2 numeric variables."); return; }
        if (varCols.includes(obsCol)) { showError("Observation column cannot be used as a variable."); return; }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('obs_col', obsCol);
        formData.append('var_cols', varCols.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_pca', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();

            loading.classList.add('hidden');
            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
                // Scroll to results
                outputContent.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError(res.message || "Analysis failed.");
            }
        } catch (e) {
            loading.classList.add('hidden');
            showError("Network error or server unreachable.");
            console.error(e);
        }
    });

    function renderResults(res) {
        // Total Variance
        const eigs = res.eigenvalues;
        const kaiser = eigs.filter(e => e >= 1).length;
        const totalExpl = res.cum_variance_pct[kaiser - 1];

        document.getElementById('total-var-disp').textContent = totalExpl.toFixed(2) + '%';
        document.getElementById('pcs-retained-disp').textContent = kaiser;

        // Table
        const tbody = document.getElementById('eig-body');
        tbody.innerHTML = '';
        eigs.forEach((eig, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 0.5rem; color: #000;">PC${i + 1}</td>
                <td style="padding: 0.5rem; color: #000;">${eig.toFixed(4)}</td>
                <td style="padding: 0.5rem; color: #000;">${res.variance_pct[i].toFixed(2)}%</td>
                <td style="padding: 0.5rem; color: #000;">${res.cum_variance_pct[i].toFixed(2)}%</td>
            `;
            if (eig >= 1) tr.style.fontWeight = 'bold';
            tbody.appendChild(tr);
        });
    }

    function setupDownloads(formData) {
        const setupBtn = (btnId, endpoint, filename) => {
            const btn = document.getElementById(btnId);
            // Remove old listeners ideally, but cloning works
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', async () => {
                newBtn.textContent = "Generating...";
                newBtn.disabled = true;

                try {
                    const resp = await fetch(`http://localhost:8000/${endpoint}`, {
                        method: 'POST',
                        body: formData
                    });

                    if (resp.ok) {
                        const blob = await resp.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    } else {
                        alert("Error generating report.");
                    }
                } catch (e) {
                    console.error(e);
                    alert("Download failed.");
                } finally {
                    newBtn.textContent = newBtn.innerText.replace("Generating...", "").trim() || "Download"; // Reset text roughly
                    // Actually reset to original text logic:
                    if (endpoint.includes('plots')) newBtn.textContent = "📊 Download Plots (DOCX)";
                    if (endpoint.includes('text')) newBtn.textContent = "📝 Download Interpretation";
                    if (endpoint.includes('excel')) newBtn.textContent = "📗 Download Excel Output";
                    newBtn.disabled = false;
                }
            });
        };

        setupBtn('dl-plots-btn', 'report_pca_plots', 'PCA_Plots.docx');
        setupBtn('dl-text-btn', 'report_pca_text', 'PCA_Interpretation.docx');
        setupBtn('dl-excel-btn', 'report_pca_excel', 'PCA_Output.xlsx');
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
