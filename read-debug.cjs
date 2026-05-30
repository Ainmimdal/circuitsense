const fs = require('fs');
const data = JSON.parse(fs.readFileSync('debug-output.json'));
console.log('Number of wires:', data.wires.length);
data.wires.forEach((w, i) => {
    console.log(`Wire ${i} (${w.from.instanceId}:${w.from.pinName} -> ${w.to.instanceId}:${w.to.pinName}): ${w.waypoints?.length || 0} waypoints`);
    if (w.waypoints?.length > 0) console.log(JSON.stringify(w.waypoints));
});
