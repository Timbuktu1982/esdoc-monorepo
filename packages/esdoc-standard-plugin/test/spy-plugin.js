const { default: PluginManager } = require("@enterthenamehere/esdoc-core/lib/Plugin/PluginManager");

class SpyingPlugin {
  onStart() {
    this.pluginEntries = PluginManager.getPluginEntries();
  }
}

module.exports = new SpyingPlugin();
