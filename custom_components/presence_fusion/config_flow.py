from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN


class PresenceFusionConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Presence Fusion."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if user_input is not None:
            title = user_input.get("name") or "Presence Fusion"
            return self.async_create_entry(title=title, data=user_input)

        data_schema = vol.Schema({vol.Optional("name", default="Presence Fusion"): str})
        return self.async_show_form(step_id="user", data_schema=data_schema)
