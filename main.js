const mqtt = require('mqtt')
const child_process = require('child_process');

var host = process.argv[2];
var username = process.argv[3];
var password = process.argv[4];
var listen_topic = process.argv[5];
var command  = process.argv[6];
var args  = process.argv.slice(7);

console.log(`Connecting ${host}`);
const client  = mqtt.connect(`mqtt://${host}`, { username, password });

client.on('error', function(err) {
    console.log("Error", err);
});

client.on('connect', function () {
  console.log('Connected');
  client.subscribe(listen_topic, function (err) {
    if (!err) {
        console.log('Subscribed');
        client.publish('tuyacli-cpr', 'Test Message')
    }
  })
})

var wanted = false;

client.on('message', function (topic, message) {
  // message is Buffer
  try {
      var m = JSON.parse(message.toString());
      if (topic == listen_topic) {
          console.log("Received command: ", m);
          wanted = m.wanted === true;
      }
  } catch (e) {
      console.log("Exception", e);
  }
});

async function loop() {
    const taskkill = (await import('taskkill')).default;

    let cp = null;

    while (true) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (cp === null && wanted) {
            console.log('spawning');
            cp = child_process.spawn(
                command,
                args,
                {
//[INFO] [2022-06-04T16:58:48+02:00] [GPU 0] Speed: 59.30 MH/s Temp: 74C Fan: 44% Power: 209W 0.28 MH/J
//[INFO] [2022-06-04T16:58:48+02:00] Total 59.30 MH/s Accepted/Rejected/Stale/Invalid shares 13/1/0/0
                    stdio: 'inherit',
                }
            );
        } else if (cp && !wanted) {
            console.log('killing');
            try {
               await taskkill([cp.pid], { tree: true, force: true }); 
               cp = null;
            } catch (e) {
               console.log("Exception", e);
            }
        }
    }
}

loop();