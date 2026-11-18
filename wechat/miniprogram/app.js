const { Client } = require('./utils/client');
const config = require('./config');
App({
  onLaunch() { this.client = new Client(wx, config); },
  onShow() { if (this.client) this.client.resume(); },
  onHide() { if (this.client) this.client.pause(); }
});
