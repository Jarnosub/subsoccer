import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# -------------------------------------------------------------
# INSTRUCTIONS FOR RUNNING:
#
# Option A: Run in Google Colab (Highly Recommended - Free GPU)
# 1. Open Google Colab: https://colab.research.google.com/
# 2. Upload this script and 'subsoccer_daily_games.csv'
# 3. Create a cell and run:
#    !git clone https://github.com/google-research/timesfm.git
#    !pip install ./timesfm[torch]
# 4. Run this script: !python timesfm_forecast.py
#
# Option B: Run Locally
# 1. Install prerequisites:
#    pip install matplotlib pandas numpy
#    pip install timesfm (or install from git: pip install git+https://github.com/google-research/timesfm.git)
# 2. Run: python timesfm_forecast.py
# -------------------------------------------------------------

def run_forecast():
    csv_path = 'subsoccer_daily_games.csv'
    
    # Check if file exists in current directory or scratch folder
    if not os.path.exists(csv_path):
        # Fallback for local execution folder structures
        csv_path = os.path.join(os.path.dirname(__file__), 'subsoccer_daily_games.csv')
        if not os.path.exists(csv_path):
            print(f"Error: Could not find '{csv_path}'. Make sure it is in the same directory.")
            return

    # 1. Load Subsoccer Telemetry Data
    print(f"Loading dataset from: {csv_path}...")
    df = pd.read_csv(csv_path)
    
    # Convert dates and sort
    df['ds'] = pd.to_datetime(df['ds'])
    df = df.sort_values('ds').reset_index(drop=True)
    
    dates = df['ds'].tolist()
    y_values = df['y'].astype(float).values
    
    print(f"Loaded {len(y_values)} days of game data.")
    print(f"Start date: {dates[0].strftime('%Y-%m-%d')}, End date: {dates[-1].strftime('%Y-%m-%d')}")
    print(f"Last 5 days values: {y_values[-5:]}")
    
    # 2. Import TimesFM
    print("\nInitializing Google TimesFM model...")
    try:
        import torch
        import timesfm
        
        # Enable tf32 matrix multiplication for speed on GPUs
        if torch.cuda.is_available():
            torch.set_float32_matmul_precision("high")
            print("CUDA is available! Using GPU for inference.")
        else:
            print("Using CPU for inference.")
            
    except ImportError:
        print("\n[!] 'timesfm' or 'torch' package not found.")
        print("Please install them using: pip install git+https://github.com/google-research/timesfm.git")
        print("\nGenerating mock forecast visualization to demonstrate script structure...")
        generate_mock_forecast(dates, y_values)
        return

    # 3. Load pre-trained TimesFM model from Hugging Face
    # Using the standard PyTorch 2.5 200M parameter model
    try:
        model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
            "google/timesfm-2.5-200m-pytorch"
        )
    except Exception as e:
        print(f"Error loading model from Hugging Face: {e}")
        print("Falling back to TimesFM 1.0 architecture initialization...")
        # Fallback for older TimesFM 1.0 installs
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

    # 4. Compile Model Configuration
    # We want to forecast the next 14 days
    horizon = 14
    model.compile(
        timesfm.ForecastConfig(
            max_context=1024,
            max_horizon=256,
            normalize_inputs=True,
        )
    )

    # 5. Generate Zero-Shot Forecast
    print(f"Running 14-day zero-shot forecasting using TimesFM...")
    
    # Inputs is a list of 1D numpy arrays (each array is one time series)
    inputs = [y_values]
    
    # Run prediction
    point_forecast, quantile_forecast = model.forecast(
        horizon=horizon,
        inputs=inputs
    )
    
    # Extract the forecasted array (first series in the batch)
    forecast_predictions = point_forecast[0]
    print(f"Forecast successfully generated! Values for next 14 days:\n{forecast_predictions}")
    
    # 6. Generate Forecast Dates
    last_date = dates[-1]
    forecast_dates = [last_date + pd.Timedelta(days=i) for i in range(1, horizon + 1)]
    
    # 7. Plot and Save Visualization
    plot_results(dates, y_values, forecast_dates, forecast_predictions, "Google TimesFM 14-Day Zero-Shot Forecast")

def generate_mock_forecast(dates, y_values):
    # Generates a mock forecast using simple moving average + trend for visualization
    # when the user runs the script without the timesfm library installed locally.
    horizon = 14
    last_val = y_values[-1]
    
    # Simple projection (mean of last 7 days with minor noise)
    mean_last_week = np.mean(y_values[-7:])
    mock_predictions = [max(0.0, mean_last_week + np.sin(i) * 3 + np.random.normal(0, 2)) for i in range(horizon)]
    
    last_date = dates[-1]
    forecast_dates = [last_date + pd.Timedelta(days=i) for i in range(1, horizon + 1)]
    
    plot_results(dates, y_values, forecast_dates, mock_predictions, "Simulated 14-Day Forecast (TimesFM Not Installed)")

def plot_results(history_dates, history_values, forecast_dates, forecast_values, title):
    plt.figure(figsize=(12, 6))
    
    # Plot History
    plt.plot(history_dates, history_values, label='Historical Games Played', color='#1a73e8', linewidth=2, marker='o', markersize=4)
    
    # Plot Forecast
    # Join history last point with forecast first point for a continuous line
    all_forecast_dates = [history_dates[-1]] + list(forecast_dates)
    all_forecast_values = [history_values[-1]] + list(forecast_values)
    
    plt.plot(all_forecast_dates, all_forecast_values, label='TimesFM 14-Day Forecast', color='#ea4335', linewidth=2.5, linestyle='--', marker='^', markersize=5)
    
    # Styling
    plt.title(title, fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Date', fontsize=11, labelpad=10)
    plt.ylabel('Daily Games Finished', fontsize=11, labelpad=10)
    plt.grid(True, linestyle=':', alpha=0.6)
    
    # Highlight forecast area
    plt.axvspan(history_dates[-1], forecast_dates[-1], color='#ea4335', alpha=0.05, label='Forecast Horizon')
    
    plt.legend(loc='upper left', frameon=True, facecolor='white', edgecolor='#e0e0e0')
    plt.tight_layout()
    
    save_path = 'subsoccer_forecast.png'
    plt.savefig(save_path, dpi=150)
    print(f"Chart successfully saved to: {os.path.abspath(save_path)}")
    plt.show()

if __name__ == '__main__':
    run_forecast()
