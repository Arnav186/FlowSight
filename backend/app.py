"""Serve React and the traffic analytics API, with validated input and model reloads."""
from functools import lru_cache
from pathlib import Path
import json
import os

import joblib
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from analytics import analyze, find_neighbors, validate_traffic

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "artifacts" / "traffic_analytics.joblib"
DASH = ROOT / "artifacts" / "dashboard.json"
FRONTEND = ROOT.parent / "frontend" / "dist"
app = Flask(__name__, static_folder=None)


@lru_cache(maxsize=1)
def load_bundle(modified_ns):
    loaded = joblib.load(BUNDLE)
    if loaded.get("schema_version") != 2:
        raise FileNotFoundError("Models need updating. Run python backend/train_models.py, then refresh.")
    return loaded


def bundle():
    if not BUNDLE.exists():
        raise FileNotFoundError("Models are missing. Run python backend/train_models.py first.")
    return load_bundle(BUNDLE.stat().st_mtime_ns)


@app.errorhandler(FileNotFoundError)
def missing_artifact(error):
    return jsonify(error=str(error)), 503


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error=error.description), error.code


@app.get("/api/dashboard")
def dashboard():
    bundle()
    return jsonify(json.loads(DASH.read_text(encoding="utf-8")))


@app.post("/api/analyze")
def analyze_traffic():
    payload = request.get_json()
    try:
        return jsonify(analyze(bundle(), payload))
    except ValueError as error:
        return jsonify(error=str(error)), 400


@app.post("/api/similar")
def similar():
    try:
        traffic = validate_traffic(request.get_json())
        return jsonify(find_neighbors(bundle(), traffic, 5).round(3).to_dict(orient="records"))
    except ValueError as error:
        return jsonify(error=str(error)), 400


@app.get("/api/health")
def health():
    bundle()
    return jsonify(status="ok", schema_version=2)


@app.get("/")
def index():
    if not (FRONTEND / "index.html").exists():
        return "Build the dashboard first: cd frontend && npm run build", 503
    return send_from_directory(FRONTEND, "index.html")


@app.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(FRONTEND / "assets", filename)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")))
