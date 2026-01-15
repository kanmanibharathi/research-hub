const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const configPanel = document.getElementById('config-panel');
const emptyState = document.getElementById('empty-state');
const outputContent = document.getElementById('output-content');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error-box');

let selectedFile = null;

// Drag and drop handlers
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
        configPanel.classList.remove('hidden');
        dropZone.classList.add('file-loaded');
        document.getElementById('upload-msg').innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                <div style="font-size: 2rem;">✅</div>
                <div style="text-align: center;">
                    <p style="font-size: 0.85rem; text-transform: uppercase; color: #4ade80; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 0.25rem;">File Ready</p>
                    <p style="color: #fff; font-weight: 600; word-break: break-all;">${file.name}</p>
                </div>
            </div>`;
        hideError();
    };
    r.readAsText(file);
}

function populateSelects(headers) {
    const ids = ['col-treat', 'col-year', 'col-resp'];
    ids.forEach(id => {
        const s = document.getElementById(id);
        s.innerHTML = '';
        headers.forEach(h => {
            const o = document.createElement('option'); o.value = h; o.textContent = h; s.appendChild(o);
        });
    });
    // Auto guess
    const guess = (id, kws) => {
        const m = headers.find(h => kws.some(k => h.toLowerCase().includes(k)));
        if (m) document.getElementById(id).value = m;
    };
    guess('col-treat', ['treat', 'genotype', 'cultivar']);
    guess('col-year', ['year', 'loc', 'env', 'site']);
    guess('col-resp', ['yield', 'val', 'resp', 'height']);
}

function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
function hideError() { errorBox.style.display = 'none'; }

document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    loading.classList.remove('hidden');
    outputContent.classList.add('hidden');
    emptyState.classList.add('hidden'); // Ensure empty state is hidden
    hideError();

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('treat_col', document.getElementById('col-treat').value);
    fd.append('year_col', document.getElementById('col-year').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);
    fd.append('mean_order', document.getElementById('mean-order').value);

    try {
        const res = await fetch('/analyze_pooled_crd', { method: 'POST', body: fd });
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
    emptyState.classList.add('hidden'); // Ensure empty state is hidden on success

    // Bartlett's Test Results
    if (data.bartlett) {
        const b = data.bartlett;
        document.getElementById('bartlett-stat').textContent = b.stat.toFixed(4);
        document.getElementById('bartlett-p').textContent = b.p.toFixed(4);

        const bDec = document.getElementById('bartlett-decision');
        const bMsg = document.getElementById('pooling-msg');

        if (b.valid) {
            bDec.textContent = "Homogeneous";
            bDec.className = "badge";
            bDec.style.backgroundColor = "#4ade80"; // Green
            bDec.style.color = "#000";
            bMsg.textContent = "Variances are homogeneous. Pooled CRD ANOVA is valid.";
            bMsg.style.color = "#4ade80";
        } else {
            bDec.textContent = "Heterogeneous";
            bDec.className = "badge";
            bDec.style.backgroundColor = "#f87171"; // Red
            bDec.style.color = "#fff";
            bMsg.textContent = "Warning: Error variances are heterogeneous. Pooled ANOVA results may be suspect.";
            bMsg.style.color = "#f87171";
        }
    }

    // ANOVA
    const ab = document.querySelector('#anova-table tbody');
    ab.innerHTML = '';
    const order = ["Treatment", "Year", "Interaction (T x Y)", "Error", "Total"];

    order.forEach(src => {
        if (!data.anova[src]) return;
        const r = data.anova[src];
        const tr = document.createElement('tr');

        let s = '';
        if (r.sig) {
            const cls = r.sig === '**' ? 'badge-high' : 'badge-star';
            s = `<span class="badge ${cls}">${r.sig}</span>`;
        }

        const ms_val = r.MS !== null ? r.MS.toFixed(4) : '';
        const f_val = r.F !== null ? r.F.toFixed(4) : '';
        const p_val = r.P !== null ? r.P.toFixed(4) : '';
        const sig_val = r.P !== null ? s : '';

        tr.innerHTML = `<td>${src}</td>
        <td>${r.df}</td>
        <td>${r.SS.toFixed(4)}</td>
        <td>${ms_val}</td>
        <td>${f_val}</td>
        <td>${p_val}</td>
        <td>${sig_val}</td>`;
        ab.appendChild(tr);
    });

    // Means
    const c = document.getElementById('means-results-container');
    c.innerHTML = '';

    if (data.post_hoc) {
        const ph = data.post_hoc;
        const createTable = (title, factorData, showStats) => {
            let warning = "";
            if (!factorData.test_performed) {
                warning = `<div style="background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; color: #fca5a5;">
                    <span style="font-weight: bold;">Notice:</span> ${factorData.reason}
                </div>`;
            }

            let statsHtml = '';
            if (showStats) {
                statsHtml = `
                <div class="stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">Pooled SEm</div>
                        <div style="font-size: 1.5rem; font-weight: 800;">${factorData.sem_pooled.toFixed(4)}</div>
                    </div>
                    <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">SE(d)</div>
                        <div style="font-size: 1.5rem; font-weight: 800;">${factorData.sed.toFixed(4)}</div>
                    </div>
                    <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">CD</div>
                        <div style="font-size: 1.5rem; font-weight: 800;">${factorData.cd.toFixed(4)}</div>
                    </div>
                    <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="color: #94a3b8; font-size: 0.8rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 0.5rem; text-transform: uppercase;">CV%</div>
                        <div style="font-size: 1.5rem; font-weight: 800;">${ph.cv.toFixed(2)}</div>
                    </div>
                </div>`;
            }

            return `<h3>${title}</h3>
            ${warning}
            ${statsHtml}
            <div style="overflow-x:auto"><table class="means-table">
            <thead><tr><th>Level</th><th>Mean</th><th>St.Dev</th><th>St.Err</th><th>Group</th></tr></thead>
            <tbody>
               ${factorData.means.map(m => `<tr>
                   <td>${m.level}</td>
                   <td>${m.mean.toFixed(4)}</td>
                   <td>${m.sd.toFixed(4)}</td>
                   <td>${m.se.toFixed(4)}</td>
                   <td style="font-weight:bold;color:#d63384">${m.group}</td>
               </tr>`).join('')}
            </tbody></table></div>`;
        };

        const d = document.createElement('div');
        d.innerHTML = createTable("Treatment Means", ph.Treatment, true) +
            "<br><br>" +
            createTable("Year / Location Means", ph.Year, false);
        c.appendChild(d);
    }
}

document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedFile) return;
    const btn = document.getElementById('download-btn');
    btn.textContent = "Generating...";
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('treat_col', document.getElementById('col-treat').value);
    fd.append('year_col', document.getElementById('col-year').value);
    fd.append('resp_col', document.getElementById('col-resp').value);
    fd.append('alpha', document.getElementById('alpha').value);
    fd.append('post_hoc', document.getElementById('post-hoc').value);
    fd.append('mean_order', document.getElementById('mean-order').value);

    try {
        const res = await fetch('/report_pooled_crd', { method: 'POST', body: fd });
        if (res.ok) {
            const b = await res.blob();
            const u = window.URL.createObjectURL(b);
            const a = document.createElement('a'); a.href = u; a.download = "PooledCRD_Report.docx";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } else alert("Error generating report");
    } catch (e) { alert(e); }
    btn.textContent = "Download Report (DOCX)";
});
