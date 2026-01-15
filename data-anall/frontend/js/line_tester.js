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
    const repSel = document.getElementById('rep-col');
    const lineSel = document.getElementById('line-col');
    const testerSel = document.getElementById('tester-col');
    const traitSel = document.getElementById('trait-col');
    const alphaInput = document.getElementById('alpha');
    const analyzeBtn = document.getElementById('analyze-btn');

    let fileObj = null;

    // File handling
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => { if (e.target.files.length) handleFile(e.target.files[0]); };

    function handleFile(file) {
        fileObj = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const heads = e.target.result.split('\n')[0].split(',').map(h => h.trim());
            [repSel, lineSel, testerSel, traitSel].forEach(s => {
                s.innerHTML = heads.map(h => `<option value="${h}">${h}</option>`).join('');
            });
            // Try smart defaults
            heads.forEach((h, i) => {
                const low = h.toLowerCase();
                if (low.includes('rep')) repSel.selectedIndex = i;
                if (low.includes('line')) lineSel.selectedIndex = i;
                if (low.includes('test')) testerSel.selectedIndex = i;
                if (low.includes('trait') || low.includes('yield')) traitSel.selectedIndex = i;
            });
            configPanel.classList.remove('hidden');
            uploadMsg.innerHTML = `<p style="color:#4ade80;">✅ ${file.name}</p>`;
        };
        reader.readAsText(file);
    }

    analyzeBtn.onclick = async () => {
        errorBox.style.display = 'none';
        loading.classList.remove('hidden');
        outputContent.classList.add('hidden');
        emptyState.classList.add('hidden');

        const fd = new FormData();
        fd.append('file', fileObj);
        fd.append('line_col', lineSel.value);
        fd.append('tester_col', testerSel.value);
        fd.append('rep_col', repSel.value);
        fd.append('trait_col', traitSel.value);
        fd.append('alpha', alphaInput.value);

        try {
            const r = await fetch('http://localhost:8000/analyze_line_tester', { method: 'POST', body: fd });
            const res = await r.json();
            loading.classList.add('hidden');

            if (res.status === 'success') {
                outputContent.classList.remove('hidden');
                renderResults(res);
                setupDownload(fd, traitSel.value);
            } else {
                showError(res.message);
            }
        } catch (e) { loading.classList.add('hidden'); showError("Network Error. Check backend."); }
    };

    function renderResults(res) {
        // Summary
        document.getElementById('res-mean').innerText = res.summary.Mean.toFixed(4);
        document.getElementById('res-cv').innerText = res.summary.CV.toFixed(2);

        // ANOVA
        const anovaBody = document.getElementById('anova-body');
        anovaBody.innerHTML = res.anova.map(r => `
            <tr>
                <td>${r.Source}</td>
                <td>${r.DF}</td>
                <td>${r.SS.toFixed(4)}</td>
                <td>${r.MS ? r.MS.toFixed(4) : '-'}</td>
                <td>${r.F ? r.F.toFixed(4) : '-'}</td>
                <td style="color:${r.p < 0.05 ? '#4ade80' : 'inherit'}">${r.p ? r.p.toFixed(4) : '-'}</td>
            </tr>
        `).join('');

        // GCA Lines
        const lineBody = document.getElementById('gca-line-body');
        lineBody.innerHTML = res.gca_lines.map(r => `
            <tr>
                <td>${r.Line}</td>
                <td>${r.Effect.toFixed(4)}</td>
                <td>${r.SE.toFixed(4)}</td>
                <td>${r.t_value.toFixed(4)}</td>
                <td class="sig-star">${r.Sig}</td>
            </tr>
        `).join('');

        // GCA Testers
        const testerBody = document.getElementById('gca-tester-body');
        testerBody.innerHTML = res.gca_testers.map(r => `
            <tr>
                <td>${r.Tester}</td>
                <td>${r.Effect.toFixed(4)}</td>
                <td>${r.SE.toFixed(4)}</td>
                <td>${r.t_value.toFixed(4)}</td>
                <td class="sig-star">${r.Sig}</td>
            </tr>
        `).join('');

        // Variances
        const v = res.variances;
        document.getElementById('var-gca-l').innerText = v.sigma2_gca_lines.toFixed(4);
        document.getElementById('var-gca-t').innerText = v.sigma2_gca_testers.toFixed(4);
        document.getElementById('var-sca').innerText = v.sigma2_sca.toFixed(4);
        document.getElementById('var-a').innerText = v.sigma2_a.toFixed(4);
        document.getElementById('var-d').innerText = v.sigma2_d.toFixed(4);
        document.getElementById('var-dom').innerText = v.Degree_of_Dominance.toFixed(4);
        document.getElementById('res-interpretation').innerText = res.interpretation;
    }

    function setupDownload(fd, trait) {
        const btn = document.getElementById('dl-doc-btn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = async () => {
            newBtn.disabled = true; newBtn.innerText = "Generating...";
            const r = await fetch('http://localhost:8000/report_line_tester', { method: 'POST', body: fd });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `LT_Analysis_${trait}.docx`; a.click();
            newBtn.disabled = false; newBtn.innerText = "Download Comprehensive Report (DOCX)";
        };
    }

    function showError(m) {
        errorBox.innerText = m;
        errorBox.style.display = 'block';
    }
});
