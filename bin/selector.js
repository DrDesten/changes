/** @param {string|string[]|RegExp} [selector] */
export function Selector( selector ) {
    if ( selector === undefined ) return /(?:)/
    if ( selector instanceof RegExp ) return selector

    /** @param {string|string[]} selector @returns {string} */
    function compile( selector ) {
        function compileSelector( selector ) {
            let pattern = selector
            // match "/" and "\" using "/"
            pattern = pattern.replace( /\\/g, "/" )
            pattern = pattern.replace( /\//g, "[/\\\\]" )
            // match special regex characters as literals
            pattern = pattern.replace( /[\^$(){}\.?+]/g, "\\$&" )
            // match "*" and "**"
            pattern = pattern.replace( /\*+/g, m => m.length > 1 ? ".*" : "[^\\\\/\\n]*" )
            return `^${pattern}$`
        }

        function compileNegative( previous, pattern ) {
            previous = previous.length > 1 ? `(${previous.join( "|" )})` : previous[0] || ".*"
            return `^${previous}(?<!${pattern})$`
        }

        if ( selector instanceof Array ) {
            let pattern = []
            for ( const s of selector ) {
                if ( s[0] === "!" ) { // Negative
                    pattern = [compileNegative( pattern, compileSelector( s.slice( 1 ) ) )]
                } else { // Positive
                    pattern.push( compile( s ) )
                }
            }
            return pattern.join( "|" )
        }

        if ( selector[0] === "!" ) {
            return compileNegative( [], compileSelector( selector.slice( 1 ) ) )
        } else {
            return compileSelector( selector )
        }
    }
    return new RegExp( compile( selector ) )
}