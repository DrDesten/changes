import fs from 'fs/promises'
import path from 'path'
import { Selector } from './selector.js'

/**
 * @typedef {import('fs').Dirent} fsDirent
 * @typedef {{ dirent: fsDirent, path: string }} Dirent
 * @typedef {(file: Dirent) => boolean} FileFilterFunction
 * @typedef {"file"|"directory"|"blockDevice"|"characterDevice"|"symbolicLink"|"FIFO"|"socket"} FileFilterDescriptor
 */

/** @param {string} directory */
export function mkdir( directory ) {
    return fs.mkdir( directory, { recursive: true } )
}
/** @param {string} directory @param {string|string[]|RegExp} [selector] @returns {Promise<Dirent[]>} */
export async function readdir( directory, selector ) {
    let elements = await fs.readdir( directory, { withFileTypes: true } )
    elements = elements.map( dirent => ( { dirent, path: path.join( directory, dirent.name ) } ) )
    if ( selector ) {
        selector = Selector( selector )
        elements = elements.filter( e => selector.test( e.path ) )
    }
    return elements
}

/** @param {string} directory @param {string|string[]|RegExp} [selector] @returns {Promise<Dirent[]>} */
export async function scandir( directory, selector ) {
    selector = Selector( selector )
    const results = []
    async function inner( directory ) {
        const elements = await readdir( directory, selector )
        for ( const element of elements ) {
            if ( element.dirent.isDirectory() ) {
                await inner( element.path )
            }
        }
        results.push( ...elements )
    }
    await inner( directory )
    return results
}

/** @param {string} target target path */
export function stat( target ) {
    return fs.stat( target )
}

/** @param {string} targetPath */
export function isdir( targetPath ) {
    return fs.lstatSync( targetPath ).isDirectory()
}
/** @param {string} targetPath */
export function isfile( targetPath ) {
    return fs.lstatSync( targetPath ).isFile()
}