// C:\reactjs node mongodb\pharmacie-backend\src\routes\cart.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../middlewares/auth');
const Cart = mongoose.connection.useDb('pharmacies').model('Cart', require('../models/Cart').schema);
const { User } = require('../models/User');
const Medicament = require('../models/Medicament');
const DrugImage = mongoose.connection.useDb('pharmacies').model('DrugImage', require('../models/DrugImage').schema);



router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('🔍 [getCarts] Requête reçue pour userId:', userId);

    // Récupérer tous les paniers de l'utilisateur
    const carts = await Cart.find({ userId })
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie pharmacieInfo.livraisonDisponible')
      .lean();

    // Ajouter les informations de la pharmacie et calculer le total
    const formattedCarts = carts.map(cart => ({
      pharmacyId: cart.pharmacyId._id,
      pharmacieInfo: {
        nomPharmacie: cart.pharmacyId.pharmacieInfo.nomPharmacie,
        livraisonDisponible: cart.pharmacyId.pharmacieInfo.livraisonDisponible
      },
      medicaments: cart.items.map(item => ({
        medicamentId: item.medicamentId,
        nom: item.nom,
        quantite: item.quantity,
        prixUnitaire: item.prix,
        image: item.image
      })),
      total: cart.items.reduce((sum, item) => sum + item.prix * item.quantity, 0)
    }));

    console.log('✅ [getCarts] Paniers récupérés:', formattedCarts);
    res.json({ success: true, data: formattedCarts });
  } catch (error) {
    console.error('❌ [getCarts] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});



router.post('/add', authenticate, async (req, res) => {
  try {
    const { medicamentId, pharmacyId, quantity = 1 } = req.body;
    const userId = req.user._id;

    console.log('🔍 [addToCart] Requête reçue:', { medicamentId, pharmacyId, quantity, userId });

    // Vérifier les paramètres requis
    if (!medicamentId || !pharmacyId) {
      return res.status(400).json({ success: false, message: 'medicamentId et pharmacyId sont requis' });
    }

    // Vérifier la pharmacie
    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie' || !pharmacy.pharmacieInfo?.baseMedicament) {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    // Vérifier le médicament
    const connection = mongoose.connection.useDb(pharmacy.pharmacieInfo.baseMedicament);
    const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');
    const medicament = await MedicamentModel.findById(medicamentId);
    if (!medicament) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
    }
    if (medicament.quantite_stock < quantity) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant' });
    }

    // Récupérer l'image depuis DrugImage
    console.log(`🔍 [addToCart] Recherche image pour nom: ${medicament.nom}, nom_generique: ${medicament.nom_generique || 'aucun'}`);
    const image = await DrugImage.findOne({
      nom: { $in: [medicament.nom.toLowerCase(), medicament.nom_generique?.toLowerCase()].filter(Boolean) }
    }).lean();
    console.log(`🔍 [addToCart] Image trouvée pour ${medicament.nom}:`, image ? JSON.stringify(image.images) : 'Aucune');

    // Trouver ou créer le panier
    let cart = await Cart.findOne({ userId, pharmacyId });
    if (!cart) {
      cart = new Cart({ userId, pharmacyId, items: [] });
    }

    // Vérifier si le médicament est déjà dans le panier
    const existingItem = cart.items.find(item => item.medicamentId.toString() === medicamentId);
    if (existingItem) {
      existingItem.quantity += quantity;
      if (existingItem.quantity > medicament.quantite_stock) {
        return res.status(400).json({ success: false, message: 'Stock insuffisant pour la quantité demandée' });
      }
    } else {
      cart.items.push({
        medicamentId,
        nom: medicament.nom,
        prix: medicament.prix,
        quantity,
        image: image && image.images && image.images.length > 0 ? {
          nomFichier: image.images[0].nomFichier,
          cheminFichier: image.images[0].cheminFichier
        } : null
      });
    }

    cart.updatedAt = new Date();
    await cart.save();

    console.log('✅ [addToCart] Panier mis à jour:', JSON.stringify(cart, null, 2));
    res.json({ success: true, message: `${medicament.nom} ajouté au panier`, data: cart });
  } catch (error) {
    console.error('❌ [addToCart] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;