const stringify = require('json-stable-stringify-without-jsonify');

const PLATFORMS = {
    ACTION: 'action',
    STATE: 'state',
};

const SERVICES = {
    TOGGLE: 'toggle',
    TURN_ON: 'turn_on',
    TURN_OFF: 'turn_off',
};

const STATES = {
    ON: 'ON',
    OFF: 'OFF',
};

const toArray = (item) => {
    return Array.isArray(item) ? item : [item];
};

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

        this.automations = this.parseConfig(settings.get().automations || {});

        this.logger.info('AutomationsExtension loaded');
        this.logger.debug(`Registered automations: ${stringify(this.automations)}`);
    }

    parseConfig(automations) {
        /*
        {
            PLATFORM: {
                ENTITY: [{
                    trigger: [ACTION_OR_STATE_1, ACTION_OR_STATE_2],
                    action: [{
                        entity: ENTITY_2,
                        service: SERVICE
                    }]
                }]
            }
        }
        */
        return Object.entries(automations).reduce((result, [_, automation]) => {
            const platform = automation.trigger.platform;
            if (!result[platform]) {
                result[platform] = {};
            }

            const entities = toArray(automation.trigger.entity);
            let triggerActions;
            let triggerStates;

            if (automation.trigger.action) {
                triggerActions = toArray(automation.trigger.action);
            }
            if (automation.trigger.state) {
                triggerStates = toArray(automation.trigger.state);
            }
            const actions = toArray(automation.action);

            for (const entity of entities) {
                if (!result[platform][entity]) {
                    result[platform][entity] = [];
                }

                result[platform][entity].push({
                    trigger: triggerActions || triggerStates,
                    action: actions,
                });
            }

            return result;
        }, {});
    }

    getPlatform(update) {
        if (update.hasOwnProperty(PLATFORMS.ACTION)) {
            return PLATFORMS.ACTION;
        }
        if (update.hasOwnProperty(PLATFORMS.STATE)) {
            return PLATFORMS.STATE;
        }
        return null;
    }

    runAction(action) {
        if (!Object.values(SERVICES).includes(action.service)) {
            return;
        }

        const destination = this.zigbee.resolveEntity(action.entity);
        if (!destination) {
            this.logger.debug(`Destination not found for entity '${action.entity}'`);
            return;
        }

        const currentState = this.state.get(destination).state;
        let newState;

        switch (action.service) {
        case SERVICES.TURN_ON:
            newState = STATES.ON;
            break;
        case SERVICES.TURN_OFF:
            newState = STATES.OFF;
            break;
        case SERVICES.TOGGLE:
            newState = currentState === STATES.ON ?
                STATES.OFF : STATES.ON;
            break;
        }

        if (currentState === newState) {
            return;
        }

        this.logger.debug(`Run automation for entity '${action.entity}': ${stringify(action)}`);
        this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({state: newState}));
    }

    runAutomation(platform, automation, update, from, to) {
        if (platform === PLATFORMS.ACTION && !automation.trigger.includes(update.action)) {
            return;
        }
        if (platform === PLATFORMS.STATE) {
            if (from.state === to.state) {
                return;
            }
            if (!automation.trigger.includes(update.state)) {
                return;
            }
        }

        for (const action of automation.action) {
            this.runAction(action);
        }
    }

    findAndRun(entity, update, from, to) {
        this.logger.debug(`Looking for automations for entity '${entity}'`);

        const platform = this.getPlatform(update);
        if (!platform) {
            return;
        }

        if (!this.automations.hasOwnProperty(platform)) {
            return;
        }

        const automations = this.automations[platform][entity];
        if (!automations) {
            return;
        }

        for (const automation of automations) {
            this.runAutomation(platform, automation, update, from, to);
        }
    }

    async start() {
        this.eventBus.onStateChange(this, (data) => {
            this.findAndRun(data.entity.name, data.update, data.from, data.to);
        });
    }

    async stop() {
        this.eventBus.removeListeners(this);
    }
}

module.exports = AutomationsExtension;
