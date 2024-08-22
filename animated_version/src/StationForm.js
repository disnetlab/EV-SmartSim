import React, { useState, useEffect } from 'react';
import axios from 'axios';

const StationForm = ({ onAddStation, onCancel, initialLocation, onSelectLocation }) => {
  const [stationData, setStationData] = useState({
    id: '',
    name: '',
    charging_speed: '',
    price_per_kwh: '',
    buy_price_per_kwh: '',
    location: initialLocation || [0, 0],
    discharging_speed: '',
  });

  useEffect(() => {
    if (initialLocation) {
      setStationData((prevData) => ({
        ...prevData,
        location: initialLocation,
      }));
    }
  }, [initialLocation]);

  const handleChange = (e) => {
    setStationData({
      ...stationData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddStation(stationData);
    axios.post('http://localhost:5000/add_station', stationData)
      .then(response => {
        console.log(response.data);
      });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name:
        <input
          type="text"
          name="name"
          value={stationData.name}
          onChange={handleChange}
        />
      </label>

      <label>
        charging_speed:
        <input
          type="number"
          name="charging_speed"
          value={stationData.charging_speed}
          onChange={handleChange}
        />
      </label>

      <label>
        Price per kwh:
        <input
          type="number"
          name="price_per_kwh"
          value={stationData.price_per_kwh}
          onChange={handleChange}
        />
      </label>

      <label>
        Buy price per kwh:
        <input
          type="number"
          name="buy_price_per_kwh"
          value={stationData.buy_price_per_kwh}
          onChange={handleChange}
        />
      </label>

      <label>
        Location:
        <input
          type="text"
          name="location"
          value={stationData.location}
          onChange={handleChange}
          disabled
        />
        <button type="button" onClick={onSelectLocation}>Select on Map</button>
      </label>

      <label>
        discharging speed:
        <input
          type="number"
          name="discharging_speed"
          value={stationData.discharging_speed}
          onChange={handleChange}
        />
      </label>

      <button type="submit">Add station</button>
    </form>
  );
};

export default StationForm;
