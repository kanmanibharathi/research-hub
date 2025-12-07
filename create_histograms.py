# File: D:\GitHub\stat-summary-webapp\create_histograms.py
import pandas as pd
import matplotlib.pyplot as plt
import os
import math

IN_CSV = os.path.join(os.path.dirname(__file__), "Input - Model.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "plots")
os.makedirs(OUT_DIR, exist_ok=True)

def save_hist(series, outpath):
    # high quality: 300 dpi, tight bounding box
    plt.figure(figsize=(4, 1.0))   # compact sparkline/hist style
    vals = series.dropna()
    if len(vals) == 0:
        plt.axis('off')
    else:
        n_bins = max(4, int(min(30, math.sqrt(len(vals))*2)))
        plt.hist(vals, bins=n_bins, edgecolor='none')
        plt.gca().yaxis.set_visible(False)
        plt.gca().xaxis.set_tick_params(labelsize=6)
        plt.gca().spines['top'].set_visible(False)
        plt.gca().spines['right'].set_visible(False)
        plt.gca().spines['left'].set_visible(False)
    plt.tight_layout(pad=0)
    plt.savefig(outpath, dpi=300, bbox_inches='tight', transparent=False)
    plt.close()

def main():
    df = pd.read_csv(IN_CSV)
    for col in df.columns:
        if df[col].dtype.kind in "biufc":
            outpath = os.path.join(OUT_DIR, f"{col}.png")
            save_hist(df[col], outpath)
            print("Saved", outpath)

if __name__ == "__main__":
    main()
