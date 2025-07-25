const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const pharmacyDir = path.join(__dirname, '../../Uploads/pharmacies');
const documentDir = path.join(__dirname, '../../Uploads/documents');
const medicamentDir = path.join(__dirname, '../../Uploads/medicaments');

if (!fs.existsSync(pharmacyDir)) {
  fs.mkdirSync(pharmacyDir, { recursive: true });
}
if (!fs.existsSync(documentDir)) {
  fs.mkdirSync(documentDir, { recursive: true });
}
if (!fs.existsSync(medicamentDir)) {
  fs.mkdirSync(medicamentDir, { recursive: true });
}

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
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}-${file.originalname}`;
    console.log('🔍 [multer] Nom fichier medicament:', filename);
    cb(null, filename);
  },
});

const uploadPharmacyPhoto = multer({
  storage: pharmacyStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log('🔍 [multer] Vérification photo:', {
      originalname: file?.originalname,
      mimetype: file?.mimetype,
      size: file?.size,
      userId: req.user?._id,
    });
    if (!file) {
      console.log('❌ [multer] Aucun fichier fourni pour photo');
      return cb(null, false);
    }
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      console.log('❌ [multer] Fichier non-image détecté:', file.mimetype);
      cb(new Error('Seuls les fichiers image sont autorisés pour la photo de profil'), false);
    }
  },
}).single('photo');

const uploadDocuments = multer({
  storage: documentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log('🔍 [multer] Vérification document:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images ou PDF sont autorisés pour les documents'), false);
    }
  },
}).array('documentsVerification', 5);

const uploadMedicamentImage = multer({
  storage: medicamentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Images uniquement (jpeg, jpg, png)'));
    }
  },
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log(`🔍 [multer] Vérification ${file.fieldname}:`, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      userId: req.user?._id,
    });
    if (file.fieldname === 'photoPharmacie' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.fieldname === 'documentsVerification' && (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf')) {
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
};