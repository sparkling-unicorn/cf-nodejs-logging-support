import util from "util";
import Config from "../config/config";
import { ConfigField } from "../config/interfaces";
import NestedVarResolver from "../helper/nested-var-resolver";
import RequestAccessor from "../middleware/request-Accessor";
import ResponseAccessor from "../middleware/response-accessor";
import ReqContext from "./context";
const stringifySafe = require('json-stringify-safe');

export default class RecordFactory {
    static MAX_STACKTRACE_SIZE = 55 * 1024;

    // init a new record and assign fields with output "msg-log"
    static buildMsgRecord(loggerCustomFields: Map<string, any>, level: string, args: Array<any>, context?: ReqContext): any {

        let record: any = {
            "level": level,
        };

        var customFieldsFromArgs = {};
        var lastArg = args[args.length - 1];

        // why check if lastArg and lastArg._error?
        if (typeof lastArg === "object") {
            if (RecordFactory.isErrorWithStacktrace(lastArg)) {
                record.stacktrace = RecordFactory.prepareStacktrace(lastArg.stack);
            } else if (RecordFactory.isValidObject(lastArg)) {
                if (RecordFactory.isErrorWithStacktrace(lastArg._error)) {
                    record.stacktrace = RecordFactory.prepareStacktrace(lastArg._error.stack);
                    delete lastArg._error;
                }
                customFieldsFromArgs = lastArg;
            }
            args.pop();
        }

        const msgLogFields = Config.getInstance().getMsgFields();


        msgLogFields.forEach(field => {
            record[field.name] = this.getFieldValue(field, record);
        });

        if (context) {
            const contextFields = context.getProps();
            for (let key in contextFields) {
                record[key] = contextFields[key];
            }
        }

        record = this.addCustomFields(record, loggerCustomFields, customFieldsFromArgs);
        record["msg"] = util.format.apply(util, args);
        return record;
    }

    // init a new record and assign fields with output "req-log"
    static buildReqRecord(req: any, res: any): any {

        const requestAccessor = RequestAccessor.getInstance();
        const responseAccessor = ResponseAccessor.getInstance();

        const reqLogFields = Config.getInstance().getReqFields();
        let record: any = { "level": "info" };
        reqLogFields.forEach(field => {
            if (!Array.isArray(field.source)) {
                switch (field.source.type) {
                    case "req-header":
                        record[field.name] = requestAccessor.getHeaderField(req, field.source.name!);
                        break;
                    case "req-object":
                        record[field.name] = requestAccessor.getField(req, field.source.name!);
                        break;
                    case "res-header":
                        record[field.name] = responseAccessor.getHeaderField(res, field.source.name!);
                        break;
                    case "res-object":
                        record[field.name] = responseAccessor.getField(res, field.source.name!);
                        break;
                    default:
                        record[field.name] = this.getFieldValue(field, record);
                }
            }

            // TO DO: sources as array case

        });
        return record;
    }

    private static getFieldValue(field: ConfigField, record: any): string | undefined {
        // TO DO: if source array iterate until source framework = config framework
        let source = Array.isArray(field.source) ? field.source[0] : field.source;

        switch (source.type) {
            case "static":
                return source.value;
            case "env":
                if (source.path) {
                    return NestedVarResolver.resolveNestedVariable(process.env, source.path);
                }
                return process.env[source.name!];
            case "config-field":
                return record[source.name!];
            default:
                return undefined;
        }



        // TO DO: handle sources as array case


    }

    // check if the given object is an Error with stacktrace using duck typing
    private static isErrorWithStacktrace(obj: any): boolean {
        if (obj && obj.stack && obj.message && typeof obj.stack === "string" && typeof obj.message === "string") {
            return true;
        }
        return false;
    }

    // Split stacktrace into string array and truncate lines if required by size limitation
    // Truncation strategy: Take one line from the top and two lines from the bottom of the stacktrace until limit is reached.
    private static prepareStacktrace(stacktraceStr: any): any {
        var fullStacktrace = stacktraceStr.split('\n');
        var totalLineLength = fullStacktrace.reduce((acc: any, line: any) => acc + line.length, 0);

        if (totalLineLength > this.MAX_STACKTRACE_SIZE) {
            var truncatedStacktrace = [];
            var stackA = [];
            var stackB = [];
            var indexA = 0;
            var indexB = fullStacktrace.length - 1;
            var currentLength = 73; // set to approx. character count for "truncated" and "omitted" labels

            for (let i = 0; i < fullStacktrace.length; i++) {
                if (i % 3 == 0) {
                    let line = fullStacktrace[indexA++];
                    if (currentLength + line.length > this.MAX_STACKTRACE_SIZE) {
                        break;
                    }
                    currentLength += line.length;
                    stackA.push(line);
                } else {
                    let line = fullStacktrace[indexB--];
                    if (currentLength + line.length > this.MAX_STACKTRACE_SIZE) {
                        break;
                    }
                    currentLength += line.length;
                    stackB.push(line);
                }
            }

            truncatedStacktrace.push("-------- STACK TRACE TRUNCATED --------");
            truncatedStacktrace = [...truncatedStacktrace, ...stackA];
            truncatedStacktrace.push(`-------- OMITTED ${fullStacktrace.length - (stackA.length + stackB.length)} LINES --------`);
            truncatedStacktrace = [...truncatedStacktrace, ...stackB.reverse()];
            return truncatedStacktrace;
        }
        return fullStacktrace;
    }

    private static isValidObject(obj: any, canBeEmpty?: any): boolean {
        if (!obj) {
            return false;
        } else if (typeof obj !== "object") {
            return false;
        } else if (!canBeEmpty && Object.keys(obj).length === 0) {
            return false;
        }
        return true;
    }

    private static addCustomFields(record: any, loggerCustomFields: Map<string, any>, customFieldsFromArgs: any): any {
        var providedFields = Object.assign({}, loggerCustomFields, customFieldsFromArgs);
        const customFieldsFormat = Config.getInstance().getConfig().customFieldsFormat;

        for (var key in providedFields) {
            var value = providedFields[key];

            // Stringify, if necessary.
            if ((typeof value) != "string") {
                value = stringifySafe(value);
            }

            // let customFields: any = {};
            if (customFieldsFormat == "application-logging" || record[key] != null) {
                record[key] = value;
            }
            // if (customFieldsFormat == "cloud-logging")
            //     customFields[key] = value;
        }

        if (customFieldsFormat == "cloud-logging") {
            // let res: any = {};
            // res.string = [];
            // let key;
            // for (var i = 0; i < registeredCustomFields.length; i++) {
            //     key = registeredCustomFields[i]
            //     if (providedFields[key])
            //         res.string.push({
            //             "k": key,
            //             "v": providedFields[key],
            //             "i": i
            //         })
            // }
            // if (res.string.length > 0)
            //     record["#cf"] = res;
        }
        return record;
    }
}
