import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi( config.host, config.token )
client.onConnect( () => console.log( "socket", client.socket.id ) );
client.onDisconnect( () => console.log( "disconnected", client.socket.id ) );

async function agentLoop () {

    // get random previous direction
    var previous = [ 'up', 'right', 'down', 'left' ][ Math.floor(Math.random()*4) ];

    while ( true ) {
        //await client.pickup();
        //await client.putdown();
        let tried = [];
        
        let myYou = {};
        let myParcels = [];
        client.onYou( you => {
            myYou = you;
            //console.log( myYou );
        });
        // if myYou x and y are == 0 or == 9 then I can putdown
        
            await client.pickup();
            

        while ( tried.length < 4 ) {
            
            let current = { up: 'down', right: 'left', down: 'up', left: 'right' }[previous] // backward

            if ( tried.length < 3 ) { // try ahaed or turn (before going backward)
                current = [ 'up', 'right', 'down', 'left' ].filter( d => d != current)[ Math.floor(Math.random()*3) ];
            }

            
            client.onParcelsSensing( parcels => {
                for ( let parcel of parcels ) {
                    if(parcel.carriedBy == myYou.id){
                        myParcels.push(parcel);
                    }
                }
            });
            if ( myParcels.length == 0){
                if(myYou.x == 1){
                    current = 'left';
                }
                if(myYou.x == 19){
                    current = 'right';
                }
                if(myYou.y == 1){
                    current = 'up';
                }
                if(myYou.y == 19){
                    current = 'down';
                }
            }
            else if ( myParcels.length > 0){
                if(myYou.x  == 1){
                    current = 'right';
                    myParcels = [];
                }
                if(myYou.x == 19){
                    current = 'left';
                    myParcels = [];
                }
                if(myYou.y == 1){
                    current = 'down';
                    myParcels = [];
                }
                if(myYou.y == 19){
                    current = 'up';
                    myParcels = [];
                }
                
            }
        
        
            
            if ( ! tried.includes(current) ) {
                
                if ( await client.move( current ) ) {
                    console.log('x', myYou.x, 'y', myYou.y)
                    
                    if ( myYou.x == 0 || myYou.x == 9 || myYou.y == 0 || myYou.y == 9) {
                        await client.putdown();
                        
                    }
                    // if we have at least one parcel and we are near a border, go to the border and putdown
                    // check if myParcels has an element which carriedBy is myYou.id
                    
                    previous = current;
                    break; // moved, continue
                }
                
                tried.push( current );
                // await client.shout( 'zono boly' );
                client.onYou( you => {
                    myYou = you;
                    console.log( myYou );
                });
            }
            
        }

        if ( tried.length == 4 ) {
            console.log( 'stucked' );
            await client.timer(1000); // stucked, wait 1 sec and retry
        }


    }
}

agentLoop()