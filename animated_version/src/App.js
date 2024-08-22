import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import VehicleForm from './VehicleForm';
import StationForm from './StationForm';
import StepForm from './StepForm';
import MapComponent from './MapComponent';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import io from 'socket.io-client';
import { incrementId, incrementStepId, incrementStationId } from './global';

function App() {
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showStationForm, setShowStationForm] = useState(false);
  const [showStepForm, setShowStepForm] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [stations, setStations] = useState([]);
  const [steps, setSteps] = useState([]);
  const [newLocation, setNewLocation] = useState(null);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(0);
  const [selectedCharge, setSelectedCharge] = useState(0);
  const [logs, setLogs] = useState([]);

  function sleep(ms) {
    console.log("start sleep");
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  useEffect(() => {
    const socket = io('http://127.0.0.1:5000');

    socket.on('log', (data) => {
      console.log("Log received:", data);
      setLogs((prevLogs) => [...prevLogs, data.message]);
      console.log("vehicle", data.vehicle);
      if (data.name) {
        const updatedVehicles = vehicles.map(vehicle => {
          if (vehicle.name === data.name) {
            if (!data.battery){
              vehicle.location = data.location;
            }
            else if(!data.location){
              vehicle.battery = data.battery;
            }
            else{
              console.log("in app both");
              vehicle.battery = data.battery;
              vehicle.previousLocation = data.previousLocation;
              vehicle.location = data.location;
            }
            console.log("Updating vehicle:", vehicle);
            console.log("vehicle is at ", vehicle.location.lat, vehicle.location.lng);
            return vehicle;
          }
          return vehicle;
        });
        setVehicles(updatedVehicles);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [vehicles]);



  const handleMapClick = (location) => {
    if (location.lat === undefined || location.lng === undefined) {
      console.error('Invalid location object', location);
      return;
    }

    console.log('in handleMapClick', location.lat, location.lng);
    setNewLocation(location);

    if (selectingLocation && selectedType) {
      if (selectedType === 'vehicle') {
        console.log('in vehicle');
        updateVehicleLocation(location);

      } else if (selectedType === 'station') {
        console.log('in station');
        updateStationLocation(location);
      }
      setSelectingLocation(false);
    }
  };

  const toggleVehicleForm = () => {
    setShowVehicleForm(!showVehicleForm);
  };

  const addVehicle = (vehicleData) => {
    if (!vehicleData.name || !vehicleData.battery_capacity || !vehicleData.consumption || !vehicleData.battery || !vehicleData.location || !vehicleData.start_time) {
      alert('Every field is required');
      return;
    }

    vehicleData.id = incrementId();
    vehicleData.previousLocation = [0,0];

    const newVehicle = {
      ...vehicleData,
    };

    axios.post('http://127.0.0.1:5000/add_vehicle', newVehicle)
      .then(response => {
        setVehicles([...vehicles, vehicleData]);
        console.log(response.data.message);
        setShowVehicleForm(false);
        setNewLocation(null);
      })
      .catch(error => {
        console.error('Error adding vehicle:', error);
        alert('Error adding vehicle: ' + error.message);
      });
  };

  const toggleStationForm = () => {
    setShowStationForm(!showStationForm);
  };

  const addStation = (stationData) => {
    if (!stationData.name || !stationData.location || !stationData.charging_speed || !stationData.price_per_kwh || !stationData.buy_price_per_kwh || !stationData.discharging_speed) {
      alert('Every field is required');
      return;
    }
    stationData.id = incrementStationId();

    axios.post('http://127.0.0.1:5000/add_station', stationData)
      .then(response => {
        setStations([...stations, stationData]);
        console.log(response.data.message);
        setShowStationForm(false);
        setNewLocation(null);
      })
      .catch(error => {
        console.error('Error adding station:', error);
        alert('Error adding station: ' + error.message);
      });
  };

  const toggleStepForm = () => {
    setShowStepForm(!showStepForm);
  };

  const addStep = (stepData) => {
    if (!stepData.stepType){
      alert('choose a type');
      return
    }
    stepData.id = incrementStepId();
    console.log(stepData);
    axios.post('http://127.0.0.1:5000/add_step', stepData)
      .then(response => {
        console.log('in then');
        setSteps([...steps, stepData]);
        console.log(response.data.message);
        setShowStepForm(false);
      })
      .catch(error => {
        console.error('Error adding step:', error);
      });
    };

  const updateVehicleSteps = (vehicleName, stepData) => {
    const updatedVehicles = vehicles.map(vehicle => {
      if (vehicle.name === vehicleName) {
        return { ...vehicle, steps: stepData };
      }
      return vehicle;
    });
    setVehicles(updatedVehicles);
  };

  const updateVehicleLocation = (vehicleName, newLocation) => {
    const updatedVehicles = vehicles.map(vehicle => {
      if (vehicle.name === vehicleName) {
        return { ...vehicle, location: newLocation };
      }
      return vehicle;
    });
    setVehicles(updatedVehicles);
  };

  const updateStationLocation = (stationName, newLocation) => {
    const updatedStations = stations.map(station => {
      if (stationName === station.name){
        return {...station, location: newLocation};
      }
      return station;
    })
    setStations(updatedStations);
  }

  const handleChargeChange = (e) => {
    const value = Number(e.target.value);
    setSelectedCharge(value);
    axios.post('http://127.0.0.1:5000/charge_method', {selectedCharge : value})
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error('error changing charge method', error);
      });
  };

  const handleTripChange = (e) => {
    const value = Number(e.target.value);
    setSelectedTrip(value);
    axios.post('http://127.0.0.1:5000/trip_mode', {selectedTrip : value})
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error('error changing charge method', error);
      });
  };

  const runSimulation = () => {
    console.log('running simulation');
    axios.post('http://127.0.0.1:5000/run_simulation')
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error('Error running simulation:', error);
        alert('Error running simulation: ' + error.message);
      });
  };

  async function fetchVehicles() {
    const response = await fetch('http://127.0.0.1:5000/get_vehicles');
    const data = await response.json();
    console.log(data.vehicles);
    setVehicles(prevVehicles => [...prevVehicles, data]);
  }

  const handleFileLoad = async (event, dataType) => {
    const file = event.target.files[0];
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const parsedData = results.data.map(item => {
          if (item.location) {
            const [lat, lng] = item.location.split('&').map(Number);
            console.log(item.location, [lat, lng]);
            return { ...item, location: { lat, lng } };
          }
          else if (dataType === 'steps' && item.id !== undefined){
            return item
          }
        }).filter(item => item !== undefined);

        for (const item of parsedData){
          console.log('processing items', item);
        }

        for (const item of parsedData) {
          let url;
          if (dataType === 'vehicles') {
            url = 'http://127.0.0.1:5000/add_vehicle';
          } else if (dataType === 'stations') {
            url = 'http://127.0.0.1:5000/add_station';
          } else if (dataType === 'steps') {
            url = 'http://127.0.0.1:5000/add_step';
            if (item.id === undefined) {
             console.error('Step ID is undefined. Step not added.');
             continue;
            }
          }

          try {
            if (!item){
              console.error('item missing');
              return;
            }
            if (dataType === 'vehicles'){
              item.id = incrementId();
            }
            if (dataType === 'stations'){
              item.id = incrementStationId();
            }
            if (dataType === 'steps'){
              item.id = incrementStepId()
              console.log('step', item.id);
            }
            if (item.id !== undefined){
              const response = await axios.post(url, item);
              console.log(response.data.message);
            }

            if (dataType === 'vehicles') {
              setVehicles(prevVehicles => [...prevVehicles, item]);
            } else if (dataType === 'stations') {
              setStations(prevStations => [...prevStations, item]);
            } else if (dataType === 'steps') {
              setSteps(prevSteps => [...prevSteps, item]);
            }
          } catch (error) {
            console.error(`Error adding ${item.type}:`, error);
          }
        }
      }
    });
  };

  return (
    <div className="App">
      <div className="sidebar_gauche">
        <h1>Simulation parameters</h1>
        <h5>load your datas : </h5>
        <div className="controls-section">
          <button className="load-button" onClick={() => document.getElementById('vehicleFile').click()}>Load Vehicles</button>
          <input type="file" accept=".csv" id="vehicleFile" style={{ display: 'none' }} onChange={(e) => handleFileLoad(e, 'vehicles')} />
        </div>

        <div className="controls-section">
          <button className="load-button" onClick={() => document.getElementById('stationFile').click()}>Load Stations</button>
          <input type="file" accept=".csv" id="stationFile" style={{ display: 'none' }} onChange={(e) => handleFileLoad(e, 'stations')} />
        </div>

        <div className="controls-section">
          <button className="load-button" onClick={() => document.getElementById('stepFile').click()}>Load Steps</button>
          <input type="file" accept=".csv" id="stepFile" style={{ display: 'none' }} onChange={(e) => handleFileLoad(e, 'steps')} />
        </div>

        <div className="controls-section">
            <h5> select trip calculation model : </h5>
            {<select value={selectedTrip} onChange={handleTripChange}>
              <option value={0}>simple</option>
              <option value={1}>complex</option>
             </select>
           }
        </div>

        <div className="controls-section">
            <h5> select charging model : </h5>
            <select value={selectedCharge} onChange={handleChargeChange}>
              <option value={0}>Simple with time</option>
              <option value={1}>Complex with time</option>
              <option value={2}>Simple with desired charge</option>
              <option value={3}>Complex with desired charge</option>
            </select>
        </div>

        <div className="controls-section">
          <button className="add-button" onClick={toggleVehicleForm}>Add vehicle</button>
          {showVehicleForm && (
            <VehicleForm
              onAddVehicle={addVehicle}
              onCancel={() => setShowVehicleForm(false)}
              initialLocation={newLocation}
              onSelectLocation={() => { setSelectingLocation(true); setSelectedType('vehicle')}}
            />
          )}
        </div>

        <div className="controls-section">
          <button className="add-button" onClick={toggleStationForm}>Add station</button>
          {showStationForm && (
            <StationForm
              onAddStation={addStation}
              onCancel={() => setShowStationForm(false)}
              initialLocation={newLocation}
              onSelectLocation={() => { setSelectingLocation(true); setSelectedType('station')}}
            />
          )}
        </div>

        <div className="controls-section">
          <button className="add-button" onClick={toggleStepForm}>Add step</button>
          {showStepForm && (
            <StepForm
              onAddStep={addStep}
              onCancel={() => setShowStepForm(false)}
              vehicles={vehicles}
              stations={stations}
            />
          )}
        </div>

        <div>
          <div className="controls-section">
            <button className="add-button" onClick={runSimulation}>Run Simulation</button>
          </div>
        </div>
      </div>

      <div className="map-container">
        <div className="map-frame">
          <MapComponent
            vehicles={vehicles}
            stations={stations}
            onMapClick={handleMapClick}
            newLocation={newLocation}
            setSelectingLocation={setSelectingLocation}
            setSelectedType={setSelectedType}
          />
        </div>
      </div>

      <div className="sidebar_droite">
        <div className="logs-section">
          <h2>Simulated steps</h2>
          <div className="logs-container">
            {logs.map((log, index) => (
              <p key={index}>{log}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
