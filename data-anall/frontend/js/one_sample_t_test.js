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

    // Selectors
    const valueColSelect = document.getElementById('value-col');
    const mu0Input = document.getElementById('mu0-input');
    const alphaInput = document.getElementById('alpha-input');
    const analyzeBtn = document.getElementById('analyze-btn');

    // State
    let headers = [];
    let fileObj = null;

    // File Handling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#d63384';
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
        if (!file.name.endsWith('.csv')) {
            showError("Please upload a CSV file.");
            return;
        }
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) {
                showError("File is empty or invalid.");
                return;
            }
            headers = lines[0].split(',').map(h => h.trim());
            populateSelectors(headers);
            configPanel.classList.remove('hidden');
            errorBox.style.display = 'none';
        };
        reader.readAsText(file);
        uploadMsg.innerHTML = `<p style="color: #4ade80;">✅ ${file.name}</p>`;
    }

    function populateSelectors(cols) {
        valueColSelect.innerHTML = '<option value="">-- Select Column --</option>';
        cols.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col; opt.textContent = col;
            valueColSelect.appendChild(opt);
        });
        if (cols.length > 0) valueColSelect.selectedIndex = 1;
    }

    analyzeBtn.addEventListener('click', async () => {
        const value_col = valueColSelect.value;
        const mu_0 = mu0Input.value;
        const alpha = alphaInput.value;

        if (!value_col) {
            showError("Please select a value column.");
            return;
        }

        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('value_col', value_col);
        formData.append('mu_0', mu_0);
        formData.append('alpha', alpha);

        try {
            const resp = await fetch('http://localhost:8000/analyze_one_sample_t_test', {
                method: 'POST', body: formData
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
            showError("Network error. Ensure the backend is running.");
        }
    });

    function renderResults(res) {
        // 1. t-Test Summary
        document.getElementById('res-t-stat').innerText = res.t_test.t_value.toFixed(4);
        document.getElementById('res-p-val').innerText = res.t_test.p_value.toFixed(4);
        document.getElementById('res-mu0').innerText = res.t_test.mu_0;
        document.getElementById('res-mean').innerText = res.t_test.mean.toFixed(4);
        document.getElementById('res-df').innerText = res.t_test.df;
        document.getElementById('res-se').innerText = res.t_test.se.toFixed(4);
        document.getElementById('res-interpretation').innerText = res.interpretation;

        // 2. Descriptive Stats
        const tbody = document.getElementById('desc-body');
        tbody.innerHTML = '';
        const parameters = [
            { key: 'n', label: 'Sample Size (n)' },
            { key: 'Mean', label: 'Mean' },
            { key: 'Median', label: 'Median' },
            { key: 'Variance', label: 'Variance (s²)' },
            { key: 'StdDev', label: 'Std. Deviation (s)' },
            { key: 'StdError', label: 'Std. Error' },
            { key: 'CV', label: 'C.V. (%)' },
            { key: 'Skewness', label: 'Skewness' },
            { key: 'Kurtosis', label: 'Kurtosis' }
        ];

        parameters.forEach(p => {
            const row = document.createElement('tr');
            const val = res.descriptive[p.key];
            row.innerHTML = `
                <td style="font-weight: 600;">${p.label}</td>
                <td>${Number.isInteger(val) ? val : val.toFixed(4)}</td>
            `;
            tbody.appendChild(row);
        });

        // 3. Normality Test Results
        const normContainer = document.getElementById('normality-container');
        normContainer.innerHTML = '';
        const n = res.normality;
        const badgeClass = n.interpretation === 'Normal' ? 'normality-normal' : 'normality-not-normal';
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <h4 style="margin-bottom: 1rem;">Shapiro-Wilk Normality Test</h4>
            <p style="font-size: 0.9rem; opacity: 0.8;">W Statistic: ${n.W.toFixed(4)}</p>
            <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem;">P-value: ${n.p.toFixed(4)}</p>
            <span class="normality-badge ${badgeClass}">${n.interpretation}</span>
        `;
        normContainer.appendChild(card);
    }

    function setupDownloads(formData) {
        const dlBtn = document.getElementById('dl-doc-btn');
        const newBtn = dlBtn.cloneNode(true);
        dlBtn.parentNode.replaceChild(newBtn, dlBtn);

        newBtn.addEventListener('click', async () => {
            newBtn.disabled = true;
            const oldText = newBtn.innerText;
            newBtn.innerText = "Generating Report...";
            try {
                const r = await fetch('http://localhost:8000/report_one_sample_t_test', { method: 'POST', body: formData });
                if (r.ok) {
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const value_col = formData.get('value_col');
                    a.download = `One_Sample_t_Test_Report_${value_col}.docx`;
                    document.body.appendChild(a); a.click(); a.remove();
                } else alert("Error generating report.");
            } catch (e) { alert("Download failed."); }
            finally { newBtn.disabled = false; newBtn.innerText = oldText; }
        });
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
});
