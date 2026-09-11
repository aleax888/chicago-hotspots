# AGENTS.md

Data-science EDA project (Spanish). One Jupyter notebook + one large CSV + generated outputs. Not a git repo; no tests, lint, or CI.

## Core flow
- `Notebook_CrimAnalyzer_Informe_EDA.ipynb` is the only source of code (57 cells, run top-to-bottom, state-dependent). It loads data, cleans it, profiles attributes, and exports outputs.
- All dataset-specific config lives in the **1. Configuración / CONFIG** cell (~cell 3): `DATA_PATH`, `DATE_COL`, `CRIME_COL`, `SITE_COL`, `LAT_COL`, `LON_COL`. Column names must match the CSV exactly and contain spaces (e.g. `Location Description`, `X Coordinate`).
- Run from the repo root: all paths are relative (`salidas_informe`, `venv`).

## Data gotchas
- `Crimes_-_2001_to_Present_20260911.csv` is 2.4 GB, ~8.6M rows. A full `pd.read_csv` takes minutes and >10 GB RAM. Use `nrows=`/`usecols=` for experiments; don't re-run all cells casually.
- The loader (section 2) auto-globs the repo root for `*.csv/*.xlsx/*.json` and raises a helpful `FileNotFoundError` if `DATA_PATH` is wrong.

## Environment
- Use the local venv (Python 3.12.3): `venv/bin/python` or `source venv/bin/activate`.
- Very new stack installed (pandas 3.0.5, numpy 2.5.3 — CoW on, string dtype defaults; seaborn 0.13.2; scipy 1.18.1; sklearn 1.9.1). Old pandas idioms can break.
- `requirements.txt` pins nothing; `openpyxl`/`statsmodels` mentioned in the notebook's import comment are not in it (optional).
- The saved notebook outputs were produced on Windows/Python 3.13 (see traceback paths); local runs may differ.

## Output conventions
- Figures → `salidas_informe/figuras/` (PNG, matplotlib); tables → `salidas_informe/tablas/` with zero-padded numeric filenames (`01_...`→`07_...`). Keep these dirs, names, and ordering.
- The clean dataset is exported by the last section to `salidas_informe/dataset_limpio_para_analisis.csv` (not currently present).

## Known broken cell
- The dashboard cell (section 10, ~cell 47) raises `KeyError: 'null_pct'`: `missing` (created in section 4.1) uses column `nulos_pct`, but the dashboard sorts by `null_pct`. Fix the name mismatch before re-running. `dashboard_EDA.png` is consequently absent from `figuras/`.

## Language
- Notebook prose, hypothesis conclusion templates, the informe, and anything added (titles, figure captions, output text) must be in Spanish, matching existing style.