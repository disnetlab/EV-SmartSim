import React, { useState, useEffect } from 'react';
import axios from 'axios';

const VehicleForm = ({ onAddVehicle, onCancel, initialLocation, onSelectLocation }) => {
  const [vehicleData, setVehicleData] = useState({
    name: '',
    id: '',
    battery_capacity: '',
    consumption: '',
    battery: '',
    location: initialLocation || [0, 0],
    start_time: '',
  });

  useEffect(() => {
    if (initialLocation) {
      setVehicleData((prevData) => ({
        ...prevData,
        location: initialLocation,
      }));
    }
  }, [initialLocation]);

  const handleChange = (e) => {
    setVehicleData({
      ...vehicleData,
      previousLocation: [0,0],
      [e.target.name]: e.target.value,
    });
  };


  const handleSubmit = (e) => {
  e.preventDefault();
  axios.post('http://localhost:5000/add_vehicle', vehicleData)
    .then(response => {
      console.log(response.data);
      // Call the callback and update the vehicle data
      onAddVehicle(vehicleData);
    })
    .catch(error => {
      console.error('Error adding vehicle:', error);
      alert('Error adding vehicle: ' + error.message); // Display an alert or an error
    });
};

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name:
        <input
          type="text"
          name="name"
          value={vehicleData.name}
          onChange={handleChange}
        />
      </label>

      <label>
        Battery Capacity:
        <input
          type="number"
          name="battery_capacity"
          value={vehicleData.battery_capacity}
          onChange={handleChange}
        />
      </label>

      <label>
        consumption:
        <input
          type="number"
          name="consumption"
          value={vehicleData.consumption}
          onChange={handleChange}
        />
      </label>

      <label>
        battery:
        <input
          type="number"
          name="battery"
          value={vehicleData.battery}
          onChange={handleChange}
        />
      </label>

      <label>
        locations:
        <input
          type="text"
          name="location"
          value={vehicleData.location}
          onChange={handleChange}
          disabled
        />
        <button type="button" onClick={onSelectLocation}>Select on Map</button>
      </label>

      <label>
        start time:
        <input
          type="number"
          name="start_time"
          value={vehicleData.start_time}
          onChange={handleChange}
        />
      </label>

      <button type="submit">Add Vehicle</button>
    </form>
  );
};

export default VehicleForm;
