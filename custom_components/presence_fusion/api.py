import voluptuous as vol
from homeassistant.components import websocket_api

from .const import DOMAIN


# -----------------------------
# GET FULL DEVICE STATE
# -----------------------------
@websocket_api.websocket_command({
    vol.Required("type"): "presence_fusion/ble_state",
})
@websocket_api.async_response
async def ws_ble_state(hass, connection, msg):

    devices = hass.data[DOMAIN]["devices"]

    connection.send_result(msg["id"], {
        "devices": {
            mac: {
                "id": d["id"],
                "mac": d["mac"],
                "rssi": d["rssi"],
                "ibeacon": d["ibeacon"],
                "sources": list(d["sources"]),
                "last_seen": d["last_seen"],
            }
            for mac, d in devices.items()
        }
    })


# -----------------------------
# LIVE STREAM SUBSCRIPTION
# -----------------------------
@websocket_api.websocket_command({
    vol.Required("type"): "presence_fusion/subscribe",
})
@websocket_api.async_response
async def ws_subscribe(hass, connection, msg):

    collector = hass.data[DOMAIN]["collector"]

    def callback(device):
        connection.send_message({
            "type": "presence_fusion/device_update",
            "device": {
                "id": device["id"],
                "mac": device["mac"],
                "rssi": device["rssi"],
                "ibeacon": device["ibeacon"],
                "sources": list(device["sources"]),
                "last_seen": device["last_seen"],
            }
        })

    collector.subscribe(callback)

    connection.send_result(msg["id"], {
        "success": True
    })