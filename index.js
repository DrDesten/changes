// NodeJS
import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { scandir, stat } from './bin/util.js'
import { Selector } from './bin/selector.js'

const HASH_KEY = "\\\\hash\\\\"

/**
 * @typedef {(filepath: string) => void|Promise<void>} ChangesCallback 
 * @typedef {() => void|Promise<void>} ChangesUnmappedCallback 
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

        this.listeners = {
            /** @type {{callback: ChangesUnmappedCallback}[]} */
            always: [],
            /** @type {{selector: RegExp, callback: ChangesCallback}[]} */
            create: [],
            /** @type {{selector: RegExp, callback: ChangesCallback}[]} */
            change: [],
            /** @type {{selector: RegExp, callback: ChangesCallback}[]} */
            delete: [],
        }
    }

    /** @param {'create'|'change'|'delete'|('create'|'change'|'delete')[]} events @param {string} selector @param {ChangesCallback} callback */
    on( events, selector, callback ) {
        selector = Selector( selector )
        if ( typeof events === 'string' ) events = [events]
        for ( const e of events ) switch ( e ) {
            case 'create': this.listeners.create.push( { selector, callback } ); break
            case 'change': this.listeners.change.push( { selector, callback } ); break
            case 'delete': this.listeners.delete.push( { selector, callback } ); break
        }
    }

    /** @param {ChangesUnmappedCallback} callback  */
    addUnconditionalListener( callback ) {
        this.listeners.always.push( { callback } )
    }
    /** @param {string|string[]} selector @param {ChangesCallback} callback  */
    addChangeListener( selector, callback ) {
        this.on( ['create', 'change'], selector, callback )
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

    /** @param {{path: string, relative: string}[]} changed file paths */
    async dispatchChanges( changed, created, deleted ) {
        // Unconditional listeners
        let promises = []
        for ( const { callback } of this.listeners.always ) {
            const res = callback()
            if ( res instanceof Promise ) promises.push( res )
        }
        await Promise.allSettled( promises )

        // Creation listeners
        promises = []
        for ( const { selector, callback } of this.listeners.create ) {
            for ( const relative of created ) {
                if ( selector.test( relative ) ) {
                    const res = callback( relative )
                    if ( res instanceof Promise ) promises.push( res )
                }
            }
        }
        await Promise.allSettled( promises )

        // Change listeners
        promises = []
        for ( const { selector, callback } of this.listeners.change ) {
            for ( const { relative } of changed ) {
                if ( selector.test( relative ) ) {
                    const res = callback( relative )
                    if ( res instanceof Promise ) promises.push( res )
                }
            }
        }
        await Promise.allSettled( promises )

        // Deletion listeners
        promises = []
        for ( const { selector, callback } of this.listeners.delete ) {
            for ( const relative of deleted ) {
                if ( selector.test( relative ) ) {
                    const res = callback( relative )
                    if ( res instanceof Promise ) promises.push( res )
                }
            }
        }
        await Promise.allSettled( promises )
    }

    /** @param {any} hash */
    async getChanged( hash ) {
        // get files
        const elements = await scandir( this.directory, this.selector )
        const files = elements.filter( file => file.dirent.isFile() )
        const mapped = await Promise.all( files.map( async file => ( {
            path: file.path,
            relative: path.relative( this.directory, file.path ),
            stat: await stat( file.path ),
        } ) ) )

        // get created/deleted
        const currentFiles = new Set( mapped.map( file => file.relative ) )
        const cachedFiles = new Set( Object.keys( this.cache ).filter( key => key != HASH_KEY ) )
        const created = [], deleted = []
        for ( const file of currentFiles ) if ( !cachedFiles.has( file ) ) created.push( file )
        for ( const file of cachedFiles ) if ( !currentFiles.has( file ) ) deleted.push( file )

        // get changed
        const invalidate = this.cache[HASH_KEY] !== hash
        const changes = mapped.filter( file => this.cache[file.relative] && ( invalidate || file.stat.mtimeMs !== this.cache[file.relative] ) )
        return { all: mapped, changed: changes, created, deleted }
    }

    /** @param {{path: string, relative: string, stat: any}[]} files file paths @param {any} hash */
    async updateCache( files, hash ) {
        const updated = Object.fromEntries( files.map(
            file => [file.relative, file.stat.mtimeMs]
        ) )
        updated[HASH_KEY] = hash
        this.cache = updated
        this.saveCache()
    }
    /** @param {{path: string, relative: string}[]} files file paths */
    async updateCachePartial( files ) {
        const updated = Object.fromEntries( files.map(
            file => [file.relative, file.stat.mtimeMs]
        ) )
        Object.assign( this.cache, updated )
        this.saveCache()
    }

    /** Check for changes and run listeners @param {any} hash */
    async apply( hash ) {
        const { all, changed, created, deleted } = await this.getChanged( hash )
        await this.dispatchChanges( changed, created, deleted )
        await this.updateCache( all, hash )
    }

    /** Run listeners for provided files @param {string[]} candidates relative file paths */
    async applyPartial( candidates ) {
        const elements = candidates.filter( file => this.selector.test( file ) ).map( file => ( { path: path.join( this.directory, file ), relative: file } ) )
        const files = elements.filter( file => fs.existsSync( file.path ) && fs.statSync( file.path ).isFile() )
        if ( files.length === 0 ) return

        await this.dispatchChanges( files )
        await this.updateCachePartial( files )
    }

}
