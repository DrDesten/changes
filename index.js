// NodeJS
import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { scandir, stat } from './bin/util.js'
import { Selector } from './bin/selector.js'

/**
 * @typedef {(filepath: string) => void} ChangesCallback 
 */

export default class Changes {
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

    /** @param {string|string[]} selector @param {ChangesCallback} callback  */
    addChangeListener( selector, callback ) {
        this.listeners.push( { selector: Selector( selector ), callback } )
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
                if ( listener.selector.test( filepath ) ) {
                    listener.callback( filepath )
                }
            }
        }
    }

    async apply() {
        const files = ( await scandir( this.directory, [".changes", ".git"] ) ).filter( file => file.dirent.isFile() )
        const stats = await Promise.all( files.map( file => stat( file.path ) ) )
        const relative = files.map( file => path.relative( this.directory, file.path ) )
        const changes = relative.filter( ( path, i ) => stats[i].mtimeMs !== this.cache[path] )

        this.dispatchChanges( changes )

        const newstats = await Promise.all( files.map( file => stat( file.path ) ) )
        this.cache = Object.fromEntries( files.map( ( file, i ) =>
            [path.relative( this.directory, file.path ), newstats[i].mtimeMs]
        ) )
        this.saveCache()
    }

    /** @param {string[]} candidates relative file paths */
    async applyPartial( candidates ) {
        const filter = Selector( [".changes", ".changes/**", ".git", ".git/**"] )
        const files = candidates.filter( file => !filter.test( file ) )
            .map( file => path.join( this.directory, file ) )
            .filter( file => fs.existsSync( file ) && fs.statSync( file ).isFile() )
        if ( files.length === 0 ) return

        this.dispatchChanges( files )

        const stats = await Promise.all( files.map( file => stat( file ) ) )
        this.cache = Object.assign( this.cache, Object.fromEntries( files.map( ( file, i ) =>
            [path.relative( this.directory, file ), stats[i].mtimeMs]
        ) ) )
        this.saveCache()
    }

}