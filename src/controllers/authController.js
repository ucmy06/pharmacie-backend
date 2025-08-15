// C:\reactjs node mongodb\pharmacie-backend\src\controllers\authController.js
console.log('🔍 Début du chargement de authController.js');

console.log('🔍 Importation de User et ConnexionPharmacie');
const { User, ConnexionPharmacie } = require('../models/User');

console.log('🔍 Importation de generateToken');
const { generateToken } = require('../utils/tokenUtils');

console.log('🔍 Importation de emailUtils');
const { sendResetPasswordEmail, sendPharmacyRequestNotification, sendVerificationEmail } = require('../utils/emailUtils');

console.log('🔍 Importation de crypto');
const crypto = require('crypto');

console.log('🔍 Importation de logUtils');
const { createDetailedLog } = require('../utils/logUtils');

console.log('🔍 Importation de authenticate');
const { authenticate } = require('../middlewares/auth');

console.log('🔍 Définition de register');
const register = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasse, adresse, dateNaissance, sexe } = req.body;
    if (!nom || !prenom || !email || !telephone || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }
    const existingUser = await User.findOne({ 
      $or: [{ email }, { telephone }] 
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email ou ce téléphone existe déjà'
      });
    }
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
    const verificationToken = newUser.generateVerificationToken();
    await newUser.save();
    try {
      await sendVerificationEmail(email, verificationToken, `${prenom} ${nom}`);
      console.log('✅ Email de vérification envoyé avec succès');
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
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
console.log('🔍 register défini');

console.log('🔍 Définition de verifyEmail');
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    console.log("🔑 =====  DÉBUT VÉRIFICATION EMAIL =====");
    console.log("🔑 Token reçu côté backend:", token);
    console.log("🔑 Longueur du token:", token?.length);
    console.log("🔑 Type du token:", typeof token);
    if (!token) {
      console.log("❌ Token manquant dans les paramètres");
      return res.status(400).json({
        success: false,
        message: 'Token de vérification manquant'
      });
    }
    console.log("🔍 Recherche de l'utilisateur dans la base...");
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    console.log("👤 Utilisateur trouvé:", user ? "OUI" : "NON");
    if (!user) {
      console.log("⚠️ Aucun utilisateur avec ce token ou token expiré");
      const verifiedUser = await User.findOne({ verificationToken: token });
      if (verifiedUser && verifiedUser.isVerified) {
        console.log("✅ Utilisateur déjà vérifié:", verifiedUser.email);
        return res.status(200).json({
          success: true,
          message: 'Email déjà vérifié. Votre compte est actif.',
          code: 'ALREADY_VERIFIED'
        });
      }
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
    if (user.isVerified) {
      console.log("ℹ️ Email déjà vérifié pour:", user.email);
      return res.status(200).json({
        success: true,
        message: 'Email déjà vérifié. Votre compte est actif.',
        code: 'ALREADY_VERIFIED'
      });
    }
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
console.log('🔍 verifyEmail défini');

console.log('🔍 Définition de login');
const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      createDetailedLog('CONNEXION_CLIENT_ECHEC', {
        raison: 'CHAMPS_REQUIS_MANQUANTS',
        email,
        headers: req.headers,
      });
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis',
      });
    }
    createDetailedLog('CONNEXION_CLIENT_DEBUT', {
      email,
      motDePasse: `[MASQUÉ - ${motDePasse.length} caractères]`,
      headers: req.headers,
    });
    const user = await User.findOne({ email });
    if (!user) {
      createDetailedLog('CONNEXION_CLIENT_ECHEC', {
        raison: 'UTILISATEUR_NON_TROUVE',
        email,
      });
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect',
      });
    }
    const isMatch = await user.comparePassword(motDePasse);
    if (!isMatch) {
      createDetailedLog('CONNEXION_CLIENT_ECHEC', {
        raison: 'MOT_DE_PASSE_INCORRECT',
        email,
      });
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect',
      });
    }
    if (!user.isVerified) {
      createDetailedLog('CONNEXION_CLIENT_ECHEC', {
        raison: 'EMAIL_NON_VERIFIE',
        email,
      });
      return res.status(401).json({
        success: false,
        message: 'Veuillez vérifier votre email avant de vous connecter',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    if (!user.isActive) {
      createDetailedLog('CONNEXION_CLIENT_ECHEC', {
        raison: 'COMPTE_DESACTIVE',
        email,
      });
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé',
      });
    }
    user.lastLogin = new Date();
    await user.save();
    const token = generateToken(user);
    const isTemporaryPassword = Boolean(user.motDePasseTemporaire);
    createDetailedLog('CONNEXION_CLIENT_REUSSIE', {
      userId: user._id,
      email: user.email,
      role: user.role,
      motDePasseTemporaire: isTemporaryPassword,
      token: `[TOKEN - ${token.length} caractères]`,
    });
    if (isTemporaryPassword) {
      return res.status(200).json({
        success: true,
        message: 'Connexion avec mot de passe temporaire. Veuillez le changer.',
        motDePasseTemporaire: true,
        data: {
          token,
          user: user.getPublicProfile(),
        },
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      motDePasseTemporaire: false,
      data: {
        token,
        user: user.getPublicProfile(),
      },
    });
  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    createDetailedLog('ERREUR_CONNEXION_CLIENT', {
      erreur: error.message,
      stack: error.stack,
      email: req.body.email,
    });
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion',
    });
  }
};
console.log('🔍 login défini');

console.log('🔍 Définition de forgotPassword');
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
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    try {
      await sendResetPasswordEmail(email, resetToken, `${user.prenom} ${user.nom}`);
      console.log('✅ Email de réinitialisation envoyé');
    } catch (emailError) {
      console.error('❌ Erreur envoi email reset:', emailError);
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
console.log('🔍 forgotPassword défini');

console.log('🔍 Définition de resetPassword');
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
console.log('🔍 resetPassword défini');

console.log('🔍 Définition de resendVerificationEmail');
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
    const verificationToken = user.generateVerificationToken();
    await user.save();
    console.log("🔑 Nouveau token généré:", verificationToken);
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
console.log('🔍 resendVerificationEmail défini');

console.log('🔍 Définition de getProfile');
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
console.log('🔍 getProfile défini');

console.log('🔍 Définition de demandeComptePharmacie');
const demandeComptePharmacie = async (req, res) => {
  try {
    console.log("🟢 Fichier reçu (req.files):", req.files);
    console.log("🟢 Données reçues (req.body):", req.body);
    console.log("🟢 Utilisateur connecté (req.user):", req.user);
    const { nomPharmacie, emailPharmacie, telephonePharmacie, adresseGoogleMaps } = req.body;
    const documentsVerification = req.files['documentsVerification'] || [];
    const photoPharmacieFile = req.files['photoPharmacie']?.[0] || null;
    if (!nomPharmacie || !emailPharmacie || !telephonePharmacie || !adresseGoogleMaps || documentsVerification.length === 0) {
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
    await sendPharmacyRequestNotification({
      nomPharmacie: req.body.nomPharmacie,
      adresseGoogleMaps: req.body.adresseGoogleMaps,
      nom: req.user.nom,
      prenom: req.user.prenom,
      email: req.user.email,
      telephone: req.user.telephone,
      livraisonDisponible: false
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
console.log('🔍 demandeComptePharmacie défini');

console.log('🔍 Définition de connexionPharmacie');
const connexionPharmacie = async (req, res) => {
  try {
    console.log('🔍 Exécution de connexionPharmacie');
    const { pharmacyId, typeConnexion, motDePasse } = req.body;
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }
    const pharmacie = await User.findOne({
      _id: pharmacyId,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    }).select('+motDePasse');
    if (!pharmacie) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée ou non approuvée',
      });
    }
    const isMatch = await pharmacie.comparePassword(motDePasse);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
      });
    }
    const connexion = new ConnexionPharmacie({
      utilisateur: req.user._id,
      pharmacie: pharmacyId,
      typeConnexion: typeConnexion || 'consultation',
      informationsUtilisateur: {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        adresse: req.user.adresse,
      },
    });
    await connexion.save();
    const token = generateToken(pharmacie);
    createDetailedLog('CONNEXION_PHARMACIE_REUSSIE', {
      userId: req.user._id,
      pharmacyId,
      email: pharmacie.email,
      typeConnexion,
      token: `[TOKEN - ${token.length} caractères]`,
    });
    res.json({
      success: true,
      message: 'Connexion à la pharmacie réussie',
      data: {
        token,
        pharmacie: {
          _id: pharmacie._id,
          nom: pharmacie.nom,
          prenom: pharmacie.prenom,
          email: pharmacie.email,
          role: pharmacie.role,
          nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
          adresseGoogleMaps: pharmacie.pharmacieInfo.adresseGoogleMaps,
          livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
          estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
          heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture,
        },
        connexionId: connexion._id,
      },
    });
  } catch (error) {
    console.error('❌ Erreur connexion pharmacie:', error);
    createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.body.pharmacyId,
      userId: req.user?._id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion à la pharmacie',
    });
  }
};
console.log('🔍 connexionPharmacie défini');

console.log('🔍 Vérification des fonctions avant exportation');
console.log('🔍 register:', typeof register);
console.log('🔍 verifyEmail:', typeof verifyEmail);
console.log('🔍 login:', typeof login);
console.log('🔍 forgotPassword:', typeof forgotPassword);
console.log('🔍 resetPassword:', typeof resetPassword);
console.log('🔍 resendVerificationEmail:', typeof resendVerificationEmail);
console.log('🔍 getProfile:', typeof getProfile);
console.log('🔍 demandeComptePharmacie:', typeof demandeComptePharmacie);
console.log('🔍 connexionPharmacie:', typeof connexionPharmacie);

console.log('🔍 Définition de updateProfile');
const updateProfile = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, adresse, dateNaissance, sexe } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    user.nom = nom || user.nom;
    user.prenom = prenom || user.prenom;
    user.email = email || user.email;
    user.telephone = telephone || user.telephone;
    user.adresse = adresse || user.adresse;
    user.dateNaissance = dateNaissance || user.dateNaissance;
    user.sexe = sexe || user.sexe;
    await user.save();
    createDetailedLog('MISE_A_JOUR_PROFIL', {
      userId: user._id,
      email: user.email,
      updatedFields: req.body
    });
    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du profil'
    });
  }
};
console.log('🔍 updateProfile défini');

console.log('🔍 Définition de updatePassword');
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe actuel et nouveau mot de passe requis'
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe doit contenir au moins 6 caractères'
      });
    }
    const user = await User.findById(req.user._id).select('+motDePasse');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect'
      });
    }
    user.motDePasse = newPassword;
    user.motDePasseTemporaire = false;
    await user.save();
    createDetailedLog('CHANGEMENT_MOT_DE_PASSE', {
      userId: user._id,
      email: user.email
    });
    res.json({
      success: true,
      message: 'Mot de passe modifié avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur changement mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de mot de passe'
    });
  }
};
console.log('🔍 updatePassword défini');

console.log('🔍 Exportations de authController:', Object.keys(module.exports));
module.exports = {}; // Vider module.exports
module.exports = {
  register,
  verifyEmail,
  login,
  demandeComptePharmacie,
  connexionPharmacie,
  forgotPassword,
  resetPassword,
  resendVerificationEmail,
  getProfile,
  updateProfile, // AJOUT
  updatePassword // AJOUT
};
console.log('🔍 module.exports défini');
console.log('🔍 Exportations de authController après assignation:', Object.keys(module.exports));