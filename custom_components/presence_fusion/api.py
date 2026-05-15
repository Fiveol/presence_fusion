import voluptuous as vol

from homeassistant.components import websocket_api

from .const import DOMAIN


# =========================================================
# GET CURRENT DEVICE STATE
# =========================================================
@websocket_api.websocket_command(
    {
        vol.Required("type"): "presence_fusion/ble_state",
    }
)
@websocket_api.async_response
async def ws_ble_state(hass, connection, msg):

    devices = hass.data[DOMAIN]["devices"]

    connection.send_result(
        msg["id"],
        {
            "devices": list(devices.values())
        },
    )


# =========================================================
# LIVE BLE SUBSCRIPTION
# =========================================================
@websocket_api.websocket_command(
    {
        vol.Required("type"): "presence_fusion/subscribe",
    }
)
@websocket_api.async_response
async def ws_subscribe(hass, connection, msg):

    collector = hass.data[DOMAIN]["collector"]

    connection.send_result(msg["id"])

    def callback(device):

        connection.send_message(
            {
                "id": msg["id"],
                "type": "event",
                "event": {
                    "device": {
                        "id": device["id"],
                        "mac": device["mac"],
                        "rssi": device["rssi"],
                        "ibeacon": device["ibeacon"],
                        "sources": list(device["sources"]),
                        "last_seen": device["last_seen"],
                    }
                },
            }
        )

    collector.subscribe(callback)


# =========================================================
# REGISTER
# =========================================================
async def async_register_api(hass):

    websocket_api.async_register_command(
        hass,
        ws_ble_state,
    )

    websocket_api.async_register_command(
        hass,
        ws_subscribe,
    )