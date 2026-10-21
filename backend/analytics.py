"""Input validation and coordinated analysis of an observed traffic situation."""
import math

import pandas as pd

FEATURES = [
    "hour", "traffic_volume", "average_speed_kmph", "rainfall_mm", "incidents", "road_lanes"
]
FIELD_INFO = {
    "hour": ("Time of day", 0, 23, True, "hour"),
    "traffic_volume": ("Vehicles observed", 0, 3200, True, "vehicles"),
    "average_speed_kmph": ("Average speed", 1, 100, False, "km/h"),
    "rainfall_mm": ("Rainfall", 0, 30, False, "mm"),
    "incidents": ("Road incidents", 0, 3, True, "incidents"),
    "road_lanes": ("Open lanes", 1, 6, True, "lanes"),
}


def validate_traffic(values):
    """Reject incomplete, nonfinite or out-of-range observations before sklearn."""
    if not isinstance(values, dict):
        raise ValueError("Traffic inputs must be an object with all six fields.")
    result = {}
    for field, (label, low, high, integral, _) in FIELD_INFO.items():
        value = values.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{label} must be a number.")
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{label} must be between {low} and {high}.")
        if integral and int(value) != value:
            raise ValueError(f"{label} must be a whole number.")
        result[field] = int(value) if integral else float(value)
    return result


def find_neighbors(bundle, traffic, count):
    row = pd.DataFrame([traffic], columns=FEATURES)
    pipe = bundle["neighbors"]
    scaled = pipe.named_steps["scale"].transform(row)
    distances, indices = pipe.named_steps["knn"].kneighbors(scaled, n_neighbors=count)
    matches = bundle["records"].iloc[indices[0]].copy()
    # Keep the actual closest record, including a zero-distance exact match.
    matches["similarity_distance"] = distances[0]
    return matches


def explain_tree(bundle, traffic):
    model = bundle["explainer"]
    row = pd.DataFrame([traffic], columns=FEATURES)
    rules = []
    for node in model.decision_path(row).indices:
        index = model.tree_.feature[node]
        if index < 0:
            continue
        feature = FEATURES[index]
        threshold = float(model.tree_.threshold[node])
        value = traffic[feature]
        label, _, _, _, unit = FIELD_INFO[feature]
        relation = "at most" if value <= threshold else "above"
        rules.append({"feature": feature, "value": value, "threshold": threshold,
                      "text": f"{label} is {value:g} {unit}, {relation} {threshold:.2f} {unit}."})
    group = int(model.predict(row)[0])
    return {"segment_name": bundle["label_map"][group], "rules": rules}


def analyze(bundle, payload):
    if not isinstance(payload, dict):
        raise ValueError("Send a JSON object with traffic and reference inputs.")
    traffic = validate_traffic(payload.get("traffic"))
    reference = validate_traffic(payload.get("reference"))
    count = payload.get("sample_size", 30)
    if isinstance(count, bool) or not isinstance(count, int) or not 5 <= count <= 100:
        raise ValueError("Choose between 5 and 100 similar records.")
    matches = find_neighbors(bundle, traffic, count)
    groups = []
    for cluster_id, name in bundle["label_map"].items():
        group = matches[matches.segment_name == name]
        groups.append({
            "cluster_id": int(cluster_id), "segment_name": name, "count": len(group),
            "share": round(len(group) / count * 100, 1),
            "avg_delay": round(float(group.delay_minutes.mean()), 2) if len(group) else None,
            "avg_speed": round(float(group.average_speed_kmph.mean()), 2) if len(group) else None,
            "avg_volume": round(float(group.traffic_volume.mean()), 2) if len(group) else None,
        })
    regression = bundle["regression"]
    contributions = []
    for feature, coefficient in zip(FEATURES, regression.coef_):
        delta = traffic[feature] - reference[feature]
        contributions.append({
            "feature": feature, "label": FIELD_INFO[feature][0], "unit": FIELD_INFO[feature][4],
            "current": traffic[feature], "reference": reference[feature], "change": delta,
            "coefficient": float(coefficient), "minutes": round(float(coefficient * delta), 3),
        })
    return {
        "inputs": traffic, "reference": reference, "sample_size": count,
        "summary": {"avg_delay": round(float(matches.delay_minutes.mean()), 2),
                    "avg_speed": round(float(matches.average_speed_kmph.mean()), 2),
                    "dominant_group": max(groups, key=lambda group: group["count"])["segment_name"]},
        "segments": groups,
        "matches": matches.round(3).to_dict(orient="records"),
        "contributions": contributions,
        "tree": explain_tree(bundle, traffic),
        "data_note": "All recorded examples in this demo are simulated traffic observations.",
    }
