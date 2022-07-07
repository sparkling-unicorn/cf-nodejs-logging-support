import Config from "../config/config";
import { ConfigField, Source } from "../config/interfaces";
import NestedVarResolver from "../helper/nested-var-resolver";
import RequestAccessor from "../middleware/request-Accessor";
import ResponseAccessor from "../middleware/response-accessor";
const { v4: uuid } = require('uuid');

type origin = "msg-log" | "req-log" | "context";

export class SourceUtils {
    private static instance: SourceUtils;
    private requestAccessor: RequestAccessor = RequestAccessor.getInstance();
    private responseAccessor = ResponseAccessor.getInstance();

    private constructor() { }

    public static getInstance(): SourceUtils {
        if (!SourceUtils.instance) {
            SourceUtils.instance = new SourceUtils();
        }

        return SourceUtils.instance;
    }

    getFieldValue(source: Source, record: any): string | undefined {
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
    }

    getReqFieldValue(name: string, source: Source, record: any, req: any, res: any, now?: Date): string | undefined {
        switch (source.type) {
            case "req-header":
                return this.requestAccessor.getHeaderField(req, source.name!);
            case "req-object":
                if (name == "protocol") {
                    return "HTTP" + (req.httpVersion == null ? "" : "/" + req.httpVersion);
                }
                if (name == "remote_host") {
                    return req.connection.remoteAddress;
                }
                if (name == "remote_port") {
                    return req.connection.remotePort.toString();
                }
                if (name == "remote_user") {
                    if (req.user && req.user.id) {
                        return req.user.id;
                    }
                    return;
                }
                return this.requestAccessor.getField(req, source.name!);
            case "res-header":
                return this.responseAccessor.getHeaderField(res, source.name!);
            case "res-object":
                return this.responseAccessor.getField(res, source.name!);
            case "meta":
                if (now == null) {
                    return;
                }
                if (name == "request_received_at") {
                    return now.toJSON();
                }
                if (name == "response_time_ms") {
                    return (Date.now() - now.getTime()).toString();;
                }
                if (name == "response_sent_at") {
                    return new Date().toJSON();
                }
                return;
            default:
                return this.getFieldValue(source, record);
        }
    }

    // if source is request, then assign to context. If not, then ignore.
    getContextFieldValue(source: Source, req: any) {
        switch (source.type) {
            case "req-header":
                return this.requestAccessor.getHeaderField(req, source.name!);
            case "req-object":
                return this.requestAccessor.getField(req, source.name!);
            case "uuid":
                return uuid();
        }
    }

    // iterate through sources until one source returns a value 
    getValueFromSources(record: any, field: ConfigField, origin: origin, req?: any, res?: any) {

        if (origin == "req-log" && (!req || !res)) {
            throw new Error("Please pass req and res as argument to get value for req-log field.");
        }

        if (origin == "context" && (!req)) {
            throw new Error("Please pass req as argument to get value for context field.");
        }

        field.source = field.source as Source[];

        let sourceIndex = 0;
        let fieldValue;
        while (fieldValue == null) {
            sourceIndex = SourceUtils.getInstance().getNextValidSourceIndex(field.source, sourceIndex);

            if (sourceIndex == -1) {
                return;
            }

            let source = field.source[sourceIndex];

            fieldValue = origin == "msg-log" ? this.getFieldValue(source, record) :
                origin == "req-log" ? this.getReqFieldValue(field.name, source, record, req, res) :
                    this.getContextFieldValue(source, req);

            ++sourceIndex;
        }
        return fieldValue;
    }

    // returns -1 when all sources were iterated
    private getNextValidSourceIndex(sources: Source[], startIndex: number): number {
        const framework = Config.getInstance().getFramework();

        for (let i = startIndex; i < sources.length; i++) {
            if (!sources[i].framework) {
                return i;
            }
            if (sources[i].framework == framework) {
                return i;
            }
        }
        return -1;
    }
}
