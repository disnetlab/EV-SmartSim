import React, { useState, useEffect, useRef } from 'react';
  import { MapContainer, TileLayer, Marker,Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import VehicleIcon from './VehicleIcon';
import StationIcon from './StationIcon';

const MapClickHandler = ({ onMapClick }) => {
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

const getOffset = (index) => {
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

const getVehicleColor = (id) => {
  const colors = [
    'blue',    // 0
    'red',     // 1
    'green',   // 2
    'purple',  // 3
    'orange',  // 4
    'cyan',    // 5
    'magenta', // 6
    'brown',   // 7
    'pink',    // 8
    'yellow'   // 9
  ];
  return colors[id % colors.length]; // Associe une couleur basée sur l'ID du véhicule
};

const MapComponent = React.memo(({ vehicles, stations, onMapClick }) => {
  const [vehiclePositions, setVehiclePositions] = useState({});

  useEffect(() => {
    const initialPositions = vehicles.reduce((acc, vehicle) => {
      if (vehicle.previousLocation && vehicle.location) {
        acc[vehicle.id] = {
          current: vehicle.previousLocation,
          start: vehicle.previousLocation,
          end: vehicle.location,
          color: getVehicleColor(vehicle.id),
          hasReachedDestination: false
        };
        console.log("start and end", vehicle.previousLocation, vehicle);
      } else {
        console.error('Vehicle location data is incomplete for vehicle', vehicle.id);
      }
      return acc;
    }, {});

    setVehiclePositions(initialPositions);

    const updateVehiclePositions = () => {
      setVehiclePositions((prevPositions) => {
        const newPositions = {};

        for (let id in prevPositions) {
          const vehicle = prevPositions[id];

          if (!vehicle) {
            console.error('Vehicle position is undefined for vehicle', id);
            continue;
          }

          const { current, start, end, color, hasReachedDestination } = vehicle;

          if (hasReachedDestination) {
            newPositions[id] = vehicle; // Conserver la position finale
            continue;
          }

          // Vérifiez si les coordonnées de start et end sont définies
          if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
            console.error('Start or end location is undefined for vehicle', id);
            newPositions[id] = vehicle;
            continue;
          }

          // Calculez la nouvelle position en interpolant entre start et end
          console.log("diff", start, end);
          const progress = ((Date.now() % 10000) + 1) / 10000;
          const newLat = start.lat + (end.lat - start.lat) * progress;
          const newLng = start.lng + (end.lng - start.lng) * progress;

          const tolerance = 0.001;
          console.log("position", newLat, end.lat);
          const hasReached = Math.abs(newLat - end.lat) < tolerance && Math.abs(newLng - end.lng) < tolerance;
          console.log("has Reachef =", hasReached);

          newPositions[id] = {
            current: { lat: newLat, lng: newLng },
            start: start,
            end: end,
            color: color,
            hasReachedDestination: hasReached
          };
        }

        return newPositions;
      });
    };

    const intervalId = setInterval(updateVehiclePositions, 100);

    return () => clearInterval(intervalId);
  }, [vehicles]);


  // Styles pour les lignes
  const lineStyle = (color) => ({
    color: color,
    weight: 5,
    opacity: 0.7
  });

  return (
    <MapContainer center={[-37.814, 144.96332]} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
      />
      <MapClickHandler onMapClick={onMapClick} />
      {vehicles.map((vehicle, index) => {
        const offset = getOffset(index);
        const position = vehiclePositions[vehicle.id]?.current || vehicle.location;
        return (
          <Marker key={vehicle.id} position={[position.lat, position.lng]} icon={VehicleIcon}>
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
