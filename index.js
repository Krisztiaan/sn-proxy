const express = require("express");

const mqtt = require("mqtt");
const zlip = require("zlib");
const uuid = require("uuid-random");

class ShareNowClient {
  static VEHICLELISTDELTA = "C2G/S2C/55/VEHICLELISTDELTA.GZ";
  static VEHICLELIST = "C2G/S2C/55/VEHICLELIST.GZ";
  vehicles = [];
  #updateCallback;

  connect() {
    let clientId = `a:${uuid()}`;
    let client = mqtt.connect("mqtts://driver.eu.share-now.com:443", {
      clientId,
      rejectUnauthorized: false,
      reconnectPeriod: 0
    });

    client.on("connect", () => {
      console.log("Connected to MQTT broker. Subscribing to topics.");
      client.subscribe(ShareNowClient.VEHICLELIST, { qos: 0 });
      client.subscribe(ShareNowClient.VEHICLELISTDELTA, { qos: 1 });
    });

    client.on("message", (topic, message) => {
      let json = JSON.parse(zlip.gunzipSync(message));
      if (topic === ShareNowClient.VEHICLELISTDELTA) {
        this.updateVehicles(json);
        if (this.#updateCallback !== undefined) {
          this.#updateCallback(json);
        }
      } else if (topic === ShareNowClient.VEHICLELIST) {
        console.log("Received initial vehicle list");
        client.unsubscribe(ShareNowClient.VEHICLELIST);
        this.vehicles = json.connectedVehicles;
      }
    });

    client.on("error", (error) => {
      console.log(`Error: ${error}`);
    });

    client.on("close", () => {
      console.log("Close");
    });
  }

  getVehicles(callback) {
    this.#updateCallback = callback;
    return this.vehicles;
  }

  updateVehicles(vehicleUpdate) {
    this.vehicles = this.vehicles.concat(vehicleUpdate.addedVehicles);
    vehicleUpdate.removedVehicles.forEach((vehicleId) => {
      this.vehicles = this.vehicles.filter((e) => e.id !== vehicleId);
    });
  }
}

let client = new ShareNowClient();
client.connect();

const app = express();

app.get("/", (req, res) => {
  res.send("Express on Vercel");
});

app.get("/sn", (req, res) => {
  if (client.vehicles.length === 0) {
    let tries = 0
    const id = setInterval(() => {
      if (client.vehicles.length > 0) {
        res.json(client.vehicles);
        clearInterval(id);
      }else if (tries++ > 4) {
        res.json([]);
        clearInterval(id);
      }
    }, 1000);
  } else {
    res.json(client.vehicles);
  }
});

app.get("/home", (req, res) => {
  res.send("HOME!");
});

app.listen(5000, () => {
  console.log("Running on port 5000!");
});
