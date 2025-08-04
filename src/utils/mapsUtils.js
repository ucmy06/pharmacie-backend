// C:\reactjs node mongodb\pharmacie-backend\src\utils\mapsUtils.js

import axiosInstance from './axiosConfig';

// Appelle ton API backend pour résoudre l’URL raccourcie
export const convertGoogleMapsUrl = async (url) => {
  if (!url.includes('maps.app.goo.gl')) return url; // déjà au bon format

  try {
    const res = await axiosInstance.post('/api/utils/resolve-google-url', { url });
    return res.data.resolvedUrl || url;
  } catch (error) {
    console.error('❌ Erreur de conversion du lien Google Maps:', error);
    return url; // en cas d'erreur, on renvoie le lien original
  }
};
