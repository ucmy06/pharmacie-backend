// C:\reactjs node mongodb\pharmacie-backend\src\middlewares\multerConfig.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadsPath = path.join(__dirname, '../../Uploads');
const pharmacyDir = path.join(uploadsPath, 'pharmacies');
const documentDir = path.join(uploadsPath, 'documents');
const medicamentDir = path.join(uploadsPath, 'medicaments');

// Créer les dossiers s'ils n'existent pas
[uploadsPath, pharmacyDir, documentDir, medicamentDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Dossier créé: ${dir}`);
  }
});

const pharmacyStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('🔍 [multer] Destination photoPharmacie:', pharmacyDir);
    cb(null, pharmacyDir);
  },
  filename: (req, file, cb) => {
    const userId = req.user ? req.user._id : 'unknown';
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}-${userId}-${random}${ext}`;
    console.log('🔍 [multer] Nom fichier photoPharmacie:', filename);
    cb(null, filename);
  },
});

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('🔍 [multer] Destination documentsVerification:', documentDir);
    cb(null, documentDir);
  },
  filename: (req, file, cb) => {
    const userId = req.user ? req.user._id : 'unknown';
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}-${userId}-${random}${ext}`;
    console.log('🔍 [multer] Nom fichier document:', filename);
    cb(null, filename);
  },
});

const medicamentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('🔍 [multer] Destination medicament:', medicamentDir);
    cb(null, medicamentDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}-${random}${ext}`;
    console.log('🔍 [multer] Nom fichier medicament:', filename);
    cb(null, filename);
  },
});

const fileFilterImage = (req, file, cb) => {
  console.log('🔍 [multer] Vérification fichier:', {
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    size: file?.size,
    userId: req.user?._id,
  });
  if (!file) {
    console.log('❌ [multer] Aucun fichier fourni');
    return cb(new Error('Aucun fichier fourni'), false);
  }
  const filetypes = /jpeg|jpg|png/;
  if (filetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    console.log('❌ [multer] Fichier non autorisé:', file.mimetype);
    cb(new Error('Seuls les fichiers JPEG, JPG ou PNG sont autorisés'), false);
  }
};

const uploadDrugImages = multer({
  storage: medicamentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB par fichier
  fileFilter: fileFilterImage,
}).array('images', 3); // Accepter jusqu'à 3 images avec le nom 'images'



const fileFilterDocument = (req, file, cb) => {
  console.log('🔍 [multer] Vérification document:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    userId: req.user?._id,
  });
  const filetypes = /jpeg|jpg|png|pdf/;
  if (filetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    console.log('❌ [multer] Fichier non autorisé:', file.mimetype);
    cb(new Error('Seuls les fichiers JPEG, JPG, PNG ou PDF sont autorisés'), false);
  }
};

const uploadPharmacyPhoto = multer({
  storage: pharmacyStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterImage,
}).single('photo');

const uploadDocuments = multer({
  storage: documentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterDocument,
}).array('documentsVerification', 5);

const uploadMedicamentImage = multer({
  storage: medicamentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterImage,
}).single('image');

const uploadDemandePharmacie = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'photoPharmacie') {
        console.log('🔍 [multer] Destination photoPharmacie:', pharmacyDir);
        cb(null, pharmacyDir);
      } else if (file.fieldname === 'documentsVerification') {
        console.log('🔍 [multer] Destination documentsVerification:', documentDir);
        cb(null, documentDir);
      }
    },
    filename: (req, file, cb) => {
      const userId = req.user ? req.user._id : 'unknown';
      const timestamp = Date.now();
      const random = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname);
      const filename = `${timestamp}-${userId}-${random}${ext}`;
      console.log(`🔍 [multer] Nom fichier ${file.fieldname}:`, filename);
      cb(null, filename);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    console.log(`🔍 [multer] Vérification ${file.fieldname}:`, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      userId: req.user?._id,
    });
    if (file.fieldname === 'photoPharmacie' && /jpeg|jpg|png/.test(file.mimetype)) {
      cb(null, true);
    } else if (file.fieldname === 'documentsVerification' && /jpeg|jpg|png|pdf/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Fichier non autorisé pour ${file.fieldname}`), false);
    }
  },
}).fields([
  { name: 'photoPharmacie', maxCount: 1 },
  { name: 'documentsVerification', maxCount: 5 },
]);

module.exports = {
  uploadPharmacyPhoto,
  uploadDocuments,
  uploadDemandePharmacie,
  uploadMedicamentImage,
  uploadDrugImages,
};