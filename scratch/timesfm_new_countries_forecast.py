import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# -------------------------------------------------------------
# INSTRUCTIONS FOR RUNNING:
#
# Option A: Run in Google Colab (Highly Recommended)
# 1. Open Google Colab: https://colab.research.google.com/
# 2. Upload this script, 'subsoccer_new_countries_daily.csv', and 'subsoccer_new_countries_cumulative.csv'
# 3. Create a cell and run:
#    !git clone https://github.com/google-research/timesfm.git
#    !pip install ./timesfm[torch]
# 4. Run this script: !python timesfm_new_countries_forecast.py
#
# Option B: Run Locally
# 1. Install prerequisites:
#    pip install matplotlib pandas numpy
#    pip install timesfm (or install from git: pip install git+https://github.com/google-research/timesfm.git)
# 2. Run: python timesfm_new_countries_forecast.py
# -------------------------------------------------------------

def run_new_countries_forecast():
    daily_csv = 'subsoccer_new_countries_daily.csv'
    cumulative_csv = 'subsoccer_new_countries_cumulative.csv'
    
    # Resolve paths
    base_dir = os.path.dirname(__file__)
    if not os.path.exists(daily_csv):
        daily_csv = os.path.join(base_dir, 'subsoccer_new_countries_daily.csv')
    if not os.path.exists(cumulative_csv):
        cumulative_csv = os.path.join(base_dir, 'subsoccer_new_countries_cumulative.csv')
        
    if not os.path.exists(daily_csv) or not os.path.exists(cumulative_csv):
        print("Error: Could not find new countries CSV files. Make sure they are in the same directory.")
        return

    # 1. Load Data
    print("Loading datasets...")
    df_daily = pd.read_csv(daily_csv)
    df_cumulative = pd.read_csv(cumulative_csv)
    
    # Process Daily
    df_daily['ds'] = pd.to_datetime(df_daily['ds'])
    df_daily = df_daily.sort_values('ds').reset_index(drop=True)
    dates_daily = df_daily['ds'].tolist()
    y_daily = df_daily['y'].astype(float).values
    
    # Process Cumulative
    df_cumulative['ds'] = pd.to_datetime(df_cumulative['ds'])
    df_cumulative = df_cumulative.sort_values('ds').reset_index(drop=True)
    dates_cumulative = df_cumulative['ds'].tolist()
    y_cumulative = df_cumulative['y'].astype(float).values
    
    print(f"Loaded {len(y_daily)} days of new countries telemetry data.")
    print(f"Current Total Unique Countries: {int(y_cumulative[-1])}")
    
    # 2. Check for TimesFM
    print("\nInitializing Google TimesFM model...")
    has_timesfm = True
    try:
        import torch
        import timesfm
        
        if torch.cuda.is_available():
            torch.set_float32_matmul_precision("high")
            print("CUDA is available! Using GPU for inference.")
        else:
            print("Using CPU for inference.")
    except ImportError:
        print("\n[!] 'timesfm' or 'torch' package not found.")
        print("Generating mock forecasts for visualization...")
        has_timesfm = False
        
    # 3. Forecast Daily New Countries (Rate)
    horizon = 14
    if has_timesfm:
        try:
            model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
        except Exception as e:
            print(f"Error loading timesfm 2.5: {e}. Falling back to 1.0 architecture...")
            model = timesfm.TimesFm(
                context_len=512,
                horizon_len=14,
                input_patch_len=32,
                output_patch_len=128,
                num_layers=20,
                model_dims=1280,
                backend="cpu" if not torch.cuda.is_available() else "gpu",
            )
            model.load_from_checkpoint(repo_id="google/timesfm-1.0-200m")
            
        model.compile(timesfm.ForecastConfig(max_context=1024, max_horizon=256, normalize_inputs=True))
        
        # Forecast Daily Rate
        point_daily, _ = model.forecast(horizon=horizon, inputs=[y_daily])
        pred_daily = point_daily[0]
        
        # Forecast Cumulative
        point_cumulative, _ = model.forecast(horizon=horizon, inputs=[y_cumulative])
        pred_cumulative = point_cumulative[0]
        pred_cumulative = np.maximum.accumulate(np.maximum(pred_cumulative, y_cumulative[-1]))
    else:
        # Generate mock values
        # Daily rate projection: mean of last 14 days with minor random noise
        mean_rate = np.mean(y_daily[-14:])
        pred_daily = [max(0.0, mean_rate + np.random.normal(0, 0.2)) for _ in range(horizon)]
        
        # Cumulative projection
        pred_cumulative = []
        current_cum = y_cumulative[-1]
        for val in pred_daily:
            current_cum += val
            pred_cumulative.append(current_cum)
            
    # Calculate forecast dates
    last_date = dates_daily[-1]
    forecast_dates = [last_date + pd.Timedelta(days=i) for i in range(1, horizon + 1)]
    
    # 4. Plot Chart 1: Daily New Countries Rate
    plot_results(
        dates_daily, y_daily, forecast_dates, pred_daily,
        "Daily New Countries Addition Rate", "New Countries / Day",
        "subsoccer_new_countries_rate_forecast.png", "#34a853"
    )
    
    # 5. Plot Chart 2: Cumulative Countries Growth
    plot_results(
        dates_cumulative, y_cumulative, forecast_dates, pred_cumulative,
        "Cumulative Unique Countries Growth Forecast", "Total Unique Countries",
        "subsoccer_new_countries_cumulative_forecast.png", "#fbbc05"
    )

def plot_results(history_dates, history_values, forecast_dates, forecast_values, title, ylabel, filename, color):
    plt.figure(figsize=(12, 6))
    
    # Plot History
    plt.plot(history_dates, history_values, label='Historical', color='#1a73e8', linewidth=2, marker='o', markersize=4)
    
    # Plot Forecast
    all_forecast_dates = [history_dates[-1]] + list(forecast_dates)
    all_forecast_values = [history_values[-1]] + list(forecast_values)
    
    plt.plot(all_forecast_dates, all_forecast_values, label='TimesFM 14-Day Forecast', color=color, linewidth=2.5, linestyle='--', marker='^', markersize=5)
    
    # Styling
    plt.title(title, fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Date', fontsize=11, labelpad=10)
    plt.ylabel(ylabel, fontsize=11, labelpad=10)
    plt.grid(True, linestyle=':', alpha=0.6)
    
    # Highlight forecast area
    plt.axvspan(history_dates[-1], forecast_dates[-1], color=color, alpha=0.04, label='Forecast Horizon')
    
    plt.legend(loc='upper left', frameon=True, facecolor='white', edgecolor='#e0e0e0')
    plt.tight_layout()
    
    plt.savefig(filename, dpi=150)
    print(f"Chart saved to: {os.path.abspath(filename)}")
    plt.close()

if __name__ == '__main__':
    run_new_countries_forecast()
