import pandas as pd
import numpy as np
from scipy.stats import skew, kurtosis
import os

IN_CSV = os.path.join(os.path.dirname(__file__), "Input - Model.csv")
OUT_SUMMARY = os.path.join(os.path.dirname(__file__), "summary.csv")

def coef_var(x):
    return (np.std(x, ddof=1) / np.mean(x)) * 100 if np.mean(x) != 0 else np.nan

def make_summary(df):
    rows = []
    for col in df.columns:
        s = df[col].dropna()
        if s.dtype.kind in "biufc":  # numeric
            mean = s.mean()
            sd = s.std(ddof=1)
            mx = s.max()
            mn = s.min()
            med = s.median()
            cv = coef_var(s)
            sk = skew(s, bias=False)          # sample skewness
            kurt = kurtosis(s, fisher=True, bias=False)  # excess kurtosis (matches many summaries)
            pct_na = df[col].isna().mean() * 100
            rows.append({
                "Variable": col,
                "Mean": round(mean, 2),
                "SD": round(sd, 2),
                "Max": round(mx, 2),
                "Min": round(mn, 2),
                "Median": round(med, 2),
                "CV(%)": round(cv, 2),
                "Skewness": round(sk, 3),
                "Kurtosis": round(kurt, 3),
                "%NA": round(pct_na, 1)
            })
    return pd.DataFrame(rows)

def main():
    df = pd.read_csv(IN_CSV)
    summary = make_summary(df)
    summary.to_csv(OUT_SUMMARY, index=False)
    print("Saved summary to:", OUT_SUMMARY)

if __name__ == "__main__":
    main()
