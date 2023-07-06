import fs from 'fs';
import { onlineSolver, PddlProblem, Beliefset } from "@unitn-asa/pddl-client";

//Possible desires of the agent
const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";

//Used to store the map and parse it only one time
const beliefMap = new Beliefset();
var domain, mapObjects = "", beliefMapString = "";

//Read the domain file and store it in the domain variable
async function readDomain() {
    domain = await new Promise((res, rej) => {
        fs.readFile('./domain.pddl', 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

//Read the objects of the map and store them in the mapObjects variable and adds the typing - c which are the cells
function mapObjectParser() {
    for (const o of beliefMap.objects) {
        mapObjects += o + " ";
    }
    mapObjects += "c_default_default - c";
}

//Check the adjacent cells of the one called
function checkOffset(x, y, map) {
    const offsets = [
        { id: "Left", dx: -1, dy: 0 },  // Left
        { id: "Right", dx: 1, dy: 0 },   // Right
        { id: "Up", dx: 0, dy: 1 },  // Up
        { id: "Down", dx: 0, dy: -1 },   // Down
    ];

    //check for every neighbour of the cell if it is in the map, if it is and it's not blocked add the neighbourID in that direction to the map beliefs
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

//Parse the matrix and add the beliefs to the map bleiefs
function mapParser(map) {
    //cycle all the matrix and for every cell check
    //if it is blocked delare the blocked cell and continue, if it is a delivery point declare the delivery cell, if it is a normal cell or a delivery point check the neighbours
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
    beliefMapString = beliefMap.toPddlString();
}

//Parse the parcels sent by the client and add them to the beliefSet
function parcelsparser(parcels, me, beliefs) {
    //If there are no parcels in the map declare the default parcel in the default cell
    if (parcels.size == 0) {
        beliefs.declare("in p_default c_default_default");
    } else {
        //For each parcel check if it is carried by the agent or not and declare it in the beliefs
        parcels.forEach(parcel => {
            if (parcel.carriedBy == me.id) {
                //If the parcel is carried by the agent declare that the agent is holding it
                beliefs.declare("holding me_" + me.id + " p_" + parcel.id);
            } else if (!parcel.carriedBy) {
                //If the parcel is not carried by anyone declare it in the correct cell
                beliefs.declare("in p_" + parcel.id + " c_" + parcel.x + "_" + parcel.y);
            }
        });
    }
}

//Parse the "enemy" agents sent by the client and add them to the beliefSet
function agentsParser(agents, beliefs) {
    //If there are no agents in the map declare the default agent in the default cell
    if (agents.size == 0) {
        beliefs.declare("occ a_default c_default_default");
    } else {
        //For each agent declare it in the correct cell
        agents.forEach(agent => {
            beliefs.declare("occ a_" + agent.id + " c_" + agent.x + "_" + agent.y);
        });
    }
}

//Parse the goals sent by the client and add them to the goal
function goalParser(desire, args, me) {
    var goal = "and"

    if (desire == GO_PICK_UP) {
        //If the desire is to go pickup add to the goal that the agent needs to be holding the parcel
        goal += " (holding me_" + me + " p_" + args.id + ")"
    } else if (desire == GO_PUT_DOWN) {
        //If the desire is to go put down add to the goal that the one of the parcel needs to be delivered
        // this is because if we deliver one cell we deliver all of them
        goal = "or"
        for (const a of args) {
            goal += " (delivered p_" + a.id + ")"
        }
    } else {
        //If the desire is neither pikup nor putdown add to the goal that the agent needs to be in the specified cell (in case of blindmove only)
        goal += " (at me_" + me + " c_" + args.x + "_" + args.y + ")"
    }
    return goal;
}

//Parse the objects in the beliefSet used to add typing to the objects
function objectsParser(beliefs) {
    var objects = "";
    //Get the first object type
    var previous = [...beliefs.objects][0].split("_")[0];

    //For every object check the type
    for (const o of beliefs.objects) {
        //Get the object type
        var type = o.split("_")[0];
        //If the is different from cell
        if (type != "c") {
            //If the type is different from the previous one add the previous type and start a new line, after that add the current object
            if (type != previous) {
                objects += "- " + previous + "\n";
                objects += "    " + o + " ";
                previous = type;
            } else {
                //If the type is the same as the previous one add the object to the current line
                objects += o + " ";
            }
        }
    }
    //Add the last type
    objects += "- " + previous + " ";
    return objects;
}

//Parse the found plan to make it deliveroo-readable
function planParser(plan) {
    var actions = [];
    //For every action in the plan add it to the actions array and return it (used to return a deliveroo-readable plan)
    for (const p of plan) {
        actions.push(p.action);
    }
    return actions;
}

//Planner function, it takes the parcels, agents, me and goal from the client and returns the plan
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
        beliefMapString + " " + beliefs.toPddlString(), //init
        goal //goal
    )

    //parse the PDDL problem as a pddlString
    let problem = pddlProblem.toPddlString();

    //Call the onlineSolver function and return the plan if it exists
    var plan = await onlineSolver(domain, problem);

    if (plan == null) return "no plan found";
    return planParser(plan);
}

export { planner, goalParser, mapParser, readDomain };