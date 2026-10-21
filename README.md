# FlowSight Traffic Pattern and Congestion Analytics

An interactive React dashboard with a Flask API. Enter a traffic situation and explore similar recorded traffic. All four algorithms work together in one live analysis.

## Start the presentation

The dependencies and trained models in this workspace are ready. From the project root:

```powershell
python backend/app.py
```

Open **http://127.0.0.1:5000**. Flask serves the built React dashboard and its API on the same address.

Try this demo:

1. Select **Morning rush**. Point to the matching traffic group and average recorded delay.
2. Type **8** in Rainfall. The cards, chart, matching observations, regression explanation and tree rules update automatically.
3. Click **Light traffic** or **Heavy traffic** to filter the matching records. Select **Show all groups** to reset the filter.
4. Change the group chart between **Delay** and **Record count**.
5. Under **Understand what changed**, compare with **Morning rush** to isolate the rainfall difference. Click a factor to read its explanation.
6. Open a record's **Details** and select **Use this record as input**. All controls and results update together.

The controls support numeric entry and sliders for vehicle count, speed, rain, incidents, lanes and time. Choose 10, 30, 60 or 100 similar records to explore. There is no extra submit button. Invalid or empty inputs show an explanation; stale or failed requests do not overwrite newer inputs.

| Algorithm | Purpose |
|---|---|
| K-Means | Learns three groups from recorded volume, speed, rain, incidents and delay. The UI calls them Light, Busy and Heavy traffic. |
| KNN | Retrieves the closest observations to the six input values after scaling. The displayed group counts and averages use this selected set. |
| Decision Tree | Traverses learned rules using the current inputs and shows the resulting group with its actual decision path. |
| Linear Regression | Shows coefficient × input difference relative to a chosen example. Coefficients remain fixed; contributions change with the inputs. |

## What the numbers mean

- The cards and chart summarize **similar recorded observations**, not future journey times. An absent group shows no average, not zero delay.
- A regression bar is the contribution of **one difference from the reference example**, measured in minutes. It is an association, not proof of a cause. No total delay forecast is shown.
- Group models stay fitted while the user explores. Changing an input selects a new set of similar observations; it does not invent new measurements or retrain the clusters.
- KNN distances are standardized distances, not kilometres or probabilities. The smallest distance is the closest match. Exact matches are retained.
- The tree is a simplified explanation and may disagree with the most common group in the neighbor set.

## Fresh setup or rebuilding

```powershell
pip install -r requirements.txt
python backend/train_models.py
cd frontend
npm ci
npm run build
cd ..
python backend/app.py
```

For frontend development, keep Flask running and start Vite in a second terminal:

```powershell
cd frontend
npm run dev
```

Vite opens at **http://127.0.0.1:5173** and proxies `/api` requests to Flask. Restart an older Flask/Vite process after upgrading this project. The new models use schema version 2; rerun training if the API requests it.

## Verification

```powershell
python -m unittest discover -s backend -p "test_*.py" -v
cd frontend
npm run build
```

Checks cover changing scenarios, aggregation from real retrieved records, exact nearest matches, reference comparisons, and invalid inputs.

The 2,400 observations are **simulated classroom data**, generated reproducibly with seed 42. They are not live city sensor data. The illustrative group names are ordered by average delay, not municipal congestion thresholds. Small input changes can retain the same nearest records or group label; those numbers should not be forced to move. Hour is a simple numeric feature, so midnight wraparound and non-linear rush-hour patterns are limitations of this small demo.
