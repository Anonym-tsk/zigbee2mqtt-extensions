const stringify = require("json-stable-stringify-without-jsonify");
const crypto = require("crypto");
function toArray(item) {
    return Array.isArray(item) ? item : [item];
}
var ConfigPlatform;
(function (ConfigPlatform) {
    ConfigPlatform["ACTION"] = "action";
    ConfigPlatform["STATE"] = "state";
    ConfigPlatform["NUMERIC_STATE"] = "numeric_state";
})(ConfigPlatform || (ConfigPlatform = {}));
var StateOnOff;
(function (StateOnOff) {
    StateOnOff["ON"] = "ON";
    StateOnOff["OFF"] = "OFF";
})(StateOnOff || (StateOnOff = {}));
var ConfigService;
(function (ConfigService) {
    ConfigService["TOGGLE"] = "toggle";
    ConfigService["TURN_ON"] = "turn_on";
    ConfigService["TURN_OFF"] = "turn_off";
})(ConfigService || (ConfigService = {}));
class InternalLogger {
    constructor(logger) {
        this.logger = logger;
    }
    log(level, ...args) {
        const data = args.map(stringify).join(' ');
        this.logger[level](`[AutomationsExtension] ${data}`);
    }
    debug(...args) {
        this.log('debug', ...args);
    }
    warning(...args) {
        this.log('warning', ...args);
    }
    info(...args) {
        this.log('info', ...args);
    }
    error(...args) {
        this.log('error', ...args);
    }
}
class AutomationsExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, settings, baseLogger) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
        this.settings = settings;
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.automations = this.parseConfig(settings.get().automations || {});
        this.timeouts = {};
        this.logger = new InternalLogger(baseLogger);
        this.logger.info('Plugin loaded');
        this.logger.debug('Registered automations', this.automations);
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
                    id: crypto.randomUUID(),
                    trigger: automation.trigger,
                    action: actions,
                    condition: conditions,
                });
            }
            return result;
        }, {});
    }
    checkTrigger(configTrigger, update, from, to) {
        let trigger;
        let attribute;
        switch (configTrigger.platform) {
            case ConfigPlatform.ACTION:
                if (!update.hasOwnProperty('action')) {
                    return null;
                }
                trigger = configTrigger;
                const actions = toArray(trigger.action);
                return actions.includes(update.action);
            case ConfigPlatform.STATE:
                trigger = configTrigger;
                attribute = trigger.attribute || 'state';
                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return null;
                }
                if (from[attribute] === to[attribute]) {
                    return null;
                }
                const states = toArray(trigger.state);
                return states.includes(update[attribute]);
            case ConfigPlatform.NUMERIC_STATE:
                trigger = configTrigger;
                attribute = trigger.attribute;
                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return null;
                }
                if (from[attribute] === to[attribute]) {
                    return null;
                }
                if (typeof trigger.above !== 'undefined') {
                    if (to[attribute] < trigger.above) {
                        return false;
                    }
                    if (from[attribute] >= trigger.above) {
                        return null;
                    }
                }
                if (typeof trigger.below !== 'undefined') {
                    if (to[attribute] > trigger.below) {
                        return false;
                    }
                    if (from[attribute] <= trigger.below) {
                        return null;
                    }
                }
                return true;
        }
        return false;
    }
    checkCondition(condition) {
        const entity = this.zigbee.resolveEntity(condition.entity);
        if (!entity) {
            this.logger.debug(`Condition not found for entity '${condition.entity}'`);
            return true;
        }
        let currentCondition;
        let currentState;
        let attribute;
        switch (condition.platform) {
            case ConfigPlatform.STATE:
                currentCondition = condition;
                attribute = currentCondition.attribute || 'state';
                currentState = this.state.get(entity)[attribute];
                if (currentState !== currentCondition.state) {
                    return false;
                }
                break;
            case ConfigPlatform.NUMERIC_STATE:
                currentCondition = condition;
                attribute = currentCondition.attribute;
                currentState = this.state.get(entity)[attribute];
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
                    newState = StateOnOff.ON;
                    break;
                case ConfigService.TURN_OFF:
                    newState = StateOnOff.OFF;
                    break;
                case ConfigService.TOGGLE:
                    newState = currentState === StateOnOff.ON ? StateOnOff.OFF : StateOnOff.ON;
                    break;
            }
            if (currentState === newState) {
                continue;
            }
            this.logger.debug(`Run automation for entity '${action.entity}':`, action);
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({ state: newState }));
        }
    }
    stopTimeout(automationId) {
        const timeout = this.timeouts[automationId];
        if (timeout) {
            clearTimeout(timeout);
            delete this.timeouts[automationId];
        }
    }
    startTimeout(automation, time) {
        this.logger.debug('Start timeout for automation', automation.trigger);
        const timeout = setTimeout(() => {
            delete this.timeouts[automation.id];
            this.runActions(automation.action);
        }, time * 1000);
        timeout.unref();
        this.timeouts[automation.id] = timeout;
    }
    runAutomationIfMatches(automation, update, from, to) {
        const triggerResult = this.checkTrigger(automation.trigger, update, from, to);
        if (triggerResult === false) {
            this.stopTimeout(automation.id);
            return;
        }
        if (triggerResult === null) {
            return;
        }
        for (const condition of automation.condition) {
            if (!this.checkCondition(condition)) {
                this.stopTimeout(automation.id);
                return;
            }
        }
        const timeout = this.timeouts[automation.id];
        if (timeout) {
            return;
        }
        if (automation.trigger.for) {
            this.startTimeout(automation, automation.trigger.for);
            return;
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
