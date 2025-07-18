// C:\reactjs node mongodb\pharmacie-backend\src\controllers\authController.js  

const { User, ConnexionPharmacie } = require('../models/User');
const { generateToken } = require('../utils/tokenUtils');
const { sendResetPasswordEmail, sendPharmacyRequestNotification, sendVerificationEmail } = require('../utils/emailUtils');
const crypto = require('crypto');

/**
 * Inscription d'un nouvel utilisateur (client par défaut)
 */
const register = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasse, adresse, dateNaissance, sexe } = req.body;

    // Validation des champs obligatoires
    if (!nom || !prenom || !email || !telephone || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ 
      $or: [{ email }, { telephone }] 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email ou ce téléphone existe déjà'
      });
    }

    // Créer un nouvel utilisateur
    const newUser = new User({
      nom,
      prenom,
      email,
      telephone,
      motDePasse,
      adresse,
      dateNaissance,
      sexe,
      role: 'client',
      isActive: true,
      isVerified: false
    });

    // Générer un token de vérification
    const verificationToken = newUser.generateVerificationToken();
    await newUser.save();

    // Envoyer l'email de vérification
    try {
      await sendVerificationEmail(email, verificationToken, `${prenom} ${nom}`);
      console.log('✅ Email de vérification envoyé avec succès');
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
      // Ne pas faire échouer l'inscription si l'email ne part pas
    }

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
      data: {
        userId: newUser._id,
        email: newUser.email,
        nom: newUser.nom,
        prenom: newUser.prenom,
        role: newUser.role,
        isVerified: newUser.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription'
    });
  }
};

/**
 * Vérification de l'email - VERSION AMÉLIORÉE AVEC DEBUG
 */
/**
 * Vérification de l'email - VERSION AMÉLIORÉE AVEC GESTION DU DOUBLE APPEL
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log("🔑 =====  DÉBUT VÉRIFICATION EMAIL =====");
    console.log("🔑 Token reçu côté backend:", token);
    console.log("🔑 Longueur du token:", token?.length);
    console.log("🔑 Type du token:", typeof token);
    
    // Vérifier que le token existe
    if (!token) {
      console.log("❌ Token manquant dans les paramètres");
      return res.status(400).json({
        success: false,
        message: 'Token de vérification manquant'
      });
    }

    // Rechercher l'utilisateur avec ce token
    console.log("🔍 Recherche de l'utilisateur dans la base...");
    
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    console.log("👤 Utilisateur trouvé:", user ? "OUI" : "NON");
    
    if (!user) {
      console.log("⚠️ Aucun utilisateur avec ce token ou token expiré");
      
      // Vérifier si l'utilisateur existe déjà mais est déjà vérifié
      const verifiedUser = await User.findOne({
        verificationToken: token
      });
      
      if (verifiedUser && verifiedUser.isVerified) {
        console.log("✅ Utilisateur déjà vérifié:", verifiedUser.email);
        return res.status(200).json({
          success: true,
          message: 'Email déjà vérifié. Votre compte est actif.',
          code: 'ALREADY_VERIFIED'
        });
      }
      
      // Vérifier si le token existe mais est expiré
      if (verifiedUser) {
        console.log("⏰ Token trouvé mais expiré pour:", verifiedUser.email);
        console.log("⏰ Expiration:", verifiedUser.verificationTokenExpires);
        console.log("⏰ Maintenant:", new Date(Date.now()));
        
        return res.status(400).json({
          success: false,
          message: 'Token de vérification expiré. Veuillez demander un nouveau lien.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Token de vérification invalide',
        code: 'INVALID_TOKEN'
      });
    }

    console.log("✅ Utilisateur trouvé:", user.email);
    console.log("📧 Email déjà vérifié:", user.isVerified);
 
    // Vérifier si l'email est déjà vérifié
    if (user.isVerified) {
      console.log("ℹ️ Email déjà vérifié pour:", user.email);
      return res.status(200).json({
        success: true,
        message: 'Email déjà vérifié. Votre compte est actif.',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Mettre à jour l'utilisateur
    console.log("📝 Mise à jour de l'utilisateur...");
    
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    
    await user.save();
    
    console.log("✅ Utilisateur mis à jour avec succès");
    console.log("🔑 =====  FIN VÉRIFICATION EMAIL =====");

    res.status(200).json({
      success: true,
      message: 'Email vérifié avec succès. Votre compte est maintenant actif.',
      code: 'VERIFICATION_SUCCESS'
    });

  } catch (error) {
    console.error('❌ =====  ERREUR VÉRIFICATION EMAIL =====');
    console.error('❌ Type d\'erreur:', error.name);
    console.error('❌ Message:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('❌ =====  FIN ERREUR =====');
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification de l\'email',
      code: 'SERVER_ERROR'
    });
  }
};
/**
 * Connexion d'un utilisateur
 */
/**
 * Connexion d'un utilisateur - VERSION CORRIGÉE
 */
/**
 * Connexion d'un utilisateur - VERSION CORRIGÉE ET AMÉLIORÉE
 */
const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    // Validation des champs
    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.comparePassword(motDePasse);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est vérifié
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Veuillez vérifier votre email avant de vous connecter',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // Générer le token
    const token = generateToken(user);

    // ✅ VÉRIFICATION EXPLICITE DU MOT DE PASSE TEMPORAIRE
    const isTemporaryPassword = Boolean(user.motDePasseTemporaire);
    
    console.log('🔑 Connexion utilisateur:', {
      email: user.email,
      role: user.role,
      motDePasseTemporaire: isTemporaryPassword,
      rawValue: user.motDePasseTemporaire
    });

    // ✅ RÉPONSE AVEC MOT DE PASSE TEMPORAIRE
    if (isTemporaryPassword) {
      console.log('⚠️ Utilisateur avec mot de passe temporaire:', user.email);
      return res.status(200).json({
        success: true,
        message: 'Connexion avec mot de passe temporaire. Veuillez le changer.',
        motDePasseTemporaire: true, // ✅ Explicitement true
        data: {
          token,
          user: user.getPublicProfile()
        }
      });
    }

    // ✅ RÉPONSE CONNEXION NORMALE
    console.log('✅ Connexion normale pour:', user.email, 'Role:', user.role);
    
    return res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      motDePasseTemporaire: false, // ✅ Explicitement false
      data: {
        token,
        user: user.getPublicProfile()
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion'
    });
  }
};

/**
 * Mot de passe oublié
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Aucun utilisateur trouvé avec cet email'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 heure

    await user.save();

    // Envoyer l'email
    try {
      await sendResetPasswordEmail(email, resetToken, `${user.prenom} ${user.nom}`);
      console.log('✅ Email de réinitialisation envoyé');
    } catch (emailError) {
      console.error('❌ Erreur envoi email reset:', emailError);
      // Continuer même si l'email ne part pas
    }

    res.json({
      success: true,
      message: 'Email de réinitialisation envoyé'
    });

  } catch (error) {
    console.error('❌ Erreur mot de passe oublié:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de l\'email'
    });
  }
};

/**
 * Réinitialisation du mot de passe
 */
const resetPassword = async (req, res) => {
  try {
    const { token, nouveauMotDePasse } = req.body;

    if (!token || !nouveauMotDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Token et nouveau mot de passe requis'
      });
    }

    if (nouveauMotDePasse.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 6 caractères'
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }

    // Mettre à jour le mot de passe
    user.motDePasse = nouveauMotDePasse;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur réinitialisation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réinitialisation'
    });
  }
};

/**
 * Renvoyer l'email de vérification - VERSION AMÉLIORÉE
 */
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    console.log("📧 Demande de renvoi d'email pour:", email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ Utilisateur non trouvé:", email);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.isVerified) {
      console.log("ℹ️ Email déjà vérifié pour:", email);
      return res.status(400).json({
        success: false,
        message: 'Le compte est déjà vérifié'
      });
    }

    // Générer un nouveau token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    console.log("🔑 Nouveau token généré:", verificationToken);

    // Envoyer l'email
    try {
      await sendVerificationEmail(email, verificationToken, `${user.prenom} ${user.nom}`);
      console.log('✅ Email de vérification renvoyé à:', email);
    } catch (emailError) {
      console.error('❌ Erreur renvoi email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      });
    }

    res.json({
      success: true,
      message: 'Email de vérification renvoyé avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur renvoi email:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du renvoi de l\'email'
    });
  }
};


/**
 * Obtenir le profil utilisateur
 */
const getProfile = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du profil'
    });
  }
};
const demandeComptePharmacie = async (req, res) => {
  try {
    console.log("🟢 Fichier reçu (req.files):", req.files);
console.log("🟢 Données reçues (req.body):", req.body);
console.log("🟢 Utilisateur connecté (req.user):", req.user);


    const {
      nomPharmacie,
      emailPharmacie,
      telephonePharmacie,
      adresseGoogleMaps
    } = req.body;

    const documentsVerification = req.files['documentsVerification'] || [];
    const photoPharmacieFile = req.files['photoPharmacie']?.[0] || null;

    if (
      !nomPharmacie ||
      !emailPharmacie ||
      !telephonePharmacie ||
      !adresseGoogleMaps ||
      documentsVerification.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs requis doivent être remplis'
      });
    }

    const docs = documentsVerification.map(file => ({
  nomFichier: file.originalname,
  cheminFichier: file.path,
  typeFichier: file.mimetype,
  tailleFichier: file.size,
  dateUpload: new Date()
}));

    const photoPath = photoPharmacieFile?.path || null;

    req.user.demandePharmacie = {
      statutDemande: 'en_attente',
      dateDemande: new Date(),
      informationsPharmacie: {
        nomPharmacie,
        emailPharmacie,
        telephonePharmacie,
        adresseGoogleMaps,
        photoPharmacie: photoPath,
        documentsVerification: docs

      }
    };

    await req.user.save();
  // Notification à l'admin par email (si définie)
  await sendPharmacyRequestNotification({
  nomPharmacie: req.body.nomPharmacie,
  adresseGoogleMaps: req.body.adresseGoogleMaps,
  nom: req.user.nom,
  prenom: req.user.prenom,
  email: req.user.email,
  telephone: req.user.telephone,
  livraisonDisponible: false // si tu n'as pas encore ce champ, force-le à false
});


    return res.json({
      success: true,
      message: 'Demande de création de pharmacie envoyée avec succès',
      data: {
        statutDemande: req.user.demandePharmacie.statutDemande,
        dateDemande: req.user.demandePharmacie.dateDemande
      }
    });

  } catch (error) {
    console.error('❌ Erreur demande pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la demande',
      error: error.message
    });
  }
};



/**
 * Connexion utilisateur à une pharmacie (enregistre la connexion)
 */
const connexionPharmacie = async (req, res) => {
  try {
    const { pharmacieId, typeConnexion } = req.body;

    // Vérifier que la pharmacie existe et est approuvée
    const pharmacie = await User.findOne({
      _id: pharmacieId,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true
    });

    if (!pharmacie) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée ou non approuvée'
      });
    }

    // Enregistrer la connexion
    const connexion = new ConnexionPharmacie({
      utilisateur: req.user._id,
      pharmacie: pharmacieId,
      typeConnexion: typeConnexion || 'consultation',
      informationsUtilisateur: {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        adresse: req.user.adresse
      }
    });

    await connexion.save();

    res.json({
      success: true,
      message: 'Connexion à la pharmacie enregistrée',
      data: {
        pharmacie: {
          _id: pharmacie._id,
          nom: pharmacie.nom,
          prenom: pharmacie.prenom,
          nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
          adresseGoogleMaps: pharmacie.pharmacieInfo.adresseGoogleMaps,
          livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
          estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
          heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture
        },
        connexionId: connexion._id
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion à la pharmacie'
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  login,
  demandeComptePharmacie,
  connexionPharmacie,
  forgotPassword,
  resetPassword,
  resendVerificationEmail,
  getProfile
};