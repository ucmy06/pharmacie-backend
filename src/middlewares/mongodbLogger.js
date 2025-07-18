// C:\reactjs node mongodb\pharmacie-backend\src\middlewares\mongodbLogger.js
const mongoose = require('mongoose');

// 🔐 Masquer les données sensibles
const sanitizeData = (data) => {
  if (typeof data !== 'object' || data === null) return data;

  const sanitized = { ...data };

  if (sanitized.motDePasse) {
    sanitized.motDePasse = `[MASQUÉ - ${sanitized.motDePasse.length} caractères]`;
  }
  if (sanitized.password) {
    sanitized.password = `[MASQUÉ - ${sanitized.password.length} caractères]`;
  }
  if (sanitized.nouveauMotDePasse) {
    sanitized.nouveauMotDePasse = `[MASQUÉ - ${sanitized.nouveauMotDePasse.length} caractères]`;
  }

  return sanitized;
};

// 🔍 Logger Mongoose
const mongodbLogger = () => {
  mongoose.set('debug', function (collectionName, methodName, query, doc) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'MONGOOSE_DEBUG',
      collection: collectionName,
      method: methodName,
      query: sanitizeData(query),
      document: sanitizeData(doc),
      thread: process.pid,
    };

    console.log('🔍 MONGOOSE DEBUG:', JSON.stringify(logEntry, null, 2));
  });

  const loggerPlugin = function (schema) {
    schema.pre(['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'], function () {
      const operation = this.op || this.getUpdate ? 'update' : 'save';
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'MONGOOSE_PRE_HOOK',
        operation,
        modelName: this.constructor.modelName || 'Unknown',
        query: sanitizeData(this.getQuery ? this.getQuery() : {}),
        update: sanitizeData(this.getUpdate ? this.getUpdate() : {}),
        document: sanitizeData(this.toObject ? this.toObject() : {}),
      };
      console.log('⚡ MONGOOSE PRE-HOOK:', JSON.stringify(logEntry, null, 2));
    });

    schema.post(['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'], function (doc, next) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'MONGOOSE_POST_HOOK',
        operation: this.op || 'save',
        modelName: this.constructor.modelName || 'Unknown',
        result: sanitizeData(doc),
        success: true,
      };
      console.log('✅ MONGOOSE POST-HOOK:', JSON.stringify(logEntry, null, 2));
      if (next) next();
    });

    schema.post(['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'], function (error, doc, next) {
      if (error) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'MONGOOSE_ERROR_HOOK',
          operation: this.op || 'save',
          modelName: this.constructor.modelName || 'Unknown',
          error: {
            message: error.message,
            code: error.code,
            stack: error.stack,
          },
          success: false,
        };
        console.error('❌ MONGOOSE ERROR-HOOK:', JSON.stringify(logEntry, null, 2));
      }

      if (next) next(error);
    });
  };

  return loggerPlugin;
};

// 🌐 Logger HTTP Express
const httpLogger = (req, res, next) => {
  const startTime = Date.now();

  const requestLog = {
    timestamp: new Date().toISOString(),
    type: 'HTTP_REQUEST',
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: sanitizeData(req.body),
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };

  console.log('📥 HTTP REQUEST:', JSON.stringify(requestLog, null, 2));

  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    const responseLog = {
      timestamp: new Date().toISOString(),
      type: 'HTTP_RESPONSE',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseBody: sanitizeData(typeof body === 'string' ? JSON.parse(body) : body),
      headers: res.getHeaders(),
    };

    console.log('📤 HTTP RESPONSE:', JSON.stringify(responseLog, null, 2));
    return originalSend.call(this, body);
  };

  next();
};

// 🚀 Initialiser Mongoose logging
const initializeMongoLogging = () => {
  console.log('🚀 Initialisation du logging MongoDB...');
  mongoose.set('debug', true);

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connecté - Logging activé');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ Erreur MongoDB:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB déconnecté');
  });
};

module.exports = {
  mongodbLogger,
  httpLogger,
  initializeMongoLogging,
  sanitizeData,
};
