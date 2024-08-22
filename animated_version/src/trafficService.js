//trafficService.js
import axios from 'axios';

const API_KEY = 'votre_cle_api_here'; // Remplacez par votre clé API

export const getTrafficData = async (bounds) => {
  try {
    const response = await axios.get('https://traffic.ls.hereapi.com/traffic/6.3/flow.json', {
      params: {
        apiKey: API_KEY,
        bbox: `${bounds.getSouth()},${bounds.getWest()};${bounds.getNorth()},${bounds.getEast()}`,
        responseattributes: 'sh,fc' // Exemple de paramètres supplémentaires
      }
    });
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des données de trafic', error);
    return null;
  }
};
