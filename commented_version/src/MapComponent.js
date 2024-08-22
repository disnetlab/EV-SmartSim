import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import VehicleIcon from './VehicleIcon';
import StationIcon from './StationIcon';

const MapClickHandler = ({ onMapClick }) => {
  //Store new location selected on the map
  useMapEvents({
    click: (e) => {
      if (e && e.latlng) {
        const { lat, lng } = e.latlng;
        onMapClick({ lat, lng });
      } else {
        console.error("LatLng is undefined", e);
      }
    },
  });
  return null;
};

const getOffset = (index) => { // Define offset to make the visualisation easier

  const offset = 0.0002; // Adjust this value for better spacing
  return {
    lat: (index % 10) * offset,
    lng: Math.floor(index / 10) * offset
  };
};

const interpolatePosition = (start, end, fraction) => {
  return {
    lat: start.lat + (end.lat - start.lat) * fraction,
    lng: start.lng + (end.lng - start.lng) * fraction
  };
};

const animateVehicle = (start, end, duration, updatePosition) => {
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const fraction = Math.min(elapsed / duration, 1);
    const position = interpolatePosition(start, end, fraction);

    updatePosition(position);

    if (fraction < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
};

const MapComponent = React.memo(({ vehicles, stations, steps, onMapClick }) => {
  const [vehiclePositions, setVehiclePositions] = useState(vehicles.map(v => v.location));

  useEffect(() => {
    vehicles.forEach((vehicle, index) => {
      if (vehicle.isMoving && vehicle.previousLocation) {
        const start = vehicle.previousLocation;
        const end = vehicle.location;
        const duration = 1000; // 1 second
        animateVehicle(start, end, duration, (position) => {
          setVehiclePositions(prev => {
            const newPositions = [...prev];
            newPositions[index] = position;
            return newPositions;
          });
        });
      }
    });
  }, [vehicles]);
  return (
    <MapContainer center={[-37.814, 144.96332]} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
      />
      <MapClickHandler onMapClick={onMapClick} />
      {vehicles.map((vehicle, index) => {
        const offset = getOffset(index);
        const position = [vehicle.location.lat + offset.lat, vehicle.location.lng + offset.lng]; // Define the position with offset
        return (
          <Marker key={vehicle.id} position={position} icon={VehicleIcon}>
            <Popup>
              <div>
                <h3>{vehicle.name}</h3>
                <p>Capacity: {vehicle.battery_capacity}</p>
                <p>Battery: {vehicle.battery}</p>
                <p>Consumption: {vehicle.consumption}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {stations.map((station, index) => {
        const offset = getOffset(index + vehicles.length);
        const position = [station.location.lat + offset.lat, station.location.lng + offset.lng];
        return (
          <Marker key={station.id} position={position} icon={StationIcon}>
            <Popup>
              <div>
                <h3>{station.name}</h3>
                <p>Price per kwh: {station.price_per_kwh}</p>
                <p>Charging speed: {station.charging_speed}</p>
                <p>Buy price per kwh: {station.buy_price_per_kwh}</p>
                <p>Discharging speed: {station.discharging_speed}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
});

export default MapComponent;
