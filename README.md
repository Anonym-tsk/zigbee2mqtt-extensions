# Zigbee2MQTT Extensions

## What are extensions?

[Read this article](https://www.zigbee2mqtt.io/advanced/more/user_extensions.html)

## [automations-extension.js](dist/automations-extension.js)

**Allows you to set up simple automations directly in z2m**

_Example (add this into your z2m configuration.yaml):_

```yaml
automations:
  automation_by_action:
    trigger:
      platorm: action
      entity: Test Switch
      action: single
    condition:
      platorm: state
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
      platorm: action
      entity:
      - Test Switch
      - Test Button
      action:
      - single
      - double
      - hold
    condition:
      - platorm: state
        entity: Test Switch 2
        state: ON
      - platorm: numeric_state
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

### Triggers

Triggers are what starts the processing of an automation rule.
When any of the automation’s triggers becomes true (trigger fires), Z2M will validate the conditions, if any, and call the action.

The `for:` can also be specified in triggers.
If given, automation will be triggered when the condition has been true for X seconds.

#### Action Trigger

Fires when action of given entities changes.

| Item        | Type                   | Description                                                                  |
|-------------|------------------------|------------------------------------------------------------------------------|
| `platform`  | `string`               | `action`                                                                     |
| `entity`    | `string` or `string[]` | Name of entity (friendly name)                                               |
| `action`    | `string` or `string[]` | `single`, `double`, `single_left`, `single_right` and others device-specific |

_Example:_

```yaml
trigger:
  platorm: action
  entity: My Switch
  action:
    - single
    - double
```

#### State Trigger

Fires when state of given entities changes.

| Item       | Type                   | Description                    |
|------------|------------------------|--------------------------------|
| `platform` | `string`               | `state`                        |
| `entity`   | `string` or `string[]` | Name of entity (friendly name) |
| `state`    | `string` or `string[]` | `ON` or `OFF`                  |
| `for`      | `number`               | Number of seconds              |

_Example:_

```yaml
trigger:
  platorm: state
  entity:
    - My Switch
    - My Light
  state: ON
  for: 10
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
  platorm: numeric_state
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

| Item        | Type     | Description                    |
|-------------|----------|--------------------------------|
| `platform`  | `string` | `state`                        |
| `entity`    | `string` | Name of entity (friendly name) |
| `state`     | `string` | `ON` or `OFF`                  |

_Example:_

```yaml
condition:
  platorm: state
  entity: My Switch
  state: ON
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
  platorm: numeric_state
  entity: My Sensor
  attribute: temperature
  above: 25
  below: 35
```

### Actions

The action of an automation rule is what is being executed when a rule fires.

_Automation can have multiple actions_

| Item      | Type     | Description                       |
|-----------|----------|-----------------------------------|
| `entity`  | `string` | Name of entity (friendly name)    |
| `service` | `string` | `turn_on`, `turn_off` or `toggle` |

_Example:_

```yaml
action:
  - entity: Test Plug
    service: toggle
  - entity: Test Switch
    service: turn_on
```
