// C:\reactjs node mongodb\pharmacie-backend\src\utils\transporter.js


const nodemailer = require('nodemailer');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new Error('Les variables d\'environnement EMAIL_USER et EMAIL_PASS doivent être définies.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = transporter;