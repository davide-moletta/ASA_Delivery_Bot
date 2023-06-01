import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import fs from 'fs';

const map = [
    [0, 0, 1, 0, 1],
    [2, 1, 1, 1, 1],
    [0, 0, 1, 0, 1],
    [0, 0, 1, 0, 1],
    [0, 0, 1, 0, 1]
]


function readFile(path) {
    return new Promise((res, rej) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

function checkOffset(x, y) {
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
                neighbours += "(neighbour" + offset.id + " c" + x + y + " c" + offsetX + offsetY + ")\n";
            }
        }
    }
    return neighbours;
}


function parser() {
    var parsedMap = "";

    //cycle all the matrix and for every cell check
    //if it is blocked add the block and skip, if it is a delivery point add the delivery atttribute, if it is a normal cell or a delivery point check the neighbours
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map.length; j++) {
            switch (map[i][j]) {
                case 0:
                    parsedMap += "(is-blocked c" + i + j + ")\n";
                    break;
                case 1:
                    parsedMap += checkOffset(i, j);
                    break;
                case 2:
                    parsedMap += "(is-delivery c" + i + j + ")\n";
                    parsedMap += checkOffset(i, j);
                    break;
                default:
                    break;
            }
        }
    }
    return parsedMap;
}

//async function planner(problemType, problemObjects, problemInit, problemGoal, path) {
async function planner() {

    //Build problem in one of the following ways
    // let problem = new PddlProblem(
    //     problemType,
    //     problemObjects,
    //     problemInit,
    //     problemGoal
    // ).toPddlString();
    // console.log("problem: " + problem);

    console.log(parser())

    let problem = await readFile('problem.pddl');

    //Build domain reading from file
    let domain = await readFile('domain.pddl');

    //Check if plan exists
    var plan = await onlineSolver(domain, problem);
    for (const action of plan) {
        console.log("action: " + action.action + " parameters: " + action.args);
    }

    //Create executor with all the possible actions
    const pddlExecutor = new PddlExecutor(
        { name: 'moveUp', executor: (a, c1, c2) => console.log('executor moveUp ' + a + " " + c1 + " " + c2) },
        { name: 'moveDown', executor: (a, c1, c2) => console.log('executor moveDown ' + a + " " + c1 + " " + c2) },
        { name: 'moveLeft', executor: (a, c1, c2) => console.log('executor moveLeft ' + a + " " + c1 + " " + c2) },
        { name: 'moveRight', executor: (a, c1, c2) => console.log('executor moveRight ' + a + " " + c1 + " " + c2) },
        { name: 'pickup', executor: (a, p, c) => console.log('executor pickup ' + a + " " + p + " " + c) },
        { name: 'putdown', executor: (a, p, c) => console.log('executor putdown ' + a + " " + p + " " + c) }
    );

    //Execute plan
    pddlExecutor.exec(plan);
}

planner();

export { planner };