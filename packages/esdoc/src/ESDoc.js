import fs from 'fs-extra';
import path from 'path';

/**
 * API Documentation Generator.
 *
 * @example
 * let config = {source: './src', destination: './esdoc'};
 * ESDoc.generate(config, (results, config)=>{
 *   console.log(results);
 * });
 */
export default class ESDoc {
  static logger = null;
  static ASTUtil = null;
  static ESParser = null;
  static ESParser = null;
  static PathResolver = null;
  static DocFactory = null;
  static InvalidCodeLogger = null;
  static PluginManager = null;
  
  /**
   * Generate documentation.
   * @param {ESDocConfig} config - config for generation.
   */
  static generate(config) {
    this._preparation();
    if( typeof(config) === 'undefined' || config === null ) {
        const message = `[31mError: config object is expected as an argument![0m`;
        console.error(`[31m${message}[0m`);
        throw new Error(message);
    }
    
    if( typeof(config.source) !== 'string' || config.source === '' ) {
        const message = `[31mError: config.source needs to be a directory where your source code resides![0m`;
        console.error(`[31m${message}[0m`);
        throw new Error(message);
    }
    if( typeof(config.destination) !== 'string' || config.destination === '' ) {
        const message = `[31mError: config.destination needs to be a directory where to output generated documentation![0m`;
        console.error(`[31m${message}[0m`);
        throw new Error(message);
    }
    
    this._checkOldConfig(config);

    // Check whether includes/excludes is possibly regexp
    let isRegExp = false;
    if( config.includes ) {
        for( const value of config.includes ) {
            //console.log('value', value);
            //console.log('value', value.match(/[$^]/u));
            if( value.match(/[$^]/u) ) {
                isRegExp = true;
            }
        }
    }
    if( config.excludes ) {
        for( const value of config.excludes ) {
            //console.log('value', value);
            //console.log('value', value.match(/[$^]/u));
            if( value.match(/[$^]/u) ) {
                isRegExp = true;
            }
        }
    }
    
    this._setDefaultConfig(config, isRegExp);
    if( config.debug ) config.verbose = true;

    this.PluginManager.setGlobalConfig( this._getGlobalConfig(config) );

    config.plugins.forEach((pluginSettings) => {
      this.PluginManager.registerPlugin(pluginSettings);
    });

    this.PluginManager.onStart();
    
    config = this.PluginManager.onHandleConfig(config);

    this.logger.debug = Boolean(config.debug);

    let includes = [];
    let excludes = [];
    if( isRegExp ) {
        includes = config.includes.map((v) => { return new RegExp(v, 'u'); });
        excludes = config.excludes.map((v) => { return new RegExp(v, 'u'); });
    } else {
        includes = config.includes;
        excludes = config.excludes;
    }
    

    let packageName = null;
    let mainFilePath = null;
    if (config.package) {
      try {
        const packageJSON = this.FileManager.readFileContents(config.package);
        const packageConfig = JSON.parse(packageJSON);
        packageName = packageConfig.name;
        mainFilePath = packageConfig.main;
      } catch (e) {
        // ignore
      }
    }

    let results = [];
    const asts = [];
    const sourceDirPath = path.resolve(config.source);

    let fileList = [];
    
    if( isRegExp ) {
        this._walk( config.source, (filePath) => {
            const relativeFilePath = path.relative(sourceDirPath, filePath);
            for( const pattern of excludes ) {
                if( relativeFilePath.match(pattern) ) {
                    return;
                }
            }
            for( const pattern of includes ) {
                if( relativeFilePath.match(pattern) ) {
                    fileList.push(filePath);
                }
            }
        });
    } else {
        fileList = this.FileManager.getListOfFiles( config.source, includes, excludes );
    }

    fileList.forEach( (filePath) => {
      const relativeFilePath = path.relative(sourceDirPath, filePath);

      if( config.verbose ) console.info(`parse: ${filePath}`);
      const temp = this._traverse(config.source, filePath, packageName, mainFilePath);
      if (!temp) return;
      results.push(...temp.results);
      if (config.outputAST) {
        asts.push({filePath: `source${path.sep}${relativeFilePath}`, ast: temp.ast});
      }
    });

    // config.index
    if (config.index) {
      results.push(this._generateForIndex(config));
    }

    // config.package
    if (config.package) {
      results.push(this._generateForPackageJSON(config));
    }

    results = this._resolveDuplication(results);

    results = this.PluginManager.onHandleDocs(results);

    // index.json
    {
      const dumpPath = path.resolve(config.destination, 'index.json');
      fs.outputFileSync(dumpPath, JSON.stringify(results, null, 2));
    }

    // ast, array will be empty if config.outputAST is false - resulting in skipping the loop
    for (const ast of asts) {
      const json = JSON.stringify(ast.ast, null, 2);
      const filePath = path.resolve(config.destination, `ast/${ast.filePath}.json`);
      fs.outputFileSync(filePath, json);
    }

    // publish
    this._publish(config);

    this.PluginManager.onComplete();
  }

  /**
   * This function checks if a package "esdoc-standard-plugin" is installed in parallel with this instance of @enterthenamehere/esdoc.
   * Normally this is so, if the actual node package instance of @enterthenamehere/esdoc is a global or global-style instance (installed with 'npm i -g ...').
   * It is necessary to use the esdoc-core of this parallel instance (esdoc-standard-plugin) so that the plugins of esdoc-standard-plugin can use the same esdoc-core and thus works globally in every project (without locally installing esdoc in the projects).
   * So the Developer can use esdoc inside a project or as global installed node package ('npm i -g ...').
   * Normally all global node packages will be installed in one node-folder (e.g. node_modules) in a os specific path (e.g. in Linux: '/usr/local/lib/node_modules').
   *
   * @return {void}
   */
   static async _preparation() {
    const parallelPathOfESDocStandardPlugin = '../../../@enterthenamehere/esdoc-standard-plugin';
    let isGlobalInstance = false;

    try {
        require(parallelPathOfESDocStandardPlugin);
        isGlobalInstance = true;
    } catch (ex) {
        isGlobalInstance = false;
    }
    
    const absolutePath = (isGlobalInstance === true) ? `${parallelPathOfESDocStandardPlugin}/node_modules/` : '';
    
    this.logger = require(`${absolutePath}@enterthenamehere/color-logger`).default;
    this.ASTUtil = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Util/ASTUtil.js`).default;
    this.ESParser = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Parser/ESParser.js`).default;
    this.PathResolver = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Util/PathResolver.js`).default;
    this.DocFactory = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Factory/DocFactory.js`).default;
    this.InvalidCodeLogger = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Util/InvalidCodeLogger.js`).default;
    this.PluginManager = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Plugin/PluginManager.js`).default;
    this.FileManager = require(`${absolutePath}@enterthenamehere/esdoc-core/lib/Util/FileManager`).FileManager;
  }
  
  /**
   * check ESDoc config. and if it is old, exit with warning message.
   * @param {ESDocConfig} config - check config
   * @private
   */
  static _checkOldConfig(config) {
    let exit = false;

    const keys = [
      ['access', 'esdoc-standard-plugin'],
      ['autoPrivate', 'esdoc-standard-plugin'],
      ['unexportedIdentifier', 'esdoc-standard-plugin'],
      ['undocumentIdentifier', 'esdoc-standard-plugin'],
      ['builtinExternal', 'esdoc-standard-plugin'],
      ['coverage', 'esdoc-standard-plugin'],
      ['test', 'esdoc-standard-plugin'],
      ['title', 'esdoc-standard-plugin'],
      ['manual', 'esdoc-standard-plugin'],
      ['lint', 'esdoc-standard-plugin'],
      ['includeSource', 'esdoc-exclude-source-plugin'],
      ['styles', 'esdoc-inject-style-plugin'],
      ['scripts', 'esdoc-inject-script-plugin'],
      ['experimentalProposal', 'esdoc-ecmascript-proposal-plugin']
    ];

    for (const [key, plugin] of keys) {
      if (key in config) {
        console.error(`[31merror: config.${key} is invalid. Please use ${plugin}. how to migration: https://esdoc.org/manual/migration.html[0m`);
        exit = true;
      }
    }

    if (exit) process.exit(1);
  }

  /**
   * set default config to specified config.
   * @param {ESDocConfig} config - specified config.
   * @param {boolean}     [useRegExp=false] - fallback for RegExp if config is found using it in includes/excludes.
   * @private
   */
  static _setDefaultConfig(config, useRegExp = false) {
    if ( useRegExp ) {
        if (!config.includes) config.includes = ['.js$'];
        if (!config.excludes) config.excludes = ['(config|Config).js'];
    } else {
        if (!config.includes) config.includes = ['**/*.js'];
        if (!config.excludes) config.excludes = ['**/*.(spec|Spec|config|Config|test|Test).js'];
    }

    if (!config.index) config.index = './README.md';

    if (!config.package) config.package = './package.json';

    if (!('outputAST' in config)) config.outputAST = true;

    if (!config.plugins) config.plugins = [];

    if (!config.verbose) config.verbose = false;

    if (!config.debug) config.debug = false;
  }

  /**
   * Returns GlobalConfig object.
   * @param {ESDocConfig} config
   */
  static _getGlobalConfig(config) {
    return {
      debug: config.debug,
      verbose: config.verbose,
      packageScopePrefix: this._getPackagePrefix()
    };
  }

  /**
   * walk recursive in directory.
   * @param {string} dirPath - target directory path.
   * @param {function(entryPath: string)} callback - callback for find file.
   * @private
   */
  static _walk(dirPath, callback) {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const entryPath = path.resolve(dirPath, entry);
      const stat = this.FileManager.getFileStat(entryPath);

      if (stat.isFile()) {
        callback(entryPath);
      } else if (stat.isDirectory()) {
        this._walk(entryPath, callback);
      }
    }
  }

  /**
   * traverse doc comment in JavaScript file.
   * @param {string} inDirPath - root directory path.
   * @param {string} filePath - target JavaScript file path.
   * @param {string} [packageName] - npm package name of target.
   * @param {string} [mainFilePath] - npm main file path of target.
   * @returns {Object} - return document that is traversed.
   * @property {DocObject[]} results - this is contained JavaScript file.
   * @property {AST} ast - this is AST of JavaScript file.
   * @private
   */
  static _traverse(inDirPath, filePath, packageName, mainFilePath) {
    this.logger.i(`parsing: ${filePath}`);
    let ast = null;
    try {
      ast = this.ESParser.parse(filePath);
    } catch (e) {
      this.InvalidCodeLogger.showFile(filePath, e);
      return null;
    }

    const pathResolver = new this.PathResolver(inDirPath, filePath, packageName, mainFilePath);
    const factory = new this.DocFactory(ast, pathResolver);

    this.ASTUtil.traverse(ast, (node, parent) => {
      try {
        factory.push(node, parent);
      } catch (e) {
        this.InvalidCodeLogger.show(filePath, node);
        throw e;
      }
    });

    return {results: factory.results, ast: ast};
  }

  /**
   * generate index doc
   * @param {ESDocConfig} config
   * @returns {Tag}
   * @private
   */
  static _generateForIndex(config) {
    let indexContent = '';

    if (fs.existsSync(config.index)) {
      indexContent = this.FileManager.readFileContents(config.index);
    } else {
      console.warn(`[31mwarning: ${config.index} is not found. Please check config.index.[0m`);
    }

    const tag = {
      kind: 'index',
      content: indexContent,
      longname: path.resolve(config.index),
      name: config.index,
      static: true,
      access: 'public'
    };

    return tag;
  }

  /**
   * generate package doc
   * @param {ESDocConfig} config
   * @returns {Tag}
   * @private
   */
  static _generateForPackageJSON(config) {
    let packageJSON = '';
    let packagePath = '';
    try {
      packageJSON = this.FileManager.readFileContents(config.package);
      packagePath = path.resolve(config.package);
    } catch (e) {
      // ignore
    }

    const tag = {
      kind: 'packageJSON',
      content: packageJSON,
      longname: packagePath,
      name: path.basename(packagePath),
      static: true,
      access: 'public'
    };

    return tag;
  }

  /**
   * resolve duplication docs
   * @param {Tag[]} docs
   * @returns {Tag[]}
   * @private
   */
  static _resolveDuplication(docs) {
    const memberDocs = docs.filter((doc) => { return doc.kind === 'member'; });
    const removeIds = [];

    for (const memberDoc of memberDocs) {
      // member duplicate with getter/setter/method.
      // when it, remove member.
      // getter/setter/method are high priority.
      const sameLongnameDoc = docs.find((doc) => { return doc.longname === memberDoc.longname && doc.kind !== 'member'; });
      if (sameLongnameDoc) {
        removeIds.push(memberDoc.__docId__);
        continue;
      }

      const dup = docs.filter((doc) => { return doc.longname === memberDoc.longname && doc.kind === 'member'; });
      if (dup.length > 1) {
        const ids = dup.map((v) => { return v.__docId__; });
        ids.sort((a, b) => {
          return a < b ? -1 : 1;
        });
        ids.shift();
        removeIds.push(...ids);
      }
    }

    return docs.filter((doc) => { return !removeIds.includes(doc.__docId__); });
  }

  /**
   * publish content
   * @param {ESDocConfig} config
   * @private
   */
  static _publish(config) {
    try {
      const write = (filePath, content, option) => {
        const _filePath = path.resolve(config.destination, filePath);
        content = this.PluginManager.onHandleContent(content, _filePath);

        if( config.verbose ) console.info(`output: ${_filePath}`);
        this.FileManager.writeFileContents(_filePath, content, option);
      };

      const copy = (srcPath, destPath) => {
        const _destPath = path.resolve(config.destination, destPath);
        if( config.verbose ) console.info(`output: ${_destPath}`);
        this.FileManager.copy(srcPath, _destPath);
      };

      const read = (filePath) => {
        const _filePath = path.resolve(config.destination, filePath);
        return this.FileManager.readFileContents(_filePath);
      };

      this.PluginManager.onPublish(write, copy, read);
    } catch (e) {
      this.InvalidCodeLogger.showError(e);
      process.exit(1);
    }
  }
  
  static _prefix = null;
  
  /**
   * Returns prefix, or scope, of package, ie. '@enterthenamehere/esdoc' will return '@enterthenamehere'. If no prefix
   * is present, it will return empty string.
   *
   * Returns empty string if name of package doesn't end '/esdoc' (eg. '/esdoc-something-after') and returns
   * empty string if name doesn't start with '@' (eg. 'prefix/esdoc' instead of '@prefix/esdoc').
   *
   * @return {string} prefix of package.
   */
  static _getPackagePrefix() {
      if( ESDoc._prefix === null ) {
          if( require.resolve('../package.json') in require.cache ) {
              // Since require do cache of loaded modules/files, we need to reset the entry for the
              // file we will require in case it was already required, which would get us cached version
              // instead of live version.
              delete require.cache[require.resolve('../package.json')];
          }
          ESDoc._prefix = require('../package.json').name;
          // Since require do cache of loaded modules/files, we need to reset the entry for the
          // file we just required, or on next time it would not load the file and instead just
          // fetch it from cache.
          delete require.cache[require.resolve('../package.json')];
          if( typeof(ESDoc._prefix) !== 'string' ) {
              ESDoc._prefix = '';
          } else {
              const regex = new RegExp('/esdoc$', 'u');
              if( regex.test(ESDoc._prefix) && ESDoc._prefix.length > 1 && ESDoc._prefix.substr(0,1) === '@' ) {
                  const length = ESDoc._prefix.length;
                  ESDoc._prefix = ESDoc._prefix.substr(0, length - 6); // minus /esdoc
              } else {
                  ESDoc._prefix = '';
              }
          }
      }
      
      return ESDoc._prefix;
  }
}
