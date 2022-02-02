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
      platorm: action
      entity: Test Switch
      action: single
    action:
      entity: Test Plug
      service: toggle

  automation_by_state:
    trigger:
      platform: state
      entity: Test Plug
      state: ON
    action:
      entity: Test Plug 2
      service: turn_on
```

_More complex example:_

```yaml
automations:
  automation_by_action:
    trigger:
      platorm: action
      entity:
      - Test Switch
      - Test Button
      action:
      - single
      - double
      - hold
    action:
    - entity: Test Plug
      service: toggle
    - entity: Test Plug 2
      service: toggle

  automation_by_state:
    trigger:
      platform: state
      entity:
      - Test Plug
      - Test Plug 2
      state:
      - ON
      - OFF
    action:
    - entity: Test Light 1
      service: turn_on
    - entity: Test Light 2
      service: turn_off
```

#### Triggers

| Item       | Type                   | Description                                                                  | Required                      |
|------------|------------------------|------------------------------------------------------------------------------|-------------------------------|
| `platform` | `string`               | `action` or `state`                                                          | **True**                      |
| `entity`   | `string` or `string[]` | Entity name                                                                  | **True**                      |
| `action`   | `string` or `string[]` | `single`, `double`, `single_left`, `single_right` and others device-specific | Only if `platform == action`  |
| `state`    | `string` or `string[]` | `ON`, `OFF` and maybe others                                                 | Only if `platform == state`   |

#### Actions

| Item     | Type       | Description                       | Required |
|----------|------------|-----------------------------------|----------|
| `entity` | `string`   | Entity name                       | **True** |
| `service` | `string`  | `turn_on`, `turn_off` or `toggle` | **True** |

_Automation can have multiple actions_
