const mqtt = require('mqtt')
const child_process = require('child_process');

var host = process.argv[2];
var username = process.argv[3];
var password = process.argv[4];
var base_topic = process.argv[5];
var command  = process.argv[6];
var args  = process.argv.slice(7);

var listen_topic = base_topic + "/wanted";
var publish_topic = base_topic + "/status";

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
  });
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

var outputBuffer = "";
function handleOutputData(data)
{
    try {
        outputBuffer += data.toString();
        var lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();
        for (var line of lines) {
            console.log(line);
            var m1 = line.match(/\[([^\]]+)\] \[GPU 0\] Speed: ([^ ]+) MH\/s Temp: ([^C]+)C Fan: ([^%]+)% Power: ([^W]+)W/);
            if (m1) {
                //console.log(m);
                client.publish(publish_topic, JSON.stringify({
                    status: 'mining',
                    timestamp: m1[1],
                    speed: m1[2],
                    temp: m1[3],
                    fan: m1[4],
                    power: m1[5],
                    coin: "ETH",
                }));
                supressSleepKeepAlive().catch(console.log);
            }
            var m2 = line.match(/\[([^\]]+)\] INFO - \| *([^|]+)\| *([^|]+)\| *([^ ]+) M\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^|]+)\| *([^ ]+) K\|/);
            if (m2) {
                client.publish(publish_topic, JSON.stringify({
                    status: 'mining',
                    timestamp: m2[1],
                    speed: m2[4],
                    temp: m2[10],
                    fan: m2[11],
                    power: m2[8],
                    coin: "RVN",
                }));
                supressSleepKeepAlive().catch(console.log);
            }
        }
//[INFO] [2022-06-04T16:58:48+02:00] [GPU 0] Speed: 59.30 MH/s Temp: 74C Fan: 44% Power: 209W 0.28 MH/J
//[INFO] [2022-06-04T16:58:48+02:00] Total 59.30 MH/s Accepted/Rejected/Stale/Invalid shares 13/1/0/0
    } catch (e) {
        console.log("Exception", e);
    }
}

async function loop() {
    const taskkill = (await import('taskkill')).default;

    let cp = null;
    let interval = 0;

    let isGaming = null;
    var isGamingInterval = 0;

    while (true) {
        if (--isGamingInterval < 0) {
            isGamingInterval = 15;
            var game = isAnyGameExecutable(await getActiveProcessPath());
            if (game != isGaming) {
                console.log(`Gaming: ${game}`);
                interval = 0;
            }
            isGaming = game;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        if (cp === null && wanted && !isGaming) {
            console.log('spawning');
            cp = child_process.spawn(
                command,
                args,
                {
                    stdio: [ 'inherit', 'inherit', 'pipe' ]
                }
            );
            cp.stderr.on('data', handleOutputData);
            client.publish(publish_topic, JSON.stringify({
                status: 'starting',
                timestamp: new Date().toISOString(),
            }));            
        } else if (cp && (!wanted || isGaming)) {
            console.log('killing');
            try {
                await taskkill([cp.pid], { tree: true, force: true });
                cp = null;
                interval = 0;
            } catch (e) {
                console.log("Exception", e);
            }
        } else if (!cp && (!wanted || isGaming) && --interval < 0) {
            interval = 5*60; // 5 minutes
            client.publish(publish_topic, JSON.stringify({
                status: isGaming ? 'gaming' : 'stopped',
                timestamp: new Date().toISOString(),
                isGaming,
            }));
        }

        //var awnd = await activeWindow();
        //console.log(awnd.owner.path);
    }
}

async function getActiveProcessPath()
{
    return await new Promise((resolve, reject) => {
        var fgw = `${__dirname}/fgw.ps1`;
        return child_process.execFile(
            "powershell",
            [ "-ExecutionPolicy", "ByPass", fgw ],
            (error, stdout, stderr) => error ? reject(error) : resolve(stdout.trim().replace(/\\/g, '/').replace(/\r/g, '').split('\n'))
        );
    });
}

async function supressSleepKeepAlive()
{
    return await new Promise((resolve, reject) => {
        var fgw = `${__dirname}/keepalive.ps1`;
        return child_process.execFile(
            "powershell",
            [ "-ExecutionPolicy", "ByPass", fgw ],
            (error, stdout, stderr) => error ? reject(error) : resolve(stdout.trim().replace(/\\/g, '/').replace(/\r/g, '').split('\n'))
        );
    });
}

function isAnyGameExecutable(paths)
{
    for (var p of paths)
        if (isGameExecutable(p))
            return p;
    return null;
}

function isGameExecutable(path)
{
    var paths = [
        "C:/Games",
    ];
    var exceptions = [
        "/steam.exe",
        "/steamwebhelper.exe",
        "/Steam/GameOverlayUI.exe",
        "/EpicGamesLauncher.exe",
        "/EpicWebHelper.exe"
    ];
    for (var e of exceptions)
        if (path.toLowerCase().includes(e.toLowerCase()))
            return false;
    for (var p of paths)
        if (path.toLowerCase().includes(p.toLowerCase()))
            return true;
    return false;
}
loop();