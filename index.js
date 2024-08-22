// NodeJS
import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { scandir, stat } from './bin/util.js'

/**
 * @typedef {(...args: any) => void} ChangesCallback 
 */

export default class Changes {
    /** @param {string} filepath @param {string} selector  */
    static match( filepath, selector ) {
        filepath = filepath.replace( /\\/g, '/' )
        return filepath.startsWith( selector )
    }

    /** @param {string} directory absolute path of directory */
    constructor( directory ) {
        this.directory = directory

        /** @type {{[path:string]: number}} */
        this.cache = {}
        this.cacheDirectory = path.join( directory, '.changes' )
        this.loadCache()

        /** @type {{selector: string, callback: ChangesCallback}[]} */
        this.listeners = []
    }

    /** @param {string} selector @param {ChangesCallback} callback  */
    addChangeListener( selector, callback ) {
        this.listeners.push( { selector, callback } )
    }

    loadCache() {
        const cachePath = path.join( this.cacheDirectory, "cache.json" )
        if ( fs.existsSync( cachePath ) ) {
            this.cache = JSON.parse( fs.readFileSync( cachePath ) )
        }
    }
    saveCache() {
        const cachePath = path.join( this.cacheDirectory, "cache.json" )
        fs.mkdirSync( this.cacheDirectory, { recursive: true } )
        fs.writeFileSync( cachePath, JSON.stringify( this.cache, null, 4 ) )
    }
    clearCache() {
        this.cache = {}
    }

    async apply() {
        const files = ( await scandir( this.directory ) ).filter( file => file.dirent.isFile() )
        const stats = await Promise.all( files.map( file => stat( file.path ) ) )
        const changes = files
            .map( file => path.relative( this.directory, file.path ) )
            .filter( ( path, i ) => stats[i].mtimeMs !== this.cache[path.relative] )

        for ( const listener of this.listeners ) {
            for ( const filepath of changes ) {
                if ( Changes.match( filepath, listener.selector ) ) {
                    listener.callback( filepath )
                }
            }
        }

        this.cache = Object.fromEntries( files.map( ( file, i ) =>
            [path.relative( this.directory, file.path ), stats[i].mtimeMs]
        ) )
        this.saveCache()
    }
}