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
    static DefaultOptions = {
        selector: ["!**.git**"]
    }

    /** @param {string} directory absolute path of directory */
    constructor( directory, options = {} ) {
        this.directory = directory
        this.options = Object.assign( {}, Changes.DefaultOptions, options )
        this.selector = Selector( [...this.options.selector, "!**.changes**"] )

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

    /** @param {{path: string, relative: string}[]} files file paths */
    dispatchChanges( files ) {
        for ( const listener of this.listeners ) {
            for ( const { relative } of files ) {
                if ( listener.selector.test( relative ) ) {
                    listener.callback( relative )
                }
            }
        }
    }

    async getChanged() {
        const elements = await scandir( this.directory, this.selector )
        const files = elements.filter( file => file.dirent.isFile() )
        const stats = await Promise.all( files.map( file => stat( file.path ) ) )
        const mapped = files.map( file => ( {
            path: file.path,
            relative: path.relative( this.directory, file.path )
        } ) )
        const changes = mapped.filter( ( file, i ) => stats[i].mtimeMs !== this.cache[file.relative] )
        return { all: mapped, changed: changes }
    }

    /** @param {{path: string, relative: string}[]} files file paths */
    async updateCache( files ) {
        const updated = Object.fromEntries( await Promise.all( files.map(
            async file => [file.relative, ( await stat( file.path ) ).mtimeMs]
        ) ) )
        this.cache = updated
        this.saveCache()
    }
    /** @param {{path: string, relative: string}[]} files file paths */
    async updateCachePartial( files ) {
        const updated = Object.fromEntries( await Promise.all( files.map(
            async file => [file.relative, ( await stat( file.path ) ).mtimeMs]
        ) ) )
        Object.assign( this.cache, updated )
        this.saveCache()
    }

    /** Check for changes and run listeners */
    async apply() {
        const { all, changed } = await this.getChanged()
        this.dispatchChanges( changed )
        await this.updateCache( all )
    }

    /** Run listeners for provided files @param {string[]} candidates relative file paths */
    async applyPartial( candidates ) {
        const elements = candidates.filter( file => this.selector.test( file ) ).map( file => ( { path: path.join( this.directory, file ), relative: file } ) )
        const files = elements.filter( file => fs.existsSync( file.path ) && fs.statSync( file.path ).isFile() )
        if ( files.length === 0 ) return

        this.dispatchChanges( files )

        await this.updateCachePartial( files )
    }

}