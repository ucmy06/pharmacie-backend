// C:\reactjs node mongodb\pharmacie-backend\src\utils\emailUtils.js

const nodemailer = require('nodemailer');

// Configuration du transporteur email
const createTransporter = () => {
  // Configuration pour Gmail en production et développement
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'julienguenoukpati825@gmail.com',
      pass: process.env.EMAIL_PASS || 'Jul26531' // Mot de passe d'application Gmail
    }
  });
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

/**
 * Envoie un email de confirmation d'approbation à la pharmacie
 * @param {Object} pharmacieData - Données de la pharmacie
 * @param {string} status - 'approuvee' ou 'rejetee'
 * @param {string} motifRejet - Motif en cas de rejet
 */
const sendPharmacyStatusNotification = async (pharmacieData, status, motifRejet = '') => {
  try {
    const transporter = createTransporter();
    
    const isApproved = status === 'approuvee';
    const subject = isApproved 
      ? '✅ Votre pharmacie a été approuvée - PharmOne'
      : '❌ Décision concernant votre demande - PharmOne';
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'PharmOne <julienguenoukpati825@gmail.com>',
      to: pharmacieData.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, ${isApproved ? '#28a745, #20c997' : '#dc3545, #fd7e14'}); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">${isApproved ? '✅ Félicitations !' : '❌ Décision'}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bonjour ${pharmacieData.prenom} ${pharmacieData.nom} 👋</h2>
            
            ${isApproved ? `
              <p style="color: #666; line-height: 1.6; font-size: 16px;">
                Excellente nouvelle ! Votre pharmacie <strong>"${pharmacieData.nomPharmacie}"</strong> 
                a été approuvée et est maintenant active sur la plateforme PharmOne. 🎉
              </p>
              
              <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #155724; margin-top: 0; font-size: 18px;">🚀 Prochaines étapes :</h3>
                <ul style="color: #155724; margin: 10px 0; line-height: 1.8;">
                  <li>Connectez-vous à votre espace pharmacie</li>
                  <li>Configurez vos heures d'ouverture</li>
                  <li>Définissez vos périodes de garde</li>
                  <li>Commencez à gérer votre stock</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" 
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
                Nous avons examiné votre demande d'inscription pour la pharmacie 
                <strong>"${pharmacieData.nomPharmacie}"</strong>.
              </p>
              
              <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #721c24; margin-top: 0; font-size: 18px;">❌ Demande non approuvée</h3>
                <p style="color: #721c24; margin: 10px 0; line-height: 1.6;">
                  <strong>Motif :</strong> ${motifRejet || 'Les documents fournis nécessitent une vérification supplémentaire.'}
                </p>
              </div>
              
              <p style="color: #666; line-height: 1.6; font-size: 16px;">
                Vous pouvez soumettre une nouvelle demande avec les corrections nécessaires.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/pharmacy/register" 
                   style="background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); 
                          color: white; 
                          padding: 15px 30px; 
                          text-decoration: none; 
                          border-radius: 25px; 
                          font-weight: bold;
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);">
                  🔄 Nouvelle demande
                </a>
              </div>
            `}
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Pour toute question, contactez notre support à julienguenoukpati825@gmail.com<br>
              PharmOne - Votre plateforme pharmaceutique de confiance
            </p>
          </div>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email de ${status} envoyé à la pharmacie:`, info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Erreur email pharmacie:', error);
    throw new Error(`Erreur lors de l'envoi de l'email de ${status}`);
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

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendPharmacyRequestNotification,
  sendPharmacyStatusNotification,
  testEmailConfiguration,
  sendTestEmail
};