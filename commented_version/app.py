from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import simpy
import pandas as pd
import os
import tempfile

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

# =======================
# Utility: log and update
# =======================
def log(msg):
    print(msg)
    logs.append({"time": env.now, "message": msg})

def update_vehicle(vehicle, updates):
    vehicle.update(updates)

# =======================
# Processes
# =======================
def charge_vehicle(vehicle, station, start_charge, end_charge, desired_charge):
    start_charge = float(start_charge)
    end_charge = float(end_charge)
    station['charging_speed'] = float(station['charging_speed'])
    vehicle['battery'] = float(vehicle['battery'])
    station['price_per_kwh'] = float(station['price_per_kwh'])
    desired_charge = float(desired_charge)
    vehicle['battery_capacity'] = float(vehicle['battery_capacity'])

    yield env.timeout(start_charge - env.now)

    if charging_mode == 0:
        charging_time = end_charge - start_charge
        charge = charging_time * station['charging_speed']
        cost = charge * station['price_per_kwh']
        vehicle['battery'] += min(charge, vehicle['battery_capacity'] - vehicle['battery'])
        yield env.timeout(charging_time)
        log(f"{vehicle['name']} finished charging at {env.now}h, battery={vehicle['battery']}, cost={cost:.2f}")

    elif charging_mode == 1:
        charging_time = end_charge - start_charge
        charge = charging_time * station['charging_speed']
        cost = charge * station['price_per_kwh']
        vehicle['battery'] = min(vehicle['battery'] + charge, vehicle['battery_capacity'])
        yield env.timeout(charging_time)
        log(f"{vehicle['name']} finished charging (mode1) battery={vehicle['battery']}, cost={cost:.2f}")

    elif charging_mode == 2:
        if desired_charge > vehicle['battery_capacity']:
            desired_charge = vehicle['battery_capacity']
        charge_needed = desired_charge - vehicle['battery']
        if charge_needed <= 0:
            return
        charging_time = charge_needed / station['charging_speed']
        cost = charge_needed * station['price_per_kwh']
        vehicle['battery'] += charge_needed
        yield env.timeout(charging_time)
        log(f"{vehicle['name']} finished charging (mode2) battery={vehicle['battery']}, cost={cost:.2f}")

    elif charging_mode == 3:
        if desired_charge > vehicle['battery_capacity']:
            desired_charge = vehicle['battery_capacity']
        if desired_charge < vehicle['battery']:
            return
        charge_needed = desired_charge - vehicle['battery']
        charging_time = charge_needed / station['charging_speed']
        cost = charge_needed * station['price_per_kwh']
        vehicle['battery'] = desired_charge
        yield env.timeout(charging_time)
        log(f"{vehicle['name']} finished charging (mode3) battery={vehicle['battery']}, cost={cost:.2f}")

    update_vehicle(vehicle, {'battery': vehicle['battery']})


def trip_vehicle(vehicle, start_time, end_time, station):
    start_time = float(start_time)
    end_time = float(end_time)
    vehicle['battery'] = float(vehicle['battery'])

    yield env.timeout(start_time - env.now)
    if trip_mode == 0:
        trip_duration = end_time - start_time
        consumed_kwh = trip_duration * float(vehicle['consumption'])
    elif trip_mode == 1:
        consumed_kwh, trip_duration, distance_km, trip_steps = calculate_complex_consumption_and_duration(vehicle, station)
    else:
        consumed_kwh, trip_duration = 0, 0

    if consumed_kwh > vehicle['battery']:
        log(f"{vehicle['name']} cannot start the trip: insufficient battery")
    else:
        log(f"{vehicle['name']} starts trip at {env.now}h with {vehicle['battery']} kWh")
        vehicle['battery'] -= consumed_kwh
        yield env.timeout(trip_duration)
        vehicle['location'] = station['location']
        log(f"{vehicle['name']} finishes trip at {env.now}h, battery={vehicle['battery']}")
        update_vehicle(vehicle, {'battery': vehicle['battery'], 'location': vehicle['location']})


def discharge_vehicle(vehicle, station, start_discharge, end_discharge):
    start_discharge = float(start_discharge)
    end_discharge = float(end_discharge)
    vehicle['battery'] = float(vehicle['battery'])
    station['discharging_speed'] = float(station['discharging_speed'])
    station['buy_price_per_kwh'] = float(station['buy_price_per_kwh'])
    yield env.timeout(start_discharge - env.now)

    discharge_duration = end_discharge - start_discharge
    discharging_time = min(discharge_duration, vehicle['battery'] / station['discharging_speed'])
    discharged_kwh = min(discharging_time * station['discharging_speed'], vehicle['battery'])
    credit = discharged_kwh * station['buy_price_per_kwh']
    vehicle['battery'] -= discharged_kwh
    yield env.timeout(discharging_time)
    log(f"{vehicle['name']} finishes discharging at {env.now}h, battery={vehicle['battery']}, credit={credit:.2f}")
    update_vehicle(vehicle, {'battery': vehicle['battery']})


def calculate_complex_consumption_and_duration(vehicle, station, step):
    start_coords = f"{vehicle['location']['lng']},{vehicle['location']['lat']}"
    end_coords = f"{step['destination_long']},{step['destination_lat']}"
    url = f"https://router.project-osrm.org/route/v1/driving/{start_coords};{end_coords}?overview=full&steps=true"

    try:
        response = requests.get(url)
        data = response.json()
    except:
        return 0, 0, 0, []

    if 'routes' not in data or len(data['routes']) == 0:
        return 0, 0, 0, []

    route = data['routes'][0]
    steps = route['legs'][0]['steps']
    distance = data['routes'][0]['distance']
    duration = data['routes'][0]['duration']

    distance_km = distance / 1000
    duration_hours = duration / 3600
    consumed_kwh = distance_km * float(vehicle['consumption'])
    return consumed_kwh, duration_hours, distance_km, steps

# =======================
# API Routes
# =======================

@app.route("/upload_csvs", methods=["POST"])
def upload_csvs():
    """Upload vehicles, stations, and steps CSVs from frontend"""
    global vehicles, stations, steps

    if "vehicles" not in request.files or "stations" not in request.files or "steps" not in request.files:
        return jsonify({"error": "Please upload vehicles, stations, and steps CSV files"}), 400

    vehicles_file = request.files["vehicles"]
    stations_file = request.files["stations"]
    steps_file = request.files["steps"]

    vehicles_path = os.path.join(UPLOAD_FOLDER, "vehicles.csv")
    stations_path = os.path.join(UPLOAD_FOLDER, "charging_places.csv")
    steps_path = os.path.join(UPLOAD_FOLDER, "vehicle_steps_data.csv")

    vehicles_file.save(vehicles_path)
    stations_file.save(stations_path)
    steps_file.save(steps_path)

    vehicles = pd.read_csv(vehicles_path).to_dict(orient="records")
    stations = pd.read_csv(stations_path).to_dict(orient="records")
    steps = pd.read_csv(steps_path).to_dict(orient="records")

    return jsonify({"message": "Files uploaded successfully", "vehicles_count": len(vehicles), "stations_count": len(stations), "steps_count": len(steps)})

@app.route("/run_simulation", methods=["POST"])
def run_simulation():
    """Run simulation using uploaded CSVs"""
    global env, logs
    logs = []
    env = simpy.Environment()

    for step in steps:
        vehicle = next(v for v in vehicles if v['id'] == step['vehicle_id'])
        station = next((s for s in stations if s['id'] == step['station_id']), None)
        if step['stepType'] == 'charge':
            env.process(charge_vehicle(vehicle, station, step['start_charge'], step['end_charge'], step.get('desired_charge', vehicle['battery_capacity'])))
        elif step['stepType'] == 'trip':
            env.process(trip_vehicle(vehicle, step['start_time'], step['end_time'], station))
        elif step['stepType'] == 'discharge':
            env.process(discharge_vehicle(vehicle, station, step['start_charge'], step['end_charge']))

    env.run()

    # Save outputs
    vehicles_out = pd.DataFrame(vehicles)
    steps_out = pd.DataFrame(steps)
    logs_out = pd.DataFrame(logs)

    vehicles_out_path = os.path.join(OUTPUT_FOLDER, "vehicles_out.csv")
    steps_out_path = os.path.join(OUTPUT_FOLDER, "steps_out.csv")
    logs_out_path = os.path.join(OUTPUT_FOLDER, "logs.csv")

    vehicles_out.to_csv(vehicles_out_path, index=False)
    steps_out.to_csv(steps_out_path, index=False)
    logs_out.to_csv(logs_out_path, index=False)

    return jsonify({
        "message": "Simulation completed",
        "output_files": {
            "vehicles": "/download/vehicles_out.csv",
            "steps": "/download/steps_out.csv",
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