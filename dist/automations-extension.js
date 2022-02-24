const stringify = require("json-stable-stringify-without-jsonify");
function toArray(item) {
    return Array.isArray(item) ? item : [item];
}
var ConfigPlatform;
(function (ConfigPlatform) {
    ConfigPlatform["ACTION"] = "action";
    ConfigPlatform["STATE"] = "state";
    ConfigPlatform["NUMERIC_STATE"] = "numeric_state";
})(ConfigPlatform || (ConfigPlatform = {}));
var ConfigState;
(function (ConfigState) {
    ConfigState["ON"] = "ON";
    ConfigState["OFF"] = "OFF";
})(ConfigState || (ConfigState = {}));
var ConfigService;
(function (ConfigService) {
    ConfigService["TOGGLE"] = "toggle";
    ConfigService["TURN_ON"] = "turn_on";
    ConfigService["TURN_OFF"] = "turn_off";
})(ConfigService || (ConfigService = {}));
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
        const services = Object.values(ConfigService);
        const platforms = Object.values(ConfigPlatform);
        return Object.values(automations).reduce((result, automation) => {
            const platform = automation.trigger.platform;
            if (!platforms.includes(platform)) {
                return result;
            }
            if (!automation.trigger.entity) {
                return result;
            }
            const actions = toArray(automation.action);
            for (const action of actions) {
                if (!services.includes(action.service)) {
                    return result;
                }
            }
            const conditions = automation.condition ? toArray(automation.condition) : [];
            for (const condition of conditions) {
                if (!condition.entity) {
                    return result;
                }
                if (!platforms.includes(condition.platform)) {
                    return result;
                }
            }
            const entities = toArray(automation.trigger.entity);
            for (const entityId of entities) {
                if (!result[entityId]) {
                    result[entityId] = [];
                }
                result[entityId].push({
                    trigger: automation.trigger,
                    action: actions,
                    condition: conditions,
                });
            }
            return result;
        }, {});
    }
    checkCondition(condition) {
        const entity = this.zigbee.resolveEntity(condition.entity);
        if (!entity) {
            this.logger.debug(`Condition not found for entity '${condition.entity}'`);
            return true;
        }
        let currentCondition;
        let currentState;
        switch (condition.platform) {
            case ConfigPlatform.STATE:
                currentCondition = condition;
                currentState = this.state.get(entity).state;
                if (currentState !== currentCondition.state) {
                    return false;
                }
                break;
            case ConfigPlatform.NUMERIC_STATE:
                currentCondition = condition;
                currentState = this.state.get(entity)[currentCondition.attribute];
                if (typeof currentCondition.above !== 'undefined' && currentState < currentCondition.above) {
                    return false;
                }
                if (typeof currentCondition.below !== 'undefined' && currentState > currentCondition.below) {
                    return false;
                }
                break;
        }
        return true;
    }
    runActions(actions) {
        for (const action of actions) {
            const destination = this.zigbee.resolveEntity(action.entity);
            if (!destination) {
                this.logger.debug(`Destination not found for entity '${action.entity}'`);
                continue;
            }
            const currentState = this.state.get(destination).state;
            let newState;
            switch (action.service) {
                case ConfigService.TURN_ON:
                    newState = ConfigState.ON;
                    break;
                case ConfigService.TURN_OFF:
                    newState = ConfigState.OFF;
                    break;
                case ConfigService.TOGGLE:
                    newState = currentState === ConfigState.ON ? ConfigState.OFF : ConfigState.ON;
                    break;
            }
            if (currentState === newState) {
                continue;
            }
            this.logger.debug(`Run automation for entity '${action.entity}': ${stringify(action)}`);
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({ state: newState }));
        }
    }
    runAutomationIfMatches(automation, update, from, to) {
        let trigger;
        switch (automation.trigger.platform) {
            case ConfigPlatform.ACTION:
                if (!update.hasOwnProperty('action')) {
                    return;
                }
                trigger = automation.trigger;
                const actions = toArray(trigger.action);
                if (!actions.includes(update.action)) {
                    return;
                }
                break;
            case ConfigPlatform.STATE:
                if (!update.hasOwnProperty('state') || !from.hasOwnProperty('state') || !to.hasOwnProperty('state')) {
                    return;
                }
                trigger = automation.trigger;
                const states = toArray(trigger.state);
                if (from.state === to.state) {
                    return;
                }
                if (!states.includes(update.state)) {
                    return;
                }
                break;
            case ConfigPlatform.NUMERIC_STATE:
                trigger = automation.trigger;
                const attribute = trigger.attribute;
                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return;
                }
                if (from[attribute] === to[attribute]) {
                    return;
                }
                if (typeof trigger.above !== 'undefined') {
                    if (from[attribute] >= trigger.above || to[attribute] < trigger.above) {
                        return;
                    }
                }
                if (typeof trigger.below !== 'undefined') {
                    if (from[attribute] <= trigger.below || to[attribute] > trigger.below) {
                        return;
                    }
                }
                break;
        }
        for (const condition of automation.condition) {
            if (!this.checkCondition(condition)) {
                return;
            }
        }
        this.runActions(automation.action);
    }
    findAndRun(entityId, update, from, to) {
        this.logger.debug(`Looking for automations for entity '${entityId}'`);
        const automations = this.automations[entityId];
        if (!automations) {
            return;
        }
        for (const automation of automations) {
            this.runAutomationIfMatches(automation, update, from, to);
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
