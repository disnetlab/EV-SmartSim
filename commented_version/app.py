from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
import simpy
import numpy as np
import requests
import time

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global simulation environment
env = simpy.Environment()

# In-memory storage for vehicles, stations, and steps
vehicles = []
stations = []
steps = []
logs = []
charging_mode = 0
trip_mode = 0

def update_vehicle(name, updates):
    for vehicle in vehicles:
        if vehicle['name'] == name:
            vehicle.update(updates)
            socketio.emit('log', vehicle)

@app.route('/get_steps/<int:vehicle_id>', methods=['GET'])
def get_steps(vehicle_id):
    vehicle_steps = [step for step in steps if int(step['vehicle_id']) == vehicle_id]
    return jsonify({'steps': vehicle_steps})


@app.route('/get_vehicles', methods=['GET'])
def get_vehicles():
    return jsonify({'vehicles': vehicles})


@app.route('/add_vehicle', methods=['POST'])
def add_vehicle():
    vehicle_data = request.json
    vehicles.append(vehicle_data)
    return jsonify({'message': f"Vehicle added successfully! {vehicle_data}"})

@app.route('/add_station', methods=['POST'])
def add_station():
    station_data = request.json
    stations.append(station_data)
    return jsonify({'message': f"Station added successfully! {station_data}"})

@app.route('/add_step', methods=['POST'])
def add_step():
    step_data = request.json
    steps.append(step_data)
    return jsonify({'message': f"Step added successfully! {step_data}"})

@app.route('/charge_method', methods=['POST'])
def update_charge_method():
    charge_method = request.json
    global charging_mode
    charging_mode = charge_method.get('selectedCharge')
    return jsonify({'message': f"charge method set {charging_mode}"})

@app.route('/trip_mode', methods=['POST'])
def update_trip_mode():
    trip_method = request.json
    global trip_mode
    trip_mode = trip_method.get('selectedTrip')
    return jsonify({'message': f"trip method set {trip_mode}"})

@app.route('/run_simulation', methods=['POST'])
def run_simulation():
    global env
    env = simpy.Environment()
    a = 0
    socketio.emit('log', {'message': "Starting simulation"})
    processed_steps = set()

    for vehicle in vehicles:
        for step in steps:
            if step['id'] in processed_steps:
                continue
            step_vehicle_id = int(step['vehicle_id'])
            if step_vehicle_id == vehicle['id']:
                current_station = None
                for station in stations:
                    if station['id'] == int(step['station_id']):
                        current_station = station
                        break
                if not current_station:
                    socketio.emit('log', {'message': f"Station {step['station_id']} not found for step {step['stepType']}"})
                    continue

                if step['stepType'] == 'charge':
                    env.process(charge_vehicle(vehicle, current_station, step['start_charge'], step['end_charge'], step['desired_charge']))
                    a += 1
                elif step['stepType'] == 'trip':
                    env.process(trip_vehicle(vehicle, step['start_time'], step['end_time'], current_station))
                    a += 1
                elif step['stepType'] == 'discharge':
                    env.process(discharge_vehicle(vehicle, current_station, step['start_charge'], step['end_charge']))
                    a += 1

                processed_steps.add(step['id'])

    env.run()
    socketio.emit('log', {'message': f"Steps processed: {a}"})
    socketio.emit('log', {'message': "Simulation run completed"})
    return jsonify({'message': 'Simulation run successfully!', 'steps_processed': a})

def charge_vehicle(vehicle, station, start_charge, end_charge, desired_charge):
    start_charge = float(start_charge)
    end_charge = float(end_charge)
    station['charging_speed'] = float(station['charging_speed'])
    vehicle['battery'] = float(vehicle['battery'])
    station['price_per_kwh'] = float(station['price_per_kwh'])
    desired_charge = float(desired_charge)
    vehicle['battery_capacity'] = float(vehicle['battery_capacity'])
    time_in_station=end_charge-start_charge
    global charging_mode

    yield env.timeout(start_charge - env.now)

    if vehicle['location'] != station['location']:
        socketio.emit('log', {'message': f"Vehicle {vehicle['name']} is not at station {station['name']}"})
        return

    if charging_mode == 3:
        # Realistic charging model
        if desired_charge > vehicle['battery_capacity']:
            desired_charge = vehicle['battery_capacity']

        if desired_charge < vehicle['battery']:
            return
        socketio.emit('log', {'message': f"{vehicle['name']} starts charging at {env.now}h at {station['name']} with {vehicle['battery']}kwh"})
        charge_needed = desired_charge - vehicle['battery']
        charging_time = 0

        if vehicle['battery'] < vehicle['battery_capacity'] / 2:
            if desired_charge > vehicle['battery_capacity'] / 2:
                charging_time += (vehicle['battery_capacity'] / 2 - vehicle['battery']) / station['charging_speed']
                vehicle['battery'] = vehicle['battery_capacity'] / 2
            else:
                charging_time += (desired_charge - vehicle['battery']) / station['charging_speed']
                vehicle['battery'] = desired_charge

        elif vehicle['battery'] < 0.8 * vehicle['battery_capacity']:
            if desired_charge > 0.8 * vehicle['battery_capacity']:
                charging_time += (0.8 * vehicle['battery_capacity'] - vehicle['battery']) / (station['charging_speed'] * 0.4)
                vehicle['battery'] = 0.8 * vehicle['battery_capacity']
            else:
                charging_time += (desired_charge - vehicle['battery']) / (station['charging_speed'] * 0.4)
                vehicle['battery'] = desired_charge

        else:
            charging_time += (desired_charge - vehicle['battery']) / (station['charging_speed'] * 0.04)
            vehicle['battery'] = desired_charge

        cost = charge_needed * station['price_per_kwh']
        yield env.timeout(charging_time)
        socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
        update_vehicle(vehicle['name'], {'battery': vehicle['battery']})

    elif charging_mode == 2:
        socketio.emit('log', {'message': f"in methode 2"})
        if desired_charge > vehicle['battery_capacity']:
            desired_charge = vehicle['battery_capacity']

        charge_needed = desired_charge - vehicle['battery']
        if charge_needed <= 0:
            socketio.emit('log', {'message': f"battery enought charged no need to charge"})
            return

        socketio.emit('log', {'message': f"{vehicle['name']} starts charging at {env.now}h at {station['name']} with {vehicle['battery']}kwh"})
        charging_time = charge_needed / station['charging_speed']
        cost = charge_needed * station['price_per_kwh']
        vehicle['battery'] += charge_needed
        yield env.timeout(charging_time)
        socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
        update_vehicle(vehicle['name'], {'battery': vehicle['battery']})

    elif charging_mode == 0:
        charging_time = end_charge - start_charge
        socketio.emit('log', {'message': f"{vehicle['name']} starts charging at {env.now}h at {station['name']} with {vehicle['battery']}kwh"})
        charge = charging_time * station['charging_speed']
        cost = charge * station['price_per_kwh']
        vehicle['battery'] += min(charge, vehicle['battery_capacity'] - vehicle['battery'])
        yield env.timeout(charging_time)
        socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
        update_vehicle(vehicle['name'], {'battery': vehicle['battery']})

    elif charging_mode == 1:
        time_in_station = end_charge - start_charge
        charging_time = 0
        charge = time_in_station * station['charging_speed']
        cost = 0

        if charge > vehicle['battery_capacity']:
            charge = vehicle['battery_capacity']
        socketio.emit('log', {'message': f"{vehicle['name']} starts charging at {env.now}h at {station['name']} with {vehicle['battery']}kwh"})
        if vehicle['battery'] < vehicle['battery_capacity'] / 2:
            if vehicle['battery'] + charge > vehicle['battery_capacity'] / 2:
                charging_time += (vehicle['battery_capacity'] / 2 - vehicle['battery']) / station['charging_speed']
                if charging_time > time_in_station:
                    vehicle['battery'] += time_in_station * station['charging_speed']
                    cost = time_in_station * station['charging_speed'] * station['price_per_kwh']
                    yield env.timeout(time_in_station)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    return
                else:
                    charge -= vehicle['battery_capacity'] / 2 - vehicle['battery']
                    cost += (vehicle['battery_capacity'] / 2 - vehicle['battery']) * station['price_per_kwh']
                    vehicle['battery'] = vehicle['battery_capacity'] / 2
            else:
                charging_time += charge / station['charging_speed']
                if charging_time > time_in_station:
                    vehicle['battery'] += time_in_station * station['charging_speed']
                    cost = time_in_station * station['charging_speed'] * station['price_per_kwh']
                    yield env.timeout(time_in_station)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    return
                else:
                    vehicle['battery'] += charge
                    cost = charge * station['price_per_kwh']
                    yield env.timeout(charging_time)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    yield env.timeout(time_in_station - charging_time)
                    return

        if vehicle['battery'] < 0.8 * vehicle['battery_capacity']:
            if vehicle['battery'] + charge > 0.8 * vehicle['battery_capacity']:
                charging_time += (0.8 * vehicle['battery_capacity'] - vehicle['battery']) / (station['charging_speed'] * 0.4)
                if charging_time > time_in_station:
                    vehicle['battery'] += time_in_station * (station['charging_speed'] * 0.4)
                    cost = time_in_station * (station['charging_speed'] * 0.4) * station['price_per_kwh']
                    yield env.timeout(time_in_station)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    return
                else:
                    charge -= 0.8 * vehicle['battery_capacity'] - vehicle['battery']
                    cost += (0.8 * vehicle['battery_capacity'] - vehicle['battery']) * station['price_per_kwh']
                    vehicle['battery'] = 0.8 * vehicle['battery_capacity']
                    yield env.timeout(charging_time)
            else:
                charging_time += charge / (station['charging_speed'] * 0.4)
                if charging_time > time_in_station:
                    vehicle['battery'] += time_in_station * (station['charging_speed'] * 0.4)
                    cost = time_in_station * (station['charging_speed'] * 0.4) * station['price_per_kwh']
                    yield env.timeout(time_in_station)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    return
                else:
                    vehicle['battery'] += charge
                    cost = charge * station['price_per_kwh']
                    yield env.timeout(charging_time)
                    update_vehicle(vehicle['name'], {'battery': vehicle['battery']})
                    socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
                    yield env.timeout(time_in_station - charging_time)
                    return

        charging_time += charge / (station['charging_speed'] * 0.04)
        if charging_time > time_in_station:
            vehicle['battery'] += time_in_station * (station['charging_speed'] * 0.04)
            cost = time_in_station * station['charging_speed']
            yield env.timeout(time_in_station)
            socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
            return
        else:
            self.battery += charge
            cost = charge * station['price_per_kwh']
            yield env.timeout(charging_time)
            socketio.emit('log', {'message': f"Vehicle {vehicle['name']} finished charging at {env.now}h at station {station['name']} with battery {vehicle['battery']} kWh, cost: ${cost:.2f}"})
            yield env.timeout(time_in_station-charging_time)


    update_vehicle(vehicle['name'], {'battery': vehicle['battery']}) #update vehicle battery

def trip_vehicle(vehicle, start_time, end_time, station):
    start_time=float(start_time)
    end_time=float(end_time)
    vehicle['battery']=float(vehicle['battery'])

    yield env.timeout(start_time - env.now)
    if trip_mode == 0 : #simple trip calculation method
        trip_duration = end_time - start_time
        consumed_kwh = trip_duration * float(vehicle['consumption'])
    elif trip_mode == 1: #complex trip calculation method
        consumed_kwh, trip_duration, distance_km, trip_steps = calculate_complex_consumption_and_duration(vehicle, station)

    if consumed_kwh > vehicle['battery']: #check if the car can make it to the destination
        socketio.emit('log', {'message': f"{vehicle['name']} cannot start the trip: destination too far and battery insufficient."})
    else: #running trip step
        socketio.emit('log', {'message': f"{vehicle['name']} starts its trip at {env.now}h with {vehicle['battery']} kWh battery"})
        vehicle['battery'] -= consumed_kwh
        yield env.timeout(trip_duration)
        vehicle['previousLocation'] = vehicle['location']
        vehicle['location'] = station['location']
        socketio.emit('log', {'message': f"{vehicle['name']} finishes its trip at {env.now}h with {vehicle['battery']} kWh battery"})
        #vehicle['battery_history'].append((env.now, vehicle['battery']))
        update_vehicle(vehicle['name'], {'battery': vehicle['battery'], 'location': vehicle['location'], 'previousLocation': vehicle['previousLocation']}) #update vehicle location and battery

def discharge_vehicle(vehicle, station, start_discharge, end_discharge):
    # discharging function
    start_discharge=float(start_discharge)
    end_discharge=float(end_discharge)
    vehicle['battery']=float(vehicle['battery'])
    station['discharging_speed']=float(station['discharging_speed'])
    station['buy_price_per_kwh']=float(station['buy_price_per_kwh'])
    yield env.timeout(start_discharge - env.now)

    if station['location']==vehicle['location']: #check if the car is in station

        socketio.emit('log', {'message': f"{vehicle['name']} starts discharging at {env.now}h at {station['name']} with {vehicle['battery']} kWh battery"})
        discharge_duration = end_discharge - start_discharge
        discharging_time = min(discharge_duration, vehicle['battery'] / station['discharging_speed'])
        discharged_kwh = min(discharging_time * station['discharging_speed'], vehicle['battery'])
        credit = discharged_kwh * station['buy_price_per_kwh']
        vehicle['battery'] -= discharged_kwh
        yield env.timeout(discharging_time) #wait for discharging time
        socketio.emit('log', {'message': f"{vehicle['name']} finishes discharging at {env.now}h at {station['name']} with {vehicle['battery']} kWh battery, credit: ${credit:.2f}"})

        update_vehicle(vehicle['name'], {'battery': vehicle['battery']}) #update vehicle battery
    else:
        socketio.emit('log', {'message': f"{vehicle['name']} in not in station"})

def calculate_complex_consumption_and_duration(vehicle, station, step_frequency=10):
    start_coords = f"{vehicle['location']['lng']},{vehicle['location']['lat']}"
    end_coords = f"{station['location']['lng']},{station['location']['lat']}"
    # OSMNX PACKAGE to find routes
    
    # URL for Leaflet routing API
    url = f"https://router.project-osrm.org/route/v1/driving/{start_coords};{end_coords}?overview=full&steps=true"

    try:
        response = requests.get(url)
        response.raise_for_status()  # Will raise an HTTPError for bad responses (4xx and 5xx)
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None, None, None
    except ValueError as e:
        print(f"Error parsing JSON: {e}")
        return None, None, None

    # Check if 'routes' exists in the response
    if 'routes' not in data or len(data['routes']) == 0:
        print("No routes found in the response")
        return None, None, None

    route = data['routes'][0]
    steps = route['legs'][0]['steps']
    distance = data['routes'][0]['distance']  # distance in meters
    duration = data['routes'][0]['duration']  # duration in seconds

    sampled_steps = steps[::step_frequency]
    # Convert distance to km and duration to hours
    distance_km = distance / 1000
    duration_hours = duration / 3600

    consumed_kwh = distance_km * float(vehicle['consumption'])

    return consumed_kwh, duration_hours, distance_km, steps

if __name__ == '__main__':
    socketio.run(app, debug=True)
