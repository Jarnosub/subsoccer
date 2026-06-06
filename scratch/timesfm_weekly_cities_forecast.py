"""
Subsoccer — Weekly New Cities Forecast
TimesFM-ennuste johtoryhmädemolle

Käyttö Google Colabissa:
  !git clone https://github.com/google-research/timesfm.git
  !pip install ./timesfm[torch] -q
  !python timesfm_weekly_cities_forecast.py
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.ticker import MaxNLocator
import warnings
warnings.filterwarnings('ignore')

# ── 1. Lataa päivädata ja aggregoi viikkotasolle ────────────────────────────
CSV_PATH = 'subsoccer_new_cities_daily.csv'
FORECAST_WEEKS = 8   # Kuinka monta viikkoa ennustetaan

df = pd.read_csv(CSV_PATH)
df['ds'] = pd.to_datetime(df['ds'])
df = df.sort_values('ds')

# Aggregoi: kuinka monta uutta kaupunkia per viikko (maanantai–sunnuntai)
weekly = (
    df.set_index('ds')['y']
    .resample('W-MON', label='left', closed='left')
    .sum()
    .reset_index()
    .rename(columns={'ds': 'week_start', 'y': 'new_cities'})
)

# Jätä pois mahdollisesti kesken oleva viimeisin viikko (ei täysi)
today = pd.Timestamp.today().normalize()
last_full_week = today - pd.Timedelta(days=today.weekday() + 1)  # edellinen sunnuntai
weekly = weekly[weekly['week_start'] <= last_full_week]

print(f"✅ Historiallinen data: {len(weekly)} viikkoa")
print(f"   Aikajana: {weekly['week_start'].min().date()} → {weekly['week_start'].max().date()}")
print(f"   Yhteensä uniikkeja kaupunkeja: {weekly['new_cities'].sum():.0f}")
print(f"   Keskiarvo/viikko: {weekly['new_cities'].mean():.1f} uutta kaupunkia")
print(f"   Paras viikko: {weekly['new_cities'].max():.0f} uutta kaupunkia")

# ── 2. TimesFM-ennuste ──────────────────────────────────────────────────────
print(f"\n🔮 Ladataan TimesFM-malli...")
import timesfm

tfm = timesfm.TimesFm(
    hparams=timesfm.TimesFmHparams(
        backend='torch',
        per_core_batch_size=32,
        horizon_len=FORECAST_WEEKS,
    ),
    checkpoint=timesfm.TimesFmCheckpoint(
        huggingface_repo_id='google/timesfm-1.0-200m-pytorch'
    ),
)

# Syöte: lista historiallisista arvoista
history_values = weekly['new_cities'].tolist()

print(f"   Ennustetaan {FORECAST_WEEKS} viikkoa eteenpäin...")
point_forecast, interval_forecast = tfm.forecast(
    inputs=[np.array(history_values)],
    freq=[1],
    quantile_levels=[0.1, 0.9],  # 80% konfidenssiväli
)

forecast_values = point_forecast[0].tolist()
lower_bound     = interval_forecast[0][:, 0].tolist()  # 10th percentile
upper_bound     = interval_forecast[0][:, 1].tolist()  # 90th percentile

# Negatiiviset arvot → 0
forecast_values = [max(0, v) for v in forecast_values]
lower_bound     = [max(0, v) for v in lower_bound]
upper_bound     = [max(0, v) for v in upper_bound]

# Tulevaisuuden viikot
last_week = weekly['week_start'].max()
future_weeks = [last_week + pd.Timedelta(weeks=i+1) for i in range(FORECAST_WEEKS)]

print(f"\n📊 ENNUSTE — uusia kaupunkeja per viikko:")
print(f"{'Viikko':<14} {'Ennuste':>10} {'Min–Max':>16}")
print("─" * 42)
for week, val, lo, hi in zip(future_weeks, forecast_values, lower_bound, upper_bound):
    print(f"  {week.date()!s:<12} {val:>8.1f}     {lo:.0f}–{hi:.0f}")

total_forecast = sum(forecast_values)
print(f"\n   Yhteensä {FORECAST_WEEKS} viikossa: ~{total_forecast:.0f} uutta kaupunkia")
current_total = 121  # päivitetty luku
print(f"   Nykytila: {current_total} kaupunkia → ennuste: ~{current_total + total_forecast:.0f} kaupunkia")

# ── 3. Piirretään graafi johtoryhmälle ─────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 7))
fig.patch.set_facecolor('#0D1117')
ax.set_facecolor('#0D1117')

# Historiadatan pylväät
hist_dates = weekly['week_start']
hist_vals  = weekly['new_cities']

ax.bar(hist_dates, hist_vals, width=5,
       color='#2D6A4F', alpha=0.85, label='Historia (toteutunut)', zorder=3)

# Ennustepylväät
ax.bar(future_weeks, forecast_values, width=5,
       color='#52B788', alpha=0.90, label=f'TimesFM-ennuste ({FORECAST_WEEKS} vk)', zorder=3)

# Konfidenssiväli varjostettuna
ax.fill_between(
    [w + pd.Timedelta(days=3.5) for w in future_weeks],
    lower_bound, upper_bound,
    alpha=0.20, color='#74C69D', zorder=2, label='80% todennäköisyysväli'
)

# Viiva historian ja ennusteen väliin
ax.axvline(x=last_week + pd.Timedelta(days=7),
           color='#FFFFFF', linewidth=1, linestyle='--', alpha=0.4, zorder=4)
ax.text(last_week + pd.Timedelta(days=8), ax.get_ylim()[1] * 0.92,
        'ENNUSTE →', color='#AAAAAA', fontsize=9, va='top')

# Korostetaan ennustejakson maksimi
if forecast_values:
    peak_idx = forecast_values.index(max(forecast_values))
    ax.annotate(
        f'  Huippu: {max(forecast_values):.0f} kaupunkia',
        xy=(future_weeks[peak_idx], max(forecast_values)),
        xytext=(future_weeks[peak_idx], max(forecast_values) + 0.8),
        color='#95D5B2', fontsize=9,
        arrowprops=dict(arrowstyle='->', color='#95D5B2', lw=1.2),
    )

# Yhteissummabox
summary_text = (
    f"Nyt: {current_total} kaupunkia\n"
    f"+ {FORECAST_WEEKS} vk ennuste: ~{total_forecast:.0f} uutta\n"
    f"Yhteensä: ~{current_total + total_forecast:.0f} kaupunkia"
)
ax.text(0.02, 0.97, summary_text,
        transform=ax.transAxes, fontsize=10, va='top', ha='left',
        color='white', bbox=dict(boxstyle='round,pad=0.5',
                                  facecolor='#1B4332', edgecolor='#52B788', alpha=0.9))

# Tyyli
ax.set_title('Subsoccer — Uudet kaupungit per viikko + TimesFM-ennuste',
             color='white', fontsize=14, fontweight='bold', pad=15)
ax.set_xlabel('Viikon aloituspäivä', color='#AAAAAA', fontsize=11)
ax.set_ylabel('Uusia kaupunkeja', color='#AAAAAA', fontsize=11)
ax.tick_params(colors='#AAAAAA', labelsize=9)
ax.xaxis.set_tick_params(rotation=35)
ax.yaxis.set_major_locator(MaxNLocator(integer=True))
for spine in ax.spines.values():
    spine.set_edgecolor('#333333')
ax.grid(axis='y', color='#222222', linewidth=0.7, zorder=1)

# Legenda
ax.legend(loc='upper left', framealpha=0.15, labelcolor='white',
          facecolor='#111111', edgecolor='#444444', fontsize=9, bbox_to_anchor=(0.02, 0.78))

# Powered by
fig.text(0.99, 0.01, 'Powered by Google TimesFM  |  subsoccer.pro',
         ha='right', va='bottom', color='#555555', fontsize=8)

plt.tight_layout()
output_file = 'subsoccer_weekly_cities_forecast.png'
plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f"\n✅ Graafi tallennettu: {output_file}")
print("   → Lataa tiedosto Colabista: tiedostopaneeli (📁) → hiiren oikea → Download")
