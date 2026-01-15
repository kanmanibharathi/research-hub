const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const configPanel = document.getElementById('config-panel');
const emptyState = document.getElementById('empty-state');
const outputContent = document.getElementById('output-content');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error-box');

let selectedFile = null;

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#d63384';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
        showError("Please upload a valid CSV file.");
        return;
    }
    selectedFile = file;
    parseHeaders(file);

    // UI Updates
    configPanel.classList.remove('hidden');
    dropZone.classList.add('file-loaded');
    document.getElementById('upload-msg').innerHTML = `<p style="color:#4ade80; font-weight:bold;">File Loaded:</p><p>${file.name}</p>`;

    hideError();
}

function parseHeaders(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const firstLine = text.split('\n')[0];
        const headers = firstLine.split(',').map(h => h.trim());

        populateSelects(headers);
    };
    reader.readAsText(file);
}

function populateSelects(headers) {
    const selects = ['col-row', 'col-col', 'col-treat', 'col-resp'];

    selects.forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            sel.appendChild(opt);
        });
    });

    // Auto-guess
    guessSelection('col-row', headers, ['row', 'r', 'block']);
    guessSelection('col-col', headers, ['col', 'column', 'c']);
    guessSelection('col-treat', headers, ['treat', 'treatment', 't', 'variety', 'geno']);
    guessSelection('col-resp', headers, ['yield', 'height', 'weight', 'response', 'y']);
}

function guessSelection(id, headers, keywords) {
    const sel = document.getElementById(id);
    const match = headers.find(h => keywords.some(k => h.toLowerCase().includes(k)));
    if (match) sel.value = match;
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
}

function hideError() {
    errorBox.style.display = 'none';
}

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!selectedFile) return;

    emptyState.classList.add('hidden');
    outputContent.classList.add('hidden');
    loading.classList.remove('hidden');
    hideError();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('row_col', document.getElementById('col-row').value);
    formData.append('col_col', document.getElementById('col-col').value);
    formData.append('treat_col', document.getElementById('col-treat').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.status === 'error') {
            showError(data.message);
            loading.classList.add('hidden');
        } else {
            renderResults(data);
        }
    } catch (e) {
        showError("An error occurred during analysis: " + e.message);
        loading.classList.add('hidden');
    }
});

function renderResults(data) {
    loading.classList.add('hidden');
    outputContent.classList.remove('hidden');

    // Interpretation
    document.getElementById('interpretation').textContent = data.interpretation;

    // ANOVA Table
    const anovaBody = document.querySelector('#anova-table tbody');
    anovaBody.innerHTML = '';

    const sources = ['Rows', 'Columns', 'Treatments', 'Error', 'Total'];
    sources.forEach(src => {
        const row = data.anova[src];
        const tr = document.createElement('tr');

        // Sig Badge
        let sigHtml = '';
        if (row.sig) {
            const cls = row.sig === '**' ? 'badge badge-high' : (row.sig === '*' ? 'badge badge-star' : 'badge badge-ns');
            sigHtml = `<span class="${cls}">${row.sig}</span>`;
        }

        tr.innerHTML = `
            <td>${src}</td>
            <td>${row.df}</td>
            <td>${row.SS.toFixed(4)}</td>
            <td>${row.MS ? row.MS.toFixed(4) : ''}</td>
            <td>${row.F ? row.F.toFixed(4) : ''}</td>
            <td>${row.P ? row.P.toFixed(4) : ''}</td>
            <td>${sigHtml}</td>
        `;
        anovaBody.appendChild(tr);
    });

    // Means Table
    const meansBody = document.querySelector('#means-table tbody');
    meansBody.innerHTML = '';
    data.means.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.treatment}</td>
            <td>${m.mean.toFixed(4)}</td>
            <td style="font-weight:bold; color: #d63384;">${m.group}</td>
            <td>${m.sd.toFixed(4)}</td>
            <td>${m.se.toFixed(4)}</td>
        `;
        meansBody.appendChild(tr);
    });

    // Stats
    document.getElementById('stat-sem').textContent = data.precision.sem.toFixed(4);
    document.getElementById('stat-sed').textContent = data.precision.sed.toFixed(4);
    document.getElementById('stat-cv').textContent = data.precision.cv.toFixed(2) + '%';
    document.getElementById('stat-cd').textContent = data.precision.cd.toFixed(4);
    document.getElementById('cd-alpha-label').textContent = document.getElementById('alpha').value;


    // Download Link
    const downloadBtn = document.getElementById('download-link');
    // Remove previous listeners if any (simple cloning trick to clear listeners)
    const newBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        downloadReport();
    });
    newBtn.style.cursor = 'pointer';
}

async function downloadReport() {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('row_col', document.getElementById('col-row').value);
    formData.append('col_col', document.getElementById('col-col').value);
    formData.append('treat_col', document.getElementById('col-treat').value);
    formData.append('resp_col', document.getElementById('col-resp').value);
    formData.append('alpha', document.getElementById('alpha').value);
    formData.append('post_hoc', document.getElementById('post-hoc').value);
    formData.append('mean_order', document.getElementById('mean-order').value);

    // Show loading state on button
    const btn = document.getElementById('download-link');
    const originalText = btn.textContent;
    btn.textContent = "Generating...";

    try {
        const response = await fetch('/report', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "LSD_Analysis_Report.docx";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert("Failed to generate report.");
        }
    } catch (e) {
        console.error(e);
        alert("Error downloading report.");
    } finally {
        btn.textContent = originalText;
    }
}
