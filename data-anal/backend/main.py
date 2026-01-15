from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import pandas as pd
import numpy as np
import io
import traceback



from experimental_design.lsd_analysis import LSDAnalyzer
from experimental_design.strip_plot_analysis import StripPlotAnalyzer
from experimental_design.crd_analysis import CRDAnalyzer
from experimental_design.factorial_crd_analysis import FactorialCRDAnalyzer
from experimental_design.three_factor_crd_analysis import ThreeFactorCRDAnalyzer
from experimental_design.pooled_crd_analysis import PooledCRDAnalyzer
from experimental_design.two_factor_pooled_crd import TwoFactorPooledCRDAnalyzer
from breeding.griffing_method1 import GriffingMethod1Analyzer
from breeding.griffing_method1_check import GriffingMethod1CheckAnalyzer
from breeding.griffing_method2 import GriffingMethod2Analyzer
from breeding.griffing_method2_check import GriffingMethod2CheckAnalyzer
from breeding.line_tester_analyzer import LineTesterAnalyzer
from breeding.genotypic_correlation import GenotypicCorrelationAnalyzer
from breeding.phenotypic_correlation import PhenotypicCorrelationAnalyzer
from breeding.genotypic_path_analysis import GenotypicPathAnalyzer
from breeding.phenotypic_path_analysis import PhenotypicPathAnalyzer
from breeding.mahalanobis_d2 import MahalanobisD2Analyzer
from breeding.genetic_parameters import GeneticParameterAnalyzer
from breeding.eberhart_russell import EberhartRussellAnalyzer
from hypothesis_testing.f_test import FTestAnalyzer
from hypothesis_testing.one_sample_t_test import OneSampleTTestAnalyzer
from hypothesis_testing.two_sample_t_test import TwoSampleTTestAnalyzer
from hypothesis_testing.paired_t_test import PairedTTestAnalyzer
from correlation_regression.regression_analyzer import RegressionAnalyzer


app = FastAPI()

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper for CRD
def perform_crd_analysis(df, treat_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = CRDAnalyzer(df, treat_col, resp_col)
    analyzer.validate()
    anova = analyzer.run_anova()
    results = analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    return analyzer, anova, results

@app.post("/analyze_crd")
async def analyze_crd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, anova, results = perform_crd_analysis(
            df, treat_col, resp_col, post_hoc, alpha, mean_order
        )
        
        return {
            "status": "success",
            "anova": {k: {**v, "sig": get_sig(v['P'])} for k, v in anova.items()},
            "results": {
                "means": results["means"], # Already serialized in CRDAnalyzer
                "se": results["SEm"],
                "sed": results["SEd"],
                "cv": results["CV"],
                "cd": results["CD"]
            }
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_crd")
async def report_crd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, _, _ = perform_crd_analysis(
            df, treat_col, resp_col, post_hoc, alpha, mean_order
        )
        
        report_buffer = analyzer.create_report()
        return StreamingResponse(
             report_buffer,
             media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             headers={"Content-Disposition": "attachment; filename=CRD_Analysis_Report.docx"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Strip Plot
def perform_strip_analysis(df, rep_col, a_col, b_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = StripPlotAnalyzer(df, rep_col, a_col, b_col, resp_col)
    analyzer.validate()
    anova = analyzer.run_anova()
    results = analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    return analyzer, anova, results

@app.post("/analyze_strip_plot")
async def analyze_strip_plot(
    file: UploadFile = File(...),
    rep_col: str = Form(...),
    a_col: str = Form(...), # Horizontal
    b_col: str = Form(...), # Vertical
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, anova, results = perform_strip_analysis(
            df, rep_col, a_col, b_col, resp_col, post_hoc, alpha, mean_order
        )
        
        # Serialize Results
        # Results is a dictionary { "Factor A": {means, grouping, SE, CD}, ... }
        # We need to convert Pandas Series to lists/dicts
        
        serialized_results = {}
        for key, val in results.items():
            means_list = []
            sds_series = val['sds'].to_dict() # helper
            ses_series = val['ses'].to_dict() # helper
            
            for idx, mean_val in val['means'].items():
                # idx is likely string, but let's be safe
                sd_val = sds_series.get(idx, 0.0)
                se_val = ses_series.get(idx, 0.0)
                
                means_list.append({
                    "level": str(idx),
                    "mean": float(mean_val),
                    "sd": float(sd_val) if not pd.isna(sd_val) else 0.0,
                    "se": float(se_val) if not pd.isna(se_val) else 0.0,
                    "group": val['grouping'].get(idx, "-")
                })
            
            serialized_results[key] = {
                "means": means_list,
                "se_pooled": float(val['SE']) if val['SE'] else 0, # Renamed to avoid confusion, but frontend uses result.se currently
                "se": float(val['SE']) if val['SE'] else 0, # Keep for backward compat with JS if needed
                "sed": float(val['SEd']) if val['SEd'] else 0,
                "cv": float(val['CV']) if val['CV'] else 0,
                "cd": float(val['CD']) if val['CD'] else 0
            }

        return {
            "status": "success",
            "anova": {k: {**v, "sig": get_sig(v['P'])} for k, v in anova.items()},
            "post_hoc": serialized_results
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_strip_plot")
async def report_strip_plot(
    file: UploadFile = File(...),
    rep_col: str = Form(...),
    a_col: str = Form(...),
    b_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, _, _ = perform_strip_analysis(
            df, rep_col, a_col, b_col, resp_col, post_hoc, alpha, mean_order
        )
        
        report_buffer = analyzer.create_report()
        filename = "StripPlot_Analysis_Report.docx"
        
        return StreamingResponse(
            report_buffer, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# ... (Existing LSD code and mounts)


# Serve Frontend
# Assuming we run this from 'backend' folder, frontend is at '../frontend'
# But better to use absolute or relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

# Helper to avoid code duplication
def perform_analysis(df, row_col, col_col, treat_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = LSDAnalyzer(df, row_col, col_col, treat_col, resp_col)
    analyzer.validate()
    anova = analyzer.run_anova()
    grouping = analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    interpretation = analyzer.interpret()
    return analyzer, anova, grouping, interpretation

# API Routes first
@app.post("/analyze")
async def analyze_data(
    file: UploadFile = File(...),
    row_col: str = Form(...),
    col_col: str = Form(...),
    treat_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        # Read file
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, anova, grouping, interpretation = perform_analysis(
            df, row_col, col_col, treat_col, resp_col, post_hoc, alpha, mean_order
        )
        
        # Format results for JSON
        means_data = []
        sds = analyzer.df.groupby(treat_col)[resp_col].std()
        
        # Helper dictionary for fast lookup of sorted means
        means_dict = analyzer.means.to_dict()
        
        # Iterate over treatments alphabetically/numerically to preserve stable order in table
        all_treats = sorted([str(t) for t in analyzer.means.index])
        
        for t in all_treats:
            # We need to find the original key type if it wasn't string, but we cast to str in validate
            # However, analyzer.means index is what grouping uses.
            # Let's ensure we access correctly.
            mean_val = means_dict.get(t, means_dict.get(int(t) if t.isdigit() else t))
            
            means_data.append({
                "treatment": t,
                "mean": float(mean_val) if mean_val is not None else 0.0,
                "sd": float(sds.get(t, sds.get(int(t) if t.isdigit() else t, 0))),
                "se": float(analyzer.SE_m), # SE is constant for balanced LSD
                "group": grouping.get(t, grouping.get(int(t) if t.isdigit() else t, "-"))
            })
            
        return {
            "status": "success",
            "anova": {k: {**v, "sig": get_sig(v['P'])} for k, v in anova.items()},
            "means": means_data,
            "precision": {
                "sem": analyzer.SE_m,
                "sed": analyzer.SE_d,
                "cv": analyzer.CV,
                "cd": getattr(analyzer, 'CD', 0)
            },
            "interpretation": interpretation
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report")
async def download_report(
    file: UploadFile = File(...),
    row_col: str = Form(...),
    col_col: str = Form(...),
    treat_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, _, _, _ = perform_analysis(
            df, row_col, col_col, treat_col, resp_col, post_hoc, alpha, mean_order
        )
        
        report_buffer = analyzer.create_report()
        
        filename = f"LSD_Analysis_Report.docx"
        return StreamingResponse(
            report_buffer, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Factorial CRD
def perform_factorial_crd_analysis(df, a_col, b_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = FactorialCRDAnalyzer(df, a_col, b_col, resp_col)
    analyzer.validate()
    anova = analyzer.run_anova()
    results = analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    return analyzer, anova, results

@app.post("/analyze_factorial_crd")
async def analyze_factorial_crd(
    file: UploadFile = File(...),
    a_col: str = Form(...),
    b_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, anova, results = perform_factorial_crd_analysis(
            df, a_col, b_col, resp_col, post_hoc, alpha, mean_order
        )
        
        # Serialize results (Same structure as Strip Plot)
        serialized_results = {}
        for key, val in results.items():
            means_list = []
            sds_series = val['sds'].to_dict()
            ses_series = val['ses'].to_dict()
            
            for idx, mean_val in val['means'].items():
                sd_val = sds_series.get(idx, 0.0)
                se_val = ses_series.get(idx, 0.0)
                
                means_list.append({
                    "level": str(idx),
                    "mean": float(mean_val),
                    "sd": float(sd_val) if not pd.isna(sd_val) else 0.0,
                    "se": float(se_val) if not pd.isna(se_val) else 0.0,
                    "group": val['grouping'].get(idx, "-")
                })
            
            serialized_results[key] = {
                "means": means_list,
                "se_pooled": float(val['SE']) if val['SE'] else 0,
                "se": float(val['SE']) if val['SE'] else 0, # Legacy/Card
                "sed": float(val['SEd']) if val['SEd'] else 0,
                "cv": float(val['CV']) if val['CV'] else 0,
                "cd": float(val['CD']) if val['CD'] else 0
            }

        return {
            "status": "success",
            "anova": {k: {**v, "sig": get_sig(v['P'])} for k, v in anova.items()},
            "results": serialized_results
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_factorial_crd")
async def report_factorial_crd(
    file: UploadFile = File(...),
    a_col: str = Form(...),
    b_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, _, _ = perform_factorial_crd_analysis(
             df, a_col, b_col, resp_col, post_hoc, alpha, mean_order
        )
        
        report_buffer = analyzer.create_report()
        return StreamingResponse(
             report_buffer,
             media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             headers={"Content-Disposition": "attachment; filename=Factorial_CRD_Report.docx"}
        )
    except Exception as e:
         traceback.print_exc()
         return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Three Factor CRD
def perform_three_factor_crd_analysis(df, a_col, b_col, c_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = ThreeFactorCRDAnalyzer(df, a_col, b_col, c_col, resp_col)
    analyzer.validate()
    anova = analyzer.run_anova()
    results = analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    return analyzer, anova, results

@app.post("/analyze_three_factor_crd")
async def analyze_three_factor_crd(
    file: UploadFile = File(...),
    a_col: str = Form(...),
    b_col: str = Form(...),
    c_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        data = await file.read()
        df = pd.read_csv(io.BytesIO(data))
        
        analyzer, anova, results = perform_three_factor_crd_analysis(
            df, a_col, b_col, c_col, resp_col, post_hoc, alpha, mean_order
        )
        
        # Serialize
        serial_res = {}
        for key, val in results.items():
             means_list = []
             sds = val['sds'].to_dict()
             ses = val['ses'].to_dict()
             grp = val['grouping']
             
             for idx, m_val in val['means'].items():
                 # For multi-index, idx might be tuple or string. Analyzer converts keys to string if needed?
                 # Pandas groupby with multiple cols usually produces tuples.
                 # We converted columns to ' : ' string inside analyzer for interaction. So it's string.
                 # For main effect it's single val.
                 means_list.append({
                     "level": str(idx),
                     "mean": float(m_val),
                     "sd": float(sds.get(idx, 0)),
                     "se": float(ses.get(idx, 0)),
                     "group": grp.get(idx, "-")
                 })
                 
             serial_res[key] = {
                 "means": means_list,
                 "se_pooled": float(val['SE']) if val['SE'] else 0,
                 "sed": float(val['SEd']) if val['SEd'] else 0,
                 "cv": float(val['CV']) if val['CV'] else 0,
                 "cd": float(val['CD']) if val['CD'] else 0
             }

        # Serialize ANOVA
        serial_anova = {k: {**v, "sig": get_sig(v['P'])} for k, v in anova.items()}
        
        return {"status": "success", "anova": serial_anova, "results": serial_res}
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_three_factor_crd")
async def report_three_factor_crd(
    file: UploadFile = File(...),
    a_col: str = Form(...),
    b_col: str = Form(...),
    c_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        data = await file.read()
        df = pd.read_csv(io.BytesIO(data))
        analyzer, _, _ = perform_three_factor_crd_analysis(
             df, a_col, b_col, c_col, resp_col, post_hoc, alpha, mean_order
        )
        buf = analyzer.create_report()
        return StreamingResponse(
            buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=ThreeFactorCRD_Report.docx"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})



# Helper for Pooled CRD
def perform_pooled_crd_analysis(df, treat_col, year_col, resp_col, post_hoc, alpha, mean_order):
    analyzer = PooledCRDAnalyzer(df, treat_col, year_col, resp_col)
    analyzer.validate()
    analyzer.run_bartlett_test()
    # Proceed even if heterogeneous, but warn
    analyzer.run_pooled_anova()
    analyzer.run_post_hoc(method=post_hoc, alpha=alpha, order=mean_order)
    return analyzer

@app.post("/analyze_pooled_crd")
async def analyze_pooled_crd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    year_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        data = await file.read()
        df = pd.read_csv(io.BytesIO(data))
        
        analyzer = perform_pooled_crd_analysis(
            df, treat_col, year_col, resp_col, post_hoc, alpha, mean_order
        )
        
        # Serialize Response
        # Bartlett
        b = analyzer.bartlett_res
        
        # ANOVA
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"],
                "SS": v["SS"],
                "MS": v["MS"],
                "F": v["F"],
                "P": v["P"],
                "sig": get_sig(v["P"])
            }
            
        # Post Hoc
        ph = analyzer.post_hoc_res
        ph_serial = None
        if ph:
             def serialize_factor(factor_dict):
                 means_list = []
                 for tr, val in factor_dict['means'].items():
                     means_list.append({
                         "level": str(tr),
                         "mean": float(val),
                         "sd": float(factor_dict['sds'].get(tr, 0)),
                         "se": float(factor_dict['ses'].get(tr, 0)),
                         "group": factor_dict['grouping'].get(tr, "")
                     })
                 return {
                     "means": means_list,
                     "sem_pooled": float(factor_dict['sem_pooled']),
                     "sed": float(factor_dict.get('sed', 0)),
                     "cd": float(factor_dict.get('cd', 0)),
                     "test_performed": factor_dict['test_performed'],
                     "reason": factor_dict['reason']
                 }

             ph_serial = {
                 "Treatment": serialize_factor(ph["Treatment"]),
                 "Year": serialize_factor(ph["Year"]),
                 "cv": float(ph['CV']),
                 "method": ph['method']
             }

        return {
            "status": "success",
            "bartlett": b,
            "anova": a,
            "post_hoc": ph_serial
        }
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pooled_crd")
async def report_pooled_crd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    year_col: str = Form(...),
    resp_col: str = Form(...),
    post_hoc: str = Form("lsd"),
    alpha: float = Form(0.05),
    mean_order: str = Form("desc")
):
    try:
        data = await file.read()
        df = pd.read_csv(io.BytesIO(data))
        analyzer = perform_pooled_crd_analysis(
            df, treat_col, year_col, resp_col, post_hoc, alpha, mean_order
        )
        buf = analyzer.create_report()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=PooledCRD_Report.docx"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Two Factor Pooled CRD
from experimental_design.two_factor_pooled_crd import TwoFactorPooledCRDAnalyzer

# Multivariate
from multivariate_analysis.pca_analysis import PCAAnalyzer
from multivariate_analysis.path_analysis import PathAnalyzer

# Correlation
from correlation_regression.pearson_correlation import PearsonCorrelationAnalyzer
from correlation_regression.spearman_correlation import SpearmanCorrelationAnalyzer

@app.post("/analyze_two_factor_pooled_crd")
async def analyze_two_factor_pooled_crd(
    file: UploadFile = File(...),
    treat_a_col: str = Form(...),
    treat_b_col: str = Form(...),
    year_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = TwoFactorPooledCRDAnalyzer(df, treat_a_col, treat_b_col, year_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett_test()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        # Serialize with handling for Pivot Tables / DataFrames
        ph = analyzer.post_hoc_res
        ph_serial = {}
        
        # Copy basic scalar fields
        for k, v in ph.items():
            if k not in ["ABY", "AB", "A", "B", "Year"]:
                ph_serial[k] = v
        
        # Helper to serialize pivots
        def ser_pivot(piv):
            cols = list(piv.columns)
            rows = []
            for idx, row in piv.iterrows():
                rows.append({
                    "label": str(idx),
                    "values": [float(x) for x in row.values]
                })
            return {"cols": [str(c) for c in cols], "rows": rows}
            
        if "ABY" in ph:
            dat = ph["ABY"]
            tables = []
            for t in dat["tables"]:
                tables.append({
                    "year": str(t["year"]),
                    "pivot": ser_pivot(t["pivot"])
                })
            ph_serial["ABY"] = {
                "tables": tables,
                "sem": float(dat["sem"]), "sed": float(dat["sed"]), "cd": float(dat["cd"]),
                "sig": dat["sig"]
            }
            
        if "AB" in ph:
            dat = ph["AB"]
            ph_serial["AB"] = {
                "pivot": ser_pivot(dat["pivot"]),
                "sem": float(dat["sem"]), "sed": float(dat["sed"]), "cd": float(dat["cd"]),
                "sig": dat["sig"],
                "grouping": dat["grouping"]
            }
            
        for eff in ["A", "B", "Year"]:
            if eff in ph:
                dat = ph[eff]
                ph_serial[eff] = {
                    "means": [
                        {
                            "level": str(k), 
                            "mean": float(v),
                            "std": float(dat["stds"][k]) if "stds" in dat else 0,
                            "se": float(dat["ses"][k]) if "ses" in dat else 0
                        } 
                        for k,v in dat["means"].items()
                    ],
                    "grouping": dat["grouping"],
                    "sem": float(dat["sem"]), "sed": float(dat["sed"]), "cd": float(dat["cd"]), "sig": True
                }

        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }

        return {
            "status": "success",
            "bartlett": analyzer.bartlett_res,
            "anova": a,
            "post_hoc": ph_serial
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_two_factor_pooled_crd")
async def report_two_factor_pooled_crd(
    file: UploadFile = File(...),
    treat_a_col: str = Form(...),
    treat_b_col: str = Form(...),
    year_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = TwoFactorPooledCRDAnalyzer(df, treat_a_col, treat_b_col, year_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett_test()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=TwoFactorPooledCRD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

def get_sig(p_val):
    if p_val is None or np.isnan(p_val): return ""
    if p_val <= 0.01: return "**"
    if p_val <= 0.05: return "*"
    return ""

def safe_float(val):
    if val is None or np.isnan(val) or np.isinf(val):
        return 0.0
    return float(val)


from experimental_design.rcbd_analysis import RCBDAnalyzer
from experimental_design.two_factor_rcbd import TwoFactorRCBDAnalyzer
from experimental_design.three_factor_rcbd import ThreeFactorRCBDAnalyzer
from experimental_design.split_plot_analysis import SplitPlotAnalyzer
from experimental_design.split_plot_21 import SplitPlot21Analyzer
from experimental_design.split_plot_12 import SplitPlot12Analyzer
from experimental_design.split_split_plot import SplitSplitPlotAnalyzer
from experimental_design.split_crd_analysis import SplitCRDAnalyzer
from experimental_design.split_plot_pooled import SplitPlotPooledAnalyzer
from experimental_design.pooled_rcbd_analysis import PooledRCBDAnalyzer
from experimental_design.pooled_two_factor_rcbd import PooledTwoFactorRCBDAnalyzer

@app.post("/analyze_one_factor_rcbd")
async def analyze_one_factor_rcbd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = RCBDAnalyzer(df, treat_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        # Serialize
        ph = analyzer.post_hoc_res
        ph_serial = {}
        
        # Basic scalar fields
        for k, v in ph.items():
            if k != "Treatment":
                ph_serial[k] = v
                
        # Treatment Data
        if "Treatment" in ph:
            dat = ph["Treatment"]
            ph_serial["Treatment"] = {
                "means": [
                    {
                        "level": str(k), 
                        "mean": float(v),
                        "std": float(dat["stds"][k]),
                        "se": float(dat["ses"][k])
                    } for k, v in dat["means"].items()
                ],
                "grouping": dat["grouping"],
                "sig": dat["sig"]
            }

        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }

        return {
            "status": "success",
            "anova": a,
            "post_hoc": ph_serial
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_one_factor_rcbd")
async def report_one_factor_rcbd(
    file: UploadFile = File(...),
    treat_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = RCBDAnalyzer(df, treat_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=RCBD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}



@app.post("/analyze_two_factor_rcbd")
async def analyze_two_factor_rcbd(
    file: UploadFile = File(...),
    fact_a: str = Form(...),
    fact_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = TwoFactorRCBDAnalyzer(df, fact_a, fact_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        # Serialize Post Hoc
        # Helper to serialize a dataset (Factor A/B/Interaction)
        def ser_ds(ds):
            if "means" not in ds: return ds # e.g. info notes
            return {
                "sig": ds["sig"],
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else f"{k[0]} x {k[1]}",
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else f"{k[0]} x {k[1]}"): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
            
        ph = analyzer.post_hoc_res
        ph_serial = {
            "stats": analyzer.stats,
            "Interaction": ser_ds(ph["Interaction"]),
            "Factor A": ser_ds(ph["Factor A"]),
            "Factor B": ser_ds(ph["Factor B"])
        }
        
        # Serialize ANOVA
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_two_factor_rcbd")
async def report_two_factor_rcbd(
    file: UploadFile = File(...),
    fact_a: str = Form(...),
    fact_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = TwoFactorRCBDAnalyzer(df, fact_a, fact_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=TwoFactor_RCBD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}



@app.post("/analyze_three_factor_rcbd")
async def analyze_three_factor_rcbd(
    file: UploadFile = File(...),
    fact_a: str = Form(...),
    fact_b: str = Form(...),
    fact_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = ThreeFactorRCBDAnalyzer(df, fact_a, fact_b, fact_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "sig": ds["sig"],
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_three_factor_rcbd")
async def report_three_factor_rcbd(
    file: UploadFile = File(...),
    fact_a: str = Form(...),
    fact_b: str = Form(...),
    fact_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd'),
    mean_order: str = Form('desc')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = ThreeFactorRCBDAnalyzer(df, fact_a, fact_b, fact_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha, mean_order)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=ThreeFactor_RCBD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/analyze_split_plot")
async def analyze_split_plot(
    file: UploadFile = File(...),
    main_col: str = Form(...),
    sub_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitPlotAnalyzer(df, main_col, sub_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_plot")
async def report_split_plot(
    file: UploadFile = File(...),
    main_col: str = Form(...),
    sub_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitPlotAnalyzer(df, main_col, sub_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Split_Plot_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/analyze_split_plot_21")
async def analyze_split_plot_21(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    main_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitPlot21Analyzer(df, main_a, main_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_plot_21")
async def report_split_plot_21(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    main_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitPlot21Analyzer(df, main_a, main_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Split_Plot_21_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/analyze_split_plot_12")
async def analyze_split_plot_12(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitPlot12Analyzer(df, main_a, sub_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_plot_12")
async def report_split_plot_12(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitPlot12Analyzer(df, main_a, sub_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Split_Plot_12_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/analyze_split_split_plot")
async def analyze_split_split_plot(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitSplitPlotAnalyzer(df, main_a, sub_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_split_plot")
async def report_split_split_plot(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    sub_c: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitSplitPlotAnalyzer(df, main_a, sub_b, sub_c, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Split_Split_Plot_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}
        

@app.post("/analyze_split_crd")
async def analyze_split_crd(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitCRDAnalyzer(df, main_a, sub_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_crd")
async def report_split_crd(
    file: UploadFile = File(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitCRDAnalyzer(df, main_a, sub_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Split_CRD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze_split_pooled")
async def analyze_split_pooled(
    file: UploadFile = File(...),
    year_col: str = Form(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = SplitPlotPooledAnalyzer(df, year_col, main_a, sub_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "bartlett": analyzer.bartlett_res, "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_split_pooled")
async def report_split_pooled(
    file: UploadFile = File(...),
    year_col: str = Form(...),
    main_a: str = Form(...),
    sub_b: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = SplitPlotPooledAnalyzer(df, year_col, main_a, sub_b, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Pooled_Split_Plot_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze_pooled_rcbd")
async def analyze_pooled_rcbd(
    file: UploadFile = File(...),
    year_col: str = Form(...),
    treat_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = PooledRCBDAnalyzer(df, year_col, treat_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "bartlett": analyzer.bartlett_res, "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_pooled_rcbd")
async def report_pooled_rcbd(
    file: UploadFile = File(...),
    year_col: str = Form(...),
    treat_col: str = Form(...),
    rep_col: str = Form(...),
    resp_col: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = PooledRCBDAnalyzer(df, year_col, treat_col, rep_col, resp_col)
        analyzer.validate()
        analyzer.run_bartlett()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Pooled_RCBD_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/analyze_pooled_two_factor_rcbd")
async def analyze_pooled_two_factor_rcbd(
    file: UploadFile = File(...),
    col_year: str = Form(...),
    col_a: str = Form(...),
    col_b: str = Form(...),
    col_rep: str = Form(...),
    col_resp: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = PooledTwoFactorRCBDAnalyzer(df, col_year, col_a, col_b, col_rep, col_resp)
        analyzer.validate()
        analyzer.run_homogeneity_test()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        def ser_ds(ds):
            if "means" not in ds: return ds
            return {
                "means": [
                    {
                        "level": str(k) if not isinstance(k, tuple) else " x ".join(map(str, k)),
                        "mean": float(v),
                        "std": float(ds["stds"][k]),
                        "se": float(ds["ses"][k])
                    } for k, v in ds["means"].items()
                ],
                "grouping": {
                    (str(k) if not isinstance(k, tuple) else " x ".join(map(str, k))): v 
                    for k, v in ds.get("grouping", {}).items()
                }
            }
        
        ph = analyzer.post_hoc_res
        ph_serial = { "stats": analyzer.stats }
        for k in ph.keys(): ph_serial[k] = ser_ds(ph[k])
        
        a = {}
        for k, v in analyzer.anova_table.items():
            a[k] = {
                "df": v["df"], "SS": v["SS"], "MS": v["MS"], "F": v["F"], "P": v["P"],
                "sig": get_sig(v["P"]) if v["P"] is not None else ""
            }
            
        return { "status": "success", "bartlett": analyzer.bartlett_res, "anova": a, "post_hoc": ph_serial }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/report_pooled_two_factor_rcbd")
async def report_pooled_two_factor_rcbd(
    file: UploadFile = File(...),
    col_year: str = Form(...),
    col_a: str = Form(...),
    col_b: str = Form(...),
    col_rep: str = Form(...),
    col_resp: str = Form(...),
    alpha: float = Form(0.05),
    post_hoc: str = Form('lsd')
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = PooledTwoFactorRCBDAnalyzer(df, col_year, col_a, col_b, col_rep, col_resp)
        analyzer.validate()
        analyzer.run_homogeneity_test()
        analyzer.run_anova()
        analyzer.run_post_hoc(post_hoc, alpha)
        
        docx = analyzer.create_report()
        return StreamingResponse(
            docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Pooled_Two_Factor_Report.docx"}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
async def read_root():
    return FileResponse(os.path.join(FRONTEND_DIR, "data-analyzer.html"))


# ==========================================
# MULTIVARIATE ANALYSIS (PCA)
# ==========================================

# Helper
def perform_pca(df, obs_col, var_cols):
    var_list = var_cols.split(',') if isinstance(var_cols, str) else var_cols
    analyzer = PCAAnalyzer(df, obs_col, var_list)
    analyzer.validate()
    analyzer.run_pca()
    return analyzer

@app.post("/analyze_pca")
async def analyze_pca(
    file: UploadFile = File(...),
    obs_col: str = Form(...),
    var_cols: str = Form(...) # Comma separated list
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_pca(df, obs_col, var_cols)
        analyzer.generate_plots() # Generate plot buffers
        
        # Return basic stats
        res = analyzer.pca_res
        
        return {
            "status": "success",
            "eigenvalues": res['eigenvalues'].tolist(),
            "variance_pct": res['variance_pct'].tolist(),
            "cum_variance_pct": res['cum_variance_pct'].tolist()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pca_plots")
async def report_pca_plots(
    file: UploadFile = File(...),
    obs_col: str = Form(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_pca(df, obs_col, var_cols)
        analyzer.generate_plots()
        
        buf = analyzer.create_report_plots()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=PCA_Plots.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pca_text")
async def report_pca_text(
    file: UploadFile = File(...),
    obs_col: str = Form(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_pca(df, obs_col, var_cols)
        
        buf = analyzer.create_report_interpretation()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=PCA_Interpretation.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pca_excel")
async def report_pca_excel(
    file: UploadFile = File(...),
    obs_col: str = Form(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_pca(df, obs_col, var_cols)
        
        buf = analyzer.create_output_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=PCA_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# ==========================================
# MULTIVARIATE ANALYSIS (PATH ANALYSIS)
# ==========================================

def perform_path_analysis(df, dep_var, indep_vars):
    indep_list = indep_vars.split(',') if isinstance(indep_vars, str) else indep_vars
    # Clean list
    indep_list = [x.strip() for x in indep_list if x.strip()]
    analyzer = PathAnalyzer(df, dep_var, indep_list)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_path")
async def analyze_path(
    file: UploadFile = File(...),
    dep_var: str = Form(...),
    indep_vars: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_path_analysis(df, dep_var, indep_vars)
        analyzer.generate_diagram() # Gen diagram to ensure no errors
        
        res = analyzer.results
        
        return {
            "status": "success",
            "R2": res['R2'],
            "residual": res['residual'],
            "direct_effects": res['direct_effects']
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_path_doc")
async def report_path_doc(
    file: UploadFile = File(...),
    dep_var: str = Form(...),
    indep_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_path_analysis(df, dep_var, indep_vars)
        analyzer.generate_diagram()
        
        buf = analyzer.create_report_doc()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Path_Analysis_Report.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_path_excel")
async def report_path_excel(
    file: UploadFile = File(...),
    dep_var: str = Form(...),
    indep_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_path_analysis(df, dep_var, indep_vars)
        
        buf = analyzer.create_output_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Path_Analysis_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# ==========================================
# CORRELATION ANALYSIS (PEARSON)
# ==========================================

def perform_pearson(df, var_cols):
    var_list = var_cols.split(',') if isinstance(var_cols, str) else var_cols
    var_list = [x.strip() for x in var_list if x.strip()]
    
    analyzer = PearsonCorrelationAnalyzer(df, var_list)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_pearson")
async def analyze_pearson(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_pearson(df, var_cols)
        analyzer.generate_heatmap()
        
        # Serialize matrices for frontend table (just r and sig)
        res = analyzer.results
        r_dict = res['corr_matrix'].to_dict()
        sig_dict = res['sig_matrix'].to_dict()
        
        return {
            "status": "success",
            "vars": analyzer.vars,
            "corr_matrix": r_dict,
            "sig_matrix": sig_dict
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pearson_doc")
async def report_pearson_doc(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_pearson(df, var_cols)
        analyzer.generate_heatmap()
        
        buf = analyzer.create_report_doc()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Pearson_Correlation_Report.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_pearson_excel")
async def report_pearson_excel(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_pearson(df, var_cols)
        analyzer.run_analysis() # Run explicitly if skipped
        
        buf = analyzer.create_output_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Pearson_Correlation_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# ==========================================
# SPEARMAN RANK CORRELATION
# ==========================================

def perform_spearman(df, var_cols):
    var_list = var_cols.split(',') if isinstance(var_cols, str) else var_cols
    var_list = [x.strip() for x in var_list if x.strip()]
    
    analyzer = SpearmanCorrelationAnalyzer(df, var_list)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_spearman")
async def analyze_spearman(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_spearman(df, var_cols)
        analyzer.generate_heatmap()
        
        # Serialize matrices for frontend table (just r and sig)
        res = analyzer.results
        r_dict = res['corr_matrix'].to_dict()
        sig_dict = res['sig_matrix'].to_dict()
        
        return {
            "status": "success",
            "vars": analyzer.vars,
            "corr_matrix": r_dict,
            "sig_matrix": sig_dict
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_spearman_doc")
async def report_spearman_doc(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_spearman(df, var_cols)
        analyzer.generate_heatmap()
        
        buf = analyzer.create_report_doc()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Spearman_Correlation_Report.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_spearman_excel")
async def report_spearman_excel(
    file: UploadFile = File(...),
    var_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_spearman(df, var_cols)
        analyzer.run_analysis()
        
        buf = analyzer.create_output_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Spearman_Correlation_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Griffing Method 1
def perform_griffing_method1(df, female_col, male_col, rep_col, trait_cols):
    # trait_cols might be a comma separated string if coming from Form
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = GriffingMethod1Analyzer(df, female_col, male_col, rep_col, trait_cols)
    analyzer.validate()
    analyzer.run_all()
    return analyzer

@app.post("/analyze_griffing1")
async def analyze_griffing1(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_griffing_method1(df, female_col, male_col, rep_col, trait_cols)
        
        # Serialize results
        serialized = {}
        for trait in analyzer.trait_cols:
            res = analyzer.results[trait]
            # Convert matrices to dictionaries or lists for JSON
            s_mat = res['sca_effects']
            r_mat = res['rca_effects']
            
            # GCA is already a list of dicts
            
            serialized[trait] = {
                "anova_geno": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_geno'].items()},
                "anova_comb": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_comb'].items()},
                "gca_effects": res['gca_effects'],
                "sca_matrix": s_mat.tolist(),
                "rca_matrix": r_mat.tolist(),
                "se_sca": float(res['se_sca']),
                "se_rca": float(res['se_rca']),
                "variances": res['variances'],
                "heterosis": res['heterosis'],
                "parents": analyzer.parents
            }
            
        return {"status": "success", "results": serialized}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing1_doc")
async def report_griffing1_doc(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method1(df, female_col, male_col, rep_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Griffing_Method1_Report.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing1_excel")
async def report_griffing1_excel(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method1(df, female_col, male_col, rep_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Griffing_Method1_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Heatmap endpoint
@app.get("/griffing1_heatmap/{trait}/{type}")
async def griffing1_heatmap(trait: str, type: str):
    # This would require caching the analyzer result or re-running.
    # For now, we can skip or implement if needed. 
    # Usually heatmaps are better generated on frontend with D3/Chart.js if possible,
    # but the request asked for heatmaps. I can generate them on the fly if I have the data.
    # But since it's a POST with file upload, we usually return it in the main analyze response as base64 or separate.
    return {"status": "not_implemented_separately"}


# Griffing Method 1 WITH CHECK
def perform_griffing_method1_check(df, female_col, male_col, rep_col, check_col, trait_cols):
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = GriffingMethod1CheckAnalyzer(df, female_col, male_col, rep_col, check_col, trait_cols)
    analyzer.validate()
    for trait in analyzer.trait_cols:
        analyzer.analyze_trait(trait)
    return analyzer

@app.post("/analyze_griffing1_check")
async def analyze_griffing1_check(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method1_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        
        serialized = {}
        for trait in analyzer.trait_cols:
            res = analyzer.results[trait]
            serialized[trait] = {
                "anova_geno": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_geno'].items()},
                "anova_comb": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_comb'].items()},
                "gca_effects": res['gca_effects'],
                "sca_matrix": res['sca_matrix'],
                "rca_matrix": res['rca_matrix'],
                "se_sca": float(res['se_sca']),
                "se_rca": float(res['se_rca']),
                "variances": res['variances'],
                "std_heterosis": res['std_heterosis'],
                "check_means": res['check_means'],
                "parents": res['parents']
            }
        return {"status": "success", "results": serialized}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing1_check_doc")
async def report_griffing1_check_doc(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method1_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Griffing_Method1_WithCheck_Report.docx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing1_check_excel")
async def report_griffing1_check_excel(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method1_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Griffing_Method1_WithCheck_Output.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Griffing Method 2
def perform_griffing_method2(df, female_col, male_col, rep_col, trait_cols):
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = GriffingMethod2Analyzer(df, female_col, male_col, rep_col, trait_cols)
    analyzer.validate()
    for trait in analyzer.trait_cols:
        analyzer.analyze_trait(trait)
    return analyzer

@app.post("/analyze_griffing2")
async def analyze_griffing2(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2(df, female_col, male_col, rep_col, trait_cols)
        serialized = {}
        for trait in analyzer.trait_cols:
            res = analyzer.results[trait]
            serialized[trait] = {
                "anova_geno": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_geno'].items()},
                "anova_comb": {k: {**v, "sig": get_sig(v['P'])} for k, v in res['anova_comb'].items()},
                "gca_effects": res['gca_effects'],
                "sca_matrix": res['sca_matrix'],
                "variances": res['variances'],
                "heterosis": res['heterosis'],
                "parents": res['parents']
            }
        return {"status": "success", "results": serialized}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing2_doc")
async def report_griffing2_doc(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2(df, female_col, male_col, rep_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": "attachment; filename=Griffing_Method2_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing2_excel")
async def report_griffing2_excel(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2(df, female_col, male_col, rep_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=Griffing_Method2_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Griffing Method 2 WITH CHECK
def perform_griffing_method2_check(df, female_col, male_col, rep_col, check_col, trait_cols):
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = GriffingMethod2CheckAnalyzer(df, female_col, male_col, rep_col, check_col, trait_cols)
    analyzer.validate()
    for trait in analyzer.trait_cols:
        analyzer.analyze_trait(trait)
    return analyzer

@app.post("/analyze_griffing2_check")
async def analyze_griffing2_check(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        serialized = {}
        for trait in analyzer.trait_cols:
            res = analyzer.results[trait]
            serialized[trait] = {
                "anova_comb": {k: {**v, "sig": get_sig(v.get('P'))} for k, v in res['anova_comb'].items()},
                "gca_effects": res['gca_effects'],
                "sca_matrix": res['sca_matrix'],
                "variances": res['variances'],
                "heterosis": res['heterosis'],
                "parents": res['parents']
            }
        return {"status": "success", "results": serialized}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing2_check_doc")
async def report_griffing2_check_doc(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": "attachment; filename=Griffing_Method2_WithCheck_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_griffing2_check_excel")
async def report_griffing2_check_excel(
    file: UploadFile = File(...),
    female_col: str = Form(...),
    male_col: str = Form(...),
    rep_col: str = Form(...),
    check_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_griffing_method2_check(df, female_col, male_col, rep_col, check_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=Griffing_Method2_WithCheck_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Genotypic Correlation
def perform_genotypic_correlation(df, genotype_col, rep_col, trait_cols):
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = GenotypicCorrelationAnalyzer(df, genotype_col, rep_col, trait_cols)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_genotypic_correlation")
async def analyze_genotypic_correlation(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_genotypic_correlation(df, genotype_col, rep_col, trait_cols)
        
        return {
            "status": "success",
            "traits": analyzer.trait_cols,
            "variances": analyzer.variances,
            "corr_matrix": analyzer.correlation_matrix.to_dict(),
            "sig_matrix": analyzer.p_values.to_dict(),
            "interpretations": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genotypic_correlation_doc")
async def report_genotypic_correlation_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_genotypic_correlation(df, genotype_col, rep_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
            headers={"Content-Disposition": "attachment; filename=Genotypic_Correlation_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genotypic_correlation_excel")
async def report_genotypic_correlation_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_genotypic_correlation(df, genotype_col, rep_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Genotypic_Correlation_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Phenotypic Correlation
def perform_phenotypic_correlation(df, genotype_col, rep_col, trait_cols):
    if isinstance(trait_cols, str):
        trait_cols = [t.strip() for t in trait_cols.split(",") if t.strip()]
    analyzer = PhenotypicCorrelationAnalyzer(df, genotype_col, rep_col, trait_cols)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_phenotypic_correlation")
async def analyze_phenotypic_correlation(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_phenotypic_correlation(df, genotype_col, rep_col, trait_cols)
        
        return {
            "status": "success",
            "traits": analyzer.trait_cols,
            "variances": {k: v for k, v in analyzer.variances.items()},
            "corr_matrix": analyzer.correlation_matrix.to_dict(),
            "sig_matrix": analyzer.p_values.to_dict(),
            "interpretations": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_phenotypic_correlation_doc")
async def report_phenotypic_correlation_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_phenotypic_correlation(df, genotype_col, rep_col, trait_cols)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
            headers={"Content-Disposition": "attachment; filename=Phenotypic_Correlation_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_phenotypic_correlation_excel")
async def report_phenotypic_correlation_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_phenotypic_correlation(df, genotype_col, rep_col, trait_cols)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Phenotypic_Correlation_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Mount Frontend
# --- Genotypic Path Analysis ---
def perform_genotypic_path(df, genotype_col, rep_col, dependent_var, independent_vars):
    analyzer = GenotypicPathAnalyzer(df, genotype_col, rep_col, dependent_var, independent_vars)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_genotypic_path")
async def analyze_genotypic_path(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        
        analyzer = perform_genotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        path_table = analyzer.get_path_table()
        
        # Generate Diagram in base64
        import base64
        diag_buf = analyzer.generate_path_diagram()
        diag_base64 = base64.b64encode(diag_buf.read()).decode('utf-8')
        
        return {
            "status": "success",
            "traits": analyzer.independent_vars,
            "dependent": analyzer.dependent_var,
            "path_table": path_table.to_dict(orient='records'),
            "residual": float(analyzer.residual_effect),
            "explained": float(analyzer.explained_variation),
            "unexplained": float(analyzer.unexplained_variation),
            "corr_matrix": analyzer.correlation_matrix.to_dict(),
            "diagram": diag_base64
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genotypic_path_doc")
async def report_genotypic_path_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        analyzer = perform_genotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Genotypic_Path_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genotypic_path_excel")
async def report_genotypic_path_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        analyzer = perform_genotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Genotypic_Path_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# --- Phenotypic Path Analysis ---
def perform_phenotypic_path(df, genotype_col, rep_col, dependent_var, independent_vars):
    analyzer = PhenotypicPathAnalyzer(df, genotype_col, rep_col, dependent_var, independent_vars)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_phenotypic_path")
async def analyze_phenotypic_path(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        
        analyzer = perform_phenotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        path_table = analyzer.get_path_table()
        
        import base64
        diag_buf = analyzer.generate_path_diagram()
        diag_base64 = base64.b64encode(diag_buf.read()).decode('utf-8')
        
        return {
            "status": "success",
            "traits": analyzer.independent_vars,
            "dependent": analyzer.dependent_var,
            "path_table": path_table.to_dict(orient='records'),
            "residual": float(analyzer.residual_effect),
            "explained": float(analyzer.explained_variation),
            "unexplained": float(analyzer.unexplained_variation),
            "corr_matrix": analyzer.correlation_matrix.to_dict(),
            "diagram": diag_base64
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_phenotypic_path_doc")
async def report_phenotypic_path_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        analyzer = perform_phenotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Phenotypic_Path_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_phenotypic_path_excel")
async def report_phenotypic_path_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    dependent_var: str = Form(...),
    independent_vars: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        indep_list = [x.strip() for x in independent_vars.split(',')]
        analyzer = perform_phenotypic_path(df, genotype_col, rep_col, dependent_var, indep_list)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Phenotypic_Path_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# --- Mahalanobis D2 Statistics ---
def perform_mahalanobis_d2(df, genotype_col, rep_col, trait_cols):
    analyzer = MahalanobisD2Analyzer(df, genotype_col, rep_col, trait_cols)
    # Note: rep_col is used for averaging data in the analyzer if needed
    analyzer.validate()
    # We pass rep_col check here if we want to ensure averaging correctly
    # For now, the analyzer groups by genotype and averages.
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_mahalanobis_d2")
async def analyze_mahalanobis_d2(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in trait_cols.split(',')]
        
        analyzer = perform_mahalanobis_d2(df, genotype_col, rep_col, traits_list)
        
        import base64
        dendro_buf = analyzer.generate_dendrogram()
        dendro_b64 = base64.b64encode(dendro_buf.read()).decode('utf-8')
        
        plot_buf = analyzer.generate_cluster_plot()
        plot_b64 = base64.b64encode(plot_buf.read()).decode('utf-8')
        
        # Data Cleaning for JSON serialization
        def clean_data(obj):
            if isinstance(obj, dict):
                return {k: clean_data(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_data(x) for x in obj]
            elif hasattr(obj, "item"): # Handle NumPy scalars
                return obj.item()
            elif isinstance(obj, float):
                if np.isnan(obj) or np.isinf(obj): return 0.0
                return obj
            return obj

        response_data = {
            "status": "success",
            "clusters": analyzer.clusters,
            "intra_distances": analyzer.intra_distances,
            "inter_distances": analyzer.inter_distances.to_dict(),
            "cluster_means": analyzer.cluster_means.to_dict(orient='index'),
            "trait_contributions": analyzer.trait_contributions.to_dict(orient='records'),
            "d2_matrix": analyzer.d2_matrix.to_dict(),
            "dendrogram": dendro_b64,
            "cluster_plot": plot_b64
        }
        
        return clean_data(response_data)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_mahalanobis_d2_doc")
async def report_mahalanobis_d2_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in trait_cols.split(',')]
        analyzer = perform_mahalanobis_d2(df, genotype_col, rep_col, traits_list)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Mahalanobis_D2_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_mahalanobis_d2_excel")
async def report_mahalanobis_d2_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    trait_cols: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in trait_cols.split(',')]
        analyzer = perform_mahalanobis_d2(df, genotype_col, rep_col, traits_list)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Mahalanobis_D2_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# --- Genetic Parameter Estimation ---
def perform_genetic_parameters(df, genotype_col, rep_col, traits):
    analyzer = GeneticParameterAnalyzer(df, genotype_col, rep_col, traits)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_genetic_parameters")
async def analyze_genetic_parameters(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    traits: str = Form(...) # Comma separated
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in traits.split(',')]
        
        analyzer = perform_genetic_parameters(df, genotype_col, rep_col, traits_list)
        
        # Data Cleaning for JSON serialization
        def clean_data(obj):
            if isinstance(obj, dict):
                return {k: clean_data(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_data(x) for x in obj]
            elif hasattr(obj, "item"): # Handle NumPy scalars
                return obj.item()
            elif isinstance(obj, float):
                if np.isnan(obj) or np.isinf(obj): return 0.0
                return obj
            return obj

        response_data = {
            "status": "success",
            "results": analyzer.results,
            "summary": analyzer.get_summary_table().to_dict(orient='records')
        }
        
        return clean_data(response_data)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genetic_parameters_doc")
async def report_genetic_parameters_doc(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    traits: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in traits.split(',')]
        analyzer = perform_genetic_parameters(df, genotype_col, rep_col, traits_list)
        buf = analyzer.create_report()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Genetic_Parameters_Report.docx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_genetic_parameters_excel")
async def report_genetic_parameters_excel(
    file: UploadFile = File(...),
    genotype_col: str = Form(...),
    rep_col: str = Form(...),
    traits: str = Form(...)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        traits_list = [x.strip() for x in traits.split(',')]
        analyzer = perform_genetic_parameters(df, genotype_col, rep_col, traits_list)
        buf = analyzer.create_excel()
        return StreamingResponse(buf, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=Genetic_Parameters_Output.xlsx"})
    except Exception as e: return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})


# Eberhart-Russell Stability Analysis
def perform_eberhart_russell_analysis(df, geno_col, env_col, rep_col, trait_col, model_type):
    analyzer = EberhartRussellAnalyzer(df, geno_col, env_col, rep_col, trait_col, model_type)
    analyzer.validate()
    results = analyzer.run_analysis()
    return analyzer, results

@app.post("/analyze_eberhart_russell")
async def analyze_eberhart_russell(
    file: UploadFile = File(...),
    geno_col: str = Form(...),
    env_col: str = Form(...),
    rep_col: str = Form(...),
    trait_col: str = Form(...),
    model_type: str = Form("fixed")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, results = perform_eberhart_russell_analysis(
            df, geno_col, env_col, rep_col, trait_col, model_type
        )
        
        # Serialize Response
        # Pooled ANOVA
        pa = {}
        for k, v in results['pooled_anova'].items():
            pa[k] = {
                "df": int(v["df"]),
                "SS": safe_float(v["SS"]),
                "MS": safe_float(v["MS"]),
                "F": safe_float(v["F"]),
                "P": safe_float(v["P"]),
                "sig": get_sig(v["P"])
            }
            
        # Stability ANOVA
        sa = {}
        for k, v in results['stability_anova'].items():
            sa[k] = {
                "df": int(v["df"]),
                "SS": safe_float(v["SS"]),
                "MS": safe_float(v["MS"]),
                "F": safe_float(v.get("F", 0)),
                "P": safe_float(v.get("P", 1)),
                "sig": get_sig(v.get("P", 1))
            }
            
        # Environmental Indices
        ei = []
        env_means = df.groupby(env_col)[trait_col].mean()
        for env, idx in results['env_indices'].items():
            ei.append({
                "env": str(env),
                "mean": safe_float(env_means[env]),
                "index": safe_float(idx)
            })
            
        # Stability Parameters
        sp = []
        for p in results['stability_parameters']:
            sp.append({
                "genotype": str(p["Genotype"]),
                "mean": safe_float(p["Mean"]),
                "bi": safe_float(p["bi"]),
                "se_bi": safe_float(p["SE_bi"]),
                "t_b0": safe_float(p["t_b0"]),
                "p_b0": safe_float(p["p_b0"]),
                "t_b1": safe_float(p["t_b1"]),
                "p_b1": safe_float(p["p_b1"]),
                "ms_di": safe_float(p["MS_di"]),
                "s2di": safe_float(p["S2di"]),
                "f_s2di": safe_float(p["F_S2di"]),
                "p_s2di": safe_float(p["p_S2di"]),
                "inference": p["Inference"]
            })
            
        return {
            "status": "success",
            "bartlett": {
                "stat": safe_float(results['bartlett']['stat']),
                "p": safe_float(results['bartlett']['p'])
            },
            "pooled_anova": pa,
            "stability_anova": sa,
            "env_indices": ei,
            "stability_parameters": sp,
            "grand_mean": safe_float(results['grand_mean'])
        }
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_eberhart_russell")
async def report_eberhart_russell(
    file: UploadFile = File(...),
    geno_col: str = Form(...),
    env_col: str = Form(...),
    rep_col: str = Form(...),
    trait_col: str = Form(...),
    model_type: str = Form("fixed")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer, _ = perform_eberhart_russell_analysis(
            df, geno_col, env_col, rep_col, trait_col, model_type
        )
        
        report_buffer = analyzer.create_report()
        filename = "Eberhart_Russell_Stability_Report.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for One-Sample t-Test
def perform_one_sample_t_test(df, value_col, mu_0, alpha):
    analyzer = OneSampleTTestAnalyzer(df, value_col, mu_0, alpha)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_one_sample_t_test")
async def analyze_one_sample_t_test(
    file: UploadFile = File(...),
    value_col: str = Form(...),
    mu_0: float = Form(0.0),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_one_sample_t_test(df, value_col, mu_0, alpha)
        
        return {
            "status": "success",
            "descriptive": {k: safe_float(v) for k, v in analyzer.descriptive_stats.items()},
            "normality": {
                "W": safe_float(analyzer.normality_results["W"]),
                "p": safe_float(analyzer.normality_results["p_value"]),
                "interpretation": analyzer.normality_results["Interpretation"]
            },
            "t_test": {
                "mu_0": safe_float(analyzer.t_test_results["HypotheticalMean"]),
                "mean": safe_float(analyzer.t_test_results["SampleMean"]),
                "se": safe_float(analyzer.t_test_results["StdError"]),
                "t_value": safe_float(analyzer.t_test_results["t_value"]),
                "df": int(analyzer.t_test_results["df"]),
                "p_value": safe_float(analyzer.t_test_results["p_value"]),
                "lower_ci": safe_float(analyzer.t_test_results["Lower_CI"]),
                "upper_ci": safe_float(analyzer.t_test_results["Upper_CI"]),
                "conclusion": analyzer.t_test_results["Conclusion"]
            },
            "interpretation": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_one_sample_t_test")
async def report_one_sample_t_test(
    file: UploadFile = File(...),
    value_col: str = Form(...),
    mu_0: float = Form(0.0),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_one_sample_t_test(df, value_col, mu_0, alpha)
        
        report_buffer = analyzer.create_report()
        filename = f"One_Sample_t_Test_Report_{value_col}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Two-Sample t-Test
def perform_two_sample_t_test(df, category_col, value_col, alpha, variance_option):
    analyzer = TwoSampleTTestAnalyzer(df, category_col, value_col, alpha, variance_option)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_two_sample_t_test")
async def analyze_two_sample_t_test(
    file: UploadFile = File(...),
    category_col: str = Form(...),
    value_col: str = Form(...),
    alpha: float = Form(0.05),
    variance_option: str = Form("bartlett")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_two_sample_t_test(df, category_col, value_col, alpha, variance_option)
        
        return {
            "status": "success",
            "descriptive": {g: {k: safe_float(v) for k, v in s.items()} for g, s in analyzer.descriptive_stats.items()},
            "normality": {g: {
                "W": safe_float(n["W"]),
                "p": safe_float(n["p_value"]),
                "interpretation": n["Interpretation"]
            } for g, n in analyzer.normality_results.items()},
            "bartlett": {
                "statistic": safe_float(analyzer.bartlett_results["Statistic"]),
                "p_value": safe_float(analyzer.bartlett_results["p_value"]),
                "interpretation": analyzer.bartlett_results["Interpretation"]
            },
            "t_test": {
                "test_type": analyzer.t_test_results["TestType"],
                "mean1": safe_float(analyzer.t_test_results["Mean1"]),
                "mean2": safe_float(analyzer.t_test_results["Mean2"]),
                "diff": safe_float(analyzer.t_test_results["MeanDiff"]),
                "t_value": safe_float(analyzer.t_test_results["t_value"]),
                "df": safe_float(analyzer.t_test_results["df"]),
                "p_value": safe_float(analyzer.t_test_results["p_value"]),
                "lower_ci": safe_float(analyzer.t_test_results["Lower_CI"]),
                "upper_ci": safe_float(analyzer.t_test_results["Upper_CI"]),
                "conclusion": analyzer.t_test_results["Conclusion"]
            },
            "interpretation": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_two_sample_t_test")
async def report_two_sample_t_test(
    file: UploadFile = File(...),
    category_col: str = Form(...),
    value_col: str = Form(...),
    alpha: float = Form(0.05),
    variance_option: str = Form("bartlett")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_two_sample_t_test(df, category_col, value_col, alpha, variance_option)
        
        report_buffer = analyzer.create_report()
        filename = f"Two_Sample_t_Test_Report_{value_col}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Paired t-Test
def perform_paired_t_test(df, col1, col2, alpha, d0):
    analyzer = PairedTTestAnalyzer(df, col1, col2, alpha, d0)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_paired_t_test")
async def analyze_paired_t_test(
    file: UploadFile = File(...),
    col1: str = Form(...),
    col2: str = Form(...),
    alpha: float = Form(0.05),
    d0: float = Form(0.0)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_paired_t_test(df, col1, col2, alpha, d0)
        
        return {
            "status": "success",
            "descriptive": {k: {m: safe_float(v) for m, v in s.items()} for k, s in analyzer.descriptive_stats.items()},
            "diff_stats": {k: safe_float(v) for k, v in analyzer.diff_stats.items()},
            "normality": {
                "W": safe_float(analyzer.normality_results["W"]),
                "p": safe_float(analyzer.normality_results["p_value"]),
                "interpretation": analyzer.normality_results["Interpretation"]
            },
            "t_test": {
                "d0": safe_float(analyzer.t_test_results["d0"]),
                "mean_diff": safe_float(analyzer.t_test_results["MeanDiff"]),
                "se": safe_float(analyzer.t_test_results["StdError"]),
                "t_value": safe_float(analyzer.t_test_results["t_value"]),
                "df": int(analyzer.t_test_results["df"]),
                "p_value": safe_float(analyzer.t_test_results["p_value"]),
                "lower_ci": safe_float(analyzer.t_test_results["Lower_CI"]),
                "upper_ci": safe_float(analyzer.t_test_results["Upper_CI"]),
                "conclusion": analyzer.t_test_results["Conclusion"]
            },
            "interpretation": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_paired_t_test")
async def report_paired_t_test(
    file: UploadFile = File(...),
    col1: str = Form(...),
    col2: str = Form(...),
    alpha: float = Form(0.05),
    d0: float = Form(0.0)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_paired_t_test(df, col1, col2, alpha, d0)
        
        report_buffer = analyzer.create_report()
        filename = f"Paired_t_Test_Report_{col1}_vs_{col2}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Regression Analysis
def perform_regression_analysis(df, y_col, x_cols, model_type, degree, alpha):
    analyzer = RegressionAnalyzer(df, y_col, x_cols, model_type, degree, alpha)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_regression")
async def analyze_regression(
    file: UploadFile = File(...),
    y_col: str = Form(...),
    x_cols: str = Form(...),  # Comma separated
    model_type: str = Form("linear"),
    degree: int = Form(2),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        x_list = [x.strip() for x in x_cols.split(",") if x.strip()]
        analyzer = perform_regression_analysis(df, y_col, x_list, model_type, degree, alpha)
        
        return {
            "status": "success",
            "summary": {k: (safe_float(v) if isinstance(v, (float, int, np.float64, np.int64)) else v) for k, v in analyzer.summary_stats.items()},
            "coefficients": [{k: (safe_float(v) if k != 'Variable' else v) for k, v in c.items()} for c in analyzer.coefficient_table],
            "anova": [{k: (safe_float(v) if k != 'Source' else v) for k, v in a.items()} for a in analyzer.anova_table],
            "interpretation": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_regression")
async def report_regression(
    file: UploadFile = File(...),
    y_col: str = Form(...),
    x_cols: str = Form(...),
    model_type: str = Form("linear"),
    degree: int = Form(2),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        x_list = [x.strip() for x in x_cols.split(",") if x.strip()]
        analyzer = perform_regression_analysis(df, y_col, x_list, model_type, degree, alpha)
        
        report_buffer = analyzer.create_report()
        filename = f"Regression_Report_{y_col}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for Line x Tester Analysis
def perform_line_tester_analysis(df, line_col, tester_col, rep_col, trait_col, alpha):
    analyzer = LineTesterAnalyzer(df, line_col, tester_col, rep_col, trait_col, alpha)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_line_tester")
async def analyze_line_tester(
    file: UploadFile = File(...),
    line_col: str = Form(...),
    tester_col: str = Form(...),
    rep_col: str = Form(...),
    trait_col: str = Form(...),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_line_tester_analysis(df, line_col, tester_col, rep_col, trait_col, alpha)
        
        return {
            "status": "success",
            "anova": [{k: (safe_float(v) if k not in ['Source', 'DF'] else v) for k, v in row.items()} for row in analyzer.anova_table],
            "gca_lines": [{k: (safe_float(v) if k not in ['Line', 'Sig'] else v) for k, v in row.items()} for row in analyzer.gca_lines],
            "gca_testers": [{k: (safe_float(v) if k not in ['Tester', 'Sig'] else v) for k, v in row.items()} for row in analyzer.gca_testers],
            "sca": [{k: (safe_float(v) if k not in ['Hybrid', 'Sig'] else v) for k, v in row.items()} for row in analyzer.sca_effects],
            "variances": {k: (safe_float(v) if k != 'GeneAction' else v) for k, v in analyzer.genetic_variances.items()},
            "summary": {k: safe_float(v) for k, v in analyzer.summary_stats.items()},
            "interpretation": analyzer.get_interpretation()
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_line_tester")
async def report_line_tester(
    file: UploadFile = File(...),
    line_col: str = Form(...),
    tester_col: str = Form(...),
    rep_col: str = Form(...),
    trait_col: str = Form(...),
    alpha: float = Form(0.05)
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        analyzer = perform_line_tester_analysis(df, line_col, tester_col, rep_col, trait_col, alpha)
        
        report_buffer = analyzer.create_report()
        filename = f"Line_Tester_Report_{trait_col}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

# Helper for F-Test
def perform_f_test_analysis(df, category_col, value_col, alpha, mode):
    analyzer = FTestAnalyzer(df, category_col, value_col, alpha, mode)
    analyzer.validate()
    analyzer.run_analysis()
    return analyzer

@app.post("/analyze_f_test")
async def analyze_f_test(
    file: UploadFile = File(...),
    category_col: str = Form(...),
    value_col: str = Form(...),
    alpha: float = Form(0.05),
    mode: str = Form("long")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_f_test_analysis(df, category_col, value_col, alpha, mode)
        
        # Serialize Response
        res = {
            "status": "success",
            "descriptive": {g: {k: safe_float(v) for k, v in s.items()} for g, s in analyzer.descriptive_stats.items()},
            "normality": {g: {
                "W": safe_float(n["W"]),
                "p": safe_float(n["p_value"]),
                "interpretation": n["Interpretation"]
            } for g, n in analyzer.normality_results.items()},
            "f_test": {
                "var1": safe_float(analyzer.f_test_results["Variance1"]),
                "var2": safe_float(analyzer.f_test_results["Variance2"]),
                "f_value": safe_float(analyzer.f_test_results["F_value"]),
                "p_value": safe_float(analyzer.f_test_results["p_value"]),
                "df1": int(analyzer.f_test_results["df1"]),
                "df2": int(analyzer.f_test_results["df2"]),
                "lower_ci": safe_float(analyzer.f_test_results["Lower_CI"]),
                "upper_ci": safe_float(analyzer.f_test_results["Upper_CI"]),
                "conclusion": analyzer.f_test_results["Conclusion"]
            },
            "interpretation": analyzer.get_interpretation()
        }
        return res
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/report_f_test")
async def report_f_test(
    file: UploadFile = File(...),
    category_col: str = Form(...),
    value_col: str = Form(...),
    alpha: float = Form(0.05),
    mode: str = Form("long")
):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        analyzer = perform_f_test_analysis(df, category_col, value_col, alpha, mode)
        
        report_buffer = analyzer.create_report()
        filename = f"F_Test_Report_{value_col}.docx" if mode == 'long' else f"F_Test_Report_{category_col}_vs_{value_col}.docx"
        
        return StreamingResponse(
            report_buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
