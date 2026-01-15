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
    const ids = ['col-year', 'col-main', 'col-sub', 'col-rep', 'col-resp'];
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
    guess('col-year', ['year', 'loc', 'env']);
    guess('col-main', ['main', 'a', 'factor a']);
    guess('col-sub', ['sub', 'b', 'factor b']);
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
    fd.append('year_col', document.getElementById('col-year').value);
    fd.append('main_a', document.getElementById('col-main').value);
    fd.append('sub_b', document.getElementById('col-sub').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);

    try {
        const res = await fetch('/analyze_split_pooled', { method: 'POST', body: fd });
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

    // Bartlett
    const b = data.bartlett || {};
    document.getElementById('bartlett-box').innerHTML = `
        <div class="glass-card" style="padding:1rem;">
            <p>F-Ratio (Max/Min MSE): <b>${b.F_ratio ? b.F_ratio.toFixed(4) : '-'}</b></p>
            <p>Result: <b style="color:${b.result?.includes('Hetero') ? '#f87171' : '#4ade80'}">${b.result || '-'}</b></p>
            <small>Max MS: ${b.max_ms?.toFixed(4)}, Min MS: ${b.min_ms?.toFixed(4)}</small>
        </div>
    `;

    // ANOVA
    const ab = document.querySelector('#anova-table tbody');
    ab.innerHTML = '';
    const order = [
        "Year (Y)", "Rep (within Y)", "Main Plot (A)", "Year x Main (Y x A)", "Error (a)",
        "Sub Plot (B)", "Year x Sub (Y x B)", "Main x Sub (A x B)", "Year x Main x Sub", "Error (b)", "Total"
    ];
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

    // Overall Stats
    let html = `
    <div style="margin-bottom:1rem; text-align:right; font-weight:bold; color:#4ade80;">
        CV (a) %: ${ph.stats['CV (a)'].toFixed(2)} | CV (b) %: ${ph.stats['CV (b)'].toFixed(2)}
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; margin-bottom:2rem;">
    `;

    const makeCardGroup = (title, stats) => {
        if (!stats) return '';
        return `
        <div class="glass-card" style="padding:1rem;">
            <h4 style="margin-bottom:0.5rem; text-align:center; color:#d63384;">${title}</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; text-align:center; font-size:0.9rem;">
                <div><small>SEm</small><div><b>${stats.SEm.toFixed(4)}</b></div></div>
                <div><small>SEd</small><div><b>${stats.SEd.toFixed(4)}</b></div></div>
            </div>
            <div style="margin-top:0.5rem; text-align:center;">
                <small>CD</small><div><b>${stats.CD.toFixed(4)}</b></div>
            </div>
        </div>`;
    };

    const keys = ["Year (Y)", "Main Plot (A)", "Sub Plot (B)", "Main x Sub (A x B)"];
    keys.forEach(k => html += makeCardGroup(k, ph.stats[k]));
    html += `</div>`;
    cards.innerHTML = html;

    // Means Tables
    const c = document.getElementById('means-results-container');
    c.innerHTML = '';

    const createTable = (title, dataset) => {
        if (!dataset || !dataset.means) return '';

        return `
        <h3 style="margin-top:2rem;">${title}</h3>
        <div style="overflow-x:auto">
            <table class="means-table">
                <thead>
                    <tr>
                        <th>Level</th>
                        <th>Mean</th>
                        <th>St.Dev</th>
                        <th>St.Err</th>
                        <th>Group</th>
                    </tr>
                </thead>
                <tbody>
                    ${dataset.means.map(m => `
                        <tr>
                            <td>${m.level}</td>
                            <td>${m.mean.toFixed(4)}</td>
                            <td>${m.std.toFixed(4)}</td>
                            <td>${m.se.toFixed(4)}</td>
                            <td style="color:#d63384; font-weight:bold;">${dataset.grouping[m.level] || 'ns'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    };

    keys.forEach(k => {
        c.innerHTML += createTable(`${k} Means`, ph[k]);
    });
}

document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    const btn = document.getElementById('download-btn');
    btn.textContent = "Generating...";

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('year_col', document.getElementById('col-year').value);
    fd.append('main_a', document.getElementById('col-main').value);
    fd.append('sub_b', document.getElementById('col-sub').value);
    fd.append('rep_col', document.getElementById('col-rep').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);

    try {
        const res = await fetch('/report_split_pooled', { method: 'POST', body: fd });
        if (res.ok) {
            const b = await res.blob();
            const url = window.URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = "Pooled_Split_Plot_Report.docx";
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
