/** @param {string|string[]} selector */
export function Selector( selector ) {
    /** @param {string|string[]} selector @returns {string} */
    function compile( selector ) {
        function compilePattern( pattern ) {
            // match "/" and "\" using "/"
            pattern = pattern.replace( /\\/g, "/" )
            pattern = pattern.replace( /\//g, "[/\\\\]" )
            // match special regex characters as literals
            pattern = pattern.replace( /[\^$(){}\.?+]/g, "\\$&" )
            // match "*" and "**"
            pattern = pattern.replace( /\*+/g, m => m.length > 1 ? ".*" : "[^/\\n]*" )
            return pattern
        }

        if ( selector instanceof Array ) {
            let pattern = []
            for ( const s of selector ) {
                if ( s[0] === "!" ) { // Negative
                    if ( pattern.length === 0 ) pattern.push( ".*" )
                    pattern = [`(${pattern.join( "|" )})(?<!${compile( s.slice( 1 ) )})$`]
                } else { // Positive
                    pattern.push( compile( s ) )
                }
            }
            return pattern.join( "|" )
        }

        const root = selector[0] === "/"
        if ( root ) selector = selector.slice( 1 )
        selector = compilePattern( selector )
        selector = root ? `^${selector}$` : `${selector}$`
        return selector
    }
    return new RegExp( compile( selector ) )
}
/* 
console.log( Selector( ["*.fsh", "*.vsh", "*.gsh", "*.glsl"] ) )
console.log( Selector( ["*.fsh", "*.vsh", "*.gsh", "*.glsl", "!/core/**"] ) ) */