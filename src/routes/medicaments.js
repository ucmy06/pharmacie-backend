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

router.get('/test/:base', async (req, res) => {
  try {
    const { base } = req.params;
    console.log(`🔍 Test connexion à la base: ${base}`);
    const db = connectToPharmacyDB(base);
    
    const hasMedicamentsCollection = await collectionExists(db, 'medicaments');
    if (!hasMedicamentsCollection) {
      return res.status(404).json({ success: false, message: `Aucune collection 'medicaments' dans ${base}` });
    }

    const Medicament = db.model('Medicament', require('../models/Medicament').schema, 'medicaments');
    
    console.log(`🔍 Exécution find dans ${base}`);
    const meds = await Medicament.find({}).limit(5).lean();
    console.log(`🔍 Médicaments trouvés dans ${base}:`, meds.length);
    
    const total = await Medicament.countDocuments({});
    console.log(`🔍 Total documents dans ${base}:`, total);
    
    res.json({
      success: true,
      data: {
        medicaments: meds,
        totalMedicaments: total
      }
    });
  } catch (error) {
    console.error(`❌ Erreur test base ${req.params.base}:`, error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { nom, categorie, prixMax, page = 1, limit = 1000 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Requête de recherche:', { nom, categorie, prixMax, page, limit });

    const pharmacies = await User.find({ 
      role: 'pharmacie', 
      isActive: true, 
      'pharmacieInfo.baseMedicament': { $exists: true, $ne: null }
    }).lean();

    console.log('🔍 Pharmacies trouvées:', pharmacies.length);

    if (!pharmacies.length) {
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

    console.log('🔍 Requête de recherche:', query);

    const results = await Promise.all(
      pharmacies.map(async (pharma) => {
        try {
          console.log(`🔍 Traitement pharmacie: ${pharma.pharmacieInfo.nomPharmacie} (${pharma.pharmacieInfo.baseMedicament})`);
          const db = connectToPharmacyDB(pharma.pharmacieInfo.baseMedicament);
          
          const hasMedicamentsCollection = await collectionExists(db, 'medicaments');
          if (!hasMedicamentsCollection) {
            console.log(`🔍 Aucune collection 'medicaments' dans ${pharma.pharmacieInfo.baseMedicament}`);
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
          
          console.log(`🔍 Exécution find dans ${pharma.pharmacieInfo.baseMedicament}`);
          const meds = await Medicament.find(query)
            .limit(limitNum)
            .skip(skip)
            .lean();
          
          console.log(`🔍 Médicaments trouvés dans ${pharma.pharmacieInfo.baseMedicament}:`, meds.length);

          let drugImages = [];
          if (meds.length > 0) {
            try {
              drugImages = await DrugImage.find({
                nom: { $in: meds.map(med => med.nom.toLowerCase()).concat(meds.map(med => med.nom_generique?.toLowerCase()).filter(Boolean)) }
              }).lean();
            } catch (imageError) {
              console.error(`❌ Erreur récupération images pour ${pharma.pharmacieInfo.nomPharmacie}:`, imageError);
              drugImages = [];
            }
          }
          
          const medicamentsWithImages = meds.map(med => ({
            ...med,
            images: drugImages.find(img => 
              img.nom === med.nom.toLowerCase() || 
              (med.nom_generique && img.nom === med.nom_generique.toLowerCase())
            )?.images || []
          }));

          const total = await Medicament.countDocuments(query);
          console.log(`🔍 Total documents dans ${pharma.pharmacieInfo.baseMedicament}:`, total);
          
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
          console.error(`❌ Erreur pour pharmacie ${pharma.pharmacieInfo.nomPharmacie}:`, error);
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
    console.log('🔍 Total global des médicaments:', totalGlobal);

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
    console.error('❌ Erreur recherche médicaments:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.get('/pharmacy/:pharmacyId/medicaments', authenticate, getPharmacyMedicaments);

module.exports = router;