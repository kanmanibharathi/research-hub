const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const configForm = document.getElementById('config-form');
const emptyState = document.getElementById('empty-state');
const outputContent = document.getElementById('output-content');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error-box');

let selectedFile = null;

// Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#d63384'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
    if (!file.name.endsWith('.csv')) { showError("CSV only."); return; }
    selectedFile = file;
    const r = new FileReader();
    r.onload = e => {
        const h = e.target.result.split('\n')[0].split(',').map(x => x.trim());
        populateSelects(h);
        configForm.classList.remove('hidden');
        document.getElementById('upload-msg').innerHTML = `<p style="color:#4ade80">File Ready: ${file.name}</p>`;
        hideError();
    };
    r.readAsText(file);
}

function populateSelects(headers) {
    const ids = ['col-treat', 'col-rep', 'col-resp'];
    ids.forEach(id => {
        const s = document.getElementById(id);
        s.innerHTML = '';
        headers.forEach(h => {
            const o = document.createElement('option');
            o.value = h;
            o.textContent = h;
            s.appendChild(o);
        });
    });

    // Auto guess
    const guess = (id, kws) => {
        const m = headers.find(h => kws.some(k => h.toLowerCase().includes(k)));
        if (m) document.getElementById(id).value = m;
    };
    guess('col-treat', ['treat', 'genotype', 'cultivar']);
    guess('col-rep', ['rep', 'block']);
    guess('col-resp', ['yield', 'val', 'height', 'resp']);
}

function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
function hideError() { errorBox.style.display = 'none'; }

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    loading.classList.remove('hidden');
    outputContent.classList.add('hidden');
    emptyState.classList.add('hidden');
    hideError();

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('treat_col', document.getElementById('col-treat').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);
    fd.append('mean_order', document.getElementById('mean-order').value);

    try {
        const res = await fetch('/analyze_one_factor_rcbd', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.status === 'error') {
            showError(data.message);
            loading.classList.add('hidden');
        } else {
            renderResults(data);
        }
    } catch (e) {
        showError(e.message);
        loading.classList.add('hidden');
    }
});

function renderResults(data) {
    loading.classList.add('hidden');
    outputContent.classList.remove('hidden');

    // ANOVA
    const ab = document.querySelector('#anova-table tbody');
    ab.innerHTML = '';
    const order = ["Replication", "Treatment", "Error", "Total"];
    order.forEach(k => {
        if (!data.anova[k]) return;
        const r = data.anova[k];
        const tr = document.createElement('tr');

        let sig = '';
        if (r.sig) sig = `<span class="badge ${r.sig === '**' ? 'badge-high' : 'badge-star'}">${r.sig}</span>`;

        tr.innerHTML = `
            <td>${k}</td>
            <td>${r.df}</td>
            <td>${r.SS.toFixed(4)}</td>
            <td>${r.MS ? r.MS.toFixed(4) : '-'}</td>
            <td>${r.F ? r.F.toFixed(4) : '-'}</td>
            <td>${r.P !== null ? r.P.toFixed(4) : '-'}</td>
            <td>${sig}</td>
        `;
        ab.appendChild(tr);
    });

    // Stats Cards
    const ph = data.post_hoc;
    const cards = document.getElementById('stats-cards-container');

    cards.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 2rem 0;">
            <div class="glass-card" style="padding: 1rem; text-align: center;">
                <small style="color:#aaa;">SEm</small><div><b>${ph.SEm.toFixed(4)}</b></div>
            </div>
            <div class="glass-card" style="padding: 1rem; text-align: center;">
                <small style="color:#aaa;">SEd</small><div><b>${ph.SEd.toFixed(4)}</b></div>
            </div>
            <div class="glass-card" style="padding: 1rem; text-align: center;">
                <small style="color:#aaa;">CD (${ph.Method})</small><div><b>${ph.CD.toFixed(4)}</b></div>
            </div>
            <div class="glass-card" style="padding: 1rem; text-align: center;">
                <small style="color:#aaa;">CV %</small><div><b>${ph.CV.toFixed(2)}</b></div>
            </div>
        </div>
    `;

    // Means Table
    const c = document.getElementById('means-results-container');
    c.innerHTML = '';

    if (ph.Treatment) {
        let html = `
        <h3>Treatment Means</h3>
        <div style="overflow-x:auto">
            <table class="means-table">
                <thead>
                    <tr>
                        <th>Treatment</th>
                        <th>Mean</th>
                        <th>St.Dev</th>
                        <th>St.Err</th>
                        <th>Group</th>
                    </tr>
                </thead>
                <tbody>
                    ${ph.Treatment.means.map(m => `
                        <tr>
                            <td>${m.level}</td>
                            <td>${m.mean.toFixed(4)}</td>
                            <td>${m.std.toFixed(4)}</td>
                            <td>${m.se.toFixed(4)}</td>
                            <td style="color:#d63384; font-weight:bold;">${ph.Treatment.grouping[m.level] || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
        c.innerHTML = html;
    } else {
        c.innerHTML = '';
    }
}

document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    const btn = document.getElementById('download-btn');
    btn.textContent = "Generating...";

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('treat_col', document.getElementById('col-treat').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);
    fd.append('mean_order', document.getElementById('mean-order').value);

    try {
        const res = await fetch('/report_one_factor_rcbd', { method: 'POST', body: fd });
        if (res.ok) {
            const b = await res.blob();
            const url = window.URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = "RCBD_Report.docx";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            alert('Error generating report');
        }
    } catch (e) {
        alert(e);
    }
    btn.textContent = "Download Report (DOCX)";
});
