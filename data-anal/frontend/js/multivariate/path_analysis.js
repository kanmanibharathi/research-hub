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
    const colDep = document.getElementById('col-dep');
    const colIndepContainer = document.getElementById('col-indep');
    const selectAllBtn = document.getElementById('select-all-btn');
    const analyzeBtn = document.getElementById('analyze-btn');

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

        // Auto-detect numeric columns
        detectNumericColumns();
    }

    function populateSelectors() {
        // Dep variable (Y)
        colDep.innerHTML = '';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            colDep.appendChild(opt);
        });

        // Indep variables (Xs)
        colIndepContainer.innerHTML = '';
        headers.forEach(h => {
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${h}" id="chk-${h}"> <label for="chk-${h}">${h}</label>`;
            colIndepContainer.appendChild(div);
        });
    }

    function detectNumericColumns() {
        if (headers.length > 0) {
            // Assume last col is Yield (Y) if contains 'yield' otherwise last
            const yieldCol = headers.find(h => h.toLowerCase().includes('yield')) || headers[headers.length - 1];
            colDep.value = yieldCol;

            // Check numeric cols
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i];
                let isNum = true;
                for (let r = 0; r < Math.min(csvData.length, 5); r++) {
                    if (isNaN(parseFloat(csvData[r][i]))) {
                        isNum = false;
                        break;
                    }
                }

                if (isNum && header !== yieldCol && header !== 'Genotype') {
                    const chk = document.getElementById(`chk-${header}`);
                    if (chk) chk.checked = true;
                }
            }
        }
    }

    // Select All
    selectAllBtn.addEventListener('click', () => {
        const chks = colIndepContainer.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(chks).every(c => c.checked);
        chks.forEach(c => c.checked = !allChecked);
        selectAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
    });

    // Analyze
    analyzeBtn.addEventListener('click', async () => {
        const depVar = colDep.value;
        const indepVars = Array.from(colIndepContainer.querySelectorAll('input:checked')).map(c => c.value);

        if (!depVar) { showError("Please select a valid Dependent Variable."); return; }
        if (indepVars.length < 1) { showError("Please select at least 1 Independent Variable."); return; }
        if (indepVars.includes(depVar)) { showError("Dependent Variable cannot be included in Independent Variables."); return; }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('dep_var', depVar);
        formData.append('indep_vars', indepVars.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_path', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();

            loading.classList.add('hidden');
            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownloads(formData);
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
        document.getElementById('r2-disp').textContent = res.R2.toFixed(4);
        document.getElementById('residual-disp').textContent = res.residual.toFixed(4);

        const tbody = document.getElementById('effects-body');
        tbody.innerHTML = '';

        // Sort by direct effect strength?
        const entries = Object.entries(res.direct_effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

        entries.forEach(([varName, val]) => {
            const tr = document.createElement('tr');
            let interp = "";
            if (Math.abs(val) >= 0.3) interp = "<strong>Strong Direct Influence</strong>";
            else if (Math.abs(val) < 0.1) interp = "Negligible Direct Effect";
            else interp = "Moderate Effect";

            tr.innerHTML = `
                <td style="padding: 0.75rem; border-bottom: 1px solid #eee;">${varName}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid #eee; font-weight: bold; color: ${val >= 0 ? 'blue' : 'red'};">${val.toFixed(4)}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9em; opacity: 0.8;">${interp}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function setupDownloads(formData) {
        const setupBtn = (btnId, endpoint, filename, btnText) => {
            const btn = document.getElementById(btnId);
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', async () => {
                const originalText = newBtn.innerText;
                newBtn.innerText = "Generating...";
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
                    newBtn.innerText = originalText;
                    newBtn.disabled = false;
                }
            });
        };

        setupBtn('dl-doc-btn', 'report_path_doc', 'Path_Analysis_Report.docx');
        setupBtn('dl-excel-btn', 'report_path_excel', 'Path_Analysis_Output.xlsx');
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
