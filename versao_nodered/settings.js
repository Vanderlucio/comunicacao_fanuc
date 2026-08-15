const path = require('path');

module.exports = {
  uiPort: process.env.PORT || 1880,
  mqttReconnectTime: 15000,
  serialReconnectTime: 15000,
  debugMaxLength: 1000,
  flowFile: 'flows.json',
  flowFilePretty: true,
  userDir: __dirname,
  nodesDir: path.join(__dirname, 'nodes'),
  logging: {
    console: {
      level: 'info',
      metrics: false,
      audit: false
    }
  },
  exportGlobalContextKeys: false,
  editorTheme: {
    projects: {
      enabled: false
    },
    header: {
      title: 'Fanuc CNC / PMC - Node-RED Industrial Integration'
    }
  }
};
