import util from "util";
import Config from "../config/config";
import { isValidObject } from "../middleware/utils";
import CacheFactory from "./cache-factory";
import ReqContext from "./context";
import { SourceUtils } from "./source-utils";
import { StacktraceUtils } from "./stacktrace-utils";
import { outputs } from "../config/interfaces";
const stringifySafe = require('json-stringify-safe');

export var REDACTED_PLACEHOLDER = "redacted";

export default class RecordFactory {

    private static instance: RecordFactory;
    private config: Config;
    private stacktraceUtils: StacktraceUtils;
    private sourceUtils: SourceUtils;
    private LOG_TYPE = "log";
    private cacheFactory: CacheFactory;
    private cacheMsgRecord: any;
    private cacheReqRecord: any;


    private constructor() {
        this.config = Config.getInstance();
        this.stacktraceUtils = StacktraceUtils.getInstance();
        this.sourceUtils = SourceUtils.getInstance();
        this.cacheFactory = CacheFactory.getInstance();
    }

    public static getInstance(): RecordFactory {
        if (!RecordFactory.instance) {
            RecordFactory.instance = new RecordFactory();
        }

        return RecordFactory.instance;
    }

    updateCache(output: outputs, req?: any, res?: any) {
        if (output == "msg-log") {
            const newCache = this.cacheFactory.createCache("msg-log");
            this.cacheMsgRecord = newCache;
        } else {
            const newCache = this.cacheFactory.createCache("req-log", req, res);
            this.cacheReqRecord = newCache;
        }
    }

    // init a new record and assign fields with output "msg-log"
    buildMsgRecord(registeredCustomFields: Array<string>, loggerCustomFields: Map<string, any>, level: string, args: Array<any>, context?: ReqContext): any {

        var customFieldsFromArgs = {};
        var lastArg = args[args.length - 1];

        let record: any = {};

        if (typeof lastArg === "object") {
            if (this.stacktraceUtils.isErrorWithStacktrace(lastArg)) {
                record.stacktrace = this.stacktraceUtils.prepareStacktrace(lastArg.stack);
            } else if (isValidObject(lastArg)) {
                if (this.stacktraceUtils.isErrorWithStacktrace(lastArg._error)) {
                    record.stacktrace = this.stacktraceUtils.prepareStacktrace(lastArg._error.stack);
                    delete lastArg._error;
                }
                customFieldsFromArgs = lastArg;
            }
            args.pop();
        }

        // if config has changed, rebuild cache of record
        if (this.config.updateCacheMsgRecord == true) {
            this.updateCache("msg-log");
            this.config.updateCacheMsgRecord = false;
        }

        // assign cache to record
        Object.assign(record, this.cacheMsgRecord);

        // assign dynamic fields
        record = this.addDynamicFields(record, "msg-log");

        // read and copy values from context
        if (context) {
            record = this.addContext(record, context);
        }

        record = this.addCustomFields(record, registeredCustomFields, loggerCustomFields, customFieldsFromArgs);

        record["level"] = level;
        record["msg"] = util.format.apply(util, args);
        record["type"] = this.LOG_TYPE;

        return record;
    }

    // init a new record and assign fields with output "req-log"
    buildReqRecord(req: any, res: any, context: ReqContext): any {

        const reqLoggingLevel = this.config.getReqLoggingLevel();
        let record: any = { "level": reqLoggingLevel };


        // if config has changed, rebuild cache of record
        if (this.config.updateCacheReqRecord == true) {
            this.updateCache("req-log", req, res);
            this.config.updateCacheReqRecord = false;
        }

        // assign cache to record
        record = Object.assign(record, this.cacheReqRecord);

        // assign dynamic fields
        record = this.addDynamicFields(record, "req-log", req, res);

        record = this.addContext(record, context);

        const loggerCustomFields = Object.assign({}, req.logger.extractCustomFieldsFromLogger(req.logger));
        record = this.addCustomFields(record, req.logger.registeredCustomFields, loggerCustomFields, {});
        return record;
    }

    private addCustomFields(record: any, registeredCustomFields: Array<string>, loggerCustomFields: Map<string, any>, customFieldsFromArgs: any): any {
        var providedFields = Object.assign({}, loggerCustomFields, customFieldsFromArgs);
        const customFieldsFormat = this.config.getConfig().customFieldsFormat!;

        // if format "disabled", do not log any custom fields
        if (customFieldsFormat == "disabled") {
            return record;
        }

        for (var key in providedFields) {
            var value = providedFields[key];

            if (["cloud-logging", "all", "default"].includes(customFieldsFormat) || record[key] != null || this.config.isSettable(key)) {
                record[key] = value;
            }

            if (customFieldsFormat == "application-logging" || customFieldsFormat == "all") {
                let res: any = {};
                res.string = [];
                let key;
                for (var i = 0; i < registeredCustomFields.length; i++) {
                    key = registeredCustomFields[i]
                    if (providedFields[key]) {
                        var value = providedFields[key];
                        // Stringify, if necessary.
                        if ((typeof value) != "string") {
                            value = stringifySafe(value);
                        }
                        res.string.push({
                            "k": key,
                            "v": value,
                            "i": i
                        })
                    }
                }
                if (res.string.length > 0)
                    record["#cf"] = res;
            }
        }
        return record;
    }

    // read and copy values from context
    private addContext(record: any, context: ReqContext): any {
        const contextFields = context.getProps();
        for (let key in contextFields) {
            if (contextFields[key] != null) {
                record[key] = contextFields[key];
            }
        }
        return record;
    }

    private addDynamicFields(record: any, output: outputs, req?: any, res?: object) {
        const writtenAt = new Date();

        // assign dynamic fields
        const fields = (output == "msg-log") ? this.config.noCacheMsgFields : this.config.noCacheReqFields;
        fields.forEach(
            field => {
                // ignore context fields because they are handled in addContext()
                if (field._meta?.isContext == true) {
                    return;
                }

                if (!Array.isArray(field.source)) {
                    if (output == "msg-log") {
                        record[field.name] = this.sourceUtils.getFieldValue(field.source, record, writtenAt);
                    } else {
                        record[field.name] = this.sourceUtils.getReqFieldValue(field.source, record, writtenAt, req, res);
                    }
                } else {
                    const value = this.sourceUtils.getValueFromSources(field, record, output, writtenAt, req, res);
                    if (value != null) {
                        record[field.name] = value;
                    }
                }

                // Handle default
                if (record[field.name] == null && field.default != null) {
                    record[field.name] = field.default;
                }

                // Replaces all fields, which are marked to be reduced and do not equal to their default value to REDUCED_PLACEHOLDER.
                if (field._meta!.isRedacted == true && record[field.name] != null && record[field.name] != field.default) {
                    record[field.name] = REDACTED_PLACEHOLDER;
                }
            }
        );
        return record;
    }
}
