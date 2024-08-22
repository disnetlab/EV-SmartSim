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
// Using time as a state
// WebGl fluid simulation

function App() {
  // State variables to manage UI states and data
  const [showVehicleForm, setShowVehicleForm] = useState(false);  // Show/hide vehicle form
  const [showStationForm, setShowStationForm] = useState(false);  // Show/hide station form
  const [showStepForm, setShowStepForm] = useState(false);        // Show/hide step form
  const [vehicles, setVehicles] = useState([]);                   // List of vehicles
  const [stations, setStations] = useState([]);                   // List of stations
  const [steps, setSteps] = useState([]);                         // List of steps
  const [newLocation, setNewLocation] = useState(null);           // Location selected on map
  const [selectingLocation, setSelectingLocation] = useState(false); // Flag for selecting location
  const [selectedType, setSelectedType] = useState(null);         // Type of entity being selected (vehicle/station)
  const [selectedTrip, setSelectedTrip] = useState(0);            // Selected trip calculation model
  const [selectedCharge, setSelectedCharge] = useState(0);        // Selected charging model
  const [logs, setLogs] = useState([]);

  // Effect hook to manage socket connection and listen for real-time updates
  useEffect(() => {
    const socket = io('http://127.0.0.1:5000');

    // Listen for log messages from the backend
    socket.on('log', (data) => {
      console.log("Log received:", data);
      setLogs((prevLogs) => [...prevLogs, data.message]);  // Append new log message

      // Update vehicle data based on the received log
      if (data.name) {
        const updatedVehicles = vehicles.map(vehicle => {
          if (vehicle.name === data.name) {
            if (!data.battery) {
              vehicle.location = data.location;
            } else if (!data.location) {
              vehicle.battery = data.battery;
            } else {
              vehicle.battery = data.battery;
              vehicle.location = data.location;
            }
            console.log("Updating vehicle:", vehicle);
            console.log("vehicle is at ", vehicle.location.lat, vehicle.location.lng);
            return vehicle;
          }
          return vehicle;
        });
        setVehicles(updatedVehicles);  // Update the vehicles state with new data
      }
    });

    // Cleanup: disconnect the socket when the component unmounts
    return () => {
      socket.disconnect();
    };
  }, [vehicles]);  // Re-run the effect if the vehicles array changes

  // Handler for clicks on the map
  const handleMapClick = (location) => {
    if (location.lat === undefined || location.lng === undefined) {
      console.error('Invalid location object', location);
      return;
    }

    console.log('in handleMapClick', location.lat, location.lng);
    setNewLocation(location);  // Update the newLocation state with the clicked location

    // Update the location of a vehicle or station based on the selected type
    if (selectingLocation && selectedType) {
      if (selectedType === 'vehicle') {
        console.log('in vehicle');
        updateVehicleLocation(location);

      } else if (selectedType === 'station') {
        console.log('in station');
        updateStationLocation(location);
      }
      setSelectingLocation(false);  // End the selection mode
    }
  };

  // Toggle the visibility of the vehicle form
  const toggleVehicleForm = () => {
    setShowVehicleForm(!showVehicleForm);
  };

  // Add a new vehicle
  const addVehicle = (vehicleData) => {
    // Check if all required fields are filled
    if (!vehicleData.name || !vehicleData.battery_capacity || !vehicleData.consumption || !vehicleData.battery || !vehicleData.location || !vehicleData.start_time) {
      alert('Every field is required');
      return;
    }

    // Assign a unique ID to the new vehicle
    vehicleData.id = incrementId();

    const newVehicle = {
      ...vehicleData,
    };

    // Send a POST request to add the vehicle to the backend
    axios.post('http://127.0.0.1:5000/add_vehicle', newVehicle)
      .then(response => {
        setVehicles([...vehicles, vehicleData]);  // Update the vehicles state
        console.log(response.data.message);
        setShowVehicleForm(false);  // Hide the vehicle form
        setNewLocation(null);  // Reset the selected location
      })
      .catch(error => {
        console.error('Error adding vehicle:', error);
        alert('Error adding vehicle: ' + error.message);
      });
  };

  // Toggle the visibility of the station form
  const toggleStationForm = () => {
    setShowStationForm(!showStationForm);
  };

  // Add a new station
  const addStation = (stationData) => {
    // Check if all required fields are filled
    if (!stationData.name || !stationData.location || !stationData.charging_speed || !stationData.price_per_kwh || !stationData.buy_price_per_kwh || !stationData.discharging_speed) {
      alert('Every field is required');
      return;
    }
    stationData.id = incrementStationId();  // Assign a unique ID to the new station

    // Send a POST request to add the station to the backend
    axios.post('http://127.0.0.1:5000/add_station', stationData)
      .then(response => {
        setStations([...stations, stationData]);  // Update the stations state
        console.log(response.data.message);
        setShowStationForm(false);  // Hide the station form
        setNewLocation(null);  // Reset the selected location
      })
      .catch(error => {
        console.error('Error adding station:', error);
        alert('Error adding station: ' + error.message);
      });
  };

  // Toggle the visibility of the step form
  const toggleStepForm = () => {
    setShowStepForm(!showStepForm);
  };

  // Add a new step
  const addStep = (stepData) => {
    // Check if the step type is selected
    if (!stepData.stepType) {
      alert('choose a type');
      return;
    }
    stepData.id = incrementStepId();  // Assign a unique ID to the new step
    console.log(stepData);

    // Send a POST request to add the step to the backend
    axios.post('http://127.0.0.1:5000/add_step', stepData)
      .then(response => {
        console.log('in then');
        setSteps([...steps, stepData]);  // Update the steps state
        console.log(response.data.message);
        setShowStepForm(false);  // Hide the step form
      })
      .catch(error => {
        console.error('Error adding step:', error);
      });
  };

  // Update the steps associated with a vehicle
  const updateVehicleSteps = (vehicleName, stepData) => {
    const updatedVehicles = vehicles.map(vehicle => {
      if (vehicle.name === vehicleName) {
        return { ...vehicle, steps: stepData };
      }
      return vehicle;
    });
    setVehicles(updatedVehicles);  // Update the vehicles state
  };

  // Update the location of a vehicle
  const updateVehicleLocation = (vehicleName, newLocation) => {
    const updatedVehicles = vehicles.map(vehicle => {
      if (vehicle.name === vehicleName) {
        return { ...vehicle, location: newLocation };
      }
      return vehicle;
    });
    setVehicles(updatedVehicles);  // Update the vehicles state
  };

  // Update the location of a station
  const updateStationLocation = (stationName, newLocation) => {
    const updatedStations = stations.map(station => {
      if (stationName === station.name) {
        return { ...station, location: newLocation };
      }
      return station;
    });
    setStations(updatedStations);  // Update the stations state
  };

  // Handle changes in the selected charging model
  const handleChargeChange = (e) => {
    const value = Number(e.target.value);
    setSelectedCharge(value);  // Update the selected charge model

    // Send a POST request to update the charging model in the backend
    axios.post('http://127.0.0.1:5000/charge_method', { selectedCharge: value })
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error('error changing charge method', error);
      });
  };

  // Handle changes in the selected trip calculation model
  const handleTripChange = (e) => {
    const value = Number(e.target.value);
    setSelectedTrip(value);  // Update the selected trip model

    // Send a POST request to update the trip calculation model in the backend
    axios.post('http://127.0.0.1:5000/trip_method', { selectedTrip: value })
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error('error changing trip method', error);
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
          // Get the right url
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
            // define an unique Id for each item
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
            // updates datas with the new one
            if (dataType === 'vehicles') {
              setVehicles(prevVehicles => [...prevVehicles, item]);
            } else if (dataType === 'stations') {
              setStations(prevStations => [...prevStations, item]);
            } else if (dataType === 'steps') {
              setSteps(prevSteps => [...prevSteps, item]);
            }
          } catch (error) {
            console.error('Error adding ${item.type}:', error);
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
