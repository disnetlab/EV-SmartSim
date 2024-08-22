import L from 'leaflet';

import vehicleIconUrl from './vehicleLogo.png';

const VehicleIcon = L.icon({
  iconUrl: vehicleIconUrl, // Chemin vers votre icône de véhicule
  iconSize: [32, 32], // Taille de l'icône
  iconAnchor: [16, 16], // Point d'ancrage de l'icône
  popupAnchor: [0, -16], // Point d'ancrage du popup par rapport à l'icône
});

export default VehicleIcon;
