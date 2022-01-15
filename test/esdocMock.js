import fs from 'fs-extra';
import path_package from 'path';
import { fork } from 'child_process';

/**
 * We don't care about security here, just generate random 16 char string...
 * @warning Unsecure!
 * @returns {string} 16 char string
 */
function generateRandomID() {
    const source = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let str = '';
    
    for( let num = 0; num < 17; num += 1 ) {
        const index = Math.floor( Math.random() * 16 );
        str += source[index];
    }

    return str;
}

export class MockESDocTestEnvironment {
    /**
     * Directory under which will be mock environment (new directory named as ID) created.
     * @type {string}
     */
    static BaseMockingDirectoryPath = './test/tmp_dir/';
    
    static MockNodeModulesPath = './node_modules/';
    
    static MockNodeModulesESDocPackagePath = './@enterthenamehere/esdoc/';
    
    /**
     * Returns ESDoc instance.
     * @type {ESDoc}
     */
    get ESDoc() {
        return this._ESDoc;
    }
    
    /**
     * Returns ESDocCLI instance.
     * @type {ESDocCLI}
     */
    get ESDocCLI() {
        return this._ESDocCLI;
    }
    
    /**
     * Creates new mock ESDoc and ESDocCLI to be used for testing. Remember to call {@this#clean} when you are done testing to clean up.
     * @warning ESDoc and ESDoc CLI are copied into this environment under out/ directory.
     *          No check is done against you overwriting these files.
     */
    constructor() {
        /**
         * @type {string} A root directory in which new directory with {@this._id} 
         *                name will be created and environment prepared for testing 
         *                in it. Each instance remembers it's own just in case
         *                the static one {@this.BaseMockingDirectoryPath} changes 
         *                during the environment's life...
         */
        this._baseMockingDirectoryPath = path_package.resolve( MockESDocTestEnvironment.BaseMockingDirectoryPath );
        //console.log('_baseMockingDirectoryPath', this._baseMockingDirectoryPath);

        do {
            /**
             * @type {string} Hexadecimal ID for this mock environment - a directory name
             */
            this._id = generateRandomID();
            //console.log('_id', this._id);
            
            /**
            * @type {string} Directory of this mock environment. Should be CWD when running tests.
            */
            this._directoryPath = path_package.join(this._baseMockingDirectoryPath, this._id);
            //console.log('_directoryPath', this._directoryPath);

            // We don't want to use existing directory, so if it already exists, generate new ID.
        } while( fs.pathExistsSync( this._directoryPath ) );
        
        this._mockedNodeModulesPath = path_package.join(
            this._directoryPath,
            MockESDocTestEnvironment.MockNodeModulesPath
        );
        //console.log('_mockedNodeModulesPath', this._mockedNodeModulesPath);

        this._mockedESDocPackagePath = path_package.join(
            this._mockedNodeModulesPath,
            MockESDocTestEnvironment.MockNodeModulesESDocPackagePath
        );
        //console.log('_mockedESDocPackagePath', this._mockedESDocPackagePath);
        
        /**
         * @type {string} Where ESDoc and ESDocCLI for this mock environment are.
         */
        this._outPath = path_package.join(this._mockedESDocPackagePath, 'out/');
        //console.log('_outPath', this._outPath);
        
        /**
         * @type {string} Path to this mock environment's ESDoc.js file.
         */
        this._ESDocPath = path_package.join(this._outPath, 'ESDoc.js');
        //console.log('_ESDocPath', this._ESDocPath);
        
        /**
         * @type {string} Path to this mock environment's ESDocCLI.js file.
         */
        this._ESDocCLIPath = path_package.join(this._outPath, 'ESDocCLI.js');
        //console.log('_ESDocCLIPath', this._ESDocCLIPath);
        
        const realESDocPath = path_package.resolve(__dirname, '../packages/esdoc/out/ESDoc.js');
        //console.log('realESDocPath', realESDocPath);
        const realESDocCLIPath = path_package.resolve(__dirname, '../packages/esdoc/out/ESDocCLI.js');
        //console.log('realESDocCLIPath', realESDocCLIPath);
        const realESDocPackageJSON = path_package.resolve(__dirname, '../packages/esdoc/package.json');
        //console.log('realESDocPackageJSON', realESDocPackageJSON);
        
        fs.ensureDirSync(this._outPath);
        fs.copySync(realESDocPath, this._ESDocPath );
        fs.copySync(realESDocCLIPath, this._ESDocCLIPath );
        fs.copySync(realESDocPackageJSON, path_package.join( this._mockedESDocPackagePath, 'package.json' ) );
        
        this._ESDoc = require( path_package.resolve( this._ESDocPath ) ).default;
        this._ESDocCLI = require( path_package.resolve( this._ESDocCLIPath ) ).default;
        
        // We need to delete the cached version from require, or next time we would get cached version with
        // all data already set instead of freshly initialized
        delete require.cache[require.resolve( path_package.resolve(this._ESDocPath) )];
        delete require.cache[require.resolve( path_package.resolve(this._ESDocCLIPath) )];
    }
    
    writeToFile( name, data ) {
        fs.writeFileSync( path_package.join(this._directoryPath, name), data, { flag: 'w' } );
    }
    
    writeToJSONFile( name, jsonData ) {
        fs.outputJsonSync( path_package.join(this._directoryPath, name), jsonData, { flag: 'w' } );
    }
    
    /**
     * Cleans the Mock ESDoc environment. Need to be called manually!
     */
    clean = () => {
        fs.removeSync(this._directoryPath);
    };
}






/**
 * 
 * @param {string} filePath 
 * @param {[]} args
 * @returns {Promise}
 */
 export async function helperRunScriptAsync( filePath, args, cwd ) {
    return new Promise( (resolve, reject) => {
        if( !Array.isArray( args ) ) args = [args];

        const options = {
            stdio: 'pipe',
            timeout: 4000, // milliseconds
        };
        
        if( typeof cwd === 'string' ) options.cwd = cwd;
        
        const stdoutOutput = [], stderrOutput = [];
        const childProcess = fork( filePath, args, options );
        
        childProcess.stdout.on( 'data', (output) => {
            stdoutOutput.push( output.toString('utf-8') );
        });
        childProcess.stderr.on( 'data', (output) => {
            stderrOutput.push( output.toString('utf-8') );
        });
        
        childProcess.on( 'error', (error) => {
            // Error is returned as error property. The rest needs to be returned too.
            // eslint-disable-next-line prefer-promise-reject-errors
            reject( { error: error, code: error.code, std: { out: stdoutOutput, err: stderrOutput } } );
        });
        
        childProcess.on( 'close', (code) => {
            resolve( { error: null, code: code, std: { out: stdoutOutput, err: stderrOutput } } );
        });
    });
}
