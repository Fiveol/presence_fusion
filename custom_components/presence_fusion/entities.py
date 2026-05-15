"""Entity helpers for Presence Fusion."""
import logging
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_create_zone_entities(hass: HomeAssistant, zone_id: str, zone_name: str) -> None:
    """Create zone-related entities using state machine."""
    # Create occupancy binary sensor state
    occupancy_id = f"binary_sensor.presence_fusion_zone_{zone_id}_occupancy"
    hass.states.async_set(
        occupancy_id,
        "off",
        attributes={
            "friendly_name": f"{zone_name} Occupancy",
            "device_class": "occupancy",
            "icon": "mdi:home",
        },
    )
    _LOGGER.debug(f"Created zone occupancy entity for {zone_name}")

    # Create people count sensor state
    count_id = f"sensor.presence_fusion_zone_{zone_id}_count"
    hass.states.async_set(
        count_id,
        "0",
        attributes={
            "friendly_name": f"{zone_name} People Count",
            "unit_of_measurement": "people",
            "icon": "mdi:people",
        },
    )
    _LOGGER.debug(f"Created zone count entity for {zone_name}")


async def async_create_person_entity(hass: HomeAssistant, person_id: str, person_name: str) -> None:
    """Create person device tracker entity using state machine."""
    # Create device tracker for person location
    device_tracker_id = f"device_tracker.presence_fusion_person_{person_id}"
    hass.states.async_set(
        device_tracker_id,
        "home",
        attributes={
            "friendly_name": f"{person_name} Location",
            "icon": "mdi:account",
        },
    )
    _LOGGER.debug(f"Created person location entity for {person_name}")
