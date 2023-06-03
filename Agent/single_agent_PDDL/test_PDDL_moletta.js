
// const map = [
//     [0, 0, 1, 0, 1],
//     [2, 1, 1, 1, 1],
//     [0, 0, 1, 0, 1],
//     [0, 0, 1, 0, 1],
//     [0, 0, 1, 0, 1]
// ]

var parsedMap = "";

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
                neighbours += "(neighbour" + offset.id + " c-" + x + "-" + y + " c-" + offsetX + "-" + offsetY + ")\n";
            }
        }
    }
    return neighbours;
}

function mapParser(map) {
    //cycle all the matrix and for every cell check
    //if it is blocked add the block and skip, if it is a delivery point add the delivery atttribute, if it is a normal cell or a delivery point check the neighbours
    for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map.length; j++) {
            switch (map[i][j]) {
                case 0:
                    parsedMap += "(is-blocked c-" + i + "-" + j + ")\n";
                    break;
                case 1:
                    parsedMap += checkOffset(i, j, map);
                    break;
                case 2:
                    parsedMap += "(is-delivery c-" + i + "-" + j + ")\n";
                    parsedMap += checkOffset(i, j, map);
                    break;
                default:
                    break;
            }
        }
    }

    //console.log(parsedMap);
}

function parcelsparser(parcels){
    var parcelsParsed = "";
    //check that parcels is not empty
    if(parcels.length == 0){
        return parcelsParsed;
    }
    parcels.forEach(parcel => {
        parcelsParsed += "(parcel " + parcel.id + ")\n";
        parcelsParsed += "(at " + parcel.id + " c-" + parcel.x + "-" + parcel.y + ")\n";
    });
    console.log(parcelsParsed);
    return parcelsParsed;
}

function agentsParser(agents) {
    var agentsParsed = "";
    agents.forEach(agent => {
        agentsParsed += "(agent " + agent.id + ")\n";
        agentsParsed += "(at " + agent.id + " c-" + agent.x + "-" + agent.y + ")\n";
    });
    console.log(agentsParsed);
    return agentsParsed;
}

function meParser(me) {
    var meParsed = "(me " + me.id + ")\n";
    meParsed += "(at " + me.id + " c-" + me.x + "-" + me.y + ")\n";
    console.log(meParsed);
    return meParsed;
}

function planner(parcels, agents, me) {
    return parcelsparser(parcels) + agentsParser(agents) + meParser(me);
}

export { planner, mapParser, parcelsparser, agentsParser, meParser };