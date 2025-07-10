require('dotenv').config(); // charge les variables d'environnement
const { sendVerificationEmail } = require('./src/utils/emailUtils');

(async () => {
  try {
    await sendVerificationEmail(
      'alextesler17@gmail.com', // ← Remplace par un vrai email
      'faketoken1234567890',
      'Utilisateur Test'
    );
    console.log('✅ Email de vérification envoyé avec succès.');
  } catch (error) {
    console.error('❌ Erreur lors de l’envoi de l’email :', error.message);
  }
})();
