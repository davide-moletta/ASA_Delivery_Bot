import fs from 'fs';
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset } from "@unitn-asa/pddl-client";

//const beliefMap = new Beliefset();
//const beliefMe = new Beliefset();
//const beliefParcels = new Beliefset();
//const beliefAgents = new Beliefset();
const beliefSet = new Beliefset();
var goal

function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

function checkOffset(x, y, map) {
    var neighbours = "";
    const offsets = [
        { id: "Left", dx: -1, dy: 0 },  // Left
        { id: "Right", dx: 1, dy: 0 },   // Right
        { id: "Up", dx: 0, dy: 1 },  // Up
        { id: "Down", dx: 0, dy: -1 },   // Down
    ];

    //check for every neighbour of the cell if it is in the map, if it is and it's not blocked add the neighbourID in that direction
    for (const offset of offsets) {
        const offsetX = x + offset.dx;
        const offsetY = y + offset.dy;
        if (offsetX >= 0 && offsetX < map.length && offsetY >= 0 && offsetY < map.length) {
            if ((map[offsetX][offsetY] == 1 || map[offsetX][offsetY] == 2) && map[x][y] != 0) {
                beliefSet.declare( "neighbour" + offset.id + " c-" + x + "-" + y + " c-" + offsetX + "-" + offsetY );
            }
        }
    }
}

function mapParser(map) {
    //cycle all the matrix and for every cell check
    //if it is blocked add the block and skip, if it is a delivery point add the delivery atttribute, if it is a normal cell or a delivery point check the neighbours
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map.length; j++) {
            switch (map[i][j]) {
                case 0:
                    beliefSet.declare( "is-blocked c-" + i + "-" + j );
                    break;
                case 1:
                    checkOffset(i, j, map);
                    break;
                case 2:
                    beliefSet.declare( "is-delivery c-" + i + "-" + j );
                    checkOffset(i, j, map);
                    break;
                default:
                    break;
            }
        }
    }
}

function parcelsparser(parcels){
    parcels.forEach(parcel => {
        beliefSet.declare( "at " + parcel.id + " c-" + parcel.x + "-" + parcel.y );
    });
}

function agentsParser(agents) {
    agents.forEach(agent => {
        beliefSet.declare( "at " + agent.id + " c-" + agent.x + "-" + agent.y );
    });
}

function meParser(me) {
    beliefSet.declare( "at " + me.id + " c-" + me.x + "-" + me.y );
}

function goalParser(goals) {
    goal = "and"

    for(const g of goals){
        goal += " (" + g + ")";
    }
}

async function planner(parcels, agents, me) {
    let domain = await readFile('./Agent/single_agent_PDDL/domain.pddl' );

    goal = "and (at 09d0b00447e c-6-3)";

    var pddlProblem = new PddlProblem(
        'agentPRO', //name
        beliefSet.objects.join(' '), //objects
        beliefSet.toPddlString(), //init
        goal //goal
    )
    
    let problem = pddlProblem.toPddlString();
    console.log( problem );

    var plan = await onlineSolver( domain, problem );
    
    const pddlExecutor = new PddlExecutor( { 
        name: 'moveUp', executor: (a, c1, c2) => console.log('moveUp ' + a + ' from: ' + c1 + ' to: ' + c2), 
        name: 'moveLeft', executor: (a, c1, c2) => console.log('moveLeft ' + a + ' from: ' + c1 + ' to: ' + c2), 
        name: 'moveRight', executor: (a, c1, c2) => console.log('moveRight ' + a + ' from: ' + c1 + ' to: ' + c2), 
        name: 'moveDown', executor: (a, c1, c2) => console.log('moveDown ' + a + ' from: ' + c1 + ' to: ' + c2), 
        name: 'pickup', executor: (a, p, c) => console.log(a + ' picked up: ' + p + ' from: ' + c),
        name: 'putdown', executor: (a, p, c) => console.log(a + ' put down: ' + p + ' in: ' + c) 
    } );
    pddlExecutor.exec( plan );
}

export { planner, mapParser, parcelsparser, agentsParser, meParser };