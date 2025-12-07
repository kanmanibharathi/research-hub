import React, { useState, useMemo } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

// --- Helper statistics functions ---
function mean(arr){ const v=arr.filter(isFinite); if(!v.length) return NaN; return v.reduce((a,b)=>a+b,0)/v.length }
function sd(arr){ const v=arr.filter(isFinite); if(v.length<=1) return 0; const m=mean(v); return Math.sqrt(v.reduce((s,x)=>s+(x-m)*(x-m),0)/(v.length-1)) }
function median(arr){ const v=arr.filter(isFinite).sort((a,b)=>a-b); const n=v.length; if(n===0) return NaN; const mid=Math.floor(n/2); return n%2? v[mid] : (v[mid-1]+v[mid])/2 }
function minv(arr){ const v=arr.filter(isFinite); return v.length? Math.min(...v): NaN }
function maxv(arr){ const v=arr.filter(isFinite); return v.length? Math.max(...v): NaN }
function cv(arr){ const m=mean(arr); return m===0? NaN: (sd(arr)/m)*100 }
function skewness(arr){ const v=arr.filter(isFinite); const n=v.length; if(n<3) return 0; const m=mean(v); const s=sd(v); if(s===0) return 0; const a = v.reduce((acc,x)=> acc + Math.pow((x-m)/s,3),0) * (n/( (n-1)*(n-2) )); return a }
function kurtosis(arr){ const v=arr.filter(isFinite); const n=v.length; if(n<4) return 0; const m=mean(v); const s=sd(v); if(s===0) return 0; const num = v.reduce((acc,x)=> acc + Math.pow((x-m)/s,4),0); const k = ((n*(n+1))/((n-1)*(n-2)*(n-3))) * num - (3*(n-1)*(n-1)/((n-2)*(n-3))); return k }
function percentNA(col){ const total=col.length; const na = col.filter(x=> x===null || x===undefined || x==='').length; return (na/total)*100 }
function numericColumn(arr){ return arr.map(v=>{ if(v===null||v===undefined||v==='') return NaN; const n=Number(v); return Number.isFinite(n)? n : NaN }) }

// Simple histogram sparkline (mini bars)
function SparkHistogram({values}){
  const bins = 8
  const nums = values.filter(isFinite)
  if(nums.length===0) return <div style={{opacity:0.5}}>—</div>
  const minv = Math.min(...nums); const maxv = Math.max(...nums);
  const binCounts = new Array(bins).fill(0)
  nums.forEach(x=>{ const idx = Math.min(bins-1, Math.floor(((x-minv)/(maxv-minv||1))*bins)); binCounts[idx]++ })
  const maxc = Math.max(...binCounts)
  return <div style={{display:'flex',gap:3,alignItems:'end',height:28}}>
    {binCounts.map((c,i)=>(<div key={i} title={String(c)} style={{width:10,height: maxc? (c/maxc)*100+'%': '0%', background:'#223', borderRadius:3}} />))}
  </div>
}

export default function Home(){
  const [raw, setRaw] = useState([])
  const [columns, setColumns] = useState([])
  const [search, setSearch] = useState('')

  function handleFile(file){
    Papa.parse(file, {
      header:true,
      skipEmptyLines:true,
      dynamicTyping:false,
      complete: (results)=>{
        setRaw(results.data)
        setColumns(results.meta.fields || [])
      }
    })
  }

  function handlePasteCSV(){
    const text = prompt('Paste CSV text here')
    if(!text) return
    const res = Papa.parse(text, {header:true, skipEmptyLines:true})
    setRaw(res.data); setColumns(res.meta.fields)
  }

  const stats = useMemo(()=>{
    if(!raw.length) return []
    return columns.map(colName=>{
      const col = raw.map(r=> r[colName]===undefined? null : r[colName])
      const numeric = numericColumn(col)
      const s = {
        variable: colName,
        mean: Number.isFinite(mean(numeric))? round(mean(numeric),2): '',
        sd: Number.isFinite(sd(numeric))? round(sd(numeric),2): '',
        maximum: Number.isFinite(maxv(numeric))? round(maxv(numeric),2): '',
        minimum: Number.isFinite(minv(numeric))? round(minv(numeric),2): '',
        median: Number.isFinite(median(numeric))? round(median(numeric),2): '',
        cv: Number.isFinite(cv(numeric))? round(cv(numeric),2): '',
        skewness: Number.isFinite(skewness(numeric))? round(skewness(numeric),2): '',
        kurtosis: Number.isFinite(kurtosis(numeric))? round(kurtosis(numeric),2): '',
        pctna: round(percentNA(col),2),
        rawValues: numeric
      }
      return s
    })
  },[raw,columns])

  function round(v, d=2){ return Math.round(v*(10**d))/(10**d) }

  function downloadResults(){
    // create workbook client-side and trigger download. Do not store on server.
    const wb = XLSX.utils.book_new()
    const sheet1 = XLSX.utils.json_to_sheet(raw)
    XLSX.utils.book_append_sheet(wb, sheet1, 'data')
    // stats sheet
    const statsRows = stats.map(s=>({Variable:s.variable, Means:s.mean, SD:s.sd, Maximum:s.maximum, Minimum:s.minimum, Median:s.median, CV:s.cv, Skewness:s.skewness, Kurtosis:s.kurtosis, PercentNA:s.pctna }))
    const sheet2 = XLSX.utils.json_to_sheet(statsRows)
    XLSX.utils.book_append_sheet(wb, sheet2, 'summary')
    const wbout = XLSX.write(wb, {bookType:'xlsx',type:'array'})
    const blob = new Blob([wbout],{type:'application/octet-stream'})
    saveAs(blob, 'analysis-results.xlsx')
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2>Stat Summary — client-side</h2>
          <div className="small">Upload a CSV and get summary statistics and downloadable results. No server storage.</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <label className="btn">Select CSV<input type="file" accept=".csv" style={{display:'none'}} onChange={(e)=>{ if(e.target.files[0]) handleFile(e.target.files[0])}} /></label>
          <button className="btn secondary" onClick={handlePasteCSV}>Paste CSV</button>
          <button className="btn" onClick={downloadResults} disabled={!raw.length}>Download Results</button>
        </div>
      </div>

      <div style={{marginTop:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="small">Rows: {raw.length} Columns: {columns.length}</div>
        <input className="search" placeholder="Search column or value" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <section style={{marginTop:18}}>
        <h3>Data Preview</h3>
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead>
              <tr>{columns.map(c=>(<th key={c}>{c}</th>))}</tr>
            </thead>
            <tbody>
              {raw.slice(0,10).map((r,ri)=>(<tr key={ri}>{columns.map(c=>(<td key={c}>{String(r[c]===undefined? '': r[c])}</td>))}</tr>))}
            </tbody>
          </table>
        </div>
        <div className="small" style={{marginTop:8}}>Showing 1 to {Math.min(10,raw.length)} of {raw.length} entries</div>
      </section>

      <section style={{marginTop:20}}>
        <h3>Summary Statistics</h3>
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead style={{background:'#0b6a13',color:'white'}}>
              <tr>
                <th>Variable</th><th>Means</th><th>SD</th><th>Maximum</th><th>Minimum</th><th>Median</th><th>CV</th><th>Skewness</th><th>Kurtosis</th><th>%NA</th><th>Histogram</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s=>(
                <tr key={s.variable}>
                  <td>{s.variable}</td>
                  <td>{s.mean}</td>
                  <td>{s.sd}</td>
                  <td>{s.maximum}</td>
                  <td>{s.minimum}</td>
                  <td>{s.median}</td>
                  <td>{s.cv}</td>
                  <td>{s.skewness}</td>
                  <td>{s.kurtosis}</td>
                  <td>{s.pctna}</td>
                  <td><SparkHistogram values={s.rawValues} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer style={{marginTop:18,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="small">Client-side processing. Files are never uploaded to any server. When user downloads, blobs are generated client-side and not persisted on the host.</div>
        <div className="small">Source: Your uploaded sample used for layout and expectations.</div>
      </footer>
    </div>
  )
}
