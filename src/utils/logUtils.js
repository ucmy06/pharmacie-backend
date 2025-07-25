// C:\reactjs node mongodb\pharmacie-backend\src\utils\logUtils.js
const createDetailedLog = (action, data, additionalInfo = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    action,
    data: JSON.parse(JSON.stringify(data)),
    additionalInfo,
    mongodbOperation: null,
  };
  console.log('🔍 LOG DÉTAILLÉ:', JSON.stringify(logEntry, null, 2));
  return logEntry;
};

module.exports = { createDetailedLog };