require('dotenv').config();
const { sendVerificationEmail } = require('./src/utils/emailUtils');

(async () => {
  try {
    await sendVerificationEmail(
      'alextesler17@gmail.com', // ou un autre email test
      'fake-verification-token-123456',
      'Utilisateur Test'
    );
    console.log('✅ Email de vérification envoyé avec succès.');
  } catch (error) {
    console.error('❌ Erreur lors de l’envoi de l’email :', error.message);
  }
})();
