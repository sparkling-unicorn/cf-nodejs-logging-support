import jsonStringifySafe from 'json-stringify-safe';
import util from 'util';

import Config from '../config/config';
import { CustomFieldsFormat, Output } from '../config/interfaces';
import StacktraceUtils from '../helper/stacktraceUtils';
import { isValidObject } from '../middleware/utils';
import Cache from './cache';
import Record from './record';
import RequestContext from './requestContext';
import SourceUtils from './sourceUtils';

export default class RecordFactory {

    private static instance: RecordFactory;
    private config: Config;
    private stacktraceUtils: StacktraceUtils;
    private sourceUtils: SourceUtils;
    private cache: Cache;

    private constructor() {
        this.config = Config.getInstance();
        this.sourceUtils = SourceUtils.getInstance();
        this.cache = Cache.getInstance();
        this.stacktraceUtils = StacktraceUtils.getInstance();
    }

    static getInstance(): RecordFactory {
        if (!RecordFactory.instance) {
            RecordFactory.instance = new RecordFactory();
        }

        return RecordFactory.instance;
    }

    // init a new record and assign fields with output "msg-log"
    buildMsgRecord(registeredCustomFields: Array<string>, loggerCustomFields: Map<string, any>, levelName: string, args: Array<any>, context?: RequestContext): Record {
        const lastArg = args[args.length - 1];
        let customFieldsFromArgs = {};
        let record = new Record(levelName)
      
        if (typeof lastArg === "object") {
            if (this.stacktraceUtils.isErrorWithStacktrace(lastArg)) {
                record.metadata.stacktrace = this.stacktraceUtils.prepareStacktrace(lastArg.stack);
            } else if (isValidObject(lastArg)) {
                if (this.stacktraceUtils.isErrorWithStacktrace(lastArg._error)) {
                    record.metadata.stacktrace = this.stacktraceUtils.prepareStacktrace(lastArg._error.stack);
                    delete lastArg._error;
                }
                customFieldsFromArgs = lastArg;
            }
            args.pop();
        }

        // assign static fields from cache
        const cacheFields = this.config.getCacheMsgFields();
        const cacheMsgRecord = this.cache.getCacheMsgRecord(cacheFields);
        Object.assign(record.payload, cacheMsgRecord);

        record.metadata.message = util.format.apply(util, args);

        // assign dynamic fields
        this.addDynamicFields(record, Output.msgLog, Date.now());

        // assign values from request context if present
        if (context) {
            this.addContext(record, context);
        }

        // assign custom fields
        this.addCustomFields(record, registeredCustomFields, loggerCustomFields, customFieldsFromArgs);

        return record;
    }

    // init a new record and assign fields with output "req-log"
    buildReqRecord(levelName: string, req: any, res: any, context: RequestContext): Record {
        let record = new Record(levelName)

        // assign static fields from cache
        const cacheFields = this.config.getCacheReqFields();
        const cacheReqRecord = this.cache.getCacheReqRecord(cacheFields, req, res);
        Object.assign(record.payload, cacheReqRecord);

        // assign dynamic fields
        this.addDynamicFields(record, Output.reqLog, req, res);

         // assign values request context
        this.addContext(record, context);

        // assign custom fields
        const loggerCustomFields = Object.assign({}, req.logger.getCustomFieldsFromLogger(req.logger));
        this.addCustomFields(record, req.logger.registeredCustomFields, loggerCustomFields, {});

        return record;
    }

    private addCustomFields(record: Record, registeredCustomFields: Array<string>, loggerCustomFields: Map<string, any>, customFieldsFromArgs: any) {
        const providedFields = Object.assign({}, loggerCustomFields, customFieldsFromArgs);
        const customFieldsFormat = this.config.getConfig().customFieldsFormat!;

        // if format "disabled", do not log any custom fields
        if (customFieldsFormat == CustomFieldsFormat.disabled) {
            return;
        }

        let indexedCustomFields: any = {};
        for (let key in providedFields) {
            let value = providedFields[key];

            // Stringify, if necessary.
            if ((typeof value) != "string") {
                value = jsonStringifySafe(value);
            }

            if ([CustomFieldsFormat.cloudLogging, CustomFieldsFormat.all, CustomFieldsFormat.default].includes(customFieldsFormat)
                || record.payload[key] != null || this.config.isSettable(key)) {
                    record.payload[key] = value;
            }

            if ([CustomFieldsFormat.applicationLogging, CustomFieldsFormat.all].includes(customFieldsFormat)) {
                indexedCustomFields[key] = value;
            }
        }

        //writes custom fields in the correct order and correlates i to the place in registeredCustomFields
        if (Object.keys(indexedCustomFields).length > 0) {
            let res: any = {};
            res.string = [];
            let key;
            for (let i = 0; i < registeredCustomFields.length; i++) {
                key = registeredCustomFields[i]
                if (indexedCustomFields[key]) {
                    let value = indexedCustomFields[key];
                    res.string.push({
                        "k": key,
                        "v": value,
                        "i": i
                    })
                }
            }
            if (res.string.length > 0) {
                record.payload["#cf"] = res;
            }
        }
    }

    // read and copy values from context
    private addContext(record: Record, context: RequestContext) {
        const contextFields = context.getProperties();
        for (let key in contextFields) {
            if (contextFields[key] != null) {
                record.payload[key] = contextFields[key];
            }
        }
    }

    private addDynamicFields(record: Record, output: Output, req?: any, res?: object) {
        // assign dynamic fields
        const fields = (output == Output.msgLog) ? this.config.noCacheMsgFields : this.config.noCacheReqFields;
        fields.forEach(
            field => {
                // ignore context fields because they are handled in addContext()
                if (field._meta?.isContext == true) {
                    return;
                }

                record.payload[field.name] = this.sourceUtils.getValue(field, record, output, req, res);
            }
        );
    }
}
