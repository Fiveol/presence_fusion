from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN, MANUFACTURER


def home_device_info():
    return DeviceInfo(
        identifiers={(DOMAIN, "home")},
        name="Home",
        manufacturer=MANUFACTURER,
        model="Occupancy",
    )