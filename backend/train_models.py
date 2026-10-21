"""Build traffic-congestion analytics artifacts with four ML algorithms."""
from pathlib import Path
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")
import json, joblib, numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier, export_text
from analytics import FEATURES

ROOT=Path(__file__).parent; OUT=ROOT/"artifacts"; DATA=ROOT/"data"; OUT.mkdir(exist_ok=True); DATA.mkdir(exist_ok=True)

def create_traffic_data(n=2400, seed=42):
    """Create transparent city-traffic observations for classroom analytics."""
    rng=np.random.default_rng(seed); hour=rng.integers(0,24,n)
    zone=rng.choice(["City Centre","Business District","Residential","Highway"],n,p=[.28,.26,.28,.18]); weather=rng.choice(["Clear","Cloudy","Rain"],n,p=[.57,.27,.16])
    rain=np.where(weather=="Rain",rng.gamma(2,2,n),np.where(weather=="Cloudy",rng.gamma(1,.35,n),0)).round(2)
    peak=((hour>=8)&(hour<=10))|((hour>=17)&(hour<=20)); base=pd.Series(zone).map({"City Centre":900,"Business District":800,"Residential":440,"Highway":650}).to_numpy()
    lanes=pd.Series(zone).map({"City Centre":2,"Business District":3,"Residential":2,"Highway":4}).to_numpy()+rng.choice([0,0,1],n,p=[.7,.2,.1]); incidents=rng.choice([0,1,2],n,p=[.78,.18,.04])
    volume=np.clip(base+peak*850+rain*48+incidents*330+rng.normal(0,150,n),80,3100).round().astype(int)
    speed=np.clip(72-volume*.017-rain*1.1-incidents*7-(zone=="City Centre")*6+rng.normal(0,5,n),8,100).round(1)
    delay=np.clip(6+(volume/lanes)*.025+(65-speed)*.65+rain*1.3+incidents*8+rng.normal(0,3,n),2,130).round(1)
    return pd.DataFrame({"hour":hour,"road_zone":zone,"weather":weather,"traffic_volume":volume,"average_speed_kmph":speed,"rainfall_mm":rain,"incidents":incidents,"road_lanes":lanes,"delay_minutes":delay})

def main():
    df=create_traffic_data(); df.to_csv(DATA/"traffic_observations_simulated.csv",index=False)
    cluster_features=["traffic_volume","average_speed_kmph","rainfall_mm","incidents","delay_minutes"]
    clusterer=Pipeline([("scale",StandardScaler()),("kmeans",KMeans(n_clusters=3,n_init=25,random_state=42))]).fit(df[cluster_features]); df["cluster_id"]=clusterer.predict(df[cluster_features])
    summary=df.groupby("cluster_id").agg(observations=("hour","size"),avg_speed=("average_speed_kmph","mean"),avg_volume=("traffic_volume","mean"),avg_delay=("delay_minutes","mean"),rainy_share=("rainfall_mm",lambda x:(x>0).mean())).reset_index()
    labels=["Free Flow","Moderate Congestion","Severe Congestion"]; label_map=dict(zip(summary.sort_values("avg_delay")["cluster_id"],labels)); summary["segment_name"]=summary.cluster_id.map(label_map); df["segment_name"]=df.cluster_id.map(label_map)
    similar_features=FEATURES
    neighbor_pipe=Pipeline([("scale",StandardScaler()),("knn",NearestNeighbors(n_neighbors=6))]).fit(df[similar_features])
    explainer=DecisionTreeClassifier(max_depth=3,min_samples_leaf=40,random_state=42).fit(df[similar_features],df.cluster_id); rules=export_text(explainer,feature_names=similar_features)
    reg_features=FEATURES; regression=LinearRegression().fit(df[reg_features],df.delay_minutes)
    impacts=[{"feature":f,"coefficient":round(float(c),3)} for f,c in zip(reg_features,regression.coef_)]
    df["record_id"] = np.arange(1, len(df) + 1)
    ordered_labels = {int(key): label_map[key] for key in summary.sort_values("avg_delay").cluster_id}
    joblib.dump({"schema_version":2,"clusterer":clusterer,"neighbors":neighbor_pipe,"explainer":explainer,"regression":regression,"similar_features":similar_features,"label_map":ordered_labels,"records":df[["record_id"]+similar_features+["road_zone","weather","delay_minutes","segment_name"]]},OUT/"traffic_analytics.joblib")
    dashboard={"data_note":"Simulated but realistic observations for academic use; integrate official traffic sensors for city deployment.","observations":len(df),"segments":summary.round(2).to_dict(orient="records"),"linear_impacts":impacts,"linear_r2":round(float(regression.score(df[reg_features],df.delay_minutes)),3),"decision_tree_rules":rules}
    (OUT/"dashboard.json").write_text(json.dumps(dashboard,indent=2),encoding="utf-8"); print(summary.to_string(index=False))
if __name__=="__main__": main()
