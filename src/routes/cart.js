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

    // Filtrer les items invalides et calculer le total
    const formattedCarts = carts.map((cart) => {
      const validItems = cart.items.filter((item) => {
        const isValid = item && item.medicamentId && item.nom && item.prix && item.quantity;
        if (!isValid) {
          console.warn('⚠️ Item invalide dans le panier:', item);
        }
        return isValid;
      });

      return {
        _id: cart._id, // Ajouter explicitement l'ID du panier
        pharmacyId: cart.pharmacyId?._id || null,
        pharmacieInfo: cart.pharmacyId
          ? {
              nomPharmacie: cart.pharmacyId.pharmacieInfo?.nomPharmacie || 'Inconnue',
              livraisonDisponible: cart.pharmacyId.pharmacieInfo?.livraisonDisponible || false,
            }
          : { nomPharmacie: 'Inconnue', livraisonDisponible: false },
        medicaments: validItems.map((item) => ({
          medicamentId: item.medicamentId,
          nom: item.nom,
          quantite: item.quantity,
          prixUnitaire: item.prix,
          image: item.image,
        })),
        total: validItems.reduce((sum, item) => sum + item.prix * item.quantity, 0),
      };
    });

    // Supprimer les paniers vides après filtrage
    const nonEmptyCarts = formattedCarts.filter((cart) => cart.medicaments.length > 0);

    console.log('✅ [getCarts] Paniers récupérés:', nonEmptyCarts);
    res.json({ success: true, data: nonEmptyCarts });
  } catch (error) {
    console.error('❌ [getCarts] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});


router.delete('/remove', authenticate, async (req, res) => {
  try {
    const { cartId, medicamentId } = req.body;
    const userId = req.user._id;

    console.log('🔍 [removeFromCart] Requête reçue:', { cartId, medicamentId, userId });

    if (!cartId || !medicamentId) {
      return res.status(400).json({ success: false, message: 'cartId et medicamentId sont requis' });
    }

    const cart = await Cart.findOne({ _id: cartId, userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Panier non trouvé' });
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => item.medicamentId.toString() !== medicamentId);

    if (cart.items.length === initialLength) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé dans le panier' });
    }

    if (cart.items.length === 0) {
      await Cart.deleteOne({ _id: cartId, userId });
    } else {
      cart.updatedAt = new Date();
      await cart.save();
    }

    console.log('✅ [removeFromCart] Médicament supprimé du panier:', cartId);
    res.json({ success: true, message: 'Médicament supprimé du panier' });
  } catch (error) {
    console.error('❌ [removeFromCart] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});


router.delete('/clear', authenticate, async (req, res) => {
  try {
    const { cartId } = req.body;
    const userId = req.user._id;

    console.log('🔍 [clearCart] Requête reçue:', { cartId, userId });

    if (!cartId) {
      return res.status(400).json({ success: false, message: 'cartId est requis' });
    }

    const cart = await Cart.findOneAndDelete({ _id: cartId, userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Panier non trouvé' });
    }

    console.log('✅ [clearCart] Panier vidé:', cartId);
    res.json({ success: true, message: 'Panier vidé avec succès' });
  } catch (error) {
    console.error('❌ [clearCart] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// La route POST /api/cart/add reste inchangée
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
      nom: { $in: [medicament.nom.toLowerCase(), medicament.nom_generique?.toLowerCase()].filter(Boolean) },
    }).lean();
    console.log(`🔍 [addToCart] Image trouvée pour ${medicament.nom}:`, image ? JSON.stringify(image.images) : 'Aucune');

    // Trouver ou créer le panier
    let cart = await Cart.findOne({ userId, pharmacyId });
    if (!cart) {
      cart = new Cart({ userId, pharmacyId, items: [] });
    }

    // Vérifier si le médicament est déjà dans le panier
    const existingItem = cart.items.find((item) => item.medicamentId.toString() === medicamentId);
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
          cheminFichier: image.images[0].cheminFichier,
        } : null,
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

router.put('/update', authenticate, async (req, res) => {
  try {
    const { cartId, medicamentId, quantity } = req.body;
    const userId = req.user._id;

    console.log('🔍 [updateCartItem] Requête reçue:', { cartId, medicamentId, quantity, userId });

    if (!cartId || !medicamentId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'cartId, medicamentId et quantity (minimum 1) sont requis' });
    }

    const cart = await Cart.findOne({ _id: cartId, userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Panier non trouvé' });
    }

    const item = cart.items.find((item) => item.medicamentId.toString() === medicamentId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé dans le panier' });
    }

    // Vérifier la pharmacie et sa base de données
    const pharmacy = await User.findById(cart.pharmacyId);
    if (!pharmacy || !pharmacy.pharmacieInfo?.baseMedicament) {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée ou base de données non configurée' });
    }

    // Utiliser la base de données spécifique de la pharmacie
    const connection = mongoose.connection.useDb(pharmacy.pharmacieInfo.baseMedicament);
    const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');
    const medicament = await MedicamentModel.findById(medicamentId);
    if (!medicament) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
    }
    if (quantity > medicament.quantite_stock) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant pour la quantité demandée' });
    }

    item.quantity = quantity;
    cart.updatedAt = new Date();
    await cart.save();

    console.log('✅ [updateCartItem] Quantité mise à jour:', { cartId, medicamentId, quantity });
    res.json({ success: true, message: 'Quantité mise à jour', data: cart });
  } catch (error) {
    console.error('❌ [updateCartItem] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});





module.exports = router;