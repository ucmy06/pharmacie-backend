const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { User } = require('../models/User');
const { connectToPharmacyDB } = require('../config/database');
const { getPharmacyMedicaments } = require('../controllers/adminController');
const { authenticate } = require('../middlewares/auth');
const DrugImage = mongoose.connection.useDb('pharmacies').model('DrugImage', require('../models/DrugImage').schema);

const collectionExists = async (db, collectionName) => {
  try {
    const result = await db.collection(collectionName).findOne({}, { projection: { _id: 1 } });
    console.log(`🔍 Vérification collection ${collectionName} dans ${db.name}: ${result ? 'existe' : 'vide ou inexistante'}`);
    return !!result;
  } catch (error) {
    console.error(`❌ Erreur vérification collection ${collectionName} dans ${db.name}:`, error);
    return false;
  }
};

// Endpoint /list
router.get('/list', authenticate, async (req, res) => {
  try {
    const {
      minPrice,
      maxPrice,
      category,
      form,
      availableOnly,
      name,
      latitude,
      longitude,
      prescriptionOnly
    } = req.query;

    console.log('🔍 [listMedicaments] Requête reçue:', req.query);

    const pharmacies = await User.find({
      role: 'pharmacie',
      isActive: true,
      'pharmacieInfo.baseMedicament': { $exists: true, $ne: null }
    })
      .select('_id pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps')
      .lean();

    if (!pharmacies.length) {
      console.log('⚠️ [listMedicaments] Aucune pharmacie trouvée');
      return res.status(404).json({ success: false, message: 'Aucune pharmacie trouvée' });
    }

    const query = {};
    if (minPrice) query.prix = { $gte: parseFloat(minPrice) };
    if (maxPrice) query.prix = { ...query.prix, $lte: parseFloat(maxPrice) };
    if (category) query.categorie = { $regex: category, $options: 'i' };
    if (form) query.forme = { $regex: form, $options: 'i' };
    if (availableOnly === 'true') query.quantite_stock = { $gt: 0 };
    if (prescriptionOnly !== undefined && prescriptionOnly !== '') query.est_sur_ordonnance = prescriptionOnly === 'true';
    if (name) {
      query.$or = [
        { nom: { $regex: name, $options: 'i' } },
        { nom_generique: { $regex: name, $options: 'i' } }
      ];
    }

    // Récupérer tous les médicaments et leurs noms uniques
    const allMedicaments = await Promise.all(
      pharmacies.map(async (pharmacy) => {
        try {
          const db = connectToPharmacyDB(pharmacy.pharmacieInfo.baseMedicament);
          const hasMedicamentsCollection = await collectionExists(db, 'medicaments');
          if (!hasMedicamentsCollection) {
            console.log(`⚠️ Aucune collection 'medicaments' dans ${pharmacy.pharmacieInfo.baseMedicament}`);
            return [];
          }

          const Medicament = db.model('Medicament', require('../models/Medicament').schema, 'medicaments');
          const medicaments = await Medicament.find(query)
            .lean()
            .select('nom nom_generique prix quantite_stock est_sur_ordonnance categorie forme date_peremption dosage code_barre');

          return medicaments.map(med => ({
            ...med,
            pharmacyId: pharmacy._id,
            pharmacieInfo: {
              nomPharmacie: pharmacy.pharmacieInfo.nomPharmacie || pharmacy.nom,
              adresseGoogleMaps: pharmacy.pharmacieInfo.adresseGoogleMaps
            }
          }));
        } catch (error) {
          console.error(`❌ Erreur pour pharmacie ${pharmacy.pharmacieInfo.nomPharmacie}:`, error);
          return [];
        }
      })
    );

    const allMeds = allMedicaments.flat();
    const uniqueNames = [...new Set(allMeds.map(med => med.nom.toLowerCase()))];

    // Récupérer les images en une seule requête
    const drugImages = await DrugImage.find({
      nom: { $in: uniqueNames }
    }).lean();

    const medsWithImages = allMeds.map(med => {
      const image = drugImages.find(img => 
        img.nom === med.nom.toLowerCase() || 
        (med.nom_generique && img.nom === med.nom_generique.toLowerCase())
      );
      console.log(`🔍 [listMedicaments] Image pour ${med.nom}:`, image ? JSON.stringify(image.images) : 'Aucune');
      return {
        ...med,
        images: image && image.images ? image.images : []
      };
    });

    let sortedMedicaments = medsWithImages;
    if (latitude && longitude && req.query.sortByProximity === 'true') {
      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c / 1000;
      };

      const getCoordinates = (adresse) => {
        if (!adresse) return null;
        const matchGoogle = adresse.match(/q=([-.\d]+),([-.\d]+)/);
        if (matchGoogle) return { latitude: parseFloat(matchGoogle[1]), longitude: parseFloat(matchGoogle[2]) };
        const matchEmbed = adresse.match(/!2d([-.\d]+)!3d([-.\d]+)/);
        if (matchEmbed) return { latitude: parseFloat(matchEmbed[2]), longitude: parseFloat(matchEmbed[1]) };
        return null;
      };

      sortedMedicaments = medsWithImages.sort((a, b) => {
        const coordA = getCoordinates(a.pharmacieInfo.adresseGoogleMaps);
        const coordB = getCoordinates(b.pharmacieInfo.adresseGoogleMaps);
        if (!coordA || !coordB) return 0;
        const distA = calculateDistance(parseFloat(latitude), parseFloat(longitude), coordA.latitude, coordA.longitude);
        const distB = calculateDistance(parseFloat(latitude), parseFloat(longitude), coordB.latitude, coordB.longitude);
        return distA - distB;
      });
    }

    console.log('✅ [listMedicaments] Médicaments récupérés:', sortedMedicaments.length);
    res.json({ success: true, data: sortedMedicaments });
  } catch (error) {
    console.error('❌ [listMedicaments] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Endpoint /search
router.get('/search', async (req, res) => {
  try {
    const { nom, categorie, prixMax, page = 1, limit = 1000 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 [searchMedicaments] Requête:', { nom, categorie, prixMax, page, limit });

    const pharmacies = await User.find({ 
      role: 'pharmacie', 
      isActive: true, 
      'pharmacieInfo.baseMedicament': { $exists: true, $ne: null }
    }).lean();

    if (!pharmacies.length) {
      console.log('⚠️ [searchMedicaments] Aucune pharmacie trouvée');
      return res.status(200).json({
        success: true,
        data: { pharmacies: [], totalPages: 0, currentPage: pageNum, totalMedicaments: 0 }
      });
    }

    const query = {};
    if (nom) query.$or = [
      { nom: { $regex: nom, $options: 'i' } },
      { nom_generique: { $regex: nom, $options: 'i' } }
    ];
    if (categorie) query.categorie = { $regex: categorie, $options: 'i' };
    if (prixMax) query.prix = { $lte: Number(prixMax) };

    const results = await Promise.all(
      pharmacies.map(async (pharma) => {
        try {
          const db = connectToPharmacyDB(pharma.pharmacieInfo.baseMedicament);
          const hasMedicamentsCollection = await collectionExists(db, 'medicaments');
          if (!hasMedicamentsCollection) {
            console.log(`⚠️ [searchMedicaments] Aucune collection 'medicaments' dans ${pharma.pharmacieInfo.baseMedicament}`);
            return {
              pharmacie: {
                id: pharma._id,
                nom: pharma.pharmacieInfo.nomPharmacie || pharma.nom,
                base: pharma.pharmacieInfo.baseMedicament
              },
              medicaments: [],
              totalMedicaments: 0
            };
          }

          const Medicament = db.model('Medicament', require('../models/Medicament').schema, 'medicaments');
          const meds = await Medicament.find(query).limit(limitNum).skip(skip).lean();

          let drugImages = [];
          if (meds.length > 0) {
            try {
              const namesToSearch = [...new Set(
                meds.map(med => med.nom.toLowerCase()).concat(
                  meds.map(med => med.nom_generique?.toLowerCase()).filter(Boolean)
                )
              )];
              console.log(`🔍 [searchMedicaments] Recherche images pour noms: ${namesToSearch.join(', ')}`);
              drugImages = await DrugImage.find({
                nom: { $in: namesToSearch }
              }).lean();
              console.log(`🔍 [searchMedicaments] Images trouvées: ${drugImages.length}`);
            } catch (imageError) {
              console.error(`❌ [searchMedicaments] Erreur récupération images pour ${pharma.pharmacieInfo.nomPharmacie}:`, imageError);
              drugImages = [];
            }
          }

          const medicamentsWithImages = meds.map(med => {
            const image = drugImages.find(img => 
              img.nom === med.nom.toLowerCase() || 
              (med.nom_generique && img.nom === med.nom_generique.toLowerCase())
            );
            console.log(`🔍 [searchMedicaments] Image pour ${med.nom}:`, image ? JSON.stringify(image.images) : 'Aucune');
            return {
              ...med,
              images: image && image.images ? image.images : []
            };
          });

          const total = await Medicament.countDocuments(query);
          return {
            pharmacie: {
              id: pharma._id,
              nom: pharma.pharmacieInfo.nomPharmacie || pharma.nom,
              base: pharma.pharmacieInfo.baseMedicament
            },
            medicaments: medicamentsWithImages,
            totalMedicaments: total
          };
        } catch (error) {
          console.error(`❌ [searchMedicaments] Erreur pour pharmacie ${pharma.pharmacieInfo.nomPharmacie}:`, error);
          return {
            pharmacie: {
              id: pharma._id,
              nom: pharma.pharmacieInfo.nomPharmacie || pharma.nom,
              base: pharma.pharmacieInfo.baseMedicament
            },
            medicaments: [],
            totalMedicaments: 0
          };
        }
      })
    );

    const totalGlobal = results.reduce((sum, result) => sum + result.totalMedicaments, 0);
    console.log('✅ [searchMedicaments] Total global des médicaments:', totalGlobal);

    res.json({
      success: true,
      data: {
        pharmacies: results,
        totalPages: Math.ceil(totalGlobal / limitNum),
        currentPage: pageNum,
        totalMedicaments: totalGlobal
      }
    });
  } catch (error) {
    console.error('❌ [searchMedicaments] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Endpoint /pharmacy/:pharmacyId/medicaments
router.get('/pharmacy/:pharmacyId/medicaments', authenticate, getPharmacyMedicaments);

// Endpoint /test/:base
router.get('/test/:base', async (req, res) => {
  try {
    const { base } = req.params;
    console.log(`🔍 [testBase] Test connexion à la base: ${base}`);
    const db = connectToPharmacyDB(base);
    
    const hasMedicamentsCollection = await collectionExists(db, 'medicaments');
    if (!hasMedicamentsCollection) {
      return res.status(404).json({ success: false, message: `Aucune collection 'medicaments' dans ${base}` });
    }

    const Medicament = db.model('Medicament', require('../models/Medicament').schema, 'medicaments');
    
    console.log(`🔍 [testBase] Exécution find dans ${base}`);
    const meds = await Medicament.find({}).limit(5).lean();
    console.log(`🔍 [testBase] Médicaments trouvés dans ${base}:`, meds.length);
    
    const total = await Medicament.countDocuments({});
    console.log(`🔍 [testBase] Total documents dans ${base}:`, total);
    
    res.json({
      success: true,
      data: {
        medicaments: meds,
        totalMedicaments: total
      }
    });
  } catch (error) {
    console.error(`❌ [testBase] Erreur test base ${req.params.base}:`, error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;