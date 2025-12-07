// pages/anova.js
import React, { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { saveAs } from 'file-saver'
import jStat from 'jstat' // add to package.json: "jstat": "^1.9.4"

function numericColumn(arr){
  return arr.map(v=>{
    if(v===null||v===undefined||v==='') return NaN
    const n = Number(v)
    return Number.isFinite(n)? n : NaN
  })
}

function round(v,d=3){ return typeof v === 'number' && isFinite(v) ? Math.round(v*(10**d))/(10**d) : '' }

function computeANOVA(data, responseCol, groupCol){
  // data: array of objects
  const groups = {}
  for(const r of data){
    const g = r[groupCol] === undefined ? 'NA' : String(r[groupCol])
    const val = r[responseCol]
    const num = Number(val)
    if(!groups[g]) groups[g] = []
    if(Number.isFinite(num)) groups[g].push(num)
  }
  const groupNames = Object.keys(groups)
  const k = groupNames.length
  const ni = groupNames.map(g => groups[g].length)
  const N = ni.reduce((a,b)=>a+b,0)
  const means = groupNames.map(g => {
    const arr = groups[g]
    return arr.length? (arr.reduce((s,x)=>s+x,0)/arr.length): NaN
  })
  const overallMean = groupNames.reduce((acc,g,idx)=> acc + (means[idx] * ni[idx] || 0), 0) / N

  // SSB (between)
  let SSB = 0
  groupNames.forEach((g, idx) => {
    SSB += ni[idx] * Math.pow(means[idx] - overallMean, 2)
  })
  // SSW (within)
  let SSW = 0
  groupNames.forEach((g, idx) => {
    const arr = groups[g]
    const m = means[idx]
    for(const x of arr) SSW += Math.pow(x - m, 2)
  })
  const SST = SSB + SSW
  const dfBetween = k - 1
  const dfWithin = N - k
  const msBetween = dfBetween? SSB / dfBetween : NaN
  const msWithin = dfWithin? SSW / dfWithin : NaN
  const F = (msWithin? msBetween / msWithin : NaN)
  // p-value using jStat
  let pValue = NaN
  try{
    // jStat.centralF.cdf might be available
    // Many jStat builds: use 1 - jStat.centralF.cdf(F, dfBetween, dfWithin)
    if(typeof jStat.centralF === 'function'){
      pValue = 1 - jStat.centralF(F, dfBetween, dfWithin)
    } else if(jStat && jStat.centralF && typeof jStat.centralF.cdf === 'function'){
      pValue = 1 - jStat.centralF.cdf(F, dfBetween, dfWithin)
    } else if(jStat && jStat.fcdf){
      pValue = 1 - jStat.fcdf(F, dfBetween, dfWithin)
    } else if(jStat && jStat['jStat'] && jStat['jStat'].centralF){
      pValue = 1 - jStat.jStat.centralF(F, dfBetween, dfWithin)
    } else {
      // fallback to using jStat's cdf via jStat.ftest or jStat library function:
      pValue = 1 - jStat.ftest(F, dfBetween, dfWithin)
    }
  }catch(e){
    try{ pValue = 1 - jStat.ftest(F, dfBetween, dfWithin) }catch(e2){ pValue = NaN }
  }

  return {
    groups, groupNames, ni, N, means, overallMean,
    SSB, SSW, SST, dfBetween, dfWithin, msBetween, msWithin, F, pValue
  }
}

// draw a simple boxplot on canvas and return dataURL
function drawBoxplotSVG(groups, width=600, height=300, padding=40){
  // groups: {name: [nums]}
  // We'll draw one box per group horizontally
  const groupNames = Object.keys(groups)
  // compute global min/max for scale
  const all = []
  groupNames.forEach(g=> groups[g].forEach(v=> all.push(v)))
  const minv = Math.min(...all)
  const maxv = Math.max(...all)
  const innerW = width - padding*2
  const step = innerW / groupNames.length
  const boxW = Math.min(60, step*0.6)
  const scale = v => {
    if(maxv === minv) return padding + innerW/2
    // map to vertical position: higher value -> smaller y
    return padding + (1 - (v - minv)/(maxv - minv)) * (height - padding*2)
  }

  // build SVG elements
  let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' style='background:#fff'>`
  // title (optional)
  svg += `<rect x='0' y='0' width='${width}' height='${height}' fill='white'/>`
  // y-axis tick labels
  const ticks = 5
  for(let t=0;t<=ticks;t++){
    const val = minv + (t/ticks)*(maxv - minv)
    const y = scale(val)
    svg += `<line x1='${padding-6}' x2='${width-padding}' y1='${y}' y2='${y}' stroke='#eee'/>`
    svg += `<text x='8' y='${y+4}' font-size='11' fill='#333'>${round(val,3)}</text>`
  }

  // boxes
  groupNames.forEach((g, idx)=>{
    const arr = groups[g].slice().sort((a,b)=>a-b)
    const q1 = arr[Math.floor((arr.length-1)*0.25)]
    const q2 = arr[Math.floor((arr.length-1)*0.5)]
    const q3 = arr[Math.floor((arr.length-1)*0.75)]
    const minNon = arr[0]
    const maxNon = arr[arr.length-1]
    const centerX = padding + idx*step + step/2
    const xLeft = centerX - boxW/2
    const xRight = centerX + boxW/2

    // whiskers
    svg += `<line x1='${centerX}' x2='${centerX}' y1='${scale(minNon)}' y2='${scale(maxNon)}' stroke='#222' stroke-width='1'/>`
    // box
    svg += `<rect x='${xLeft}' y='${scale(q3)}' width='${boxW}' height='${Math.max(1, scale(q1)-scale(q3))}' fill='#213' opacity='0.12' stroke='#213'/>`
    // median line
    svg += `<line x1='${xLeft}' x2='${xRight}' y1='${scale(q2)}' y2='${scale(q2)}' stroke='#213' stroke-width='2'/>`
    // whisker caps
    svg += `<line x1='${centerX-12}' x2='${centerX+12}' y1='${scale(minNon)}' y2='${scale(minNon)}' stroke='#222'/>`
    svg += `<line x1='${centerX-12}' x2='${centerX+12}' y1='${scale(maxNon)}' y2='${scale(maxNon)}' stroke='#222'/>`
    // group label
    svg += `<text x='${centerX}' y='${height - padding + 16}' text-anchor='middle' font-size='12' fill='#222'>${g}</text>`
  })

  svg += `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export default function AnovaPage(){
  const [raw, setRaw] = useState([])
  const [columns, setColumns] = useState([])
  const [response, setResponse] = useState('')
  const [group, setGroup] = useState('')
  const [result, setResult] = useState(null)
  const [plotWidth, setPlotWidth] = useState(800)
  const [plotHeight, setPlotHeight] = useState(350)
  const svgRef = useRef(null)

  function handleFile(file){
    Papa.parse(file, {
      header:true,
      skipEmptyLines:true,
      dynamicTyping:false,
      complete: (results)=>{
        setRaw(results.data)
        setColumns(results.meta.fields || [])
        setResponse('')
        setGroup('')
        setResult(null)
      }
    })
  }

  function runANOVA(){
    if(!response || !group) return
    const res = computeANOVA(raw, response, group)
    setResult(res)
    // render plot as dataURL in svgRef for preview
  }

  function downloadDoc(){
    if(!result) return
    // create an SVG dataURI then convert to PNG via canvas to embed in Word HTML
    const svgDataUri = drawBoxplotSVG(result.groups, plotWidth, plotHeight)
    // create an image to draw into canvas
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = plotWidth
      canvas.height = plotHeight
      const ctx = canvas.getContext('2d')
      // white background
      ctx.fillStyle = '#fff'
      ctx.fillRect(0,0,canvas.width,canvas.height)
      ctx.drawImage(img, 0, 0)
      const pngData = canvas.toDataURL('image/png')
      // Build HTML for Word (msword can open HTML blobs)
      const htmlParts = []
      htmlParts.push(`<h2>One-way ANOVA Result</h2>`)
      htmlParts.push(`<h3>ANOVA Table</h3>`)
      htmlParts.push(`<table border="1" cellpadding="6" cellspacing="0"><tr><th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p-value</th></tr>`)
      htmlParts.push(`<tr><td>Between</td><td>${round(result.SSB,4)}</td><td>${result.dfBetween}</td><td>${round(result.msBetween,4)}</td><td>${round(result.F,4)}</td><td>${round(result.pValue,6)}</td></tr>`)
      htmlParts.push(`<tr><td>Within</td><td>${round(result.SSW,4)}</td><td>${result.dfWithin}</td><td>${round(result.msWithin,4)}</td><td>-</td><td>-</td></tr>`)
      htmlParts.push(`<tr><td>Total</td><td>${round(result.SST,4)}</td><td>${result.N - 1}</td><td>-</td><td>-</td><td>-</td></tr>`)
      htmlParts.push(`</table>`)
      htmlParts.push(`<h3>Group Means</h3>`)
      htmlParts.push(`<table border="1" cellpadding="6" cellspacing="0"><tr><th>Group</th><th>n</th><th>Mean</th></tr>`)
      result.groupNames.forEach((g, idx)=>{
        htmlParts.push(`<tr><td>${g}</td><td>${result.ni[idx]}</td><td>${round(result.means[idx],4)}</td></tr>`)
      })
      htmlParts.push(`</table>`)
      htmlParts.push(`<h3>Boxplot</h3>`)
      htmlParts.push(`<img src="${pngData}" style="max-width:100%;height:auto" />`)
      const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><title>ANOVA results</title></head><body>${htmlParts.join('')}</body></html>`
      const blob = new Blob([fullHtml], { type: 'application/msword' })
      saveAs(blob, 'anova-results.doc')
    }
    img.onerror = (e)=> {
      alert('Failed to render plot image for doc download.')
    }
    img.src = svgDataUri
  }

  // Preview plot SVG dataURL
  const plotDataUri = result ? drawBoxplotSVG(result.groups, plotWidth, plotHeight) : null

  return (
    <div className="container">
      <div className="header" style={{marginBottom:12}}>
        <h2>One-way ANOVA (client-side)</h2>
        <div style={{display:'flex', gap:8}}>
          <label className="btn">Select CSV<input type="file" accept=".csv" style={{display:'none'}} onChange={(e)=>{ if(e.target.files[0]) handleFile(e.target.files[0])}} /></label>
        </div>
      </div>

      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <div>
          <div className="small">Response (numeric)</div>
          <select value={response} onChange={e=>setResponse(e.target.value)}>
            <option value=''>-- choose response --</option>
            {columns.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <div className="small">Grouping factor (categorical)</div>
          <select value={group} onChange={e=>setGroup(e.target.value)}>
            <option value=''>-- choose group --</option>
            {columns.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <button className="btn" onClick={runANOVA} disabled={!response || !group}>Run ANOVA</button>
        </div>
      </div>

      <div style={{marginTop:14, display:'flex', gap:16, alignItems:'center'}}>
        <div>
          <label className="small">Plot width</label><br />
          <input type="number" value={plotWidth} onChange={e=>setPlotWidth(Number(e.target.value)||600)} style={{width:90}} />
        </div>
        <div>
          <label className="small">Plot height</label><br />
          <input type="number" value={plotHeight} onChange={e=>setPlotHeight(Number(e.target.value)||300)} style={{width:90}} />
        </div>

        <div style={{marginLeft:'auto'}}>
          <button className="btn" onClick={downloadDoc} disabled={!result}>Download .doc (ANOVA + plot)</button>
        </div>
      </div>

      <section style={{marginTop:18}}>
        <h3>ANOVA table & plot</h3>
        {!result && <div className="small">Run ANOVA to see results</div>}
        {result && (
          <div>
            <table className="table" style={{maxWidth:900}}>
              <thead style={{background:'#0b6a13', color:'#fff'}}><tr>
                <th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p-value</th>
              </tr></thead>
              <tbody>
                <tr><td>Between</td><td>{round(result.SSB,4)}</td><td>{result.dfBetween}</td><td>{round(result.msBetween,4)}</td><td>{round(result.F,4)}</td><td>{round(result.pValue,6)}</td></tr>
                <tr><td>Within</td><td>{round(result.SSW,4)}</td><td>{result.dfWithin}</td><td>{round(result.msWithin,4)}</td><td>-</td><td>-</td></tr>
                <tr><td>Total</td><td>{round(result.SST,4)}</td><td>{result.N - 1}</td><td>-</td><td>-</td><td>-</td></tr>
              </tbody>
            </table>

            <div style={{marginTop:14}}>
              <div>Group means</div>
              <table className="table" style={{width:360}}>
                <thead><tr><th>Group</th><th>n</th><th>Mean</th></tr></thead>
                <tbody>
                  {result.groupNames.map((g,idx)=>(
                    <tr key={g}><td>{g}</td><td>{result.ni[idx]}</td><td>{round(result.means[idx],4)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{marginTop:18}}>
              <div>Boxplot (custom size)</div>
              <div style={{border:'1px solid #eee', display:'inline-block', padding:6, background:'#fff'}}>
                {plotDataUri && <img alt="boxplot" src={plotDataUri} ref={svgRef} style={{maxWidth:'100%'}} />}
              </div>
            </div>
          </div>
        )}
      </section>

      <style jsx>{`
        .container { max-width:1100px; margin:28px auto; padding:18px; background:white; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.06) }
        .header{display:flex;justify-content:space-between;align-items:center}
        .btn{background:#168f3d;color:white;padding:8px 12px;border-radius:6px;border:none;cursor:pointer}
        .table{width:100%;border-collapse:collapse;margin-top:14px}
        .table th, .table td{padding:8px 10px;text-align:left;border-bottom:1px solid #eee}
      `}</style>
    </div>
  )
}
