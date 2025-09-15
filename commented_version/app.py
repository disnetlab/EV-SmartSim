from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import simpy
import pandas as pd
import os
import tempfile
import requests
import json
import math

app = Flask(__name__)
CORS(app)

# Global state
env = None
vehicles = []
stations = []
steps = []
logs = []

UPLOAD_FOLDER = tempfile.gettempdir()
OUTPUT_FOLDER = tempfile.gettempdir()

DEFAULT_BATTERY_KWH = 50.0
DEFAULT_CONSUMPTION_KWH_PER_KM = 0.2  # 0.2 kWh/km -> 20 kWh/100km
DEFAULT_CHARGER_KW = 7.0
DEFAULT_TRIP_DURATION_S = 600  # fallback duration (10 minutes)

# ---------- utils ----------
def log(msg):
    print(msg)
    logs.append({"time": env.now if env else 0, "message": msg})

def iso_to_ts(s):
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return None
    try:
        return pd.to_datetime(s).timestamp()
    except Exception:
        return None

def haversine_km(lon1, lat1, lon2, lat2):
    # returns distance in km
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def get_route_from_osrm(origin, dest):
    """
    origin = (lng, lat)
    dest = (lng, lat)
    returns (distance_m, duration_s, coords_list[[lng,lat],...]) or (None, None, None)
    """
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{origin[0]},{origin[1]};{dest[0]},{dest[1]}?overview=full&geometries=geojson"
        resp = requests.get(url, timeout=8)
        data = resp.json()
        if 'routes' in data and len(data['routes']) > 0:
            r = data['routes'][0]
            distance = r.get('distance', None)
            duration = r.get('duration', None)
            coords = r.get('geometry', {}).get('coordinates', None)
            return distance, duration, coords
    except Exception as e:
        log(f"OSRM request failed: {e}")
    return None, None, None

# ---------- prepare data ----------
def prepare_simulation_data():
    # normalize and enrich vehicles
    for v in vehicles:
        # battery capacity
        cap = None
        for k in ('battery_capacity', 'battery_capacity_kwh', 'battery_capacity_kW'):
            if k in v and pd.notna(v.get(k)):
                try:
                    cap = float(v.get(k))
                    break
                except:
                    pass
        if cap is None:
            cap = DEFAULT_BATTERY_KWH
        v['battery_capacity_kwh'] = cap

        # initial soc %
        soc = None
        for k in ('initial_soc', 'soc', 'state_of_charge'):
            if k in v and pd.notna(v.get(k)):
                try:
                    soc = float(v.get(k))
                    break
                except:
                    pass
        if soc is None:
            soc = 80.0
        # battery in kWh
        v['battery_kwh'] = cap * (soc / 100.0)

        # consumption kWh per km
        cons = None
        for k in ('consumption', 'consumption_kwh_per_km', 'consumption_kwh'):
            if k in v and pd.notna(v.get(k)):
                try:
                    cons = float(v.get(k))
                    break
                except:
                    pass
        if cons is None:
            cons = DEFAULT_CONSUMPTION_KWH_PER_KM
        v['consumption_kwh_per_km'] = cons

        # location
        lng = v.get('location_long') or v.get('lng') or v.get('initial_long') or v.get('lon') or v.get('longitude')
        lat = v.get('location_lat') or v.get('lat') or v.get('initial_lat') or v.get('latitude')
        try:
            v['location'] = {'lng': float(lng), 'lat': float(lat)}
        except:
            v['location'] = {'lng': 0.0, 'lat': 0.0}

    # normalize stations
    for s in stations:
        try:
            s['charging_speed_kw'] = float(s.get('charging_speed_kw') or s.get('charging_speed') or 7.0)
        except:
            s['charging_speed_kw'] = DEFAULT_CHARGER_KW
        try:
            s['price_per_kwh'] = float(s.get('price_per_kwh') or s.get('price') or 0.3)
        except:
            s['price_per_kwh'] = 0.3

    # normalize steps: parse times, fill missing, cast coords
    timestamps = []
    for st in steps:
        st['start_ts'] = iso_to_ts(st.get('start_time'))
        st['end_ts'] = iso_to_ts(st.get('end_time')) or iso_to_ts(st.get('destination_time'))
        if st['end_ts'] is None and st['start_ts'] is not None:
            st['end_ts'] = st['start_ts'] + DEFAULT_TRIP_DURATION_S
        if st['start_ts'] is None and st['end_ts'] is not None:
            st['start_ts'] = st['end_ts'] - DEFAULT_TRIP_DURATION_S
        if st['start_ts'] is None and st['end_ts'] is None:
            st['start_ts'] = 0.0
            st['end_ts'] = DEFAULT_TRIP_DURATION_S
        timestamps.append(st['start_ts'])
        timestamps.append(st['end_ts'])

        # coords
        for key in ('origin_long', 'origin_lat', 'destination_long', 'destination_lat'):
            if key in st and pd.notna(st.get(key)):
                try:
                    st[key] = float(st.get(key))
                except:
                    st[key] = None
            else:
                st[key] = None

        st['route'] = None
        st['distance_km'] = None
        st['duration_s'] = None
        st['soc_percent'] = None

    # normalize times relative to earliest timestamp
    if len(timestamps) == 0:
        base = 0.0
    else:
        base = min(timestamps)
    for st in steps:
        st['start_offset'] = float(st['start_ts'] - base)
        st['end_offset'] = float(st['end_ts'] - base)

# ---------- step handlers ----------
def handle_step(vehicle, step):
    """
    SimPy process for one step.
    step is mutated with route, soc_percent, distance_km, duration_s
    """
    start = float(step['start_offset'])
    # wait until step start
    yield env.timeout(max(0, start - env.now))

    stype = str(step.get('step_type') or step.get('stepType') or '').lower()
    origin = None
    if step.get('origin_long') is not None and step.get('origin_lat') is not None:
        origin = (float(step['origin_long']), float(step['origin_lat']))
    else:
        origin = (vehicle['location']['lng'], vehicle['location']['lat'])
    dest = None
    if step.get('destination_long') is not None and step.get('destination_lat') is not None:
        dest = (float(step['destination_long']), float(step['destination_lat']))
    else:
        dest = origin

    if stype == 'trip':
        # try OSRM
        distance_m, duration_s, coords = get_route_from_osrm(origin, dest)
        if distance_m is None:
            # fallback: haversine + average speed 50 km/h
            d_km = haversine_km(origin[0], origin[1], dest[0], dest[1])
            distance_m = d_km * 1000
            avg_speed_kmh = 50.0
            duration_s = (d_km / avg_speed_kmh) * 3600.0
            coords = [[origin[0], origin[1]], [dest[0], dest[1]]]
        distance_km = distance_m / 1000.0
        consumed_kwh = distance_km * vehicle['consumption_kwh_per_km']

        if consumed_kwh > vehicle['battery_kwh']:
            log(f"Vehicle {vehicle.get('id')} cannot start trip at env {env.now}: insufficient battery (need {consumed_kwh:.2f} kWh, have {vehicle['battery_kwh']:.2f} kWh)")
            # we skip the trip (no SOC change)
            step['route'] = coords
            step['distance_km'] = distance_km
            step['duration_s'] = duration_s
            step['soc_percent'] = round(100.0 * vehicle['battery_kwh'] / vehicle['battery_capacity_kwh'], 2)
            return
        # start trip
        log(f"Vehicle {vehicle.get('id')} starts trip at env {env.now}, consumed_kwh={consumed_kwh:.2f}")
        vehicle['battery_kwh'] -= consumed_kwh
        # simulate travel time
        yield env.timeout(duration_s)
        # update vehicle location
        vehicle['location'] = {'lng': dest[0], 'lat': dest[1]}
        # save step info
        step['route'] = coords
        step['distance_km'] = distance_km
        step['duration_s'] = duration_s
        step['soc_percent'] = round(100.0 * vehicle['battery_kwh'] / vehicle['battery_capacity_kwh'], 2)
        log(f"Vehicle {vehicle.get('id')} finishes trip at env {env.now}, battery_kwh={vehicle['battery_kwh']:.2f}")

    elif stype == 'charge':
        # find station if provided
        station = None
        if step.get('station_id') is not None:
            try:
                sid = step.get('station_id')
                station = next((s for s in stations if str(s.get('id')) == str(sid)), None)
            except:
                station = None
        charger_kw = station['charging_speed_kw'] if station is not None else DEFAULT_CHARGER_KW
        # planned duration (if end_offset available) else default
        planned_duration_s = max(1.0, float(step.get('end_offset', step.get('start_offset', 0)) - step.get('start_offset', step.get('start_offset', 0))) )
        # energy added
        added_kwh = charger_kw * (planned_duration_s / 3600.0)
        # if desired_soc present, respect it
        desired_soc = None
        if step.get('desired_soc') is not None and step.get('desired_soc') != '':
            try:
                desired_soc = float(step.get('desired_soc'))
            except:
                desired_soc = None
        if desired_soc is not None:
            desired_kwh = vehicle['battery_capacity_kwh'] * (desired_soc / 100.0)
            added_kwh = max(0.0, desired_kwh - vehicle['battery_kwh'])
            # if desired implies longer than planned, compute duration from charger power
            planned_duration_s = (added_kwh / charger_kw) * 3600.0 if charger_kw > 0 else planned_duration_s

        vehicle['battery_kwh'] = min(vehicle['battery_capacity_kwh'], vehicle['battery_kwh'] + added_kwh)
        # simulate charging time
        yield env.timeout(planned_duration_s)
        step['route'] = None
        step['distance_km'] = 0.0
        step['duration_s'] = planned_duration_s
        step['soc_percent'] = round(100.0 * vehicle['battery_kwh'] / vehicle['battery_capacity_kwh'], 2)
        log(f"Vehicle {vehicle.get('id')} charged at env {env.now}, battery_kwh={vehicle['battery_kwh']:.2f}")

    elif stype == 'discharge':
        # simulate V2G/discharge for the planned duration
        planned_duration_s = max(1.0, float(step.get('end_offset', step.get('start_offset', 0)) - step.get('start_offset', step.get('start_offset', 0))) )
        # discharging power: from station if provided else small default (3kW)
        discharger_kw = (next((s for s in stations if str(s.get('id')) == str(step.get('station_id'))), {}).get('discharging_speed_kw', 3.0)) if stations else 3.0
        removed_kwh = discharger_kw * (planned_duration_s / 3600.0)
        removed_kwh = min(removed_kwh, vehicle['battery_kwh'])
        vehicle['battery_kwh'] -= removed_kwh
        yield env.timeout(planned_duration_s)
        step['route'] = None
        step['distance_km'] = 0.0
        step['duration_s'] = planned_duration_s
        step['soc_percent'] = round(100.0 * vehicle['battery_kwh'] / vehicle['battery_capacity_kwh'], 2)
        log(f"Vehicle {vehicle.get('id')} discharged at env {env.now}, battery_kwh={vehicle['battery_kwh']:.2f}")

    else:
        # init or unknown step: just record SOC
        step['route'] = None
        step['distance_km'] = 0.0
        step['duration_s'] = 0.0
        step['soc_percent'] = round(100.0 * vehicle['battery_kwh'] / vehicle['battery_capacity_kwh'], 2)
        log(f"Vehicle {vehicle.get('id')} noop step at env {env.now}, battery_kwh={vehicle['battery_kwh']:.2f}")

# ---------- endpoints ----------
@app.route("/upload_csvs", methods=["POST"])
def upload_csvs():
    """Upload vehicles, stations (optional), and steps CSVs from frontend"""
    global vehicles, stations, steps
    if "steps" not in request.files or "vehicles" not in request.files:
        return jsonify({"error": "Please upload at least vehicles and steps CSV files (stations optional)"}), 400

    vehicles_file = request.files["vehicles"]
    steps_file = request.files["steps"]
    stations_file = request.files.get("stations", None)

    vehicles_path = os.path.join(UPLOAD_FOLDER, "vehicles.csv")
    steps_path = os.path.join(UPLOAD_FOLDER, "vehicle_steps_data.csv")
    vehicles_file.save(vehicles_path)
    steps_file.save(steps_path)
    if stations_file:
        stations_path = os.path.join(UPLOAD_FOLDER, "charging_places.csv")
        stations_file.save(stations_path)
        stations_df = pd.read_csv(stations_path)
        stations = stations_df.to_dict(orient="records")
    else:
        stations = []

    vehicles_df = pd.read_csv(vehicles_path)
    steps_df = pd.read_csv(steps_path, dtype=str)  # keep as strings, we'll cast later
    vehicles = vehicles_df.to_dict(orient="records")
    steps = steps_df.to_dict(orient="records")

    return jsonify({"message": "Files uploaded successfully", "vehicles_count": len(vehicles), "stations_count": len(stations), "steps_count": len(steps)})

@app.route("/run_simulation", methods=["POST"])
def run_simulation():
    """Run simulation using uploaded CSVs"""
    global env, logs
    if not vehicles or not steps:
        return jsonify({"error": "Upload files first"}), 400

    logs = []
    env = simpy.Environment()
    prepare_simulation_data()

    # create processes
    for step in steps:
        # find vehicle by id (string safe)
        vid = step.get('vehicle_id') or step.get('vehicleId') or step.get('vehicle')
        vehicle = next((v for v in vehicles if str(v.get('id')) == str(vid) or str(v.get('vehicle_id')) == str(vid)), None)
        if vehicle is None:
            log(f"No vehicle found for step with vehicle_id={vid}, skipping step")
            continue
        env.process(handle_step(vehicle, step))

    # run until last planned end
    max_end = max(float(s.get('end_offset', 0.0)) for s in steps) if steps else 0.0
    env.run(until=max_end + 5.0)

    # Build formatted output with route and updated SOC
    rows = []
    for st in steps:
        # prefer the soc stored after the step; if missing compute from vehicle current battery
        soc_percent = st.get('soc_percent')
        if soc_percent is None:
            # fallback: vehicle current state
            vid = st.get('vehicle_id') or st.get('vehicleId')
            v = next((vv for vv in vehicles if str(vv.get('id')) == str(vid) or str(vv.get('vehicle_id')) == str(vid)), None)
            if v:
                soc_percent = round(100.0 * v['battery_kwh'] / v['battery_capacity_kwh'], 2)
            else:
                soc_percent = None

        route_json = json.dumps(st['route']) if st.get('route') is not None else ''
        rows.append({
            "vehicle_id": st.get('vehicle_id'),
            "step_type": st.get('step_type'),
            "destination_time": st.get('end_time') or st.get('destination_time'),
            "destination_long": st.get('destination_long'),
            "destination_lat": st.get('destination_lat'),
            "soc": soc_percent,
            "route": route_json,
            "distance_km": st.get('distance_km'),
            "duration_s": st.get('duration_s')
        })

    formatted_out = pd.DataFrame(rows)
    formatted_out_path = os.path.join(OUTPUT_FOLDER, "formatted_output.csv")
    formatted_out.to_csv(formatted_out_path, index=False)

    # also export logs optionally
    logs_out = pd.DataFrame(logs)
    logs_out_path = os.path.join(OUTPUT_FOLDER, "logs.csv")
    logs_out.to_csv(logs_out_path, index=False)

    return jsonify({
        "message": "Simulation completed",
        "output_files": {
            "formatted": "/download/formatted_output.csv",
            "logs": "/download/logs.csv"
        }
    })

@app.route("/download/<filename>", methods=["GET"])
def download_file(filename):
    """Download output CSVs"""
    path = os.path.join(OUTPUT_FOLDER, filename)
    if not os.path.exists(path):
        return jsonify({"error": "File not found"}), 404
    return send_file(path, as_attachment=True)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
