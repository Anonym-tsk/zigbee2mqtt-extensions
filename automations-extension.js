const stringify = require('json-stable-stringify-without-jsonify');

const ACTIONS = ['toggle', 'turn_on', 'turn_off'];

class AutomationsExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, settings, logger) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
        this.settings = settings;
        this.logger = logger;

        this.mqttBaseTopic = settings.get().mqtt.base_topic;

        const automations = settings.get().automations || {};
        this.automationsBySource = Object.entries(automations).reduce((result, [_, automation]) => {
            const entity = automation.trigger.entity;
            let current = result[entity];
            if (!current) {
                current = result[entity] = [];
            }
            current.push(automation);
            return result;
        }, {});

        this.logger.info('AutomationsExtension loaded');
        this.logger.debug(`Registered automations: ${stringify(automations)}`);
    }

    findAndRun(entity, action) {
        this.logger.debug(`Looking for automations for entity '${entity}' and action '${action}'`);
        const automations = this.automationsBySource[entity];
        if (!automations) {
            return;
        }

        for (const automation of automations) {
            if (automation.trigger.action !== action) {
                continue;
            }
            if (!ACTIONS.includes(automation.action.service)) {
                continue;
            }

            this.logger.debug(`Automation for entity '${entity}' and action '${action}': ${stringify(automation)}`);

            const destination = this.zigbee.resolveEntity(automation.action.entity);
            if (!destination) {
                this.logger.debug(`Destination not found for entity '${automation.action.entity}'`);
                continue;
            }

            let resultState;
            if (automation.action.service === 'turn_on') {
                resultState = 'ON';
            } else if (automation.action.service === 'turn_off') {
                resultState = 'ON';
            } else if (automation.action.service === 'toggle') {
                const state = this.state.get(destination);
                resultState = state.state === 'ON' ? 'OFF' : 'ON';
            }

            this.logger.debug(`Run automation for entity '${entity}' and action '${action}': ${stringify(automation)}`);
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({state: resultState}));
        }
    }

    async start() {
        this.eventBus.onStateChange(this, (data) => {
            this.findAndRun(data.entity.name, data.update.action);
        });
    }

    async stop() {
        this.eventBus.removeListeners(this);
    }
}

module.exports = AutomationsExtension;
