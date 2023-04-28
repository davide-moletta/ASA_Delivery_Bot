import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w'
)
/**
 * @type {Map<string,[{id,x,y,carriedBy,reward}]}
 */
const db = new Map()
    
const start = Date.now();

client.socket.on( 'parcels sensing', ( parcels ) => {

    for (const p of parcels) {
        if ( ! db.has( p.id) ) {
            db.set( p.id, [] )
        }
        const history = db.get( p.id )
        const last = history[history.length-1]
        if ( !last || last.x != p.x || last.y != p.y ) {
            history.push( {x: p.x, y: p.y} )
        }
        console.log( p.id+':'+history.map( p => ' @' + (Date.now() - start) + ':' + p.x + '' + p.y ).join( ' ' ) )
    }

    console.log( '' )
    
    // console.log( db )

} )

/**
 * 29/03/2023
 * Implement an agent that:
 * 
 */