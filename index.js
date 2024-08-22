// NodeJS
import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { scandir, stat } from './bin/util.js'

/**
 * @typedef {(filepath: string) => void} ChangesCallback 
 * @typedef {string|string[]} ChangesSelector
 */

export default class Changes {
    /** @param {ChangesSelector} selector @returns {string} */
    static compileSelector( selector ) {
        if ( selector instanceof Array ) {
            return selector.map( Changes.compileSelector ).join( "|" )
        }
        const root = selector[0] === "/"
        if ( root ) selector = selector.slice( 1 )
        selector = selector.replace( /\//g, "[/\\\\]" )
        selector = selector.replace( /[\.^$]/g, "\\$&" )
        selector = selector.replace( /\*+/g, m => m.length > 1 ? "[^]*" : "[^/]*" )
        selector = root ? `^${selector}$` : `${selector}$`
        return selector
    }
    /** @param {string} filepath @param {RegExp} selector  */
    static match( filepath, selector ) {
        return selector.test( filepath )
    }

    /** @param {string} directory absolute path of directory */
    constructor( directory ) {
        this.directory = directory

        /** @type {{[path:string]: number}} */
        this.cache = {}
        this.cacheDirectory = path.join( directory, ".changes" )
        this.loadCache()

        /** @type {{selector: RegExp, callback: ChangesCallback}[]} */
        this.listeners = []
    }

    /** @param {ChangesSelector} selector @param {ChangesCallback} callback  */
    addChangeListener( selector, callback ) {
        const regex = new RegExp( Changes.compileSelector( selector ) )
        this.listeners.push( { selector: regex, callback } )
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

    /** @param {string[]} filepaths relative file paths */
    dispatchChanges( filepaths ) {
        const changes = filepaths
        for ( const listener of this.listeners ) {
            for ( const filepath of changes ) {
                if ( Changes.match( filepath, listener.selector ) ) {
                    listener.callback( filepath )
                }
            }
        }
    }

    async apply() {
        const files = ( await scandir( this.directory, [".changes", ".git"] ) ).filter( file => file.dirent.isFile() )
        const stats = await Promise.all( files.map( file => stat( file.path ) ) )
        const changes = files
            .map( file => path.relative( this.directory, file.path ) )
            .filter( ( path, i ) => stats[i].mtimeMs !== this.cache[path] )

        this.dispatchChanges( changes )

        this.cache = Object.fromEntries( files.map( ( file, i ) =>
            [path.relative( this.directory, file.path ), stats[i].mtimeMs]
        ) )
        this.saveCache()
    }

    /** @param {string[]} candidates relative file paths */
    async applyPartial( candidates ) {
        const filter = new RegExp( Changes.compileSelector( [".changes", ".changes/**", ".git", ".git/**"] ) )
        const files = candidates.filter( file => !Changes.match( file, filter ) && fs.existsSync( path.join( this.directory, file ) ) )
        if ( files.length === 0 ) return

        this.dispatchChanges( files )

        const stats = await Promise.all( files.map( file => stat( path.join( this.directory, file ) ) ) )
        this.cache = Object.assign( this.cache, Object.fromEntries( files.map( ( file, i ) =>
            [file, stats[i].mtimeMs]
        ) ) )
        this.saveCache()
    }

}