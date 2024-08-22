import L from 'leaflet';

// Assurez-vous d'utiliser le chemin correct vers votre image
import stationIconUrl from './stationLogo.jpeg'; // Remplacez './images/' par votre chemin réel

const StationIcon = L.icon({
  iconUrl: stationIconUrl, // Utilisez la variable importée pour définir l'URL de l'icône
  iconSize: [32, 32], // Taille de l'icône
  iconAnchor: [16, 16], // Point d'ancrage de l'icône
  popupAnchor: [0, -16], // Point d'ancrage du popup par rapport à l'icône
});

export default StationIcon;
