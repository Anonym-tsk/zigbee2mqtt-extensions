// @ts-ignore
import * as stringify from 'json-stable-stringify-without-jsonify';
import * as crypto from 'crypto';

import type Zigbee from 'zigbee2mqtt/dist/zigbee';
import type MQTT from 'zigbee2mqtt/dist/mqtt';
import type State from 'zigbee2mqtt/dist/state';
import type EventBus from 'zigbee2mqtt/dist/eventBus';
import type Settings from 'zigbee2mqtt/dist/util/settings';
import type Logger from 'zigbee2mqtt/dist/util/logger';

function toArray<T>(item: T | T[]): T[] {
    return Array.isArray(item) ? item : [item];
}

enum ConfigPlatform {
    ACTION = 'action',
    STATE = 'state',
    NUMERIC_STATE = 'numeric_state',
}

enum StateOnOff {
    ON = 'ON',
    OFF = 'OFF',
}

enum ConfigService {
    TOGGLE = 'toggle',
    TURN_ON = 'turn_on',
    TURN_OFF = 'turn_off',
}

type ConfigStateType = string | number | boolean;
type EntityId = string;
type ConfigActionType = string;
type ConfigAttribute = string;
type Update = Record<string, ConfigStateType>;
type Second = number;
type UUID = string;

interface ConfigTrigger {
    platform: ConfigPlatform;
    entity: EntityId | EntityId[];
    for?: Second;
}

interface ConfigActionTrigger extends ConfigTrigger {
    action: ConfigActionType | ConfigActionType[];
}

interface ConfigStateTrigger extends ConfigTrigger {
    attribute?: ConfigAttribute;
    state: ConfigStateType | ConfigStateType[];
}

interface ConfigNumericStateTrigger extends ConfigTrigger {
    attribute: ConfigAttribute;
    above?: number;
    below?: number;
}

interface ConfigAction {
    entity: EntityId;
    service: ConfigService;
}

interface ConfigCondition {
    platform: ConfigPlatform;
    entity: EntityId;
}

interface ConfigStateCondition extends ConfigCondition {
    attribute?: ConfigAttribute;
    state: ConfigStateType;
}

interface ConfigNumericStateCondition extends ConfigCondition {
    attribute: ConfigAttribute;
    above?: number;
    below?: number;
}

type ConfigAutomations = {
    [key: string]: {
        trigger: ConfigTrigger,
        action: ConfigAction | ConfigAction[],
        condition?: ConfigCondition | ConfigCondition[],
    }
};

type Automation = {
    id: UUID,
    trigger: ConfigTrigger,
    action: ConfigAction[],
    condition: ConfigCondition[],
};

type Automations = {
    [key: EntityId]: Automation[],
};

class InternalLogger {
    constructor(private logger: typeof Logger) {}

    private log(level: 'warning' | 'debug' | 'info' | 'error', ...args: unknown[]): void {
        const data = args.map(stringify).join(' ');
        this.logger[level](`[AutomationsExtension] ${data}`);
    }

    debug(...args: unknown[]): void {
        this.log('debug', ...args);
    }

    warning(...args: unknown[]): void {
        this.log('warning', ...args);
    }

    info(...args: unknown[]): void {
        this.log('info', ...args);
    }

    error(...args: unknown[]): void {
        this.log('error', ...args);
    }
}

class AutomationsExtension {
    private readonly mqttBaseTopic: string;
    private readonly automations: Automations;
    private readonly timeouts: Record<UUID, NodeJS.Timeout>;
    private readonly logger: InternalLogger;

    constructor(
        protected zigbee: Zigbee,
        protected mqtt: MQTT,
        protected state: State,
        protected publishEntityState: unknown,
        protected eventBus: EventBus,
        protected settings: typeof Settings,
        baseLogger: typeof Logger,
    ) {
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.automations = this.parseConfig(settings.get().automations || {});
        this.timeouts = {};
        this.logger = new InternalLogger(baseLogger);

        this.logger.info('Plugin loaded');
        this.logger.debug('Registered automations', this.automations);
    }

    private parseConfig(automations: ConfigAutomations): Automations {
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
        }, {} as Automations);
    }

    /**
     * Возвращаемые значения:
     * null - update не удовлетворяет условиям триггера
     * true - проверка прошла, триггер сработал
     * false - проверка не прошла, триггер не сработал
     */
    private checkTrigger(configTrigger: ConfigTrigger, update: Update, from: Update, to: Update): boolean | null {
        let trigger;
        let attribute;

        switch (configTrigger.platform) {
            case ConfigPlatform.ACTION:
                if (!update.hasOwnProperty('action')) {
                    return null;
                }

                trigger = configTrigger as ConfigActionTrigger;
                const actions = toArray(trigger.action);

                return actions.includes(update.action as ConfigActionType);

            case ConfigPlatform.STATE:
                trigger = configTrigger as ConfigStateTrigger;
                attribute = trigger.attribute || 'state';

                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return null;
                }

                if (from[attribute] === to[attribute]) {
                    return null;
                }

                const states = toArray(trigger.state);
                return states.includes(update[attribute] as ConfigStateType);

            case ConfigPlatform.NUMERIC_STATE:
                trigger = configTrigger as ConfigNumericStateTrigger;
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

    private checkCondition(condition: ConfigCondition): boolean {
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
                currentCondition = condition as ConfigStateCondition;
                attribute = currentCondition.attribute || 'state';
                currentState = this.state.get(entity)[attribute];

                if (currentState !== currentCondition.state) {
                    return false;
                }

                break;

            case ConfigPlatform.NUMERIC_STATE:
                currentCondition = condition as ConfigNumericStateCondition;
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

    private runActions(actions: ConfigAction[]): void {
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
            this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify({state: newState}));
        }
    }

    private stopTimeout(automationId: UUID): void {
        const timeout = this.timeouts[automationId];
        if (timeout) {
            clearTimeout(timeout);
            delete this.timeouts[automationId];
        }
    }

    private startTimeout(automation: Automation, time: Second): void {
        this.logger.debug('Start timeout for automation', automation.trigger);

        const timeout = setTimeout(() => {
            delete this.timeouts[automation.id];
            this.runActions(automation.action);
        }, time * 1000);
        timeout.unref();

        this.timeouts[automation.id] = timeout;
    }

    private runAutomationIfMatches(automation: Automation, update: Update, from: Update, to: Update): void {
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

    private findAndRun(entityId: EntityId, update: Update, from: Update, to: Update): void {
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
        this.eventBus.onStateChange(this, (data: any) => {
            this.findAndRun(data.entity.name, data.update, data.from, data.to);
        });
    }

    async stop() {
        this.eventBus.removeListeners(this);
    }
}

export = AutomationsExtension;
