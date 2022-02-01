# Zigbee2MQTT Extensions

### What are extensions?

[Read this article](https://www.zigbee2mqtt.io/advanced/more/user_extensions.html)

### automations-extension.js

**Allows you to set up simple automations directly in z2m**

_Example (add this into your z2m configuration.yaml):_

```yaml
automations:
  automation_by_action:
    trigger:
      entity: Test Switch
      action: single
    action:
      entity: Test Plug
      service: toggle
  automation_by_state:
    trigger:
      entity: Test Plug
      state: ON
    action:
      entity: Test Plug 2
      service: turn_on
```

Supported services: `turn_on`, `turn_off`, `toggle`

Supported states: `ON`, `OFF` and maybe others

Supported actions: `single`, `double`, `single_left`, `single_right` and others device-specific
