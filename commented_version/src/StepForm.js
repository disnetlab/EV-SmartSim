import React, { useState } from 'react';

const StepForm = ({ onAddStep, vehicles, stations }) => {
  const [stepType, setStepType] = useState('');
  const [vehicleIndex, setVehicleIndex] = useState(0);
  const [stationIndex, setStationIndex] = useState(0);
  const [stepData, setStepData] = useState({
    id: '',
    start_time: '',
    end_time: '',
    start_charge: '',
    end_charge: '',
    desired_charge: '',
    duration: '',
  });

  const handleStepTypeChange = (e) => {
    setStepType(e.target.value);
  };

  const handleVehicleChange = (e) => {
    setVehicleIndex(e.target.value);
  };

  const handleStationChange = (e) => { // Get the station id
    const index = e.target.value;
    setStationIndex(index);
    handleChange({ target: { name: 'station_id', value: stations[index].id } });
  };

  const handleChange = (e) => {
    setStepData({
      ...stepData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSubmit = {
      stepType,
      vehicle_id: vehicles[vehicleIndex].id,
      station_id: stations[stationIndex].id,
      ...stepData
    };
    onAddStep(dataToSubmit);
    // Reset form after submission
    setStepData({
      start_time: '',
      end_time: '',
      start_charge: '',
      end_charge: '',
      start_discharge: '',
      end_discharge: '',
      desired_charge: '',
      duration: '',
      destination: ''
    });
    setStepType('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Select Vehicle:
        <select value={vehicleIndex} onChange={handleVehicleChange}>
          {vehicles.map((vehicle, index) => (
            <option key={index} value={index}>{vehicle.name}</option>
          ))}
        </select>
      </label>

      <label> // Display the correct for in function of the type of the step
        Step Type:
        <select value={stepType} onChange={handleStepTypeChange}>
          <option value="">Select Step Type</option>
          <option value="charge">Charge</option>
          <option value="discharge">Discharge</option>
          <option value="trip">Trip</option>
        </select>
      </label>

      {stepType === 'charge' && (
        <div>
          <label>
            Select Station:
            <select value={stationIndex} onChange={handleStationChange}>
              {stations.map((station, index) => (
                <option key={index} value={index}>{station.name}</option>
              ))}
            </select>
          </label>
          <label>
            Start charge:
            <input
              type="number"
              name="start_charge"
              value={stepData.start_charge}
              onChange={handleChange}
            />
          </label>
          <label>
            End charge:
            <input
              type="number"
              name="end_charge"
              value={stepData.end_charge}
              onChange={handleChange}
            />
          </label>
          <label>
            Desired charge:
            <input
              type="number"
              name="desired_charge"
              value={stepData.desired_charge}
              onChange={handleChange}
            />
          </label>
        </div>
      )}

      {stepType === 'discharge' && (
        <div>
          <label>
            Select Station:
            <select value={stationIndex} onChange={handleStationChange}>
              {stations.map((station, index) => (
                <option key={index} value={index}>{station.name}</option>
              ))}
            </select>
          </label>
          <label>
            Start discharge:
            <input
              type="number"
              name="start_charge"
              value={stepData.start_charge}
              onChange={handleChange}
            />
          </label>
          <label>
            End discharge:
            <input
              type="number"
              name="end_charge"
              value={stepData.end_charge}
              onChange={handleChange}
            />
          </label>
          <label>
            Duration:
            <input
              type="number"
              name="duration"
              value={stepData.duration}
              onChange={handleChange}
            />
          </label>
        </div>
      )}

      {stepType === 'trip' && (
        <div>
          <label>
            Start time:
            <input
              type="number"
              name="start_time"
              value={stepData.start_time}
              onChange={handleChange}
            />
          </label>
          <label>
            End time:
            <input
              type="number"
              name="end_time"
              value={stepData.end_time}
              onChange={handleChange}
            />
          </label>
          <label>
            Select Destination:
            <select value={stationIndex} onChange={handleStationChange}>
              {stations.map((station, index) => (
                <option key={index} value={index}>{station.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <button type="submit">Add Step</button>
    </form>
  );
};

export default StepForm;
