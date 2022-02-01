# Zigbee2MQTT Extensions

### What are extensions?

[Read this article](https://www.zigbee2mqtt.io/advanced/more/user_extensions.html)

### automations-extension.js

**Allows you to set up simple automations directly in z2m**

_Example (add this into your z2m configuration.yaml):_

```yaml
 automations:
   my_first_automation:
     trigger:
       entity: test_switch
       action: single
     action:
       entity: Test Plug
       service: toggle
```

Supported services: `turn_on`, `turn_off`, `toggle`
