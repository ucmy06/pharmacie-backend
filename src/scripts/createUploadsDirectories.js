// C:\reactjs node mongodb\pharmacie-backend\src\scripts\createUploadsDirectories.js

const fs = require('fs');
const path = require('path');

/**
 * Créer les dossiers nécessaires pour les uploads
 */
const createUploadsDirectories = () => {
  try {
    const baseDir = path.join(__dirname, '../../uploads');
    
    const directories = [
      'uploads',
      'uploads/pharmacies',
      'uploads/pharmacies/photos',
      'uploads/pharmacies/documents',
      'uploads/users',
      'uploads/temp'
    ];

    directories.forEach(dir => {
      const fullPath = path.join(__dirname, '../../', dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ Dossier créé: ${dir}`);
      } else {
        console.log(`📁 Dossier existe déjà: ${dir}`);
      }
    });

    // Créer le fichier .gitkeep pour maintenir les dossiers vides dans git
    directories.slice(1).forEach(dir => {
      const gitkeepPath = path.join(__dirname, '../../', dir, '.gitkeep');
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '# Conserver ce dossier dans git');
      }
    });

    console.log('🎉 Structure des dossiers uploads créée avec succès!');
    
  } catch (error) {
    console.error('❌ Erreur création dossiers uploads:', error);
  }
};

// Exécuter si appelé directement
if (require.main === module) {
  createUploadsDirectories();
}

module.exports = createUploadsDirectories;