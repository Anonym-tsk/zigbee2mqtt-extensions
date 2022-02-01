const settings = require('../../dist/util/settings');
const logger = require('../../dist/util/logger').default;
const Extension = require('../../dist/extension/extension').default;
const stringify = require('json-stable-stringify-without-jsonify');

const ACTIONS = ['toggle', 'turn_on', 'turn_off'];

class AutomationsExtension extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension,
        restartCallback, addExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);

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

        logger.info('AutomationsExtension loaded');
        logger.debug(`Registered automations: ${automations}`);
    }

    findAndRun(entity, action) {
        logger.debug(`Looking for automations for entity '${entity}' and action '${action}'`);
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

            logger.debug(`Found automation for entity '${entity}' and action '${action}': ${automation}`);

            const destination = this.zigbee.resolveEntity(automation.action.entity);
            if (!destination) {
                logger.debug(`Destination not found for entity '${automation.action.entity}'`);
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

            logger.info(`Run automation for entity '${entity}' and action '${action}': ${automation}`);
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({state: resultState}));
        }
    }

    async start() {
        this.eventBus.onStateChange(this, (data) => {
            this.findAndRun(data.entity.name, data.update.action);
        });
    }
}

module.exports = AutomationsExtension;
