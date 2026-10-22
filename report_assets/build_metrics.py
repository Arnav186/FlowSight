"""Create reproducible evaluation figures for the FlowSight project report."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import davies_bouldin_score, mean_absolute_error, mean_squared_error, r2_score, silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from train_models import create_traffic_data  # noqa: E402

OUT = Path(__file__).resolve().parent
FEATURES = ["hour", "traffic_volume", "average_speed_kmph", "rainfall_mm", "incidents", "road_lanes"]
CLUSTER_FEATURES = ["traffic_volume", "average_speed_kmph", "rainfall_mm", "incidents", "delay_minutes"]

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.titleweight": "bold"})


def save(fig, name: str) -> None:
    fig.tight_layout()
    fig.savefig(OUT / name, dpi=220, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    data = create_traffic_data(n=2400, seed=42)
    x_train, x_test, y_train, y_test = train_test_split(
        data[FEATURES], data["delay_minutes"], test_size=0.25, random_state=42
    )
    models = {
        "Linear Regression": Pipeline([("scale", StandardScaler()), ("model", LinearRegression())]),
        "KNN Regressor": Pipeline([("scale", StandardScaler()), ("model", KNeighborsRegressor(n_neighbors=15, weights="distance"))]),
        "Decision Tree": DecisionTreeRegressor(max_depth=8, min_samples_leaf=8, random_state=42),
        "Random Forest": RandomForestRegressor(n_estimators=200, min_samples_leaf=3, random_state=42, n_jobs=1),
    }
    scores = []
    for name, model in models.items():
        started = time.perf_counter()
        model.fit(x_train, y_train)
        train_ms = (time.perf_counter() - started) * 1000
        started = time.perf_counter()
        pred = model.predict(x_test)
        predict_ms = (time.perf_counter() - started) * 1000
        scores.append({
            "model": name,
            "MAE (min)": round(mean_absolute_error(y_test, pred), 3),
            "RMSE (min)": round(mean_squared_error(y_test, pred) ** 0.5, 3),
            "R2": round(r2_score(y_test, pred), 4),
            "Train time (ms)": round(train_ms, 1),
            "Test inference (ms)": round(predict_ms, 2),
        })
    metrics = pd.DataFrame(scores).sort_values("RMSE (min)").reset_index(drop=True)
    metrics.to_csv(OUT / "model_metrics.csv", index=False)

    # K-Means quality on the same clustering variables used by the dashboard.
    z = StandardScaler().fit_transform(data[CLUSTER_FEATURES])
    km = KMeans(n_clusters=3, n_init=25, random_state=42).fit(z)
    data["cluster"] = km.labels_
    cluster_means = data.groupby("cluster")[["delay_minutes", "average_speed_kmph", "traffic_volume"]].mean()
    order = cluster_means["delay_minutes"].sort_values().index
    labels = {cluster: label for cluster, label in zip(order, ["Free flow", "Moderate", "Severe"])}
    data["group"] = data["cluster"].map(labels)
    kmeans_quality = {
        "observations": int(len(data)),
        "train_records": int(len(x_train)),
        "test_records": int(len(x_test)),
        "features": FEATURES,
        "silhouette": round(float(silhouette_score(z, km.labels_)), 3),
        "davies_bouldin": round(float(davies_bouldin_score(z, km.labels_)), 3),
        "cluster_counts": {labels[key]: int(value) for key, value in data.groupby("cluster").size().items()},
    }
    (OUT / "metrics.json").write_text(json.dumps({"models": scores, "kmeans": kmeans_quality}, indent=2))

    # Figure 1: analysis inputs and discovered groups.
    colors = {"Free flow": "#168f72", "Moderate": "#bb720c", "Severe": "#ca4458"}
    fig, ax = plt.subplots(figsize=(7.5, 3.7))
    for group, part in data.groupby("group"):
        ax.scatter(part["average_speed_kmph"], part["delay_minutes"], s=11, alpha=.40, color=colors[group], label=group)
    ax.set_title("Discovered traffic groups in the simulated observations")
    ax.set_xlabel("Average speed (km/h)")
    ax.set_ylabel("Recorded delay (minutes)")
    ax.legend(title="K-Means label", frameon=False, ncol=3, loc="upper center")
    ax.grid(axis="y", alpha=.2)
    save(fig, "fig1_clusters.png")

    # Figure 2: directly comparable held-out regression metrics.
    fig, axes = plt.subplots(1, 2, figsize=(8.0, 3.45))
    ordered = metrics.sort_values("RMSE (min)")
    palette = ["#175ddc", "#3477e8", "#70a1f2", "#9ebff5"]
    axes[0].barh(ordered["model"], ordered["RMSE (min)"], color=palette)
    axes[0].invert_yaxis(); axes[0].set_title("Lower is better")
    axes[0].set_xlabel("RMSE (minutes)"); axes[0].grid(axis="x", alpha=.2)
    axes[1].barh(ordered["model"], ordered["R2"], color=palette)
    axes[1].invert_yaxis(); axes[1].set_title("Higher is better")
    axes[1].set_xlabel("R-squared"); axes[1].set_xlim(0, 1); axes[1].grid(axis="x", alpha=.2)
    fig.suptitle("Held-out comparison of four regression baselines", fontweight="bold")
    save(fig, "fig2_model_comparison.png")

    # Figure 3: explain the application data path.
    fig, ax = plt.subplots(figsize=(7.7, 2.55)); ax.axis("off")
    steps = [
        ("User inputs", "volume, speed, rain,\nincidents, lanes, time"),
        ("Validation", "range and type checks"),
        ("Four ML views", "K-Means, KNN, tree,\nlinear regression"),
        ("React dashboard", "groups, records, rules,\ncomparison bars"),
    ]
    xs = [0.03, .28, .53, .78]
    for (title, detail), x in zip(steps, xs):
        ax.text(x, .55, title, ha="center", va="center", transform=ax.transAxes, fontweight="bold", color="white",
                bbox=dict(boxstyle="round,pad=.55", fc="#175ddc", ec="none"))
        ax.text(x, .22, detail, ha="center", va="center", transform=ax.transAxes, color="#33485f", fontsize=8)
    for x in [.155, .405, .655]:
        ax.annotate("", xy=(x+.085,.55), xytext=(x,.55), xycoords=ax.transAxes,
                    arrowprops=dict(arrowstyle="->", color="#75869d", lw=1.5))
    ax.set_title("Interactive analytics flow", loc="left", fontweight="bold")
    save(fig, "fig3_system_flow.png")

    # Figure 4: summary by discovered cluster.
    summary = data.groupby("group", observed=False).agg(
        records=("delay_minutes", "size"), avg_delay=("delay_minutes", "mean"), avg_speed=("average_speed_kmph", "mean")
    ).reindex(["Free flow", "Moderate", "Severe"])
    fig, ax = plt.subplots(figsize=(7.5, 3.4))
    bars = ax.bar(summary.index, summary["avg_delay"], color=[colors[index] for index in summary.index])
    ax.set_title("Average recorded delay by discovered traffic group")
    ax.set_ylabel("Delay (minutes)"); ax.set_ylim(0, 60); ax.grid(axis="y", alpha=.2)
    for bar, value, count in zip(bars, summary["avg_delay"], summary["records"]):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+1, f"{value:.1f} min\n(n={count})", ha="center", fontsize=8)
    save(fig, "fig4_group_delay.png")


if __name__ == "__main__":
    main()
