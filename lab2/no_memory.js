import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w'
)

const db = new Map()

// client.socket.on( 'parcels sensing', ( parcels ) => {
    
//     const pretty = Array.from(parcels)
//         .map( ( {id,x,y,carriedBy,reward} ) => {
//             return reward; //`(${x},${y},${reward})`
//         } )
//         .join( ' ' )
//     console.log( pretty )

//     // for (const p of parcels) {
//     //     db.set( p.id, p)
//     // }
    
//     // console.log( db )

// } )

client.onAgentsSensing( ( agents ) => {
    
    const pretty = Array.from(agents)
        .map( ( {id,name,x,y,score} ) => {
            return `${name}(${x},${y})`
        } )
        .join( ' ' )
    console.log( pretty )

} )

/**
 * 29/03/2023
 * Implement an agent that:
 * 
 */