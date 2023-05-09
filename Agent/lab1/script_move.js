import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w'
)

async function myFn () {

    let up = await client.move('up');
    let right = await client.move('right');
    
}

// myFn ()

client.socket.on( 'tile', (x, y, delivery) => {
    console.log(x, y, delivery)
} )

/**
 * 28/03/2023
 * 
 * Implement an agent that:
 * - moves along a predefined path
 * - pick the parcel
 * - deliver it
 * 
 * What if other agents are moving?
 * - Dealing with failing actions, by insisting on path.
 */