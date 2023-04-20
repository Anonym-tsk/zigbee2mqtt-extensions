const stringify = require("json-stable-stringify-without-jsonify");
const crypto = require("crypto");
const yaml_1 = require("../util/yaml");
const data_1 = require("../util/data");
function toArray(item) {
    return Array.isArray(item) ? item : [item];
}
var ConfigPlatform;
(function (ConfigPlatform) {
    ConfigPlatform["ACTION"] = "action";
    ConfigPlatform["STATE"] = "state";
    ConfigPlatform["NUMERIC_STATE"] = "numeric_state";
    ConfigPlatform["TIME"] = "time";
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
    ConfigService["CUSTOM"] = "custom";
})(ConfigService || (ConfigService = {}));
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_STRING_REGEXP = /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/;
class Time {
    constructor(time) {
        if (!time) {
            const now = new Date();
            this.h = now.getHours();
            this.m = now.getMinutes();
            this.s = now.getSeconds();
        }
        else if (!TIME_STRING_REGEXP.test(time)) {
            throw new Error(`Wrong time string: ${time}`);
        }
        else {
            [this.h, this.m, this.s] = time.split(':').map(Number);
        }
    }
    isEqual(time) {
        return this.h === time.h
            && this.m === time.m
            && this.s === time.s;
    }
    isGreater(time) {
        if (this.h > time.h) {
            return true;
        }
        if (this.h < time.h) {
            return false;
        }
        if (this.m > time.m) {
            return true;
        }
        if (this.m < time.m) {
            return false;
        }
        return this.s > time.s;
    }
    isLess(time) {
        return !this.isGreater(time) && !this.isEqual(time);
    }
    isInRange(after, before) {
        if (before.isEqual(after)) {
            return false;
        }
        if (this.isEqual(before) || this.isEqual(after)) {
            return true;
        }
        let inverse = false;
        if (after.isGreater(before)) {
            const tmp = after;
            after = before;
            before = tmp;
            inverse = true;
        }
        const result = this.isGreater(after) && this.isLess(before);
        return inverse ? !result : result;
    }
}
class InternalLogger {
    constructor(logger) {
        this.logger = logger;
    }
    log(level, ...args) {
        const data = args.map((item) => typeof item === 'string' ? item : stringify(item)).join(' ');
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
        this.logger = new InternalLogger(baseLogger);
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.automations = this.parseConfig(settings.get().automations || {});
        this.timeouts = {};
        this.logger.info('Plugin loaded');
        this.logger.debug('Registered automations', this.automations);
    }
    parseConfig(automations) {
        if (typeof automations === 'string') {
            automations = (yaml_1.default.readIfExists(data_1.default.joinPath(automations)) || {});
        }
        const services = Object.values(ConfigService);
        const platforms = Object.values(ConfigPlatform);
        return Object.values(automations).reduce((result, automation) => {
            const platform = automation.trigger.platform;
            if (!platforms.includes(platform)) {
                this.logger.warning(`Config validation error: unknown trigger platform '${platform}'`);
                return result;
            }
            if (!automation.trigger.entity) {
                this.logger.warning('Config validation error: trigger entity not specified');
                return result;
            }
            const actions = toArray(automation.action);
            for (const action of actions) {
                if (!services.includes(action.service)) {
                    this.logger.warning(`Config validation error: unknown service '${action.service}'`);
                    return result;
                }
            }
            const conditions = automation.condition ? toArray(automation.condition) : [];
            for (const condition of conditions) {
                if (!platforms.includes(condition.platform)) {
                    this.logger.warning(`Config validation error: unknown condition platform '${condition.platform}'`);
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
        if (condition.platform === ConfigPlatform.TIME) {
            return this.checkTimeCondition(condition);
        }
        return this.checkEntityCondition(condition);
    }
    checkTimeCondition(condition) {
        const beforeStr = condition.before || '23:59:59';
        const afterStr = condition.after || '00:00:00';
        const weekday = condition.weekday || WEEK;
        try {
            const after = new Time(afterStr);
            const before = new Time(beforeStr);
            const current = new Time();
            const now = new Date();
            const day = now.getDay();
            return current.isInRange(after, before) && weekday.includes(WEEK[day]);
        }
        catch (e) {
            this.logger.warning(e);
            return true;
        }
    }
    checkEntityCondition(condition) {
        if (!condition.entity) {
            this.logger.warning('Config validation error: condition entity not specified');
            return true;
        }
        const entity = this.zigbee.resolveEntity(condition.entity);
        if (!entity) {
            this.logger.warning(`Condition not found for entity '${condition.entity}'`);
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
            let data;
            if (action.service === ConfigService.CUSTOM) {
                data = action.data;
            }
            else if (currentState === newState) {
                continue;
            }
            else {
                data = { state: newState };
            }
            this.logger.debug(`Run automation for entity '${action.entity}':`, action);
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify(data));
        }
    }
    runActionsWithConditions(conditions, actions) {
        for (const condition of conditions) {
            if (!this.checkCondition(condition)) {
                return;
            }
        }
        this.runActions(actions);
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
            this.runActionsWithConditions(automation.condition, automation.action);
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
        this.logger.debug('Start automation', automation);
        const timeout = this.timeouts[automation.id];
        if (timeout) {
            return;
        }
        if (automation.trigger.for) {
            this.startTimeout(automation, automation.trigger.for);
            return;
        }
        this.runActionsWithConditions(automation.condition, automation.action);
    }
    findAndRun(entityId, update, from, to) {
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
