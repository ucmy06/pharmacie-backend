// C:\reactjs node mongodb\pharmacie-backend\src\utils\emailUtils.js

const nodemailer = require('nodemailer');
const transporter = require('./transporter'); // ton transporter nodemailer

// Configuration du transporteur email
const createTransporter = () => {
  // Configuration pour Gmail en production et développement
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS // Mot de passe d'application Gmail
    }
  });
};

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to,
      subject,
      html
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email envoyé à ${to} :`, info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Erreur sendEmail :', error);
    throw new Error('Échec de l’envoi de l’email');
  }
};

/**
 * Envoie un email de vérification de compte
 * @param {string} email - Email du destinataire
 * @param {string} verificationToken - Token de vérification
 * @param {string} userName - Nom complet de l'utilisateur
 */
const sendVerificationEmail = async (email, verificationToken, userName) => {
  try {
    const transporter = createTransporter();

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: email,
      subject: '✅ Vérifiez votre adresse email - PharmOne',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">💊 PharmOne</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Votre plateforme pharmaceutique</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bienvenue ${userName} ! 👋</h2>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Merci de vous être inscrit sur <strong>PharmOne</strong> ! 🎉
            </p>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Pour activer votre compte et commencer à utiliser nos services, veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email :
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                ✅ Vérifier mon email
              </a>
            </div>
            
            <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #1976d2; font-size: 14px;">
                <strong>💡 Important :</strong> Ce lien est valide pendant 24 heures.
              </p>
            </div>
            
            <p style="color: #999; font-size: 14px; line-height: 1.5; margin-top: 30px;">
              Si vous n'avez pas créé de compte sur PharmOne, vous pouvez ignorer cet email en toute sécurité.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Cet email a été envoyé automatiquement par PharmOne.<br>
              Merci de ne pas répondre à cet email.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de vérification envoyé:', info.messageId);
    console.log('📧 Email envoyé à:', email);

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('❌ Erreur envoi email vérification:', error);
    throw new Error("Impossible d'envoyer l'email de vérification");
  }
};

/**
 * Envoie un email de réinitialisation de mot de passe
 * @param {string} email - Email du destinataire
 * @param {string} resetToken - Token de réinitialisation
 * @param {string} userName - Nom complet de l'utilisateur
 */
const sendResetPasswordEmail = async (email, resetToken, userName) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: email,
      subject: '🔐 Réinitialisation de votre mot de passe - PharmOne',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">💊 PharmOne</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Votre plateforme pharmaceutique</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bonjour ${userName} 👋</h2>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Vous avez demandé la réinitialisation de votre mot de passe sur PharmOne.
            </p>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                🔐 Réinitialiser mon mot de passe
              </a>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>⚠️ Important :</strong> Ce lien est valide pendant 1 heure seulement.
              </p>
            </div>
            
            <p style="color: #999; font-size: 14px; line-height: 1.5;">
              Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. 
              Votre mot de passe restera inchangé.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Cet email a été envoyé automatiquement par PharmOne.<br>
              Merci de ne pas répondre à cet email.
            </p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de réinitialisation envoyé:', info.messageId);
    console.log('📧 Email envoyé à:', email);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Erreur envoi email reset:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email de réinitialisation');
  }
};

/**
 * Envoie un email de notification à l'admin pour nouvelle demande pharmacie
 * @param {Object} pharmacieData - Données de la pharmacie
 */
const sendPharmacyRequestNotification = async (pharmacieData) => {
  try {
    const transporter = createTransporter();
    
    const adminEmail = process.env.ADMIN_EMAIL || 'julienguenoukpati825@gmail.com';
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: adminEmail,
      subject: '🏥 Nouvelle demande d\'inscription pharmacie - PharmOne',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🏥 Nouvelle Demande</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Inscription Pharmacie</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Détails de la demande</h2>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555; width: 40%;">🏪 Nom de la pharmacie:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.nomPharmacie}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">👤 Responsable:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.prenom} ${pharmacieData.nom}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📧 Email:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.email}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📱 Téléphone:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.telephone}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📍 Adresse:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.adresseGoogleMaps}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">🚚 Livraison:</td>
                  <td style="padding: 10px 0; color: #333;">${pharmacieData.livraisonDisponible ? '✅ Disponible' : '❌ Non disponible'}</td>
                </tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/pharmacy-requests" 
                 style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
                🔍 Examiner la demande
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
              Connectez-vous à votre interface d'administration pour approuver ou rejeter cette demande.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Notification automatique - PharmOne Admin
            </p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Notification admin envoyée:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Erreur notification admin:', error);
    throw new Error('Erreur lors de l\'envoi de la notification admin');
  }
};

const sendPharmacyRequestStatusEmail = async (recipientEmail, statut, pharmacyInfo = {}, motDePasse = '') => {
  try {
    const isApproved = statut === 'approuvee';
    const subject = isApproved
      ? '✅ Votre pharmacie a été approuvée - PharmOne'
      : '❌ Décision concernant votre demande - PharmOne';

    const prenom = pharmacyInfo.prenom || 'Cher(e)';
    const nom = pharmacyInfo.nom || 'demandeur';
    const nomPharmacie = pharmacyInfo.nomPharmacie || 'votre pharmacie';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, ${isApproved ? '#28a745, #20c997' : '#dc3545, #fd7e14'}); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">${isApproved ? '✅ Félicitations !' : '❌ Décision'}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bonjour ${prenom} ${nom} 👋</h2>
          ${isApproved ? `
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Votre pharmacie <strong>"${nomPharmacie}"</strong> a été approuvée ! 🎉
              Voici votre mot de passe temporaire : <strong>${motDePasse}</strong>
            </p>
            <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${process.env.PHARMACY_LOGIN_PATH || '/pharmacie/connexion'}" 
               style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: bold;
                      font-size: 16px;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
                🏥 Accéder à mon espace
              </a>
            </div>
          ` : `
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Votre demande pour <strong>"${nomPharmacie}"</strong> a été rejetée.
            </p>
          `}
        </div>
      </div>
    `;

    await sendEmail(recipientEmail, subject, html);
    console.log(`✅ Email de statut (${statut}) envoyé à :`, recipientEmail);
  } catch (error) {
    console.error('❌ Erreur envoi email statut:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email de statut');
  }
};

/**
 * Test de la configuration email
 */
const testEmailConfiguration = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Configuration email Gmail OK');
    return true;
  } catch (error) {
    console.error('❌ Erreur configuration email:', error);
    console.error('Vérifiez vos identifiants Gmail et le mot de passe d\'application');
    return false;
  }
};

/**
 * Envoie un email avec le mot de passe généré à la pharmacie
 */
const sendGeneratedPasswordToPharmacy = async (email, password) => {
  const subject = 'Accès à votre compte Pharmacie';
  const html = `
    <h2>Bienvenue dans PharmOne !</h2>
    <p>Votre compte pharmacie a été approuvé.</p>
    <p>🔐 Voici votre mot de passe temporaire : <strong>${password}</strong></p>
    <p>Vous pourrez le modifier à votre première connexion.</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Envoie un email de test
 */
const sendTestEmail = async () => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: 'julienguenoukpati825@gmail.com',
      subject: '🧪 Test Email - PharmOne',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Test Email PharmOne</h2>
          <p>Ceci est un email de test pour vérifier la configuration.</p>
          <p><strong>Date/Heure :</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <p style="color: #28a745;">✅ Configuration email fonctionnelle !</p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email de test envoyé:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Erreur test email:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email de test');
  }
};

/**
 * Envoie un email d'approbation à la pharmacie
 */
const sendPharmacyApprovalEmail = async (recipientEmail, pharmacyInfo) => {
  try {
    const subject = `Pharmacie approuvée sur PharmOne`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">✅ Félicitations !</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-top: 0; font-size: 24px;">Votre pharmacie a été approuvée ! 🎉</h2>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">
            Votre pharmacie <strong>"${pharmacyInfo.nom}"</strong> est maintenant active sur PharmOne.
          </p>
          <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #155724; margin-top: 0; font-size: 18px;">🔐 Vos informations de connexion :</h3>
            <p style="color: #155724; margin: 10px 0; line-height: 1.8;">
              <strong>Email :</strong> ${recipientEmail}<br>
              <strong>Mot de passe temporaire :</strong> ${pharmacyInfo.motDePasse}
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${process.env.PHARMACY_LOGIN_PATH || '/pharmacie/connexion'}" 
               style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: bold;
                      font-size: 16px;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
              🏥 Accéder à mon espace
            </a>
          </div>
        </div>
      </div>
    `;

    await sendEmail(recipientEmail, subject, html);
    console.log('✅ Email d\'approbation envoyé à:', recipientEmail);
  } catch (error) {
    console.error('❌ Erreur envoi email approbation:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email d\'approbation');
  }
};

/**
 * Envoie un email de notification pour une connexion à une pharmacie
 */
const sendPharmacyAccessNotification = async (pharmacieEmail, clientInfo) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"PharmOne" <${process.env.EMAIL_FROM}>`,
      to: pharmacieEmail,
      subject: 'Connexion à votre compte pharmacie',
      html: `
        <p>Bonjour,</p>
        <p>Un utilisateur client s'est connecté à votre compte pharmacie via l'application PharmOne.</p>
        <h3>Informations du client :</h3>
        <ul>
          <li><strong>Nom :</strong> ${clientInfo.nom}</li>
          <li><strong>Prénom :</strong> ${clientInfo.prenom}</li>
          <li><strong>Email :</strong> ${clientInfo.email}</li>
        </ul>
        <p>Date de connexion : <strong>${new Date().toLocaleString()}</strong></p>
        <p>Si cette connexion ne vous semble pas légitime, veuillez contacter l'administration.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Notification d\'accès envoyée à:', pharmacieEmail);
  } catch (error) {
    console.error('❌ Erreur envoi notification accès:', error);
    throw new Error('Erreur lors de l\'envoi de la notification d\'accès');
  }
};

/**
 * Envoie un email de notification à l'admin pour une demande de suppression de pharmacie
 */
const sendSuppressionRequestEmail = async (pharmacie) => {
  try {
    const subject = `Demande de suppression - Pharmacie ${pharmacie.pharmacieInfo.nomPharmacie}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(135deg, #dc3545, #fd7e14); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">❌ Demande de suppression</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne Admin</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-top: 0; font-size: 24px;">Nouvelle demande de suppression</h2>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">
            La pharmacie suivante a demandé la suppression de son compte :
          </p>
          <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #721c24; margin: 10px 0; line-height: 1.8;">
              <strong>Nom :</strong> ${pharmacie.pharmacieInfo.nomPharmacie}<br>
              <strong>Email :</strong> ${pharmacie.email}<br>
              <strong>Numéro :</strong> ${pharmacie.telephone}
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/pharmacy-requests" 
               style="background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: bold;
                      font-size: 16px;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);">
              🔍 Examiner la demande
            </a>
          </div>
        </div>
      </div>
    `;

    await sendEmail(process.env.ADMIN_EMAIL, subject, html);
    console.log('✅ Email de demande de suppression envoyé à:', process.env.ADMIN_EMAIL);
  } catch (error) {
    console.error('❌ Erreur envoi email suppression:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email de suppression');
  }
};
/**
 * Envoie un email de notification à l'admin pour une demande de modification de pharmacie
 * @param {Object} modificationData - Données de la demande de modification
 */
const sendPharmacyModificationRequestNotification = async (modificationData) => {
  try {
    const transporter = createTransporter();
    
    const adminEmail = process.env.ADMIN_EMAIL || 'julienguenoukpati825@gmail.com';
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: adminEmail,
      subject: '🏥 Nouvelle demande de modification de pharmacie - PharmOne',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🏥 Demande de modification</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne Admin</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Détails de la demande</h2>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555; width: 40%;">🏪 Nom de la pharmacie:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.nomPharmacie}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">👤 Responsable:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.prenom} ${modificationData.nom}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📧 Email:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.email}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📱 Téléphone:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.telephone}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">📍 Adresse:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.adresseGoogleMaps}</td>
                </tr>
                ${modificationData.photo ? `
                <tr>
                  <td style="padding: 10px 0; font-weight: bold; color: #555;">🖼️ Nouvelle photo:</td>
                  <td style="padding: 10px 0; color: #333;">${modificationData.photo.nomFichier}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/pharmacy-modification-requests" 
                 style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
                🔍 Examiner la demande
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
              Connectez-vous à votre interface d'administration pour approuver ou rejeter cette demande de modification.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Notification automatique - PharmOne Admin
            </p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Notification de modification admin envoyée:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Erreur notification modification admin:', error);
    throw new Error('Erreur lors de l\'envoi de la notification de modification admin');
  }
};


const sendPharmacyAccessPassword = async (email, nomPharmacie, nomUtilisateur, motDePasse) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Accès approuvé à la pharmacie ${nomPharmacie}`,
    html: `
      <h1>Accès approuvé</h1>
      <p>Bonjour ${nomUtilisateur},</p>
      <p>Votre demande d'accès à la pharmacie ${nomPharmacie} a été approuvée.</p>
      <p>Utilisez le mot de passe suivant pour vous connecter : <strong>${motDePasse}</strong></p>
      <p>Pour des raisons de sécurité, veuillez changer ce mot de passe après votre première connexion.</p>
      <p>Cordialement,<br>L'équipe PharmOne</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ E-mail envoyé à ${email} avec le mot de passe`);
};

const sendIntegrationRequestNotification = async (data) => {
  const { nomPharmacie, nom, prenom, email, telephone, message, recipientEmail } = data;
  
  const transporter = createTransporter(); // Utiliser createTransporter
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipientEmail, // Email du createdBy
    subject: `Nouvelle demande d'intégration pour ${nomPharmacie}`,
    text: `
      Nouvelle demande d'intégration reçue pour ${nomPharmacie} :
      Nom : ${prenom} ${nom}
      Email : ${email}
      Téléphone : ${telephone}
      Message : ${message || 'Aucun message fourni'}
      Veuillez examiner cette demande dans votre tableau de bord à l'adresse : http://localhost:3000/pharmacie/demandes-integration
    `,
    html: `
      <h2>Nouvelle demande d'intégration pour ${nomPharmacie}</h2>
      <p><strong>Nom :</strong> ${prenom} ${nom}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Téléphone :</strong> ${telephone}</p>
      <p><strong>Message :</strong> ${message || 'Aucun message fourni'}</p>
      <p>Veuillez examiner cette demande dans votre <a href="http://localhost:3000/pharmacie/demandes-integration">tableau de bord</a>.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('📧 Notification de demande d\'intégration envoyée à:', recipientEmail);
  } catch (error) {
    console.error('❌ Erreur envoi email notification:', error);
    throw error;
  }
};

/**
 * Envoie une confirmation au client qui a soumis une demande d'intégration
 * @param {Object} data - Données de la demande
 */
const sendClientIntegrationRequestConfirmation = async (data) => {
  const { nomPharmacie, nom, prenom, email, telephone, message } = data;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">💊 PharmOne</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Confirmation de votre demande</p>
      </div>
      <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bonjour ${prenom} ${nom} 👋</h2>
        <p style="color: #666; line-height: 1.6; font-size: 16px;">
          Votre demande d'intégration à la pharmacie <strong>${nomPharmacie}</strong> a été envoyée avec succès.
        </p>
        <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="color: #333; margin: 10px 0; line-height: 1.8;">
            <strong>Nom :</strong> ${prenom} ${nom}<br>
            <strong>Email :</strong> ${email}<br>
            <strong>Téléphone :</strong> ${telephone}<br>
            <strong>Message :</strong> ${message || 'Aucun message fourni'}
          </p>
        </div>
        <p style="color: #666; line-height: 1.6; font-size: 16px;">
          Vous recevrez une notification par e-mail une fois que votre demande aura été examinée par l'administrateur de la pharmacie.
        </p>
        <p style="color: #666; line-height: 1.6; font-size: 16px;">
          Vous pouvez vérifier l'état de votre demande dans votre <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/ma-demande-pharmacie">tableau de bord</a>.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          Cet email a été envoyé automatiquement par PharmOne.<br>
          Merci de ne pas répondre à cet email.
        </p>
      </div>
    </div>
  `;

  try {
    await sendEmail(email, `Confirmation de votre demande d'intégration à ${nomPharmacie}`, html);
    console.log('📧 Confirmation de demande d\'intégration envoyée à:', email);
  } catch (error) {
    console.error('❌ Erreur envoi email confirmation:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendPharmacyRequestNotification,
  sendIntegrationRequestNotification,
  testEmailConfiguration,
  sendTestEmail,
  sendPharmacyApprovalEmail,
  sendPharmacyRequestStatusEmail,
  sendGeneratedPasswordToPharmacy,
  sendPharmacyAccessNotification,
  sendSuppressionRequestEmail, // Fixed export
  sendPharmacyModificationRequestNotification,
  sendPharmacyAccessPassword,
  sendClientIntegrationRequestConfirmation,
  sendEmail
};