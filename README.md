# Zigbee2MQTT Extensions

---

Enjoy my work? [Help me out](https://yoomoney.ru/to/410019180291197) for a couple of :beers: or a :coffee:!

[![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://yoomoney.ru/to/410019180291197)

---

## What are extensions?

[Read this article](https://www.zigbee2mqtt.io/advanced/more/user_extensions.html)

## [automations-extension.js](dist/automations-extension.js)

**Allows you to set up simple automations directly in z2m**

_Example (add this into your z2m configuration.yaml):_

```yaml
automations:
  automation_by_action:
    trigger:
      platform: action
      entity: Test Switch
      action: single
    condition:
      platform: state
      entity: Test Switch 2
      state: ON
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

  automation_by_numeric_state:
    trigger:
      platform: numeric_state
      entity: Test Plug
      attribute: temperatire
      above: 17
      below: 26
      for: 3
    action:
      entity: Test Plug
      service: turn_on
```

_More complex example:_

```yaml
automations:
  automation_by_action:
    trigger:
      platform: action
      entity:
      - Test Switch
      - Test Button
      action:
      - single
      - double
      - hold
    condition:
      - platform: state
        entity: Test Switch 2
        state: ON
      - platform: numeric_state
        entity: My Sensor
        attribute: temperature
        above: 25
        below: 35
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

#### Split configuration

You can move automations to a separate file.
Create file named `automations.yaml` and write all your automations there:

```yaml
# configuration.yaml

automations: automations.yaml
```

```yaml
# automations.yaml

automation_by_action:
  trigger:
    platform: action
    entity: Test Switch
    action: single
  condition:
    platform: state
    entity: Test Switch 2
    state: ON
  action:
    entity: Test Plug
    service: toggle
```


#### State Trigger

Fires when state of given entities changes.

| Item        | Type                                                               | Description                                                                                  |
|-------------|--------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `platform`  | `string`                                                           | `state`                                                                                      |
| `entity`    | `string` or `string[]`                                             | Name of entity (friendly name)                                                               |
| `state`     | `string`, `string[]`, `number`, `number[]`, `boolean`, `boolean[]` | Depends on `attribute`. `ON`/`OFF` for `state`, `true`/`false` for `occupancy`               |
| `attribute` | `string`                                                           | Optional (default `state`). `temperatire`, `humidity`, `pressure` and others device-specific |
| `for`       | `number`                                                           | Number of seconds                                                                            |

_Examples:_

```yaml
trigger:
  platform: state
  entity:
    - My Switch
    - My Light
  state: ON
  for: 10
```

```yaml
trigger:
  platform: state
  entity: Motion Sensor
  attribute: occupancy
  state: true
```


#### Numeric State Trigger

Fires when numeric attribute of given entities changes. Parameters `above` or `below` (or both) should be set.

| Item        | Type                   | Description                                                      |
|-------------|------------------------|------------------------------------------------------------------|
| `platform`  | `string`               | `numeric_state`                                                  |
| `entity`    | `string` or `string[]` | Name of entity (friendly name)                                   |
| `attribute` | `string`               | `temperatire`, `humidity`, `pressure` and others device-specific |
| `above`     | `number`               | Triggers when value crosses a given threshold                    |
| `below`     | `number`               | Triggers when value crosses a given threshold                    |
| `for`       | `number`               | Number of seconds                                                |

_Example:_

```yaml
trigger:
  platform: numeric_state
  entity: My Sensor
  attribute: temperature
  above: 25
  below: 35
  for: 180
```

### Conditions

Conditions are an optional part of an automation rule and can be used to prevent an action from happening when triggered.
When a condition does not return true, the automation will stop executing.
Conditions look very similar to triggers but are very different.
A trigger will look at events happening in the system while a condition only looks at how the system looks right now.
A trigger can observe that a switch is being turned on. A condition can only see if a switch is currently on or off.

_Automation can have multiple conditions_

#### State Condition

Tests if an entity is a specified state.

| Item        | Type                           | Description                                                                                  |
|-------------|--------------------------------|----------------------------------------------------------------------------------------------|
| `platform`  | `string`                       | `state`                                                                                      |
| `entity`    | `string`                       | Name of entity (friendly name)                                                               |
| `state`     | `string`, `number`, `boolean`  | Depends on `attribute`. `ON`/`OFF` for `state`, `true`/`false` for `occupancy`               |
| `attribute` | `string`                       | Optional (default `state`). `temperatire`, `humidity`, `pressure` and others device-specific |

_Examples:_

```yaml
condition:
  platform: state
  entity: My Switch
  state: ON
```

```yaml
condition:
  platform: state
  entity: Motion Sensor
  attribute: occupancy
  state: false
```


#### Numeric State Condition

This type of condition attempts to parse the attribute of an entity as a number, and triggers if the value matches the thresholds.

If both `below` and `above` are specified, both tests have to pass.

| Item        | Type     | Description                                                      |
|-------------|----------|------------------------------------------------------------------|
| `platform`  | `string` | `numeric_state`                                                  |
| `entity`    | `string` | Name of entity (friendly name)                                   |
| `attribute` | `string` | `temperatire`, `humidity`, `pressure` and others device-specific |
| `above`     | `number` | Triggers when value crosses a given threshold                    |
| `below`     | `number` | Triggers when value crosses a given threshold                    |

_Example:_

```yaml
condition:
  platform: numeric_state
  entity: My Sensor
  attribute: temperature
  above: 25
  below: 35
```

### Actions

The action of an automation rule is what is being executed when a rule fires.

_Automation can have multiple actions_

| Item      | Type               | Description                                 |
|-----------|--------------------|---------------------------------------------|
| `entity`  | `string`           | Name of entity (friendly name)              |
| `service` | `string`           | `turn_on`, `turn_off`, `toggle` or `custom` |
| `data`    | `{string: string}` | Only for `service: custom`, see below       |

_Example:_

```yaml
action:
  - entity: Test Plug
    service: toggle
  - entity: Test Switch
    service: turn_on
```

#### Custom action

You can call any service. Data will be transferred directly to Z2M.
For example change brightness or turn on a relay with a custom name.

_Example:_

```yaml
action:
  - entity: Plug With Two Relays
    service: custom
    data:
      state_l2: ON
  - entity: Light Strip
    service: custom
    data:
      state: ON
      brightness: 127
      transition: 2
```
