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
    const colVarsContainer = document.getElementById('col-vars');
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

        // Auto select numeric
        detectNumericColumns();
    }

    function populateSelectors() {
        colVarsContainer.innerHTML = '';
        headers.forEach(h => {
            const div = document.createElement('div');
            div.className = 'check-item';
            div.innerHTML = `<input type="checkbox" value="${h}" id="chk-${h}"> <label for="chk-${h}">${h}</label>`;
            colVarsContainer.appendChild(div);
        });
    }

    function detectNumericColumns() {
        if (headers.length > 0) {
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i];
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
        const varCols = Array.from(colVarsContainer.querySelectorAll('input:checked')).map(c => c.value);

        if (varCols.length < 2) { showError("Please select at least 2 variables."); return; }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('var_cols', varCols.join(','));

        try {
            const resp = await fetch('http://localhost:8000/analyze_spearman', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();

            loading.classList.add('hidden');
            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderMatrix(res);
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

    function renderMatrix(res) {
        const vars = res.vars;
        const corr = res.corr_matrix;
        const sig = res.sig_matrix;

        const thead = document.getElementById('matrix-head');
        const tbody = document.getElementById('matrix-body');

        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Header Row
        const hr = document.createElement('tr');
        hr.innerHTML = '<th>Variable</th>' + vars.map(v => `<th>${v}</th>`).join('');
        thead.appendChild(hr);

        // Body Rows
        vars.forEach(rVar => {
            const tr = document.createElement('tr');
            let cols = `<td>${rVar}</td>`;

            vars.forEach(cVar => {
                const rVal = corr[rVar][cVar];
                const sVal = sig[rVar][cVar];
                let display = "";
                let bg = "";

                if (rVar === cVar) {
                    display = "1.00";
                    bg = "rgba(255, 255, 255, 0.2)"; // Diagonal
                } else {
                    display = `${rVal.toFixed(2)}${sVal}`;
                    // Color based on r
                    const val = parseFloat(rVal);
                    if (val > 0) bg = `rgba(220, 38, 38, ${Math.abs(val) * 0.8})`; // Red
                    else bg = `rgba(37, 99, 235, ${Math.abs(val) * 0.8})`; // Blue
                }

                cols += `<td style="background-color: ${bg}; color: white; text-shadow: 0 1px 2px black;">${display}</td>`;
            });

            tr.innerHTML = cols;
            tbody.appendChild(tr);
        });
    }

    function setupDownloads(formData) {
        const setupBtn = (btnId, endpoint, filename) => {
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

        setupBtn('dl-doc-btn', 'report_spearman_doc', 'Spearman_Correlation_Report.docx');
        setupBtn('dl-excel-btn', 'report_spearman_excel', 'Spearman_Correlation_Output.xlsx');
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
