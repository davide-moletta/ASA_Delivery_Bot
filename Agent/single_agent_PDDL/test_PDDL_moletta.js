import fs, { writeFile } from 'fs';
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset } from "@unitn-asa/pddl-client";

//Used to store the map and parse it only one time
const beliefMap = new Beliefset();
var domain, mapObjects = "";

function readFile(path) {
    return new Promise((res, rej) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

async function readDomain() {
    //Read domain from domain file
    domain = await readFile('./Agent/single_agent_PDDL/domain.pddl');
}

function mapObjectParser() {
    for (const o of beliefMap.objects) {
        mapObjects += o + " ";
    }
    mapObjects += "- c";
}

//Check the adjacent cells of the one called
function checkOffset(x, y, map) {
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
                beliefMap.declare("neighbour" + offset.id + " c_" + x + "_" + y + " c_" + offsetX + "_" + offsetY);
            }
        }
    }
}

//Parse the matrix and writes it as a PDDL problem in the beliefMap constant
function mapParser(map) {
    //cycle all the matrix and for every cell check
    //if it is blocked add the block and skip, if it is a delivery point add the delivery atttribute, if it is a normal cell or a delivery point check the neighbours
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map.length; j++) {
            switch (map[i][j]) {
                case 0:
                    beliefMap.declare("is-blocked c_" + i + "_" + j);
                    break;
                case 1:
                    checkOffset(i, j, map);
                    break;
                case 2:
                    beliefMap.declare("is-delivery c_" + i + "_" + j);
                    checkOffset(i, j, map);
                    break;
                default:
                    break;
            }
        }
    }
    mapObjectParser();
}

//Parse the parcels sent by the client and add them to the beliefSet
function parcelsparser(parcels, me,  beliefs) {
    parcels.forEach(parcel => {
        if(parcel.carriedBy == me.id){
            beliefs.declare("holding me_" + me.id + " p_" + parcel.id);
        }else{
            beliefs.declare("in p_" + parcel.id + " c_" + parcel.x + "_" + parcel.y);
        } 
    });
}

//Parse the "enemy" agents sent by the client and add them to the beliefSet
function agentsParser(agents, beliefs) {
    agents.forEach(agent => {
        beliefs.declare("in a_" + agent.id + " c_" + agent.x + "_" + agent.y);
    });
}

//Parse the goals sent by the client and add them to the goal
function goalParser(desire, args, me) {
    var goal = "and"

    if (desire == "pickup") {
        goal += " (holding me_" + me + " p_" + args.id + ")"
    } else if (desire == "deliver") {
        for (const a of args) {
            goal += " (delivered p_" + a.id + ")"
        }
    } else {
        goal += " (at me_" + me + " c_" + args.x + "_" + args.y + ")"
    }
    return goal;
}

//Parse the objects in the beliefSet and write them in the PDDL problem necessary otherwise types breake the normal parser
function objectsParser(beliefs) {
    var objects = "";
    var previous = [...beliefs.objects][0].split("_")[0];

    for (const o of beliefs.objects) {
        var type = o.split("_")[0];
        if (type != "c") {
            if (type != previous) {
                objects += "- " + previous + "\n";
                objects += "    " + o + " ";
                previous = type;
            } else {
                objects += o + " ";
            }
        }
    }
    objects += "- " + previous + " ";
    return objects;
}

//Parse the found plan to make it deliveroo-readable
function planParser(plan) {
    var actions = [];
    for (const p of plan) {
        actions.push(p.action);
    }
    return actions;
}

//Planner function, it takes the parcels, agents and me from the client and returns the plan
async function planner(parcels, agents, me, goal) {

    //Set the beliefSet equals to the beliefMap and parse the dynamic objects
    var beliefs = new Beliefset();

    parcelsparser(parcels, me, beliefs);
    agentsParser(agents, beliefs);
    beliefs.declare("at me_" + me.id + " c_" + me.x + "_" + me.y);

    //Create the PDDL problem
    var pddlProblem = new PddlProblem(
        'agentPRO', //name
        mapObjects + "\n    " + objectsParser(beliefs), //objects
        beliefMap.toPddlString() + " " + beliefs.toPddlString(), //init
        goal //goal
    )

    //Print the PDDL problem as a pddlString
    let problem = pddlProblem.toPddlString();

    //Call the onlineSolver function and return the plan if it exists
    var plan = await onlineSolver(domain, problem);

    return planParser(plan);
}

export { planner, goalParser, mapParser, readDomain }; //, parcelsparser, agentsParser, meParser };