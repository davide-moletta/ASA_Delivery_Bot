import fs, { writeFile } from 'fs';
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset } from "@unitn-asa/pddl-client";

//Used to store the map and parse it only one time
const beliefMap = new Beliefset();
//Used to store dynamic values like agents, parcels and me
var beliefSet = new Beliefset();
var goal

function readFile(path) {
    return new Promise((res, rej) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
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
}

//Parse the parcels sent by the client and add them to the beliefSet
function parcelsparser(parcels) {
    parcels.forEach(parcel => {
        beliefSet.declare("in p_" + parcel.id + " c_" + parcel.x + "_" + parcel.y);
    });
}

//Parse the "enemy" agents sent by the client and add them to the beliefSet
function agentsParser(agents) {
    agents.forEach(agent => {
        beliefSet.declare("at a_" + agent.id + " c_" + agent.x + "_" + agent.y);
    });
}

//Parse the "me" agent sent by the client and add it to the beliefSet
function meParser(me) {
    beliefSet.declare("at me_" + me.id + " c_" + me.x + "_" + me.y);
}

//Parse the goals sent by the client and add them to the goal
function goalParser(goals) {
    goal = "and"

    for (const g of goals) {
        goal += " (" + g + ")";
    }
}

//Parse the objects in the beliefSet and write them in the PDDL problem necessary otherwise types breake the normal parser
function objectsParser() {
    var objects = "";
    var previous = "c";
    for (const o of beliefSet.objects) {
        if (o.split("_")[0] != previous) {
            objects += "- " + previous + "\n";
            objects += "    " + o + " ";
            previous = o.split("_")[0];
        } else {
            objects += o + " ";
        }
    }
    objects += "- " + previous + " ";
    return objects;
}

//Parse the found plan to make it deliveroo-readable
function planParser(plan) {
    let actions = new Array(plan.length);
    for (var i = 0; i < plan.length; i++) {
        actions[i] = plan[i].action
    }
    return actions;
}

//Planner function, it takes the parcels, agents and me from the client and returns the plan
async function planner(parcels, agents, me) {

    //Read domain from domain file
    let domain = await readFile('./Agent/single_agent_PDDL/domain.pddl');

    //Set the beliefSet equals to the beliefMap and parse the dynamic objects
    beliefSet = beliefMap;
    parcelsparser(parcels);
    agentsParser(agents);
    meParser(me);

    //Set the goal
    goal = "and (holding me_09d0b00447e p_p0)";

    //Create the PDDL problem
    var pddlProblem = new PddlProblem(
        'agentPRO', //name
        objectsParser(), //objects
        beliefSet.toPddlString(), //init
        goal //goal
    )

    //Print the PDDL problem as a pddlString
    let problem = pddlProblem.toPddlString();
    console.log(problem);

    //Write the PDDL problem in the file (FOR DEBUGGING - TO REMOVE)
    fs.writeFile('./Agent/single_agent_PDDL/problem.pddl', problem, err => {
        if (err) {
            console.error(err);
        }
    });

    //Call the onlineSolver function and return the plan if it exists
    var plan = await onlineSolver(domain, problem);

    return planParser(plan);
}

export { planner, mapParser }; //, parcelsparser, agentsParser, meParser };